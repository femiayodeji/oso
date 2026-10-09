import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { testConnection } from '../../llm/client';
import { describeLlmError } from '../../llm/errors';
import { PROVIDERS, resolveModel } from '../../llm/providers';
import { useSettings } from '../../settings/SettingsContext';
import { useTheme } from '../../theme';
import type { Provider } from '../../types';
import { AppText, ErrorText } from '../AppText';
import { Button } from '../Button';
import { Chips } from '../Chips';
import { Mascot } from '../Mascot';
import { TextField } from '../TextField';
import { Section } from './Section';

const PROVIDER_OPTIONS = (Object.keys(PROVIDERS) as Provider[]).map((value) => ({
  value,
  label: PROVIDERS[value].label,
}));

type TestState = { kind: 'idle' | 'running' | 'ok' } | { kind: 'failed'; message: string };

export function ModelSection({ hasKey }: { hasKey: boolean }) {
  const { spacing } = useTheme();
  const { settings, update } = useSettings();
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl);
  const [model, setModel] = useState(settings.model);
  const [test, setTest] = useState<TestState>({ kind: 'idle' });

  useEffect(() => setBaseUrl(settings.baseUrl), [settings.baseUrl]);
  useEffect(() => setModel(settings.model), [settings.model]);

  const save = (patch: Parameters<typeof update>[0]) => {
    setTest({ kind: 'idle' });
    void update(patch).catch(() => {});
  };

  const runTest = async () => {
    setTest({ kind: 'running' });
    try {
      // Fields persist on blur; flush them so the test uses what is on screen.
      await update({ baseUrl: baseUrl.trim(), model: model.trim() });
      await testConnection();
      setTest({ kind: 'ok' });
    } catch (e) {
      setTest({ kind: 'failed', message: describeLlmError(e) });
    }
  };

  return (
    <Section title="Model">
      <Chips
        label="Provider"
        options={PROVIDER_OPTIONS}
        value={settings.provider}
        onChange={(provider) => save({ provider, baseUrl: PROVIDERS[provider].baseUrl, model: '' })}
      />
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
      <TextField
        label="Model"
        value={model}
        onChangeText={setModel}
        onEndEditing={() => save({ model: model.trim() })}
        placeholder={resolveModel({ ...settings, model: '' })}
        autoCapitalize="none"
        autoCorrect={false}
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
          <Mascot state="error" size={72} />
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
