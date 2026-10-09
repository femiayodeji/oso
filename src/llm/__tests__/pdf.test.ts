import { existsSync, readFileSync } from 'fs';
import { deflate } from 'pako';

import { joinPdfPages, openPdf, PdfError, pdfToText } from '../pdf';
import { glyphToText } from '../pdfFonts';
import { detectChapters } from '../textSplit';

// Every PDF here is assembled in the test, so nothing copyrighted is committed.
type Body = string | Uint8Array;

const enc = (text: string): Uint8Array => Uint8Array.from(text, (c) => c.charCodeAt(0) & 0xff);
const bytesOf = (body: Body): Uint8Array => (typeof body === 'string' ? enc(body) : body);

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function stream(data: Body, dict = ''): Uint8Array {
  const bytes = bytesOf(data);
  return concat([enc(`<< ${dict} /Length ${bytes.length} >>\nstream\n`), bytes, enc('\nendstream')]);
}

const flate = (data: Body, dict = ''): Uint8Array => stream(deflate(bytesOf(data)), `/Filter /FlateDecode ${dict}`);

// Objects are numbered from 1 in the order given; object 1 must be the catalog.
function buildPdf(objects: Body[], opts: { trailer?: string; startxref?: number } = {}): Uint8Array {
  const parts = [enc('%PDF-1.4\n')];
  const offsets: number[] = [];
  let length = parts[0].length;
  objects.forEach((body, i) => {
    offsets.push(length);
    const chunk = concat([enc(`${i + 1} 0 obj\n`), bytesOf(body), enc('\nendobj\n')]);
    parts.push(chunk);
    length += chunk.length;
  });
  const entries = offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  const size = objects.length + 1;
  parts.push(
    enc(
      `xref\n0 ${size}\n0000000000 65535 f \n${entries}trailer\n<< /Size ${size} /Root 1 0 R ${opts.trailer ?? ''} >>\n` +
        `startxref\n${opts.startxref ?? length}\n%%EOF\n`,
    ),
  );
  return concat(parts);
}

const HELVETICA = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';

// One page per content stream. Fonts /F1, /F2... sit in the page tree's inherited
// resources; `fonts` gets the object number of /F1 so font objects can point at later ones.
function pdfWithPages(contents: Body[], fonts: (first: number) => Body[] = () => [HELVETICA], fontCount = 1): Uint8Array {
  const firstFont = 3 + contents.length * 2;
  const kids = contents.map((_c, i) => `${3 + i * 2} 0 R`).join(' ');
  const fontRefs = Array.from({ length: fontCount }, (_f, i) => `/F${i + 1} ${firstFont + i} 0 R`).join(' ');
  const objects: Body[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${kids}] /Count ${contents.length} /Resources << /Font << ${fontRefs} >> >> >>`,
  ];
  contents.forEach((content, i) => {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${4 + i * 2} 0 R >>`);
    objects.push(typeof content === 'string' ? stream(content) : content);
  });
  return buildPdf([...objects, ...fonts(firstFont)]);
}

const text = (content: Body, fonts?: (first: number) => Body[]) => pdfToText(pdfWithPages([content], fonts));

