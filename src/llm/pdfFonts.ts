// Pure PDF font helpers: turning the glyph codes in a text-showing operator into
// Unicode (ToUnicode CMap first, then the font's encoding) and reading glyph widths.
import { Lexer, Name, Op, Stream, type Dict, type Obj, type PdfDocument } from './pdfObjects';

export type PdfFont = {
  bytesPerCode: number;
  // '' when the code has no known Unicode meaning.
  text: (code: number) => string;
  // Advance in thousandths of the font size.
  width: (code: number) => number;
};

// Glyph names of WinAnsiEncoding (Windows-1252) for codes 0x20 to 0xFF, in order.
const WIN_ANSI_NAMES = (
  'space exclam quotedbl numbersign dollar percent ampersand quotesingle parenleft parenright asterisk plus comma hyphen period slash ' +
  'zero one two three four five six seven eight nine colon semicolon less equal greater question at ' +
  'A B C D E F G H I J K L M N O P Q R S T U V W X Y Z bracketleft backslash bracketright asciicircum underscore grave ' +
  'a b c d e f g h i j k l m n o p q r s t u v w x y z braceleft bar braceright asciitilde . ' +
  'Euro . quotesinglbase florin quotedblbase ellipsis dagger daggerdbl circumflex perthousand Scaron guilsinglleft OE . Zcaron . ' +
  '. quoteleft quoteright quotedblleft quotedblright bullet endash emdash tilde trademark scaron guilsinglright oe . zcaron Ydieresis ' +
  'nbspace exclamdown cent sterling currency yen brokenbar section dieresis copyright ordfeminine guillemotleft logicalnot sfthyphen registered macron ' +
  'degree plusminus twosuperior threesuperior acute mu paragraph periodcentered cedilla onesuperior ordmasculine guillemotright onequarter onehalf threequarters questiondown ' +
  'Agrave Aacute Acircumflex Atilde Adieresis Aring AE Ccedilla Egrave Eacute Ecircumflex Edieresis Igrave Iacute Icircumflex Idieresis ' +
  'Eth Ntilde Ograve Oacute Ocircumflex Otilde Odieresis multiply Oslash Ugrave Uacute Ucircumflex Udieresis Yacute Thorn germandbls ' +
  'agrave aacute acircumflex atilde adieresis aring ae ccedilla egrave eacute ecircumflex edieresis igrave iacute icircumflex idieresis ' +
  'eth ntilde ograve oacute ocircumflex otilde odieresis divide oslash ugrave uacute ucircumflex udieresis yacute thorn ydieresis'
).split(' ');
const WIN_ANSI_HIGH = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ';
const MAC_ROMAN_HIGH =
  'ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø¿¡¬√ƒ≈∆«»…\u00a0ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄€‹›ﬁﬂ‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔ\uf8ffÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ';
// Where StandardEncoding differs from ASCII / has printable text above 0x7F.
const STANDARD_OVERRIDES: Record<number, string> = {
  0x27: '’', 0x60: '‘', 0xa1: '¡', 0xa2: '¢', 0xa3: '£', 0xa4: '⁄', 0xa5: '¥', 0xa6: 'ƒ', 0xa7: '§', 0xa8: '¤',
  0xa9: "'", 0xaa: '“', 0xab: '«', 0xac: '‹', 0xad: '›', 0xae: 'fi', 0xaf: 'fl', 0xb1: '–', 0xb2: '†', 0xb3: '‡',
  0xb4: '·', 0xb6: '¶', 0xb7: '•', 0xb8: '‚', 0xb9: '„', 0xba: '”', 0xbb: '»', 0xbc: '…', 0xbd: '‰', 0xbf: '¿',
  0xd0: '—', 0xe1: 'Æ', 0xe3: 'ª', 0xe8: 'Ł', 0xe9: 'Ø', 0xea: 'Œ', 0xeb: 'º', 0xf1: 'æ', 0xf5: 'ı', 0xf8: 'ł',
  0xf9: 'ø', 0xfa: 'œ', 0xfb: 'ß',
};
const EXTRA_GLYPHS: Record<string, string> = {
  fi: 'fi', fl: 'fl', ff: 'ff', ffi: 'ffi', ffl: 'ffl', minus: '−', fraction: '⁄', dotlessi: 'ı', Lslash: 'Ł', lslash: 'ł',
  hyphenminus: '-', sfthyphen: '\u00ad', nbspace: ' ',
};

