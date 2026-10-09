import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { deleteBook } from '../../db/books';
import { deleteBookFile } from '../../llm/bookText';
import { isNoKeyError } from '../../llm/errors';
import { isGenerating, regenerateBook } from '../../llm/pipeline';
import { useTheme } from '../../theme';
import type { Book } from '../../types';
import { AppText, ErrorText } from '../AppText';
import { Button } from '../Button';
import { goToSettings } from '../nav';
import { errorMessage } from '../useFocusLoad';
import { pickBookFile, type PickedFile } from './bookData';

const RESET_WARNING = 'This replaces the chapters, cards and tasks of this book. Your streak is kept.';

function confirm(title: string, message: string, action: string, onConfirm: () => void) {
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: action, style: 'destructive', onPress: onConfirm },
  ]);
}

interface Props {
  book: Book;
  onChanged: () => void;
}

export function BookActions({ book, onChanged }: Props) {
  const { spacing } = useTheme();
  const [error, setError] = useState<string | null>(null);

  const regenerate = (file?: PickedFile) => {
    setError(null);
    regenerateBook(book.id, file ? { fileUri: file.uri, fileName: file.name } : undefined)
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
      const file = await pickBookFile();
      if (file) confirm(`Regenerate from ${file.name}?`, RESET_WARNING, 'Regenerate', () => regenerate(file));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const remove = () =>
    confirm(`Delete ${book.title}?`, 'Its chapters, cards and tasks are removed. Your streak is kept.', 'Delete', () => {
      deleteBook(book.id)
        .then(() => {
          deleteBookFile(book.fileUri);
          router.back();
        })
        .catch((e: unknown) => setError(errorMessage(e)));
    });

  // Busy only while work is really running: an interrupted book (status 'generating',
  // nothing running) can still be regenerated or deleted.
  const busy = isGenerating(book.id);

  return (
    <View style={{ gap: spacing.sm }}>
      <ErrorText>{error}</ErrorText>
      {busy && book.status !== 'generating' ? <AppText variant="caption">Preparing the new version…</AppText> : null}
      <Button
        label={book.source === 'uploaded' ? 'Replace file and regenerate' : 'Attach a file and regenerate'}
        variant="secondary"
        disabled={busy}
        onPress={attach}
      />
      <Button
        label="Regenerate"
        variant="secondary"
        disabled={busy}
        onPress={() => confirm('Regenerate this book?', RESET_WARNING, 'Regenerate', () => regenerate())}
      />
      <Button label="Delete book" variant="quiet" disabled={busy} onPress={remove} />
    </View>
  );
}
