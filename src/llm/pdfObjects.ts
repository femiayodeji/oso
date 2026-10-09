// Pure PDF object layer: tokenizer, cross-reference table, object streams and
// stream filters. Works on a Uint8Array only (no DOM, Buffer or fs), so it runs in Hermes.
import { inflate } from 'pako';

export class PdfError extends Error {}

export class Name {
  constructor(readonly name: string) {}
}
export class Ref {
  constructor(readonly num: number) {}
}
// A bare keyword: a content-stream operator, or `obj` / `stream` / `trailer` in the file body.
export class Op {
  constructor(readonly op: string) {}
}
export type Dict = Map<string, Obj>;
export class Stream {
  constructor(readonly dict: Dict, readonly start: number) {}
}
// PDF strings stay as bytes: their meaning depends on the font that shows them.
export type Obj = number | boolean | null | Name | Ref | Op | Uint8Array | Obj[] | Dict | Stream;

const UNREADABLE = 'This PDF could not be read.';
const MAX_REF_HOPS = 32;

// Byte classes as a table: the tokenizer looks at every byte of every page, and a
// table lookup is much cheaper than a function call in an interpreter like Hermes.
const SPACE = 1;
const DELIMITER = 2;
const CLASS = new Uint8Array(256);
for (const c of [0, 9, 10, 12, 13, 32]) CLASS[c] = SPACE;
for (const c of '()<>[]{}/%') CLASS[c.charCodeAt(0)] = DELIMITER;

function isSpace(c: number): boolean {
  return CLASS[c] === SPACE;
}

function isDelimiter(c: number): boolean {
  return CLASS[c] === DELIMITER;
}

function isDigit(c: number): boolean {
  return c >= 48 && c <= 57;
}

function hexValue(c: number): number {
  if (c >= 48 && c <= 57) return c - 48;
  if (c >= 65 && c <= 70) return c - 55;
  if (c >= 97 && c <= 102) return c - 87;
  return -1;
}

export function startsWith(bytes: Uint8Array, word: string, at: number): boolean {
  if (at < 0 || at + word.length > bytes.length) return false;
  for (let i = 0; i < word.length; i++) if (bytes[at + i] !== word.charCodeAt(i)) return false;
  return true;
}

export function indexOfWord(bytes: Uint8Array, word: string, from: number): number {
  const first = word.charCodeAt(0);
  for (let i = Math.max(0, from); i <= bytes.length - word.length; i++) {
    if (bytes[i] === first && startsWith(bytes, word, i)) return i;
  }
  return -1;
}

function lastIndexOfWord(bytes: Uint8Array, word: string): number {
  for (let i = bytes.length - word.length; i >= 0; i--) if (startsWith(bytes, word, i)) return i;
  return -1;
}

export class Lexer {
  constructor(
    readonly bytes: Uint8Array,
    public pos = 0,
    // `12 0 R` is a reference in the file body, but three separate tokens in a content stream.
    public refs = false,
  ) {}

  skipSpace(): void {
    const b = this.bytes;
    let pos = this.pos;
    while (pos < b.length) {
      const c = b[pos];
      if (CLASS[c] === SPACE) pos++;
      else if (c === 37) while (pos < b.length && b[pos] !== 10 && b[pos] !== 13) pos++;
      else break;
    }
    this.pos = pos;
  }

  // Next object or keyword; undefined at the end of the data.
  read(): Obj | undefined {
    this.skipSpace();
    const b = this.bytes;
    if (this.pos >= b.length) return undefined;
    const c = b[this.pos];
    if (c === 47) return this.readName();
    if (c === 40) return this.readLiteralString();
    if (c === 60) return b[this.pos + 1] === 60 ? this.readDict() : this.readHexString();
    if (c === 91) return this.readArray();
    if (isDigit(c) || c === 43 || c === 45 || c === 46) return this.readNumber();
    if (isDelimiter(c)) {
      this.pos++; // stray delimiter: report it as a keyword so the caller keeps moving
      return new Op(String.fromCharCode(c));
    }
    const word = this.readWord();
    if (word === 'true') return true;
    if (word === 'false') return false;
    if (word === 'null') return null;
    return new Op(word);
  }

  private readWord(): string {
    const b = this.bytes;
    const start = this.pos;
    let end = start;
    while (end < b.length && CLASS[b[end]] === 0) end++;
    this.pos = end;
    // Operators are one to three characters; skip the loop for those.
    const length = this.pos - start;
    if (length === 1) return String.fromCharCode(b[start]);
    if (length === 2) return String.fromCharCode(b[start], b[start + 1]);
    let word = '';
    for (let i = start; i < this.pos; i++) word += String.fromCharCode(b[i]);
    return word;
  }

