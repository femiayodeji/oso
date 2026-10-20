import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { deleteTopic } from '../../db/topics';
import { deleteSourceFile } from '../../llm/sourceText';
import { isNoKeyError } from '../../llm/errors';
import { isGenerating, regenerateTopic } from '../../llm/pipeline';
import { useTheme } from '../../theme';
import type { Topic } from '../../types';
import { AppText, ErrorText } from '../AppText';
import { Button } from '../Button';
import { useConfirm } from '../Dialog';
import { goToSettings } from '../nav';
import { errorMessage } from '../useFocusLoad';
import { pickSourceFile, type PickedFile } from './topicData';

const RESET_WARNING = 'This replaces the units, cards and sessions of this topic. Your streak is kept.';

interface Props {
  topic: Topic;
  onChanged: () => void;
}

export function TopicActions({ topic, onChanged }: Props) {
  const { spacing } = useTheme();
  const [error, setError] = useState<string | null>(null);
  const [dialog, confirm] = useConfirm();

  const regenerate = (file?: PickedFile) => {
    setError(null);
    regenerateTopic(topic.id, file ? { fileUri: file.uri, fileName: file.name } : undefined)
      .catch((e: unknown) => {
        if (isNoKeyError(e)) goToSettings();
        else setError(errorMessage(e));
      })
      .finally(onChanged);
    onChanged();
  };

  const attach = async () => {
    setError(null);
    try {
      const file = await pickSourceFile();
      if (file) {
        confirm({
          title: `Regenerate from ${file.name}?`,
          message: RESET_WARNING,
          action: 'Regenerate',
          onConfirm: () => regenerate(file),
        });
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const remove = () =>
    confirm({
      title: `Delete ${topic.title}?`,
      message: 'Its units, cards and sessions are removed. Your streak is kept.',
      action: 'Delete',
      onConfirm: () => {
        deleteTopic(topic.id)
          .then(() => {
            deleteSourceFile(topic.fileUri);
            router.back();
          })
          .catch((e: unknown) => setError(errorMessage(e)));
      },
    });

  // Busy only while work is really running: an interrupted topic (status 'generating',
  // nothing running) can still be regenerated or deleted.
  const busy = isGenerating(topic.id);

  return (
    <View style={{ gap: spacing.sm }}>
      <ErrorText>{error}</ErrorText>
      {busy && topic.status !== 'generating' ? <AppText variant="caption">Preparing the new version…</AppText> : null}
      <Button
        label={topic.source === 'uploaded' ? 'Replace file and regenerate' : 'Attach a file and regenerate'}
        variant="secondary"
        disabled={busy}
        onPress={attach}
      />
      <Button
        label="Regenerate"
        variant="secondary"
        disabled={busy}
        onPress={() =>
          confirm({ title: 'Regenerate this topic?', message: RESET_WARNING, action: 'Regenerate', onConfirm: () => regenerate() })
        }
      />
      <Button label="Delete topic" variant="quiet" disabled={busy} onPress={remove} />
      {dialog}
    </View>
  );
}
