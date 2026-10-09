import { AppText } from '../../src/components/AppText';
import { Button } from '../../src/components/Button';
import { Chips } from '../../src/components/Chips';
import { goToAddBook } from '../../src/components/nav';
import { ErrorLine, LoadingLine, Screen } from '../../src/components/Screen';
import { ApiKeySection } from '../../src/components/settings/ApiKeySection';
import { ModelSection } from '../../src/components/settings/ModelSection';
import { ReminderSection } from '../../src/components/settings/ReminderSection';
import { Section } from '../../src/components/settings/Section';
import { useFocusLoad } from '../../src/components/useFocusLoad';
import { getStreak } from '../../src/db/activity';
import { listBooks } from '../../src/db/books';
import { getSettings } from '../../src/db/settings';
import { hasApiKey } from '../../src/llm/apiKey';
import { getPermissionStatus } from '../../src/notifications';
import { useSettings } from '../../src/settings/SettingsContext';
import type { ColorSchemeSetting } from '../../src/types';

const APPEARANCE: { value: ColorSchemeSetting; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const SOUNDS = [
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
];

async function loadSettingsScreen() {
  // getStreak persists a new best streak, so it runs before the settings read.
  await getStreak().catch(() => null);
  const [hasKey, permission, stored, books] = await Promise.all([
    hasApiKey(),
    getPermissionStatus().catch(() => null),
    getSettings(),
    listBooks(),
  ]);
  return { hasKey, permission, bestStreak: stored.bestStreak, noBooks: books.length === 0 };
}

export default function SettingsScreen() {
  const { settings, update } = useSettings();
  const { data, loading, error, reload } = useFocusLoad(loadSettingsScreen);

  // useFocusLoad also reloads when the app returns to the foreground, which picks up a
  // permission changed in the system settings app.

  if (!data) {
    return <Screen>{loading ? <LoadingLine /> : <ErrorLine text={error ?? 'Could not load settings.'} />}</Screen>;
  }

  return (
    <Screen scroll keyboard>
      <AppText variant="title" accessibilityRole="header">
        Settings
      </AppText>

      <ApiKeySection hasKey={data.hasKey} onChanged={() => void reload()} />
      {data.hasKey && data.noBooks ? <Button label="Add your first book" variant="secondary" onPress={goToAddBook} /> : null}
      <ModelSection hasKey={data.hasKey} />
      <ReminderSection permission={data.permission} onPermissionChanged={() => void reload()} />

      <Section title="Appearance">
        <Chips
          label="Appearance"
          options={APPEARANCE}
          value={settings.colorScheme}
          onChange={(colorScheme) => void update({ colorScheme }).catch(() => {})}
        />
      </Section>

      <Section title="Sounds">
        <Chips
          label="Sounds"
          options={SOUNDS}
          value={settings.soundsEnabled ? 'on' : 'off'}
          onChange={(value) => void update({ soundsEnabled: value === 'on' }).catch(() => {})}
        />
      </Section>

      <AppText variant="caption">{`Best streak: ${data.bestStreak}`}</AppText>
      <AppText variant="caption" center style={{ paddingTop: 24 }}>
        Better books. A calmer mind.
      </AppText>
    </Screen>
  );
}
