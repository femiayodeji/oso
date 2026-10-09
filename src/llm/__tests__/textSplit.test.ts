import { buildUploadedOutline, chunkBySize, detectChapters } from '../textSplit';

const body = (seed: string, n = 30) => Array.from({ length: n }, (_, i) => `${seed} sentence number ${i}.`).join(' ');

describe('detectChapters', () => {
  it('returns nothing for empty text', () => {
    expect(detectChapters('  \n ')).toEqual([]);
  });

  it('returns one chapter when there are no headings', () => {
    const out = detectChapters('Just some prose.\n\nMore prose.');
    expect(out).toHaveLength(1);
    expect(out[0].text).toContain('More prose.');
  });

  it('splits on "Chapter N" headings', () => {
    const text = `Chapter 1: The Start\n\n${body('one')}\n\nCHAPTER 2\n\n${body('two')}\r\n\r\nChapter Three\n\n${body('three')}`;
    const out = detectChapters(text);
    expect(out.map((c) => c.title)).toEqual(['Chapter 1: The Start', 'CHAPTER 2', 'Chapter Three']);
    expect(out[0].text).toContain('one sentence number 0.');
    expect(out[0].text).not.toContain('two sentence');
    expect(out[2].text).toContain('three sentence number 29.');
  });

  it('recognises roman numerals and standalone section names', () => {
    const text = `Prologue\n\n${body('p')}\n\nChapter IV\n\n${body('four')}\n\nEpilogue\n\n${body('e')}`;
    expect(detectChapters(text).map((c) => c.title)).toEqual(['Prologue', 'Chapter IV', 'Epilogue']);
  });

  it('ignores "chapter" inside a paragraph', () => {
    const text = `Chapter 1\n\n${body('one')}\nChapter 2 of this story was never written down by anyone.\n${body('more')}`;
    expect(detectChapters(text)).toHaveLength(1);
  });

  it('drops table-of-contents entries with no body', () => {
    const text = `Chapter 1\n\nChapter 2\n\nChapter 1\n\n${body('one')}\n\nChapter 2\n\n${body('two')}`;
    const out = detectChapters(text);
    expect(out.map((c) => c.title)).toEqual(['Chapter 1', 'Chapter 2']);
    expect(out[0].text).toContain('one sentence');
  });

  it('prefers markdown headings at the shallowest repeated level', () => {
    const text = `# My Book\n\nby someone\n\n## Getting Started\n\n${body('a')}\n\n### Detail\n\n${body('sub')}\n\n## Going Deeper\n\n${body('b')}`;
    const out = detectChapters(text);
    expect(out.map((c) => c.title)).toEqual(['Getting Started', 'Going Deeper']);
    expect(out[0].text).toContain('sub sentence');
  });

  it('keeps a long preamble as an opening section', () => {
    const text = `${body('intro', 200)}\n\nChapter 1\n\n${body('one')}`;
    expect(detectChapters(text).map((c) => c.title)).toEqual(['Opening', 'Chapter 1']);
  });

  it('respects minChars', () => {
    expect(detectChapters('Chapter 1\n\nshort\n\nChapter 2\n\ntiny', { minChars: 1 }).map((c) => c.text)).toEqual(['short', 'tiny']);
  });
});

describe('chunkBySize', () => {
  it('returns nothing for empty text and one chunk for small text', () => {
    expect(chunkBySize('', 100)).toEqual([]);
    expect(chunkBySize('hello\n\nworld', 100)).toEqual(['hello\n\nworld']);
  });

  it('packs paragraphs without exceeding the limit or losing text', () => {
    const paragraphs = Array.from({ length: 20 }, (_, i) => `Paragraph ${i} ${'x'.repeat(40)}`);
    const chunks = chunkBySize(paragraphs.join('\n\n'), 200);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c) => expect(c.length).toBeLessThanOrEqual(200));
    expect(chunks.join('\n\n')).toBe(paragraphs.join('\n\n'));
  });

  it('splits an oversized paragraph at sentence boundaries', () => {
    const paragraph = Array.from({ length: 30 }, (_, i) => `This is sentence ${i}.`).join(' ');
    const chunks = chunkBySize(paragraph, 120);
    chunks.forEach((c) => {
      expect(c.length).toBeLessThanOrEqual(120);
      expect(c.endsWith('.')).toBe(true);
    });
    expect(chunks.join(' ')).toBe(paragraph);
  });

  it('hard-splits text with no boundaries', () => {
    const chunks = chunkBySize('a'.repeat(250), 100);
    expect(chunks.map((c) => c.length)).toEqual([100, 100, 50]);
  });
});

describe('buildUploadedOutline', () => {
  it('splits only the chapters that are too large', () => {
    const text = `Chapter 1\n\n${body('one', 10)}\n\nChapter 2\n\n${Array.from({ length: 8 }, (_, i) => body(`two${i}`, 10)).join('\n\n')}`;
    const out = buildUploadedOutline(text, 600);
    expect(out[0].title).toBe('Chapter 1');
    expect(out.slice(1).map((c) => c.title)[0]).toMatch(/^Chapter 2 \(part 1 of \d+\)$/);
    out.forEach((c) => expect(c.text.length).toBeLessThanOrEqual(600));
  });

  it('names parts of a book with no headings', () => {
    const text = Array.from({ length: 6 }, (_, i) => body(`p${i}`, 10)).join('\n\n');
    expect(buildUploadedOutline(text, 600).map((c) => c.title)).toEqual(expect.arrayContaining(['Part 1', 'Part 2']));
  });
});
