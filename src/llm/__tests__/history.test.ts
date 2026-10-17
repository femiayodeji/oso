import { historyWindow } from '../history';

describe('historyWindow', () => {
  it('sends everything up to the limit', () => {
    expect(historyWindow(0, 12, 6)).toBe(0);
    expect(historyWindow(12, 12, 6)).toBe(12);
  });

  it('drops old messages a whole step at a time', () => {
    expect(historyWindow(13, 12, 6)).toBe(7);
    expect(historyWindow(18, 12, 6)).toBe(12);
    expect(historyWindow(19, 12, 6)).toBe(7);
  });

  it('keeps the start fixed between drops, so the prefix is stable', () => {
    const start = (total: number) => total - historyWindow(total, 12, 6);
    expect(start(13)).toBe(start(18));
    expect(start(19)).toBe(start(24));
  });
});
