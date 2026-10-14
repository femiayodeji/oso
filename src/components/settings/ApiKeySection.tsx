import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { deleteApiKey, setApiKey } from '../../llm/apiKey';
import { PROVIDERS } from '../../llm/providers';
import { useSettings } from '../../settings/SettingsContext';
import { useTheme } from '../../theme';
import type { Provider } from '../../types';
import { AppText, ErrorText } from '../AppText';
import { Button } from '../Button';
import { TextField } from '../TextField';
import { errorMessage } from '../useFocusLoad';
import { ProviderPicker } from './ProviderPicker';
import { Section } from './Section';

interface Props {
  savedProviders: Provider[];
  onChanged: () => void;
}

// Each provider keeps its own key; the selected provider is the one the app uses.
// Keys go straight to SecureStore and are never read back into the UI.
export function ApiKeySection({ savedProviders, onChanged }: Props) {
  const { spacing } = useTheme();
  const { settings, update } = useSettings();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const provider = settings.provider;
  const label = PROVIDERS[provider].label;
  const hasKey = savedProviders.includes(provider);

  const run = (work: Promise<void>) => {
    setError(null);
    work
      .then(() => {
        setDraft('');
        onChanged();
      })
      .catch((e: unknown) => setError(errorMessage(e)));
  };

  return (
    <Section title="Provider">
      <ProviderPicker
        value={provider}
        savedProviders={savedProviders}
        onChange={(next) => run(update({ provider: next }))}
      />
      <AppText variant="body" color="textMuted">
        {hasKey ? `A ${label} key is saved on this device.` : 'Add an API key to start.'}
      </AppText>
      <TextField
        label={hasKey ? `Replace ${label} key` : `${label} API key`}
        value={draft}
        onChangeText={setDraft}
        highlight={!hasKey}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        textContentType="password"
        placeholder={hasKey ? '••••••••' : 'Paste your key'}
      />
      <ErrorText>{error}</ErrorText>
      <View style={[styles.row, { gap: spacing.sm }]}>
        <Button
          label="Save key"
          disabled={draft.trim().length === 0}
          onPress={() => run(setApiKey(draft.trim(), provider))}
        />
        {hasKey ? <Button label="Remove key" variant="quiet" onPress={() => run(deleteApiKey(provider))} /> : null}
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
