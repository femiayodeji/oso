// Pure PDF text extraction (bytes in, text out). No DOM, workers or native code:
// it reads the page content streams and rebuilds lines and paragraphs from the
// text positioning operators, so the result can go through chapter detection.
import { loadFont, type PdfFont } from './pdfFonts';
import { indexOfWord, Lexer, Name, Op, PdfDocument, PdfError, Stream, type Dict, type Obj } from './pdfObjects';

export { PdfError } from './pdfObjects';

type Matrix = readonly [number, number, number, number, number, number];
type Line = { text: string; along: number; perp: number; size: number };
type OpenLine = { parts: string[]; last: string; along: number; end: number; perp: number; size: number };
type GraphicsState = { ctm: Matrix; font: PdfFont | null; size: number; charSpace: number; wordSpace: number; scale: number; leading: number };

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const MAX_FORM_DEPTH = 6;
const MIN_CHARS_PER_PAGE = 5;
// Control characters and the replacement character, which some fonts map glyphs to.
const UNPRINTABLE = /[\u0000-\u0008\u000e-\u001f\u007f\ufffd]/g;
const UNREADABLE = 'This PDF could not be read.';
const NOT_A_PDF = 'This file is not a PDF.';
const ENCRYPTED = 'This PDF is password-protected. Use an unprotected copy, or an epub or txt file.';
const NO_TEXT = 'This PDF has no readable text. It may be a scan. Use an epub or txt file.';

function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ];
}

function isBlank(code: number): boolean {
  return code === 32 || code === 0xa0 || code === 9;
}

// Collects the text shown on one page into lines. Positions are measured along the
// baseline and across it, so rotated or mirrored pages behave like upright ones.
class PageLayout {
  private lines: Line[] = [];
  private open: OpenLine | null = null;

  add(text: string, along: number, end: number, perp: number, size: number): void {
    const line = this.open;
    if (line && Math.abs(perp - line.perp) < 0.5 * Math.max(size, line.size)) {
      const gap = along - line.end;
      const touching = isBlank(line.last.charCodeAt(line.last.length - 1)) || isBlank(text.charCodeAt(0));
      if (!touching && (gap > 0.2 * size || gap < -size)) line.parts.push(' ');
      line.parts.push(text);
      line.last = text;
      line.end = end;
      line.size = Math.max(line.size, size);
      return;
    }
    this.close();
    this.open = { parts: [text], last: text, along, end, perp, size };
  }

  private close(): void {
    const line = this.open;
    this.open = null;
    if (!line) return;
    const text = line.parts.join('').replace(UNPRINTABLE, '').replace(/[\s\u00a0]+/g, ' ').trim();
    if (text) this.lines.push({ text, along: line.along, perp: line.perp, size: line.size });
  }

  paragraphs(): string[] {
    this.close();
    return joinLines(this.lines);
  }
}

// Line spacing typical of running text on this page, as a multiple of the font size.
function typicalSpacing(lines: Line[]): number {
  const ratios: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const gap = lines[i - 1].perp - lines[i].perp;
    if (gap > 0 && lines[i].size > 0) ratios.push(gap / lines[i].size);
  }
  if (ratios.length < 3) return 1.5;
  ratios.sort((a, b) => a - b);
  return ratios[Math.floor(ratios.length / 4)];
}

function startsParagraph(prev: Line, line: Line, spacing: number): boolean {
  const gap = prev.perp - line.perp;
  const size = Math.max(prev.size, line.size);
  if (gap <= 0) return true; // moved back up: a new column or block
  if (Math.abs(prev.size - line.size) > 0.15 * size) return true; // heading to body, or back
  if (gap > 1.25 * spacing * line.size) return true; // extra vertical space
  return line.along > prev.along + 0.5 * size; // first-line indent
}