function winAnsiTable(): string[] {
  const table: string[] = new Array<string>(256).fill('');
  for (let code = 0x20; code < 0x100; code++) {
    table[code] = code >= 0x80 && code < 0xa0 ? WIN_ANSI_HIGH[code - 0x80] : String.fromCharCode(code);
  }
  table[0x7f] = '';
  return table;
}

function macRomanTable(): string[] {
  const table = winAnsiTable();
  for (let code = 0x80; code < 0x100; code++) table[code] = MAC_ROMAN_HIGH[code - 0x80];
  return table;
}

function standardTable(): string[] {
  const table = winAnsiTable();
  for (let code = 0x80; code < 0x100; code++) table[code] = '';
  for (const [code, text] of Object.entries(STANDARD_OVERRIDES)) table[Number(code)] = text;
  return table;
}

function buildGlyphNames(): Map<string, string> {
  const table = winAnsiTable();
  const names = new Map(Object.entries(EXTRA_GLYPHS));
  WIN_ANSI_NAMES.forEach((glyph, i) => {
    if (glyph !== '.' && !names.has(glyph)) names.set(glyph, table[0x20 + i]);
  });
  return names;
}

let glyphNames: Map<string, string> | null = null;

// Unicode for a glyph name from an encoding's /Differences array; '' when unknown.
export function glyphToText(name: string): string {
  glyphNames ??= buildGlyphNames();
  const known = glyphNames.get(name);
  if (known !== undefined) return known;
  const hex = /^(?:uni|u)([0-9A-Fa-f]{4,6})$/.exec(name);
  const code = hex ? parseInt(hex[1], 16) : -1;
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
}

function bigEndian(bytes: Uint8Array): number {
  let value = 0;
  for (let i = 0; i < bytes.length; i++) value = value * 256 + bytes[i];
  return value;
}

function utf16(bytes: Uint8Array): string {
  if (bytes.length === 1) return String.fromCharCode(bytes[0]);
  let text = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) text += String.fromCharCode(bytes[i] * 256 + bytes[i + 1]);
  return text;
}

export type CMap = { codeBytes: number; lookup: (code: number) => string | undefined };

// Reads the bfchar / bfrange sections of a ToUnicode CMap.
export function parseCMap(data: Uint8Array): CMap {
  const single = new Map<number, string | undefined>();
  const ranges: { lo: number; hi: number; target: string | string[] }[] = [];
  let codeBytes = 0;
  let operands: Obj[] = [];
  const lexer = new Lexer(data);
  for (let token = lexer.read(); token !== undefined; token = lexer.read()) {
    if (!(token instanceof Op)) {
      operands.push(token);
      continue;
    }
    if (token.op === 'endcodespacerange') {
      for (const operand of operands) if (operand instanceof Uint8Array) codeBytes = Math.max(codeBytes, operand.length);
    } else if (token.op === 'endbfchar') {
      for (let i = 0; i + 1 < operands.length; i += 2) {
        const source = operands[i];
        const target = operands[i + 1];
        if (source instanceof Uint8Array && target instanceof Uint8Array) single.set(bigEndian(source), utf16(target));
      }
    } else if (token.op === 'endbfrange') {
      for (let i = 0; i + 2 < operands.length; i += 3) {
        const lo = operands[i];
        const hi = operands[i + 1];
        const target = operands[i + 2];
        if (!(lo instanceof Uint8Array) || !(hi instanceof Uint8Array)) continue;
        if (target instanceof Uint8Array) ranges.push({ lo: bigEndian(lo), hi: bigEndian(hi), target: utf16(target) });
        else if (Array.isArray(target)) {
          ranges.push({ lo: bigEndian(lo), hi: bigEndian(hi), target: target.map((t) => (t instanceof Uint8Array ? utf16(t) : '')) });
        }
      }
    }
    operands = [];
  }

  const lookup = (code: number): string | undefined => {
    if (single.has(code)) return single.get(code);
    let found: string | undefined;
    for (const range of ranges) {
      if (code < range.lo || code > range.hi) continue;
      const step = code - range.lo;
      if (Array.isArray(range.target)) found = range.target[step];
      else if (range.target) {
        // The last UTF-16 unit counts up through the range.
        const last = range.target.length - 1;
        found = range.target.slice(0, last) + String.fromCharCode(range.target.charCodeAt(last) + step);
      }
      break;
    }
    single.set(code, found);
    return found;
  };
  return { codeBytes, lookup };
}

