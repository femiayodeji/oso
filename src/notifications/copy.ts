export type ReminderKind = 'evening' | 'late';

// calm:   the streak is safe, or there is nothing to lose yet.
// atRisk: yesterday had no activity; one more missed day resets the streak.
// fresh:  no live streak (never started, or already reset).
export type ReminderTone = 'calm' | 'atRisk' | 'fresh';

export interface ReminderCopy {
  title: string;
  body: string;
}

function streakLabel(days: number): string {
  return `${days}-day streak`;
}

export function reminderCopy(kind: ReminderKind, tone: ReminderTone, streak: number): ReminderCopy {
  const hasStreak = streak > 0;

  if (tone === 'atRisk' && hasStreak) {
    return kind === 'evening'
      ? {
          title: 'Your streak dies tonight',
          body: `You missed yesterday. Finish one task today or your ${streakLabel(streak)} resets.`,
        }
      : {
          title: 'Last call. Your streak dies tonight',
          body: `Your ${streakLabel(streak)} ends at midnight. One task saves it.`,
        };
  }

  if (tone === 'calm' && hasStreak) {
    return kind === 'evening'
      ? {
          title: 'Time to read',
          body: `A few cards keep your ${streakLabel(streak)} going.`,
        }
      : {
          title: 'The day is running out',
          body: `One short task keeps your ${streakLabel(streak)} going.`,
        };
  }

  return kind === 'evening'
    ? { title: 'Time to read', body: 'A few cards are waiting. One task starts a new streak.' }
    : { title: 'The day is running out', body: 'There is still time for one short task.' };
}
