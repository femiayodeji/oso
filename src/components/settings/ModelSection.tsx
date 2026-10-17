import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { testConnection } from '../../llm/client';
import { describeLlmError } from '../../llm/errors';
import { PROVIDERS } from '../../llm/providers';
import { useSettings } from '../../settings/SettingsContext';
import { useTheme } from '../../theme';
import { AppText, ErrorText } from '../AppText';
import { Button } from '../Button';
import { Mascot } from '../Mascot';
import { PopIn } from '../motion/PopIn';
import { TextField } from '../TextField';
import { ModelPicker } from './ModelPicker';
import { Section } from './Section';

type TestState = { kind: 'idle' | 'running' | 'ok' } | { kind: 'failed'; message: string };

export function ModelSection({ hasKey }: { hasKey: boolean }) {
  const { spacing } = useTheme();
  const { settings, update } = useSettings();
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl);
  const [test, setTest] = useState<TestState>({ kind: 'idle' });

  useEffect(() => setBaseUrl(settings.baseUrl), [settings.baseUrl]);
  useEffect(() => setTest({ kind: 'idle' }), [settings.provider]);

  const save = (patch: Parameters<typeof update>[0]) => {
    setTest({ kind: 'idle' });
    void update(patch).catch(() => {});
  };

  const runTest = async () => {
    setTest({ kind: 'running' });
    try {
      // Fields persist on blur; flush them so the test uses what is on screen.
      await update({ baseUrl: baseUrl.trim() });
      await testConnection();
      setTest({ kind: 'ok' });
    } catch (e) {
      setTest({ kind: 'failed', message: describeLlmError(e) });
    }
  };

  return (
    <Section title="Model">
      {settings.provider === 'anthropic' ? null : (
        <TextField
          label="Base URL (OpenAI-compatible)"
          value={baseUrl}
          onChangeText={setBaseUrl}
          onEndEditing={() => save({ baseUrl: baseUrl.trim() })}
          placeholder={PROVIDERS[settings.provider].baseUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
      )}
      <ModelPicker
        value={settings.model.trim()}
        defaultModel={PROVIDERS[settings.provider].defaultModel}
        onChange={(model) => save({ model })}
      />
      <Button
        label={test.kind === 'running' ? 'Testing…' : 'Test connection'}
        variant="secondary"
        disabled={!hasKey || test.kind === 'running'}
        onPress={() => void runTest()}
      />
      {test.kind === 'ok' ? <AppText variant="caption">Connected.</AppText> : null}
      {test.kind === 'failed' ? (
        <View style={[styles.row, { gap: spacing.md }]}>
          <PopIn>
            <Mascot state="error" size={72} />
          </PopIn>
          <View style={styles.fill}>
            <ErrorText>{test.message}</ErrorText>
          </View>
        </View>
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  fill: { flex: 1 },
});