// Unwraps lines into paragraphs. Bare page numbers are dropped.
function joinLines(lines: Line[]): string[] {
  const spacing = typicalSpacing(lines);
  const paragraphs: string[] = [];
  let current: string[] = [];
  const finish = () => {
    const text = current.join('');
    current = [];
    if (text && !/^\d{1,4}$/.test(text)) paragraphs.push(text);
  };
  lines.forEach((line, i) => {
    if (i > 0 && startsParagraph(lines[i - 1], line, spacing)) finish();
    if (current.length > 0) {
      const prev = lines[i - 1].text;
      if (prev.endsWith('\u00ad')) current[current.length - 1] = prev.slice(0, -1);
      else if (!(prev.endsWith('-') && /^[a-z]/.test(line.text))) current.push(' ');
    }
    current.push(line.text);
  });
  finish();
  return paragraphs;
}

class PageInterpreter {
  private stack: GraphicsState[] = [];
  private state: GraphicsState = { ctm: IDENTITY, font: null, size: 0, charSpace: 0, wordSpace: 0, scale: 1, leading: 0 };
  // The text matrix is the line matrix moved `shift` along its own x axis.
  private lineMatrix: Matrix = IDENTITY;
  private shift = 0;

  constructor(
    private doc: PdfDocument,
    private fonts: Map<Dict, PdfFont>,
    private layout: PageLayout,
  ) {}

  run(data: Uint8Array, resources: Dict | null, depth: number): void {
    const lexer = new Lexer(data);
    const operands: Obj[] = [];
    for (let token = lexer.read(); token !== undefined; token = lexer.read()) {
      if (!(token instanceof Op)) {
        operands.push(token);
        continue;
      }
      if (token.op === 'ID') skipInlineImage(lexer);
      else this.execute(token.op, operands, resources, depth);
      operands.length = 0;
    }
  }

  private execute(op: string, args: Obj[], resources: Dict | null, depth: number): void {
    const s = this.state;
    const num = (i: number) => {
      const v = args[i];
      return typeof v === 'number' ? v : 0;
    };
    switch (op) {
      // The two most common operators first: this switch runs for every operator on the page.
      case 'Tj':
        this.show(args[0]);
        break;
      case 'Td':
        this.nextLine(num(0), num(1));
        break;
      case 'q':
        this.stack.push({ ...s });
        break;
      case 'Q':
        this.state = this.stack.pop() ?? s;
        break;
      case 'cm':
        s.ctm = multiply([num(0), num(1), num(2), num(3), num(4), num(5)], s.ctm);
        break;
      case 'BT':
        this.lineMatrix = IDENTITY;
        this.shift = 0;
        break;
      case 'Tf':
        s.font = this.font(resources, args[0]);
        s.size = num(1);
        break;
      case 'Tc':
        s.charSpace = num(0);
        break;
      case 'Tw':
        s.wordSpace = num(0);
        break;
      case 'Tz':
        s.scale = num(0) / 100;
        break;
      case 'TL':
        s.leading = num(0);
        break;
      case 'TD':
        s.leading = -num(1);
        this.nextLine(num(0), num(1));
        break;
      case 'Tm':
        this.lineMatrix = [num(0), num(1), num(2), num(3), num(4), num(5)];
        this.shift = 0;
        break;
      case 'T*':
        this.nextLine(0, -s.leading);
        break;
      case "'":
        this.nextLine(0, -s.leading);
        this.show(args[0]);
        break;
      case '"':
        s.wordSpace = num(0);
        s.charSpace = num(1);
        this.nextLine(0, -s.leading);
        this.show(args[2]);
        break;
      case 'TJ':
        for (const item of Array.isArray(args[0]) ? args[0] : []) {
          if (typeof item === 'number') this.shift += (-item / 1000) * s.size * s.scale;
          else this.show(item);
        }
        break;
      case 'Do':
        this.drawForm(resources, args[0], depth);
        break;
    }
  }

  private font(resources: Dict | null, name: Obj | undefined): PdfFont | null {
    if (!(name instanceof Name)) return null;
    const dict = this.doc.dict(this.doc.dict(resources?.get('Font'))?.get(name.name));
    if (!dict) return null;
    let font = this.fonts.get(dict);
    if (!font) {
      font = loadFont(this.doc, dict);
      this.fonts.set(dict, font);
    }
    return font;
  }