function encodingTable(doc: PdfDocument, font: Dict): string[] {
  const encoding = doc.resolve(font.get('Encoding'));
  const dict = encoding instanceof Map ? encoding : null;
  const base = encoding instanceof Name ? encoding.name : dict ? doc.name(dict.get('BaseEncoding')) : '';
  let table: string[];
  if (base === 'MacRomanEncoding') table = macRomanTable();
  else if (base === 'StandardEncoding' || (!base && doc.name(font.get('Subtype')) === 'Type1')) table = standardTable();
  else table = winAnsiTable();

  let code = 0;
  for (const item of dict ? doc.array(dict.get('Differences')) : []) {
    if (typeof item === 'number') code = item;
    else if (item instanceof Name) {
      if (code >= 0 && code < 256) table[code] = glyphToText(item.name);
      code++;
    }
  }
  return table;
}

function simpleWidths(doc: PdfDocument, font: Dict): (code: number) => number {
  const widths = doc.array(font.get('Widths'));
  const first = doc.number(font.get('FirstChar'), 0);
  const missing = doc.number(doc.dict(font.get('FontDescriptor'))?.get('MissingWidth'), 0);
  // The 14 standard fonts may omit /Widths; half an em is close enough to place spaces.
  if (widths.length === 0) return () => 500;
  return (code) => doc.number(widths[code - first], missing);
}

function cidWidths(doc: PdfDocument, descendant: Dict | null): (code: number) => number {
  const fallback = doc.number(descendant?.get('DW'), 1000);
  const widths = new Map<number, number>();
  const w = doc.array(descendant?.get('W'));
  for (let i = 0; i + 1 < w.length; ) {
    const first = doc.number(w[i], 0);
    const second = doc.resolve(w[i + 1]);
    if (Array.isArray(second)) {
      second.forEach((width, k) => widths.set(first + k, doc.number(width, fallback)));
      i += 2;
    } else {
      const last = Math.min(doc.number(second, first), first + 0xffff);
      const width = doc.number(w[i + 2], fallback);
      for (let cid = first; cid <= last; cid++) widths.set(cid, width);
      i += 3;
    }
  }
  return (code) => widths.get(code) ?? fallback;
}

export function loadFont(doc: PdfDocument, font: Dict): PdfFont {
  const toUnicode = doc.resolve(font.get('ToUnicode'));
  let cmap: CMap | null = null;
  if (toUnicode instanceof Stream) {
    try {
      cmap = parseCMap(doc.decode(toUnicode));
    } catch {
      cmap = null;
    }
  }

  if (doc.name(font.get('Subtype')) === 'Type0') {
    const identity = doc.name(font.get('Encoding')).startsWith('Identity');
    const map = cmap;
    return {
      bytesPerCode: identity ? 2 : map?.codeBytes || 2,
      // Without a ToUnicode map the codes are glyph ids of an embedded font: not text.
      text: (code) => map?.lookup(code) ?? '',
      width: cidWidths(doc, doc.dict(doc.array(font.get('DescendantFonts'))[0])),
    };
  }

  const table = encodingTable(doc, font);
  const map = cmap;
  return {
    bytesPerCode: 1,
    text: (code) => map?.lookup(code) ?? table[code] ?? '',
    width: simpleWidths(doc, font),
  };
}
