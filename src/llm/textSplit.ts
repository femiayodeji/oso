// Pure text helpers for uploaded books: chapter detection and size-based chunking.

export type DetectedChapter = { title: string; text: string };

const NUMBER_WORDS =
  'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|' +
  'twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred';
const KEYWORD_RE = new RegExp(`^(chapter|part|book|section)\\s+(\\d+|[ivxlcdm]+|${NUMBER_WORDS})\\b`, 'i');
const STANDALONE_RE = /^(prologue|epilogue|introduction|preface|foreword|afterword|conclusion|appendix(\s+[a-z0-9]+)?)[.:]?$/i;
const MARKDOWN_RE = /^(#{1,3})\s+(.+?)\s*#*$/;
const MAX_HEADING_CHARS = 80;
const MIN_PREAMBLE_CHARS = 2000;
const DEFAULT_MIN_CHAPTER_CHARS = 200;
export const FULL_TEXT_TITLE = 'Full text';

type Heading = { line: number; title: string };

function markdownHeadings(lines: string[]): Heading[] {
  const byLevel: Heading[][] = [[], [], []];
  lines.forEach((raw, line) => {
    const match = MARKDOWN_RE.exec(raw.trim());
    if (match) byLevel[match[1].length - 1].push({ line, title: match[2].trim() });
  });
  return byLevel.find((level) => level.length >= 2) ?? [];
}

function keywordHeadings(lines: string[]): Heading[] {
  const headings: Heading[] = [];
  lines.forEach((raw, line) => {
    const text = raw.trim();
    if (!text || text.length > MAX_HEADING_CHARS) return;
    const afterBlank = line === 0 || lines[line - 1].trim() === '';
    if (!afterBlank) return;
    if (KEYWORD_RE.test(text) || STANDALONE_RE.test(text)) headings.push({ line, title: text.replace(/[.:]$/, '') });
  });
  return headings;
}

// Splits a book's text on its chapter headings (markdown headings, or lines such as
// "Chapter 3" / "Prologue"). Sections shorter than `minChars` are treated as
// table-of-contents noise and dropped. Text with no headings comes back as one chapter.
export function detectChapters(text: string, opts: { minChars?: number } = {}): DetectedChapter[] {
  const minChars = opts.minChars ?? DEFAULT_MIN_CHAPTER_CHARS;
  const normalized = text.replace(/\r\n?/g, '\n');
  const whole = normalized.trim();
  if (!whole) return [];

  const lines = normalized.split('\n');
  const markdown = markdownHeadings(lines);
  const headings = markdown.length > 0 ? markdown : keywordHeadings(lines);
  const slice = (from: number, to: number) => lines.slice(from, to).join('\n').trim();

  const sections: DetectedChapter[] = headings
    .map((h, i) => ({ title: h.title, text: slice(h.line + 1, headings[i + 1]?.line ?? lines.length) }))
    .filter((s) => s.text.length >= minChars);
  if (sections.length === 0) return [{ title: FULL_TEXT_TITLE, text: whole }];

  const preamble = slice(0, headings[0].line);
  return preamble.length >= Math.max(MIN_PREAMBLE_CHARS, minChars)
    ? [{ title: 'Opening', text: preamble }, ...sections]
    : sections;
}

function splitOversized(piece: string, maxChars: number): string[] {
  const out: string[] = [];
  let rest = piece;
  while (rest.length > maxChars) {
    const window = rest.slice(0, maxChars);
    const sentenceEnd = Math.max(window.lastIndexOf('. '), window.lastIndexOf('.\n'), window.lastIndexOf('? '), window.lastIndexOf('! '));
    const space = window.lastIndexOf(' ');
    const cut = sentenceEnd > maxChars / 2 ? sentenceEnd + 1 : space > maxChars / 2 ? space : maxChars;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

// Packs paragraphs into chunks of at most `maxChars`, splitting a paragraph at a
// sentence or word boundary only when it is too large on its own.
export function chunkBySize(text: string, maxChars: number): string[] {
  const limit = Math.max(1, Math.floor(maxChars));
  const paragraphs = text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) => (p.length > limit ? splitOversized(p, limit) : [p]));

  const chunks: string[] = [];
  let current = '';
  for (const paragraph of paragraphs) {
    if (current && current.length + 2 + paragraph.length > limit) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

// Chapter rows for an uploaded book: detected chapters, with any chapter too large
// for one model call split into numbered parts.
export function buildUploadedOutline(text: string, maxChars: number): DetectedChapter[] {
  return detectChapters(text).flatMap((chapter) => {
    if (chapter.text.length <= maxChars) return [chapter];
    const parts = chunkBySize(chapter.text, maxChars);
    return parts.map((part, i) => ({
      title:
        chapter.title === FULL_TEXT_TITLE
          ? `Part ${i + 1}`
          : `${chapter.title} (part ${i + 1} of ${parts.length})`,
      text: part,
    }));
  });
}

// Shortens a chapter that a provider refused as too large: keeps whole paragraphs from
// the start and the end (where a chapter is set up and resolved) and drops the middle.
export function condenseText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const paragraphs = text.split(/\n{2,}/);
  const headBudget = Math.floor(maxChars * 0.6);
  const tailBudget = maxChars - headBudget;
  const head: string[] = [];
  let used = 0;
  let i = 0;
  for (; i < paragraphs.length && used + paragraphs[i].length <= headBudget; i++) {
    head.push(paragraphs[i]);
    used += paragraphs[i].length + 2;
  }
  const tail: string[] = [];
  used = 0;
  for (let j = paragraphs.length - 1; j >= i && used + paragraphs[j].length <= tailBudget; j--) {
    tail.unshift(paragraphs[j]);
    used += paragraphs[j].length + 2;
  }
  // One giant paragraph: fall back to a plain cut.
  if (head.length === 0 && tail.length === 0) {
    return `${text.slice(0, headBudget)}\n\n[...]\n\n${text.slice(text.length - tailBudget)}`;
  }
  return [...head, '[...]', ...tail].join('\n\n');
}
