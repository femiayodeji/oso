import { parseChatReply } from '../chatReply';

describe('parseChatReply', () => {
  it('returns plain text untouched with no action', () => {
    expect(parseChatReply('The chapter is about habits.')).toEqual({ text: 'The chapter is about habits.' });
  });

  it('extracts a trailing set_plan action and hides it', () => {
    const out = parseChatReply('Great, five days it is.\n{"action":"set_plan","days":5}');
    expect(out).toEqual({ text: 'Great, five days it is.', action: { action: 'set_plan', days: 5 } });
  });

  it('handles a fenced action', () => {
    const out = parseChatReply('Done.\n```json\n{ "action": "set_plan", "days": 3 }\n```');
    expect(out.text).toBe('Done.');
    expect(out.action).toEqual({ action: 'set_plan', days: 3 });
  });

  it('handles an action with no surrounding text', () => {
    expect(parseChatReply('{"action":"set_plan","days":7}')).toEqual({ text: '', action: { action: 'set_plan', days: 7 } });
  });

  it('never sets a plan from free text', () => {
    const out = parseChatReply('Sure, I will set your plan to 5 days. set_plan days=5');
    expect(out.action).toBeUndefined();
  });

  it.each([
    '{"action":"set_plan","days":"five"}',
    '{"action":"set_plan","days":0}',
    '{"action":"set_plan","days":2.5}',
    '{"action":"set_plan","days":5000}',
    '{"action":"delete_book","days":5}',
    '{"action":"set_plan"}',
  ])('rejects invalid action %s but still hides it', (json) => {
    const out = parseChatReply(`Okay.\n${json}`);
    expect(out.action).toBeUndefined();
    expect(out.text).toBe('Okay.');
  });

  it('leaves unrelated JSON in the text', () => {
    const raw = 'An example object is {"name":"x"} in the book.';
    expect(parseChatReply(raw)).toEqual({ text: raw });
  });

  it('uses the last valid action and removes all of them', () => {
    const out = parseChatReply('{"action":"set_plan","days":3} or maybe\n{"action":"set_plan","days":4}');
    expect(out.action).toEqual({ action: 'set_plan', days: 4 });
    expect(out.text).toBe('or maybe');
  });

  it('ignores broken JSON', () => {
    const out = parseChatReply('Plan: {"action":"set_plan","days":5');
    expect(out.action).toBeUndefined();
  });
});
