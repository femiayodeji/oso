import { extractJson, findJsonSpans, parseJsonLoose, stripCodeFences } from '../json';

describe('stripCodeFences', () => {
  it('unwraps a json fence', () => {
    expect(stripCodeFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });
  it('unwraps a bare fence surrounded by prose', () => {
    expect(stripCodeFences('Here you go:\n```\n{"a":1}\n```\nThanks')).toBe('{"a":1}');
  });
  it('handles a fence that was never closed', () => {
    expect(stripCodeFences('```json\n{"a":1}')).toBe('{"a":1}');
  });
  it('leaves plain text alone', () => {
    expect(stripCodeFences('  {"a":1} ')).toBe('{"a":1}');
  });
});

describe('findJsonSpans', () => {
  it('ignores braces inside strings', () => {
    const text = 'x {"a":"}{","b":"\\"}"} y';
    const spans = findJsonSpans(text);
    expect(spans).toHaveLength(1);
    expect(JSON.parse(text.slice(spans[0].start, spans[0].end))).toEqual({ a: '}{', b: '"}' });
  });
  it('skips an unbalanced opener and finds a later object', () => {
    const text = 'broken { then {"ok":true}';
    const spans = findJsonSpans(text);
    expect(spans.map((s) => text.slice(s.start, s.end))).toEqual(['{"ok":true}']);
  });
});

describe('extractJson / parseJsonLoose', () => {
  it('parses bare JSON', () => {
    expect(parseJsonLoose('{"a":[1,2]}')).toEqual({ a: [1, 2] });
  });
  it('parses fenced JSON', () => {
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it('parses JSON embedded in prose', () => {
    expect(parseJsonLoose('Sure! Here it is: {"a":{"b":2}} Hope that helps.')).toEqual({ a: { b: 2 } });
  });
  it('parses a top-level array', () => {
    expect(parseJsonLoose('[1,2,3]')).toEqual([1, 2, 3]);
  });
  it('returns null / throws when there is no JSON', () => {
    expect(extractJson('no json here')).toBeNull();
    expect(() => parseJsonLoose('{"a": tru')).toThrow();
  });
});
