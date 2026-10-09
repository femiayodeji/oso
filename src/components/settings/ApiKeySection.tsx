import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { deleteApiKey, setApiKey } from '../../llm/apiKey';
import { useTheme } from '../../theme';
import { AppText, ErrorText } from '../AppText';
import { Button } from '../Button';
import { TextField } from '../TextField';
import { errorMessage } from '../useFocusLoad';
import { Section } from './Section';

interface Props {
  hasKey: boolean;
  onChanged: () => void;
}

// The key goes straight to SecureStore and is never read back into the UI.
export function ApiKeySection({ hasKey, onChanged }: Props) {
  const { spacing } = useTheme();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

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
    <Section title="API key">
      <AppText variant="body" color="textMuted">
        {hasKey ? 'A key is saved on this device.' : 'Add an API key to start.'}
      </AppText>
      <TextField
        label={hasKey ? 'Replace key' : 'API key'}
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
        <Button label="Save key" disabled={draft.trim().length === 0} onPress={() => run(setApiKey(draft.trim()))} />
        {hasKey ? <Button label="Remove key" variant="quiet" onPress={() => run(deleteApiKey())} /> : null}
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
