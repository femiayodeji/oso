import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { getStreak } from '../db/activity';
import { getSettings } from '../db/settings';
import { buildReminderSchedule } from './schedule';

export { buildReminderSchedule } from './schedule';
export { reminderCopy } from './copy';

export type ReminderPermission = 'granted' | 'denied' | 'undetermined';

const CHANNEL_ID = 'reminders';

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Reading reminders',
    description: 'Evening reminders to finish a reading task.',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

function toPermission(status: Notifications.NotificationPermissionsStatus): ReminderPermission {
  if (status.granted) return 'granted';
  // Android 13+ reports 'denied' before the user has ever been asked; canAskAgain tells
  // that apart from a real refusal, where only the system settings can turn it back on.
  return status.status === 'denied' && !status.canAskAgain ? 'denied' : 'undetermined';
}

export async function setupNotifications(): Promise<void> {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    await ensureChannel();
  } catch {
    // Reminders are optional; the app works without them.
  }
}

export async function getPermissionStatus(): Promise<ReminderPermission> {
  try {
    return toPermission(await Notifications.getPermissionsAsync());
  } catch {
    return 'undetermined';
  }
}

export async function requestPermission(): Promise<ReminderPermission> {
  try {
    // Android 13+ only shows the permission prompt once a channel exists.
    await ensureChannel();
    const result = toPermission(
      await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowSound: true, allowBadge: false },
      }),
    );
    if (result === 'granted') await syncReminders();
    return result;
  } catch {
    return getPermissionStatus();
  }
}

export async function openSystemSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch {
    // Nothing useful to do if the settings screen cannot be opened.
  }
}

async function runSync(): Promise<void> {
  if ((await getPermissionStatus()) !== 'granted') return;
  const [settings, streak] = await Promise.all([getSettings(), getStreak()]);
  const reminders = buildReminderSchedule({
    now: new Date(),
    evening: settings.reminderEvening,
    late: settings.reminderLate,
    streak,
  });

  await ensureChannel();
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const reminder of reminders) {
    await Notifications.scheduleNotificationAsync({
      content: { title: reminder.title, body: reminder.body },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminder.date,
        channelId: CHANNEL_ID,
      },
    });
  }
}

let queue: Promise<void> = Promise.resolve();

// Calls are serialized so an app-open sync and a task-completion sync cannot interleave
// their cancel/schedule steps and leave duplicates behind.
export function syncReminders(): Promise<void> {
  queue = queue.then(runSync).catch(() => undefined);
  return queue;
}
