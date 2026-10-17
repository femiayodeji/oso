import { router, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { AppText, ErrorText } from '../src/components/AppText';
import { Button } from '../src/components/Button';
import { Chips } from '../src/components/Chips';
import { PopIn } from '../src/components/motion/PopIn';
import { goToSettings } from '../src/components/nav';
import { Screen } from '../src/components/Screen';
import { TextField } from '../src/components/TextField';
import { pickSourceFile, type PickedFile } from '../src/components/topics/topicData';
import { errorMessage } from '../src/components/useFocusLoad';
import { createTopic } from '../src/db/topics';
import { diffDays, todayLocal } from '../src/lib/dates';
import { hasApiKey } from '../src/llm/apiKey';
import { isNoKeyError } from '../src/llm/errors';
import { runGeneration } from '../src/llm/pipeline';
import { importSourceFile, savePastedText } from '../src/llm/sourceText';
import { CARDS_PER_SESSION, DEFAULT_PLAN_DAYS, PLAN_LENGTHS } from '../src/plan/budget';
import { pickSuggestions } from '../src/topic/suggestions';
import { useTheme } from '../src/theme';

const LENGTH_OPTIONS = PLAN_LENGTHS.map(({ days, label }) => ({ value: days, label }));

export default function AddTopicScreen() {
  const { spacing } = useTheme();
  const headerHeight = useHeaderHeight();
  const params = useLocalSearchParams<{ q?: string }>();
  const [title, setTitle] = useState(params.q ?? '');
  const [planDays, setPlanDays] = useState(DEFAULT_PLAN_DAYS);
  const [ownMaterial, setOwnMaterial] = useState(false);
  const [file, setFile] = useState<PickedFile | null>(null);
  const [pasted, setPasted] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suggestions = useMemo(() => pickSuggestions(6, diffDays('2000-01-01', todayLocal())), []);

  const pick = async () => {
    setError(null);
    try {
      const picked = await pickSourceFile();
      if (picked) setFile(picked);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const save = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError('Type something you want to learn, or tap a suggestion.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (!(await hasApiKey())) {
        goToSettings();
        return;
      }
      const text = ownMaterial && !file ? pasted.trim() : '';
      const fileUri = file ? await importSourceFile(file.uri, file.name) : text ? await savePastedText(text) : null;
      const topic = await createTopic({
        title: cleanTitle,
        source: fileUri ? 'uploaded' : 'model_knowledge',
        fileUri,
        planDays,
      });
      runGeneration(topic.id).catch((e: unknown) => {
        if (isNoKeyError(e)) goToSettings();
      });
      router.replace({ pathname: '/topic/[id]', params: { id: String(topic.id) } });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen edges={['bottom']} scroll keyboard keyboardOffset={headerHeight}>
      <PopIn kind="rise">
        <AppText variant="title" accessibilityRole="header">
          What do you want to learn?
        </AppText>
      </PopIn>
      <TextField
        value={title}
        onChangeText={setTitle}
        placeholder="A topic, a skill, a book, a question…"
        accessibilityLabel="What do you want to learn?"
        autoFocus={!params.q}
        returnKeyType="done"
        highlight
      />

      <PopIn kind="rise" delay={100} style={{ gap: spacing.sm }}>
        <AppText variant="caption">Try one of these</AppText>
        <Chips label="Suggestions" options={suggestions.map((s) => ({ value: s, label: s }))} value={title} onChange={setTitle} />
      </PopIn>

      <PopIn kind="rise" delay={200} style={{ gap: spacing.sm, paddingTop: spacing.sm }}>
        <AppText variant="bodyStrong">How long?</AppText>
        <Chips label="Plan length" options={LENGTH_OPTIONS} value={planDays} onChange={setPlanDays} />
        <AppText variant="caption">{`About ${CARDS_PER_SESSION} cards a day, 5 minutes.`}</AppText>
      </PopIn>

      <View style={{ gap: spacing.sm, paddingTop: spacing.sm }}>
        {ownMaterial ? (
          <>
            <AppText variant="bodyStrong">Your own material</AppText>
            <AppText variant="caption">Cards will be written from this instead of what the model knows.</AppText>
            {file ? (
              <AppText variant="body" numberOfLines={1}>
                {file.name}
              </AppText>
            ) : null}
            <Button
              label={file ? 'Pick a different file' : 'Pick a file (pdf, epub, txt, md)'}
              variant="secondary"
              onPress={pick}
            />
            {file ? (
              <Button label="Remove file" variant="quiet" onPress={() => setFile(null)} />
            ) : (
              <TextField
                label="Or paste text"
                value={pasted}
                onChangeText={setPasted}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
                style={{ maxHeight: 240 }}
              />
            )}
            <Button
              label="Do not use my own material"
              variant="quiet"
              onPress={() => {
                setOwnMaterial(false);
                setFile(null);
                setPasted('');
              }}
            />
          </>
        ) : (
          <Button label="Use my own material (file or text)" variant="quiet" onPress={() => setOwnMaterial(true)} />
        )}
      </View>

      <ErrorText>{error}</ErrorText>
      <Button label={saving ? 'Starting…' : 'Start learning'} disabled={saving} onPress={save} />
    </Screen>
  );
}