describe('pdfToText', () => {
  it('reads a simple uncompressed text stream', () => {
    expect(text(String.raw`BT /F1 12 Tf 72 720 Td (Hello, \(world\) \101\053) Tj ET`)).toBe('Hello, (world) A+');
  });

  it('unwraps lines and breaks paragraphs on extra vertical space', () => {
    const content = `BT /F1 12 Tf 14 TL 72 720 Td (First line of the) Tj T* (same paragraph.) Tj
      0 -14 Td (A new paragraph) ' 0 0 (after it.) " ET`;
    expect(text(content)).toBe('First line of the same paragraph.\n\nA new paragraph after it.');
  });

  it('breaks paragraphs on a first-line indent and on a change of font size', () => {
    const content = `BT /F1 20 Tf 72 740 Td (A Heading) Tj ET
      BT /F1 12 Tf 72 716 Td (Body starts here and) Tj 0 -14 Td (carries on.) Tj 18 -14 Td (Indented start) Tj -18 -14 Td (of the next one.) Tj ET`;
    expect(text(content)).toBe('A Heading\n\nBody starts here and carries on.\n\nIndented start of the next one.');
  });

  it('inflates FlateDecode streams', () => {
    expect(text(flate('BT /F1 12 Tf 72 720 Td (Compressed text) Tj ET'))).toBe('Compressed text');
  });

  it('undoes ASCII85 and ASCIIHex filters', () => {
    const content = 'BT /F1 12 Tf 72 720 Td (Armoured text) Tj ET';
    const hex = Array.from(enc(content), (b) => b.toString(16).padStart(2, '0')).join('') + '>';
    expect(text(stream(hex, '/Filter /ASCIIHexDecode'))).toBe('Armoured text');

    const data = deflate(enc(content));
    let a85 = '';
    for (let i = 0; i < data.length; i += 4) {
      const n = Math.min(4, data.length - i);
      let value = 0;
      for (let k = 0; k < 4; k++) value = value * 256 + (k < n ? data[i + k] : 0);
      let group = '';
      for (let k = 0; k < 5; k++) {
        group = String.fromCharCode(33 + (value % 85)) + group;
        value = Math.floor(value / 85);
      }
      a85 += n === 4 && group === '!!!!!' ? 'z' : group.slice(0, n + 1);
    }
    expect(text(stream(`${a85}~>`, '/Filter [/ASCII85Decode /FlateDecode]'))).toBe('Armoured text');
  });

  it('maps glyph codes through a ToUnicode CMap', () => {
    const cmap = `/CIDInit /ProcSet findresource begin 12 dict begin begincmap
      /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
      1 begincodespacerange <0000> <FFFF> endcodespacerange
      2 beginbfchar <0001> <0048> <0002> <00E9> endbfchar
      2 beginbfrange <0003> <0005> <006A> <0006> <0007> [<00660069> <D83DDE00>] endbfrange
      endcmap end end`;
    const fonts = (first: number): Body[] => [
      `<< /Type /Font /Subtype /Type0 /BaseFont /AAAAAA+Test /Encoding /Identity-H /DescendantFonts [${first + 1} 0 R] /ToUnicode ${first + 2} 0 R >>`,
      '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /AAAAAA+Test /DW 500 /W [1 [600 500] 3 3 300] >>',
      flate(cmap),
    ];
    // One glyph run per Tj, each placed with Td, the way HTML-to-PDF converters write text.
    // Only the 3 unit gap after the narrow "j" is wide enough to be a space.
    const content = 'BT /F1 10 Tf 50 700 Td <00010002> Tj 11 0 Td <0003> Tj 6 0 Td <00040005> Tj <00060007> Tj ET';
    expect(text(content, fonts)).toBe('Héj klfi\u{1f600}');
  });

  it('falls back to the font encoding, including /Differences', () => {
    const fonts = (): Body[] => [
      '<< /Type /Font /Subtype /TrueType /BaseFont /Arial /Encoding << /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [1 /fi /eacute /quoteright /uni20AC] >> >>',
      '<< /Type /Font /Subtype /TrueType /BaseFont /Arial /Encoding /MacRomanEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>',
    ];
    const pdf = pdfWithPages(
      [
        String.raw`BT /F1 12 Tf 72 720 Td (caf\002 \223ok\224 \001ne it\003s \004 5 \377) Tj ET`,
        String.raw`BT /F2 12 Tf 72 720 Td (\216t\216 \320 \377) Tj ET`,
        String.raw`BT /F3 12 Tf 72 720 Td (\256ne don\047t) Tj ET`,
      ],
      fonts,
      3,
    );
    expect(pdfToText(pdf)).toBe('café “ok” fine it’s € 5 ÿ\n\nété – ˇ\n\nfine don’t');
  });

  it('knows the common glyph names', () => {
    expect(['A', 'Euro', 'quotedblleft', 'emdash', 'ydieresis', 'Agrave', 'germandbls', 'u1F600', 'g123'].map(glyphToText)).toEqual([
      'A',
      '€',
      '“',
      '—',
      'ÿ',
      'À',
      'ß',
      '\u{1f600}',
      '',
    ]);
  });

  it('turns TJ kerning into spaces only when the gap is wide', () => {
    expect(text('BT /F1 12 Tf 72 720 Td [(Hel) -20 (lo) -300 (wor) 15 (ld)] TJ ET')).toBe('Hello world');
  });

  it('follows a flipped coordinate system', () => {
    const content = `0.72 0 0 -0.72 72 841 cm
      BT /F1 15 Tf 1 0 0 -1 0 0 Tm 0 -190 Td (Line one) Tj ET
      BT /F1 15 Tf 1 0 0 -1 0 0 Tm 0 -208 Td (line two.) Tj ET`;
    expect(text(content)).toBe('Line one line two.');
  });

  it('skips inline image data and reads text inside form XObjects', () => {
    const pdf = buildPdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> /XObject << /Fm1 6 0 R /Im1 7 0 R >> >> >>',
      stream(
        concat([
          enc('BT /F1 12 Tf 72 720 Td (Before) Tj ET BI /W 2 /H 2 /BPC 8 /CS /G ID '),
          Uint8Array.from([0, 40, 255, 41]),
          enc(' EI q 1 0 0 1 0 -14 cm /Fm1 Do /Im1 Do Q BT /F1 12 Tf 72 692 Td (after.) Tj ET'),
        ]),
      ),
      HELVETICA,
      stream('BT /F9 12 Tf 72 720 Td (the form) Tj ET', '/Type /XObject /Subtype /Form /BBox [0 0 612 792] /Resources << /Font << /F9 5 0 R >> >>'),
      stream('(not text) Tj', '/Type /XObject /Subtype /Image /Width 1 /Height 1'),
    ]);
    expect(pdfToText(pdf)).toBe('Before the form after.');
  });

  it('keeps pages in page-tree order and inherits resources', () => {
    const pdf = buildPdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R 8 0 R] /Count 3 /Resources << /Font << /F1 10 0 R >> >> >>',
      '<< /Type /Pages /Parent 2 0 R /Kids [6 0 R 4 0 R] /Count 2 >>',
      '<< /Type /Page /Parent 3 0 R /Contents 5 0 R >>',
      stream('BT /F1 12 Tf 72 720 Td (Page two) Tj ET'),
      '<< /Type /Page /Parent 3 0 R /Contents 7 0 R >>',
      stream('BT /F1 12 Tf 72 720 Td (Page one) Tj ET'),
      '<< /Type /Page /Parent 2 0 R /Contents [9 0 R 11 0 R] >>',
      stream('BT /F1 12 Tf 72 720 Td (Page) Tj'),
      HELVETICA,
      flate('( three) Tj ET'),
    ]);
    expect(pdfToText(pdf)).toBe('Page one\n\nPage two\n\nPage three');
    expect(openPdf(pdf).pageCount).toBe(3);
  });

  it('stitches a paragraph cut by a page break and drops page numbers', () => {
    const pdf = pdfWithPages([
      'BT /F1 12 Tf 72 720 Td (The sentence runs on,) Tj ET BT /F1 12 Tf 300 40 Td (12) Tj ET',
      'BT /F1 12 Tf 72 720 Td (over the page.) Tj ET BT /F1 12 Tf 300 40 Td (13) Tj ET',
      'BT /F1 12 Tf 72 720 Td (A new one.) Tj ET',
    ]);
    expect(pdfToText(pdf)).toBe('The sentence runs on, over the page.\n\nA new one.');
  });

  it('produces text the chapter detector can split', () => {
    const page = (title: string, word: string) => {
      const lines = Array.from({ length: 12 }, (_l, i) => `(${word} sentence number ${i} fills the line.) Tj 0 -14 Td`).join(' ');
      return flate(`BT /F1 24 Tf 72 740 Td (${title}) Tj ET BT /F1 12 Tf 72 700 Td ${lines} ET`);
    };
    const chapters = detectChapters(pdfToText(pdfWithPages([page('CHAPTER ONE', 'First'), page('CHAPTER TWO', 'Second')])));
    expect(chapters.map((c) => c.title)).toEqual(['CHAPTER ONE', 'CHAPTER TWO']);
    expect(chapters[0].text).toContain('First sentence number 0 fills the line. First sentence number 1 fills the line.');
    expect(chapters[1].text).not.toContain('First');
  });

  it('reads cross-reference streams and object streams', () => {
    expect(pdfToText(xrefStreamPdf())).toBe('From an object stream');
  });

  it('rebuilds a damaged cross-reference table', () => {
    const page = 'BT /F1 12 Tf 72 720 Td (Still readable) Tj ET';
    const good = pdfWithPages([page]);
    const broken = buildPdf(
      ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 /Resources << /Font << /F1 5 0 R >> >> >>', '<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>', stream(page), HELVETICA],
      { startxref: 7 },
    );
    expect(pdfToText(good)).toBe('Still readable');
    expect(pdfToText(broken)).toBe('Still readable');
    expect(pdfToText(xrefStreamPdf(3))).toBe('From an object stream');
  });

  it('rejects encrypted PDFs with a clear message', () => {
    const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [] /Count 0 >>', '<< /Filter /Standard /V 2 /R 3 >>'];
    const run = () => pdfToText(buildPdf(objects, { trailer: '/Encrypt 3 0 R' }));
    expect(run).toThrow(PdfError);
    expect(run).toThrow(/password-protected/);
  });

  it('rejects PDFs with no extractable text', () => {
    const scanned = () => text('q 612 0 0 792 0 0 cm /Im1 Do Q');
    expect(scanned).toThrow(PdfError);
    expect(scanned).toThrow(/no readable text/);

    // Glyph ids of an embedded font with no ToUnicode map are not text.
    const fonts = (first: number): Body[] => [
      `<< /Type /Font /Subtype /Type0 /BaseFont /AAAAAA+Test /Encoding /Identity-H /DescendantFonts [${first + 1} 0 R] >>`,
      '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /AAAAAA+Test /DW 500 >>',
    ];
    expect(() => text('BT /F1 10 Tf 50 700 Td <000100020003> Tj ET', fonts)).toThrow(/no readable text/);
    expect(() => joinPdfPages([[], ['x'], []])).toThrow(/no readable text/);
  });

  it('rejects files that are not PDFs', () => {
    expect(() => pdfToText(enc('PK\u0003\u0004 not a pdf'))).toThrow(/not a PDF/);
    expect(() => pdfToText(enc('%PDF-1.4\nnothing useful here'))).toThrow(PdfError);
    expect(() => pdfToText(new Uint8Array(0))).toThrow(PdfError);
  });
});