  private readName(): Name {
    this.pos++;
    const raw = this.readWord();
    return new Name(raw.includes('#') ? raw.replace(/#([0-9a-fA-F]{2})/g, (_w, h: string) => String.fromCharCode(parseInt(h, 16))) : raw);
  }

  private readNumber(): Obj {
    const b = this.bytes;
    let negative = false;
    let integer = true;
    let whole = 0;
    let fraction = 0;
    let divisor = 1;
    let pos = this.pos;
    for (; pos < b.length; pos++) {
      const c = b[pos];
      if (c >= 48 && c <= 57) {
        if (integer) whole = whole * 10 + c - 48;
        else {
          fraction = fraction * 10 + c - 48;
          divisor *= 10;
        }
      } else if (c === 46) integer = false;
      else if (c === 45) negative = true;
      else if (c !== 43) break;
    }
    this.pos = pos;
    const magnitude = whole + fraction / divisor;
    const num = negative ? -magnitude : magnitude;
    if (!this.refs || !integer || num < 0) return num;

    const after = this.pos;
    this.skipSpace();
    const genStart = this.pos;
    while (this.pos < b.length && isDigit(b[this.pos])) this.pos++;
    if (this.pos > genStart) {
      this.skipSpace();
      const next = b[this.pos + 1];
      if (b[this.pos] === 82 && (next === undefined || isSpace(next) || isDelimiter(next))) {
        this.pos++;
        return new Ref(num);
      }
    }
    this.pos = after;
    return num;
  }

  private readLiteralString(): Uint8Array {
    const b = this.bytes;
    const out: number[] = [];
    let depth = 1;
    this.pos++;
    while (this.pos < b.length) {
      let c = b[this.pos++];
      if (c === 40) depth++;
      else if (c === 41 && --depth === 0) break;
      else if (c === 92) {
        c = b[this.pos++];
        if (c === 110) c = 10;
        else if (c === 114) c = 13;
        else if (c === 116) c = 9;
        else if (c === 98) c = 8;
        else if (c === 102) c = 12;
        else if (c >= 48 && c <= 55) {
          let octal = c - 48;
          for (let n = 0; n < 2 && b[this.pos] >= 48 && b[this.pos] <= 55; n++) octal = octal * 8 + b[this.pos++] - 48;
          c = octal & 0xff;
        } else if (c === 13) {
          if (b[this.pos] === 10) this.pos++;
          continue; // backslash + newline is a line continuation
        } else if (c === 10) continue;
      }
      out.push(c);
    }
    return Uint8Array.from(out);
  }

  private readHexString(): Uint8Array {
    const b = this.bytes;
    const start = this.pos + 1;
    let end = start;
    while (end < b.length && b[end] !== 62) end++;
    this.pos = Math.min(end + 1, b.length);
    return decodeHex(b, start, end);
  }

  private readArray(): Obj[] {
    const out: Obj[] = [];
    this.pos++;
    for (;;) {
      this.skipSpace();
      if (this.pos >= this.bytes.length) break;
      if (this.bytes[this.pos] === 93) {
        this.pos++;
        break;
      }
      const item = this.read();
      if (item === undefined) break;
      out.push(item);
    }
    return out;
  }

  private readDict(): Dict {
    const b = this.bytes;
    const dict: Dict = new Map();
    this.pos += 2;
    for (;;) {
      this.skipSpace();
      if (this.pos >= b.length) break;
      if (b[this.pos] === 62 && b[this.pos + 1] === 62) {
        this.pos += 2;
        break;
      }
      const key = this.read();
      if (key === undefined) break;
      if (!(key instanceof Name)) continue;
      const value = this.read();
      if (value === undefined) break;
      dict.set(key.name, value);
    }
    return dict;
  }
}

// Hex digits between `start` and `end`; anything else (whitespace) is skipped.
function decodeHex(b: Uint8Array, start: number, end: number): Uint8Array {
  const out = new Uint8Array((end - start + 1) >> 1);
  let length = 0;
  let high = -1;
  for (let i = start; i < end; i++) {
    const v = hexValue(b[i]);
    if (v < 0) continue;
    if (high < 0) high = v;
    else {
      out[length++] = high * 16 + v;
      high = -1;
    }
  }
  if (high >= 0) out[length++] = high * 16;
  return length === out.length ? out : out.subarray(0, length);
}

function decodeAsciiHex(data: Uint8Array): Uint8Array {
  const end = data.indexOf(62);
  return decodeHex(data, 0, end < 0 ? data.length : end);
}

function decodeAscii85(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  const group: number[] = [];
  const flush = (count: number) => {
    let value = 0;
    for (let i = 0; i < 5; i++) value = value * 85 + (i < count ? group[i] : 84);
    for (let i = 0; i < count - 1; i++) out.push(Math.floor(value / 2 ** (24 - 8 * i)) & 0xff);
    group.length = 0;
  };
  for (let i = 0; i < data.length; i++) {
    const c = data[i];
    if (c === 126) break; // "~>" ends the data
    if (c === 122 && group.length === 0) out.push(0, 0, 0, 0);
    else if (c >= 33 && c <= 117) {
      group.push(c - 33);
      if (group.length === 5) flush(5);
    }
  }
  if (group.length > 1) flush(group.length);
  return Uint8Array.from(out);
}

// Undoes the PNG row predictors that cross-reference and object streams are usually stored with.
function undoPngPredictor(data: Uint8Array, parms: Dict): Uint8Array {
  const number = (key: string, fallback: number) => {
    const v = parms.get(key);
    return typeof v === 'number' ? v : fallback;
  };
  if (number('Predictor', 1) < 10) return data;
  const bitsPerPixel = number('Colors', 1) * number('BitsPerComponent', 8);
  const bpp = Math.max(1, Math.ceil(bitsPerPixel / 8));
  const rowLength = Math.ceil((bitsPerPixel * number('Columns', 1)) / 8);
  const rows = Math.floor(data.length / (rowLength + 1));
  const out = new Uint8Array(rows * rowLength);
  for (let row = 0; row < rows; row++) {
    const type = data[row * (rowLength + 1)];
    const src = row * (rowLength + 1) + 1;
    const dst = row * rowLength;
    for (let i = 0; i < rowLength; i++) {
      const left = i >= bpp ? out[dst + i - bpp] : 0;
      const up = row > 0 ? out[dst + i - rowLength] : 0;
      const upLeft = row > 0 && i >= bpp ? out[dst + i - rowLength - bpp] : 0;
      let predicted = 0;
      if (type === 1) predicted = left;
      else if (type === 2) predicted = up;
      else if (type === 3) predicted = (left + up) >> 1;
      else if (type === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        predicted = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      out[dst + i] = (data[src + i] + predicted) & 0xff;
    }
  }
  return out;
}

type XrefEntry = { offset: number } | { stream: number; index: number };
type ObjectStream = { data: Uint8Array; offsets: number[]; nums: number[] };

export class PdfDocument {
  trailer: Dict = new Map();
  private xref = new Map<number, XrefEntry>();
  private cache = new Map<number, Obj>();
  private objectStreams = new Map<number, ObjectStream>();

  constructor(readonly bytes: Uint8Array) {
    try {
      this.readXrefChain();
    } catch {
      this.xref.clear();
    }
    if (!this.trailer.has('Root')) this.rebuildXref();
    if (!this.trailer.has('Root')) throw new PdfError(UNREADABLE);
  }

  // Follows indirect references to the object itself.
  resolve(obj: Obj | undefined): Obj {
    let current: Obj = obj ?? null;
    for (let hop = 0; current instanceof Ref && hop < MAX_REF_HOPS; hop++) current = this.object(current.num);
    return current instanceof Ref ? null : current;
  }

  dict(obj: Obj | undefined): Dict | null {
    const value = this.resolve(obj);
    if (value instanceof Stream) return value.dict;
    return value instanceof Map ? value : null;
  }

  array(obj: Obj | undefined): Obj[] {
    const value = this.resolve(obj);
    return Array.isArray(value) ? value : [];
  }

  number(obj: Obj | undefined, fallback: number): number {
    const value = this.resolve(obj);
    return typeof value === 'number' ? value : fallback;
  }

  name(obj: Obj | undefined): string {
    const value = this.resolve(obj);
    return value instanceof Name ? value.name : '';
  }

  // The stream's bytes with its filters undone.
  decode(stream: Stream): Uint8Array {
    let data = this.rawStream(stream);
    const filterObj = this.resolve(stream.dict.get('Filter'));
    const parmsObj = this.resolve(stream.dict.get('DecodeParms'));
    const filters = Array.isArray(filterObj) ? filterObj : filterObj === null ? [] : [filterObj];
    const parms = Array.isArray(parmsObj) ? parmsObj : [parmsObj];
    filters.forEach((filter, i) => {
      const name = this.name(filter);
      if (name === 'FlateDecode' || name === 'Fl') {
        try {
          data = inflate(data);
        } catch {
          throw new PdfError(UNREADABLE);
        }
        const p = this.dict(parms[i]);
        if (p) data = undoPngPredictor(data, p);
      } else if (name === 'ASCIIHexDecode' || name === 'AHx') data = decodeAsciiHex(data);
      else if (name === 'ASCII85Decode' || name === 'A85') data = decodeAscii85(data);
      else throw new PdfError(UNREADABLE);
    });
    return data;
  }

  private rawStream(stream: Stream): Uint8Array {
    const b = this.bytes;
    const length = this.number(stream.dict.get('Length'), -1);
    if (length >= 0) {
      let end = stream.start + length;
      while (end < b.length && isSpace(b[end])) end++;
      if (startsWith(b, 'endstream', end)) return b.subarray(stream.start, stream.start + length);
    }
    // Wrong or missing /Length: fall back to the endstream keyword.
    let end = indexOfWord(b, 'endstream', stream.start);
    if (end < 0) end = b.length;
    if (b[end - 1] === 10) end--;
    if (b[end - 1] === 13) end--;
    return b.subarray(stream.start, Math.max(stream.start, end));
  }

  private object(num: number): Obj {
    const cached = this.cache.get(num);
    if (cached !== undefined) return cached;
    const entry = this.xref.get(num);
    let value: Obj = null;
    if (entry) {
      this.cache.set(num, null); // guards against self-referencing objects
      try {
        value = 'offset' in entry ? this.readIndirect(entry.offset) : this.readCompressed(entry.stream, entry.index);
      } catch {
        value = null;
      }
    }
    this.cache.set(num, value);
    return value;
  }

  private readIndirect(offset: number): Obj {
    const lexer = new Lexer(this.bytes, offset, true);
    lexer.read();
    lexer.read();
    const keyword = lexer.read();
    if (!(keyword instanceof Op) || keyword.op !== 'obj') return null;
    const value = lexer.read();
    if (!(value instanceof Map)) return value ?? null;
    lexer.skipSpace();
    if (!startsWith(this.bytes, 'stream', lexer.pos)) return value;
    let start = lexer.pos + 6;
    if (this.bytes[start] === 13) start++;
    if (this.bytes[start] === 10) start++;
    return new Stream(value, start);
  }

  private objectStream(num: number): ObjectStream | null {
    const known = this.objectStreams.get(num);
    if (known) return known;
    const stream = this.object(num);
    if (!(stream instanceof Stream)) return null;
    const data = this.decode(stream);
    const first = this.number(stream.dict.get('First'), 0);
    const count = this.number(stream.dict.get('N'), 0);
    const header = new Lexer(data);
    const nums: number[] = [];
    const offsets: number[] = [];
    for (let i = 0; i < count; i++) {
      const objNum = header.read();
      const offset = header.read();
      if (typeof objNum !== 'number' || typeof offset !== 'number') break;
      nums.push(objNum);
      offsets.push(first + offset);
    }
    const parsed = { data, offsets, nums };
    this.objectStreams.set(num, parsed);
    return parsed;
  }

  private readCompressed(streamNum: number, index: number): Obj {
    const container = this.objectStream(streamNum);
    if (!container || index >= container.offsets.length) return null;
    return new Lexer(container.data, container.offsets[index], true).read() ?? null;
  }

  private addEntry(num: number, entry: XrefEntry): void {
    // Sections are read newest first, so the first entry seen for an object wins.
    if (!this.xref.has(num)) this.xref.set(num, entry);
  }

  private adoptTrailer(dict: Dict): void {
    if (!this.trailer.has('Root')) this.trailer = dict;
  }

  private readXrefChain(): void {
    const marker = lastIndexOfWord(this.bytes, 'startxref');
    if (marker < 0) return;
    const first = new Lexer(this.bytes, marker + 9).read();
    const seen = new Set<number>();
    let offset = typeof first === 'number' ? first : -1;
    while (offset >= 0 && offset < this.bytes.length && !seen.has(offset)) {
      seen.add(offset);
      offset = this.readXrefSection(offset);
    }
  }

  // Reads one cross-reference section and returns the offset of the previous one, or -1.
  private readXrefSection(offset: number): number {
    const lexer = new Lexer(this.bytes, offset);
    lexer.skipSpace();
    if (!startsWith(this.bytes, 'xref', lexer.pos)) return this.readXrefStream(lexer.pos);
    lexer.pos += 4;
    for (;;) {
      const start = lexer.read();
      if (typeof start !== 'number') break; // the `trailer` keyword
      const count = lexer.read();
      if (typeof count !== 'number') break;
      for (let i = 0; i < count; i++) {
        const entryOffset = lexer.read();
        lexer.read();
        const kind = lexer.read();
        if (typeof entryOffset === 'number' && kind instanceof Op && kind.op === 'n') this.addEntry(start + i, { offset: entryOffset });
      }
    }
    lexer.refs = true;
    const trailer = lexer.read();
    if (!(trailer instanceof Map)) return -1;
    this.adoptTrailer(trailer);
    const hybrid = trailer.get('XRefStm');
    if (typeof hybrid === 'number') this.readXrefStream(hybrid);
    const prev = trailer.get('Prev');
    return typeof prev === 'number' ? prev : -1;
  }

  private readXrefStream(offset: number): number {
    const stream = this.readIndirect(offset);
    if (!(stream instanceof Stream)) throw new PdfError(UNREADABLE);
    const dict = stream.dict;
    const data = this.decode(stream);
    const widths = this.array(dict.get('W')).map((w) => (typeof w === 'number' ? w : 0));
    const size = this.number(dict.get('Size'), 0);
    const index = dict.has('Index') ? this.array(dict.get('Index')) : [0, size];
    const rowLength = (widths[0] ?? 0) + (widths[1] ?? 0) + (widths[2] ?? 0);
    if (rowLength === 0) throw new PdfError(UNREADABLE);
    let pos = 0;
    const field = (width: number, fallback: number) => {
      if (width === 0) return fallback;
      let value = 0;
      for (let i = 0; i < width; i++) value = value * 256 + data[pos++];
      return value;
    };
    for (let section = 0; section + 1 < index.length; section += 2) {
      const start = index[section];
      const count = index[section + 1];
      if (typeof start !== 'number' || typeof count !== 'number') break;
      for (let i = 0; i < count && pos + rowLength <= data.length; i++) {
        const type = field(widths[0], 1);
        const second = field(widths[1], 0);
        const third = field(widths[2], 0);
        if (type === 1) this.addEntry(start + i, { offset: second });
        else if (type === 2) this.addEntry(start + i, { stream: second, index: third });
      }
    }
    this.adoptTrailer(dict);
    const prev = dict.get('Prev');
    return typeof prev === 'number' ? prev : -1;
  }

  // Fallback for a missing or damaged cross-reference table: find every "N G obj" in the file.
  private rebuildXref(): void {
    const b = this.bytes;
    this.cache.clear();
    this.objectStreams.clear();
    for (let at = indexOfWord(b, 'obj', 0); at >= 0; at = indexOfWord(b, 'obj', at + 3)) {
      let p = at - 1;
      if (p < 0 || !isSpace(b[p])) continue;
      while (p >= 0 && isSpace(b[p])) p--;
      const genEnd = p;
      while (p >= 0 && isDigit(b[p])) p--;
      if (p === genEnd || p < 0 || !isSpace(b[p])) continue;
      while (p >= 0 && isSpace(b[p])) p--;
      const numEnd = p;
      while (p >= 0 && isDigit(b[p])) p--;
      if (p === numEnd) continue;
      const num = new Lexer(b, p + 1).read();
      if (typeof num === 'number') this.xref.set(num, { offset: p + 1 }); // later copies replace earlier ones
    }

    const trailerAt = lastIndexOfWord(b, 'trailer');
    const trailer = trailerAt >= 0 ? new Lexer(b, trailerAt + 7, true).read() : undefined;
    if (trailer instanceof Map) this.adoptTrailer(trailer);

    for (const num of Array.from(this.xref.keys())) {
      const obj = this.object(num);
      const type = this.name(obj instanceof Stream ? obj.dict.get('Type') : obj instanceof Map ? obj.get('Type') : null);
      if (type === 'Catalog') this.adoptTrailer(new Map<string, Obj>([['Root', new Ref(num)]]));
      else if (type === 'XRef' && obj instanceof Stream) this.adoptTrailer(obj.dict);
      else if (type === 'ObjStm') {
        let members: number[] = [];
        try {
          members = this.objectStream(num)?.nums ?? [];
        } catch {
          members = [];
        }
        members.forEach((member, index) => this.addEntry(member, { stream: num, index }));
      }
    }
  }
}
