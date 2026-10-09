import { useEffect } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { AppText } from '../../src/components/AppText';
import { BookRow } from '../../src/components/books/BookRow';
import { loadBooks } from '../../src/components/books/bookData';
import { IconButton } from '../../src/components/Button';
import { EmptyState } from '../../src/components/EmptyState';
import { goToAddBook, goToBook } from '../../src/components/nav';
import { ErrorLine, LoadingLine, Screen } from '../../src/components/Screen';
import { useFocusLoad } from '../../src/components/useFocusLoad';
import { subscribeGeneration } from '../../src/llm/pipeline';
import { useTheme } from '../../src/theme';

export default function BooksScreen() {
  const { spacing } = useTheme();
  const { data, loading, error, reload } = useFocusLoad(loadBooks);

  useEffect(() => subscribeGeneration(() => void reload()), [reload]);

  let body;
  if (!data) {
    body = loading ? <LoadingLine /> : <ErrorLine text={error ?? 'Could not load books.'} />;
  } else if (data.length === 0) {
    body = <EmptyState mascot="noBooks" text="No books yet." buttonLabel="Add a book" onPress={goToAddBook} />;
  } else {
    body = (
      <FlatList
        data={data}
        keyExtractor={(item) => String(item.book.id)}
        contentContainerStyle={{ padding: spacing.xl, paddingTop: spacing.sm, gap: spacing.md }}
        renderItem={({ item }) => <BookRow item={item} onPress={() => goToBook(item.book.id)} />}
      />
    );
  }

  return (
    <Screen padded={false}>
      <View style={[styles.header, { paddingHorizontal: spacing.xl, paddingTop: spacing.sm }]}>
        <AppText variant="title" accessibilityRole="header">
          Books
        </AppText>
        {data && data.length > 0 ? <IconButton icon="add" label="Add a book" size={26} onPress={goToAddBook} /> : null}
      </View>
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
});
