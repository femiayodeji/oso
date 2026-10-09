import { reminderCopy, type ReminderKind, type ReminderTone } from '../copy';

const kinds: ReminderKind[] = ['evening', 'late'];
const tones: ReminderTone[] = ['calm', 'atRisk', 'fresh'];

describe('reminderCopy', () => {
  it('returns a non-empty title and body for every state', () => {
    for (const kind of kinds) {
      for (const tone of tones) {
        for (const streak of [0, 1, 12]) {
          const copy = reminderCopy(kind, tone, streak);
          expect(copy.title.length).toBeGreaterThan(0);
          expect(copy.body.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('is dramatic only when the streak is at risk', () => {
    expect(reminderCopy('evening', 'atRisk', 5).title).toBe('Your streak dies tonight');
    expect(reminderCopy('late', 'atRisk', 5).title).toContain('dies tonight');
    for (const kind of kinds) {
      expect(reminderCopy(kind, 'calm', 5).title).not.toContain('dies');
      expect(reminderCopy(kind, 'fresh', 5).title).not.toContain('dies');
    }
  });

  it('mentions the streak length when there is one', () => {
    expect(reminderCopy('evening', 'calm', 7).body).toContain('7-day streak');
    expect(reminderCopy('late', 'atRisk', 3).body).toContain('3-day streak');
  });

  it('never threatens a streak that does not exist', () => {
    for (const kind of kinds) {
      const copy = reminderCopy(kind, 'atRisk', 0);
      expect(copy.title).not.toContain('dies');
      expect(copy.body).not.toContain('0-day');
    }
    expect(reminderCopy('evening', 'fresh', 4).body).not.toContain('4-day');
  });

  it('uses different copy for the evening and the late reminder', () => {
    for (const tone of tones) {
      expect(reminderCopy('evening', tone, 5)).not.toEqual(reminderCopy('late', tone, 5));
    }
  });
});
