// Pure epub helpers: container/OPF parsing and HTML to text. No DOM is available
// in React Native, so these work on the markup with regular expressions.

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] !== '#') return ENTITIES[body.toLowerCase()] ?? whole;
    const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  for (let m = re.exec(tag); m; m = re.exec(tag)) attrs[m[1].toLowerCase()] = decodeEntities(m[3] ?? m[4] ?? '');
  return attrs;
}

function tags(xml: string, name: string): Record<string, string>[] {
  const re = new RegExp(`<(?:[\\w-]+:)?${name}\\b[^>]*>`, 'gi');
  return (xml.match(re) ?? []).map(parseAttributes);
}

export function parseContainerRootfile(containerXml: string): string | null {
  return tags(containerXml, 'rootfile')[0]?.['full-path'] ?? null;
}

export function resolveZipPath(baseFile: string, href: string): string {
  const clean = href.split('#')[0];
  let decoded = clean;
  try {
    decoded = decodeURIComponent(clean);
  } catch {
    decoded = clean;
  }
  const parts = baseFile.split('/').slice(0, -1);
  for (const segment of decoded.split('/')) {
    if (segment === '..') parts.pop();
    else if (segment && segment !== '.') parts.push(segment);
  }
  return parts.join('/');
}

// Zip paths of the content documents, in spine (reading) order.
export function parseOpfSpine(opfXml: string, opfPath: string): string[] {
  const manifest = new Map<string, { href: string; type: string }>();
  for (const item of tags(opfXml, 'item')) {
    if (item.id && item.href) manifest.set(item.id, { href: item.href, type: item['media-type'] ?? '' });
  }
  return tags(opfXml, 'itemref')
    .map((ref) => manifest.get(ref.idref ?? ''))
    .filter((item): item is { href: string; type: string } => Boolean(item) && /html|xml/i.test(item?.type ?? ''))
    .map((item) => resolveZipPath(opfPath, item.href));
}

function inlineText(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

// Strips markup. h1-h3 become markdown headings so chapter detection can find them.
export function htmlToText(html: string): string {
  const body = html
    .replace(/<head\b[\s\S]*?<\/head>/gi, '')
    .replace(/<(script|style|svg|nav)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const withHeadings = body.replace(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_whole, level: string, inner: string) => {
    const title = inlineText(inner);
    return title ? `\n\n${'#'.repeat(Number(level))} ${title}\n\n` : '\n\n';
  });
  const text = withHeadings
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|blockquote|tr|section|article|h[4-6])>/gi, '\n\n')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(text)
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