// A PDF 1.5 layout: catalog, page tree, page and font live in a compressed object
// stream, and the cross-reference is a stream stored with the PNG "up" predictor.
function xrefStreamPdf(startxref?: number): Uint8Array {
  const members = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /Contents 6 0 R /Resources << /Font << /F1 4 0 R >> >> >>',
    HELVETICA,
  ];
  let body = '';
  let header = '';
  members.forEach((member, i) => {
    header += `${i + 1} ${body.length} `;
    body += `${member}\n`;
  });
  const parts = [enc('%PDF-1.5\n')];
  const offsets: number[] = [];
  let length = parts[0].length;
  const add = (num: number, data: Uint8Array) => {
    offsets[num] = length;
    const chunk = concat([enc(`${num} 0 obj\n`), data, enc('\nendobj\n')]);
    parts.push(chunk);
    length += chunk.length;
  };
  add(5, flate(header + body, `/Type /ObjStm /N ${members.length} /First ${header.length}`));
  add(6, flate('BT /F1 12 Tf 72 720 Td (From an object stream) Tj ET'));

  const xrefOffset = length;
  const rows = [
    [0, 0, 0, 0],
    ...members.map((_m, i) => [2, 0, 5, i]),
    [1, offsets[5] >> 8, offsets[5] & 0xff, 0],
    [1, offsets[6] >> 8, offsets[6] & 0xff, 0],
    [1, xrefOffset >> 8, xrefOffset & 0xff, 0],
  ];
  const predicted: number[] = [];
  rows.forEach((row, r) => {
    predicted.push(2);
    row.forEach((value, c) => predicted.push((value - (r > 0 ? rows[r - 1][c] : 0)) & 0xff));
  });
  add(7, flate(Uint8Array.from(predicted), '/Type /XRef /Size 8 /W [1 2 1] /Root 1 0 R /DecodeParms << /Predictor 12 /Columns 4 >>'));
  parts.push(enc(`startxref\n${startxref ?? xrefOffset}\n%%EOF\n`));
  return concat(parts);
}

