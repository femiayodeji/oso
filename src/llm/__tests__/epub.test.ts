import JSZip from 'jszip';

import { decodeEntities, htmlToText, parseContainerRootfile, parseOpfSpine, resolveZipPath } from '../epub';
import { detectChapters } from '../textSplit';

const CONTAINER = `<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;
const OPF = `<package><manifest>
  <item href="text/ch2.xhtml" id="c2" media-type="application/xhtml+xml"/>
  <item id="c1" href="text/ch%201.xhtml" media-type="application/xhtml+xml"/>
  <item id="css" href="style.css" media-type="text/css"/>
  <item id="cover" href="cover.jpg" media-type="image/jpeg"/>
</manifest><spine toc="ncx"><itemref idref="c1"/><itemref idref="cover"/><itemref idref="c2" linear="yes"/></spine></package>`;

describe('epub parsing', () => {
  it('finds the OPF path', () => {
    expect(parseContainerRootfile(CONTAINER)).toBe('OEBPS/content.opf');
    expect(parseContainerRootfile('<container/>')).toBeNull();
  });

  it('reads content documents in spine order, not manifest order', () => {
    expect(parseOpfSpine(OPF, 'OEBPS/content.opf')).toEqual(['OEBPS/text/ch 1.xhtml', 'OEBPS/text/ch2.xhtml']);
  });

  it('resolves relative paths', () => {
    expect(resolveZipPath('content.opf', 'a.xhtml')).toBe('a.xhtml');
    expect(resolveZipPath('OEBPS/pkg/content.opf', '../text/a.xhtml#frag')).toBe('OEBPS/text/a.xhtml');
  });

  it('decodes entities', () => {
    expect(decodeEntities('Tom &amp; Jerry &#8212; &#x41;&nbsp;&unknown;')).toBe('Tom & Jerry — A &unknown;');
  });

  it('strips html to text and keeps headings as markdown', () => {
    const html = `<html><head><title>x</title><style>p{}</style></head><body>
      <h1 class="t">Chapter <span>One</span></h1><p>First&nbsp;para with <em>emphasis</em>.</p>
      <p>Second<br/>line.</p><script>alert(1)</script></body></html>`;
    expect(htmlToText(html)).toBe('# Chapter One\n\nFirst para with emphasis.\n\nSecond\nline.');
  });

  it('round-trips a zipped epub into detectable chapters', async () => {
    const zip = new JSZip();
    const para = '<p>' + 'Words and more words. '.repeat(20) + '</p>';
    zip.file('META-INF/container.xml', CONTAINER);
    zip.file('OEBPS/content.opf', OPF);
    zip.file('OEBPS/text/ch 1.xhtml', `<html><body><h1>Alpha</h1>${para}</body></html>`);
    zip.file('OEBPS/text/ch2.xhtml', `<html><body><h1>Beta</h1>${para}</body></html>`);
    const loaded = await JSZip.loadAsync(await zip.generateAsync({ type: 'uint8array' }));

    const opfPath = parseContainerRootfile((await loaded.file('META-INF/container.xml')?.async('string')) ?? '');
    const spine = parseOpfSpine((await loaded.file(opfPath ?? '')?.async('string')) ?? '', opfPath ?? '');
    const texts = await Promise.all(spine.map(async (p) => htmlToText((await loaded.file(p)?.async('string')) ?? '')));
    expect(detectChapters(texts.join('\n\n')).map((c) => c.title)).toEqual(['Alpha', 'Beta']);
  });
});