  private nextLine(tx: number, ty: number): void {
    const m = this.lineMatrix;
    this.lineMatrix = [m[0], m[1], m[2], m[3], tx * m[0] + ty * m[2] + m[4], tx * m[1] + ty * m[3] + m[5]];
    this.shift = 0;
  }

  private show(operand: Obj | undefined): void {
    const s = this.state;
    const font = s.font;
    if (!font || !(operand instanceof Uint8Array)) return;
    const step = font.bytesPerCode;
    let text = '';
    let distance = 0;
    for (let i = 0; i + step <= operand.length; i += step) {
      const code = step === 1 ? operand[i] : operand[i] * 256 + operand[i + 1];
      text += font.text(code);
      const wordSpace = step === 1 && code === 32 ? s.wordSpace : 0;
      distance += ((font.width(code) / 1000) * s.size + s.charSpace + wordSpace) * s.scale;
    }

    // Text matrix times CTM, written out because this runs once per shown string.
    const t = this.lineMatrix;
    const c = s.ctm;
    const tx = t[4] + this.shift * t[0];
    const ty = t[5] + this.shift * t[1];
    const ax = t[0] * c[0] + t[1] * c[2];
    const ay = t[0] * c[1] + t[1] * c[3];
    const ux = t[2] * c[0] + t[3] * c[2];
    const uy = t[2] * c[1] + t[3] * c[3];
    const x = tx * c[0] + ty * c[2] + c[4];
    const y = tx * c[1] + ty * c[3] + c[5];
    // A negative font size or horizontal scale mirrors the text, so flip the axes to match.
    const forward = s.size * s.scale < 0 ? -1 : 1;
    const upward = s.size < 0 ? -1 : 1;
    const alongLength = Math.sqrt(ax * ax + ay * ay) || 1;
    const upLength = Math.sqrt(ux * ux + uy * uy) || 1;
    const along = (forward * (x * ax + y * ay)) / alongLength;
    const perp = (upward * (x * ux + y * uy)) / upLength;
    this.shift += distance;
    if (text) this.layout.add(text, along, along + forward * distance * alongLength, perp, Math.abs(s.size) * upLength);
  }

  // Form XObjects are nested content streams; headings and whole pages can live in them.
  private drawForm(resources: Dict | null, name: Obj | undefined, depth: number): void {
    if (!(name instanceof Name) || depth >= MAX_FORM_DEPTH) return;
    const form = this.doc.resolve(this.doc.dict(resources?.get('XObject'))?.get(name.name));
    if (!(form instanceof Stream) || this.doc.name(form.dict.get('Subtype')) !== 'Form') return;
    const saved = { state: this.state, stack: this.stack, lineMatrix: this.lineMatrix, shift: this.shift };
    const matrix = this.doc.array(form.dict.get('Matrix')).map((v) => (typeof v === 'number' ? v : 0));
    this.state = { ...saved.state };
    this.stack = [];
    if (matrix.length === 6) this.state.ctm = multiply([matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]], this.state.ctm);
    try {
      this.run(this.doc.decode(form), this.doc.dict(form.dict.get('Resources')) ?? resources, depth + 1);
    } catch {
      // An unreadable form only loses its own text.
    }
    this.state = saved.state;
    this.stack = saved.stack;
    this.lineMatrix = saved.lineMatrix;
    this.shift = saved.shift;
  }
}

// Inline image data is raw binary: jump to the EI that closes it.
function skipInlineImage(lexer: Lexer): void {
  const b = lexer.bytes;
  const blank = (c: number | undefined) => c === undefined || c === 32 || c === 10 || c === 13 || c === 9;
  for (let at = indexOfWord(b, 'EI', lexer.pos); at >= 0; at = indexOfWord(b, 'EI', at + 2)) {
    if (blank(b[at - 1]) && blank(b[at + 2])) {
      lexer.pos = at + 2;
      return;
    }
  }
  lexer.pos = b.length;
}

type Page = { dict: Dict; resources: Dict | null };

