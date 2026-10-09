import { router } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useState } from 'react';
import { View } from 'react-native';

import { AppText, ErrorText } from '../src/components/AppText';
import { pickBookFile, type PickedFile } from '../src/components/books/bookData';
import { Button } from '../src/components/Button';
import { goToSettings } from '../src/components/nav';
import { Screen } from '../src/components/Screen';
import { TextField } from '../src/components/TextField';
import { errorMessage } from '../src/components/useFocusLoad';
import { createBook } from '../src/db/books';
import { hasApiKey } from '../src/llm/apiKey';
import { importBookFile, savePastedText } from '../src/llm/bookText';
import { isNoKeyError } from '../src/llm/errors';
import { runGeneration } from '../src/llm/pipeline';
import { useTheme } from '../src/theme';

export default function AddBookScreen() {
  const { spacing } = useTheme();
  const headerHeight = useHeaderHeight();
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [file, setFile] = useState<PickedFile | null>(null);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async () => {
    setError(null);
    try {
      const picked = await pickBookFile();
      if (!picked) return;
      setFile(picked);
      setPasting(false);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const save = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError('Give the book a title.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (!(await hasApiKey())) {
        goToSettings();
        return;
      }
      const text = pasting ? pasted.trim() : '';
      const fileUri = file ? await importBookFile(file.uri, file.name) : text ? await savePastedText(text) : null;
      const book = await createBook({
        title: cleanTitle,
        author: author.trim() || null,
        source: fileUri ? 'uploaded' : 'model_knowledge',
        fileUri,
      });
      runGeneration(book.id).catch((e: unknown) => {
        if (isNoKeyError(e)) goToSettings();
      });
      router.replace({ pathname: '/book/[id]', params: { id: String(book.id) } });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen edges={['bottom']} scroll keyboard keyboardOffset={headerHeight}>
      <TextField label="Title" value={title} onChangeText={setTitle} autoCapitalize="words" returnKeyType="next" />
      <TextField
        label="Author (optional)"
        value={author}
        onChangeText={setAuthor}
        autoCapitalize="words"
        returnKeyType="done"
      />

      <View style={{ gap: spacing.sm, paddingTop: spacing.sm }}>
        <AppText variant="bodyStrong">Knowledge base (optional)</AppText>
        <AppText variant="caption">
          Without a file, cards are generated from what the model knows about the book.
        </AppText>
        {file ? (
          <AppText variant="body" numberOfLines={1}>
            {file.name}
          </AppText>
        ) : null}
        <Button label={file ? 'Pick a different file' : 'Pick a file (epub, txt, md)'} variant="secondary" onPress={pick} />
        {file ? (
          <Button label="Remove file" variant="quiet" onPress={() => setFile(null)} />
        ) : (
          <Button
            label={pasting ? 'Do not paste text' : 'Paste text instead'}
            variant="quiet"
            onPress={() => setPasting((on) => !on)}
          />
        )}
        {pasting && !file ? (
          <TextField
            label="Book text"
            value={pasted}
            onChangeText={setPasted}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            style={{ maxHeight: 240 }}
          />
        ) : null}
      </View>

      <ErrorText>{error}</ErrorText>
      <Button label={saving ? 'Adding…' : 'Add book'} disabled={saving} onPress={save} />
    </Screen>
  );
}
