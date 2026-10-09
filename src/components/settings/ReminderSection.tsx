import { StyleSheet, View } from 'react-native';

import { openSystemSettings, requestPermission, syncReminders } from '../../notifications';
import { useSettings } from '../../settings/SettingsContext';
import { useTheme } from '../../theme';
import type { AppSettings } from '../../types';
import { AppText } from '../AppText';
import { Button } from '../Button';
import { Mascot } from '../Mascot';
import { Section } from './Section';
import { TimeStepper } from './TimeStepper';

export type Permission = 'granted' | 'denied' | 'undetermined';

interface Props {
  permission: Permission | null;
  onPermissionChanged: () => void;
}

export function ReminderSection({ permission, onPermissionChanged }: Props) {
  const { colors, radius, spacing } = useTheme();
  const { settings, update } = useSettings();

  const change = (patch: Partial<AppSettings>) => {
    void update(patch)
      .then(() => syncReminders())
      .catch(() => {});
  };

  const enable = async () => {
    if (permission === 'denied') {
      await openSystemSettings().catch(() => {});
    } else {
      await requestPermission().catch(() => {});
      void syncReminders();
    }
    onPermissionChanged();
  };

  return (
    <Section title="Reminders">
      {permission && permission !== 'granted' ? (
        <View style={[styles.banner, { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md }]}>
          <Mascot state="reminder" size={72} />
          <View style={[styles.fill, { gap: spacing.sm }]}>
            <AppText variant="bodyStrong">Reminders are off.</AppText>
            <Button label="Enable reminders" onPress={() => void enable()} />
          </View>
        </View>
      ) : null}
      {permission === 'granted' ? <AppText variant="caption">Reminders are on.</AppText> : null}
      <TimeStepper label="Evening reminder" value={settings.reminderEvening} onChange={(reminderEvening) => change({ reminderEvening })} />
      <TimeStepper label="Running out reminder" value={settings.reminderLate} onChange={(reminderLate) => change({ reminderLate })} />
    </Section>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center' },
  fill: { flex: 1 },
});