// Leaf pages in reading order, each with the resources it inherits from the tree.
function listPages(doc: PdfDocument): Page[] {
  const pages: Page[] = [];
  const seen = new Set<Dict>();
  const todo: Page[] = [{ dict: doc.dict(doc.dict(doc.trailer.get('Root'))?.get('Pages')) ?? new Map(), resources: null }];
  while (todo.length > 0) {
    const node = todo.pop();
    if (!node || seen.has(node.dict)) continue;
    seen.add(node.dict);
    const resources = doc.dict(node.dict.get('Resources')) ?? node.resources;
    if (!node.dict.has('Kids')) {
      if (node.dict.has('Contents')) pages.push({ dict: node.dict, resources });
      continue;
    }
    const kids = doc.array(node.dict.get('Kids'));
    for (let i = kids.length - 1; i >= 0; i--) {
      const kid = doc.dict(kids[i]);
      if (kid) todo.push({ dict: kid, resources });
    }
  }
  return pages;
}

function pageContent(doc: PdfDocument, page: Dict): Uint8Array {
  const contents = doc.resolve(page.get('Contents'));
  const streams = (Array.isArray(contents) ? contents.map((c) => doc.resolve(c)) : [contents]).filter(
    (c): c is Stream => c instanceof Stream,
  );
  const parts = streams.map((stream) => doc.decode(stream));
  if (parts.length === 1) return parts[0];
  // Streams of one page are a single program; a space keeps tokens from running together.
  const joined = new Uint8Array(parts.reduce((total, part) => total + part.length + 1, 0)).fill(32);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length + 1;
  }
  return joined;
}

export type OpenPdf = { pageCount: number; pageParagraphs: (index: number) => string[] };

// Parses the file structure. Pages are read one at a time so a caller on the UI
// thread can pause between them. Throws PdfError with a short user-facing message.
export function openPdf(bytes: Uint8Array): OpenPdf {
  if (indexOfWord(bytes.subarray(0, 1024), '%PDF-', 0) < 0) throw new PdfError(NOT_A_PDF);
  let doc: PdfDocument;
  try {
    doc = new PdfDocument(bytes);
  } catch (e) {
    throw e instanceof PdfError ? e : new PdfError(UNREADABLE);
  }
  if (doc.trailer.has('Encrypt')) throw new PdfError(ENCRYPTED);

  const fonts = new Map<Dict, PdfFont>();
  const pages = listPages(doc);
  return {
    pageCount: pages.length,
    pageParagraphs: (index) => {
      const page = pages[index];
      const layout = new PageLayout();
      if (!page) return [];
      try {
        new PageInterpreter(doc, fonts, layout).run(pageContent(doc, page.dict), page.resources, 0);
      } catch {
        // Keep whatever was read before the page broke.
      }
      return layout.paragraphs();
    },
  };
}

// Joins per-page paragraphs with blank lines. A paragraph cut by a page break is
// stitched back together. Throws when the pages hold no real text (scanned books).
export function joinPdfPages(pages: string[][]): string {
  const paragraphs: string[] = [];
  let chars = 0;
  for (const page of pages) {
    page.forEach((paragraph, i) => {
      const last = paragraphs.length - 1;
      chars += paragraph.length;
      if (i === 0 && last >= 0 && /[a-z,;]$/.test(paragraphs[last]) && /^[a-z]/.test(paragraph)) {
        paragraphs[last] = `${paragraphs[last]} ${paragraph}`;
      } else paragraphs.push(paragraph);
    });
  }
  if (chars < Math.max(1, pages.length * MIN_CHARS_PER_PAGE)) throw new PdfError(NO_TEXT);
  return paragraphs.join('\n\n');
}

// The text of a PDF, paragraphs separated by blank lines, pages in order.
export function pdfToText(bytes: Uint8Array): string {
  const pdf = openPdf(bytes);
  const pages: string[][] = [];
  for (let i = 0; i < pdf.pageCount; i++) pages.push(pdf.pageParagraphs(i));
  return joinPdfPages(pages);
}