// The user's own sample book. It is copyrighted and lives outside the repository,
// so this only runs on a machine that has it.
const SAMPLE = '/home/femiayodeji/sandbox/oso/books/Michaelides, Alex - The Silent Patient.pdf';

(existsSync(SAMPLE) ? describe : describe.skip)('pdfToText on the sample book', () => {
  it('extracts readable English that splits into chapters', () => {
    const extracted = pdfToText(new Uint8Array(readFileSync(SAMPLE)));
    expect(extracted.length).toBeGreaterThan(400_000);

    const commonWords = extracted.match(/\b(the|and|was|that|she|you)\b/g) ?? [];
    expect(commonWords.length).toBeGreaterThan(5_000);
    const ordinary = extracted.match(/[A-Za-z0-9\s.,;:!?'"()‘’“”—…-]/g) ?? [];
    expect(ordinary.length / extracted.length).toBeGreaterThan(0.99);
    const paragraphs = extracted.split('\n\n');
    expect(paragraphs.length).toBeGreaterThan(2_000);
    expect(Math.max(...paragraphs.map((p) => p.length))).toBeLessThan(10_000);

    const chapters = detectChapters(extracted);
    const titles = chapters.map((c) => c.title);
    expect(titles.slice(0, 4)).toEqual(['PROLOGUE', 'PART ONE', 'CHAPTER ONE', 'CHAPTER TWO']);
    expect(titles).toContain('CHAPTER THIRTY-FOUR');
    expect(chapters.length).toBeGreaterThan(60);
    expect(chapters.length).toBeLessThan(90);
    expect(Math.max(...chapters.map((c) => c.text.length))).toBeLessThan(40_000);
  }, 120_000);
});
