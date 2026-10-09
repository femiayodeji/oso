import { Directory, File, Paths } from 'expo-file-system';
import JSZip from 'jszip';

import { htmlToText, parseContainerRootfile, parseOpfSpine } from './epub';
import { joinPdfPages, openPdf } from './pdf';

export { buildUploadedOutline, chunkBySize, detectChapters } from './textSplit';

const BOOKS_DIR = 'books';
const SUPPORTED = ['txt', 'md', 'epub', 'pdf'];
const PDF_PAGES_PER_TICK = 4;

function booksDirectory(): Directory {
  const dir = new Directory(Paths.document, BOOKS_DIR);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function extensionOf(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name.split(/[?#]/)[0]);
  return match ? match[1].toLowerCase() : '';
}

function safeName(name: string): string {
  const base = name.replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
  return (base || 'book').slice(0, 40);
}

// Copies a picked file into the app's document directory so it survives cache
// cleanup and can be re-read when the book is regenerated.
export async function importBookFile(uri: string, name: string): Promise<string> {
  const dir = booksDirectory();
  if (uri.startsWith(dir.uri)) return uri;
  const ext = extensionOf(name) || extensionOf(uri) || 'txt';
  if (!SUPPORTED.includes(ext)) throw new Error('Unsupported file type. Use .pdf, .epub, .txt, or .md.');
  const dest = new File(dir, `${Date.now()}-${safeName(name)}.${ext}`);
  await new File(uri).copy(dest);
  return dest.uri;
}

export async function savePastedText(text: string): Promise<string> {
  const file = new File(booksDirectory(), `${Date.now()}-pasted.txt`);
  file.create({ overwrite: true });
  file.write(text);
  return file.uri;
}

async function readEpub(file: File): Promise<string> {
  const zip = await JSZip.loadAsync(await file.bytes());
  const container = await zip.file('META-INF/container.xml')?.async('string');
  const opfPath = container ? parseContainerRootfile(container) : null;
  const opf = opfPath ? await zip.file(opfPath)?.async('string') : undefined;
  if (!opfPath || !opf) throw new Error('This epub could not be read.');

  const sections: string[] = [];
  for (const path of parseOpfSpine(opf, opfPath)) {
    const html = await zip.file(path)?.async('string');
    const text = html ? htmlToText(html) : '';
    if (text) sections.push(text);
  }
  return sections.join('\n\n');
}

// Parsing runs on the JS thread, so it pauses every few pages to keep the UI responsive.
async function readPdf(file: File): Promise<string> {
  const pdf = openPdf(await file.bytes());
  const pages: string[][] = [];
  for (let i = 0; i < pdf.pageCount; i++) {
    pages.push(pdf.pageParagraphs(i));
    if (i % PDF_PAGES_PER_TICK === PDF_PAGES_PER_TICK - 1) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return joinPdfPages(pages);
}

export async function readBookText(uri: string): Promise<string> {
  const file = new File(uri);
  if (!file.exists) throw new Error('The book file is missing.');
  const ext = extensionOf(uri);
  if (ext === 'epub') return readEpub(file);
  if (ext === 'pdf') return readPdf(file);
  return file.text();
}
