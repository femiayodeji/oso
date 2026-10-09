import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppText } from '../../src/components/AppText';
import { BookActions } from '../../src/components/books/BookActions';
import { ChapterList, TaskPool } from '../../src/components/books/BookSections';
import { loadBookDetail, type BookDetail } from '../../src/components/books/bookData';
import { Button } from '../../src/components/Button';
import { EmptyState } from '../../src/components/EmptyState';
import { goToChat, goToSettings, readTaskInToday } from '../../src/components/nav';
import { ErrorLine, LoadingLine, Screen } from '../../src/components/Screen';
import { useFocusLoad } from '../../src/components/useFocusLoad';
import { describeLlmError, isNoKeyError } from '../../src/llm/errors';
import { getGenerationError, runGeneration, subscribeGeneration } from '../../src/llm/pipeline';
import { useTheme } from '../../src/theme';

function PlanSection({ detail }: { detail: BookDetail }) {
  const { spacing } = useTheme();
  const { book, tasks, tasksDone, tasksTotal } = detail;
  const open = () => goToChat(book.id);
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText variant="heading" accessibilityRole="header">
        Plan
      </AppText>
      {tasksTotal === 0 ? (
        <>
          <AppText variant="body" color="textMuted">
            No plan yet.
          </AppText>
          <Button label="Set a plan" onPress={open} />
        </>
      ) : (
        <>
          <AppText variant="body" color="textMuted">
            {`${book.planDays ?? tasksTotal} days, ${tasksDone} done`}
          </AppText>
          <TaskPool tasks={tasks} onOpen={(task) => readTaskInToday(task.id)} />
          <Button label="Change plan" variant="secondary" onPress={open} />
        </>
      )}
    </View>
  );
}

export default function BookScreen() {
  const { spacing } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const bookId = Number(id);
  const { data, loading, error, reload } = useFocusLoad(() => loadBookDetail(bookId));
  const [retryError, setRetryError] = useState<string | null>(null);

  useEffect(
    () =>
      subscribeGeneration((changed) => {
        if (changed === bookId) void reload();
      }),
    [bookId, reload],
  );

  const retry = () => {
    setRetryError(null);
    runGeneration(bookId)
      .catch((e: unknown) => {
        if (isNoKeyError(e)) goToSettings();
        else setRetryError(describeLlmError(e));
      })
      .finally(() => void reload());
  };

  if (loading && !data) return <Screen edges={['bottom']}><LoadingLine /></Screen>;
  if (error && !data) return <Screen edges={['bottom']}><ErrorLine text={error} /></Screen>;
  if (!data) return <Screen edges={['bottom']}><ErrorLine text="This book no longer exists." /></Screen>;

  const { book, chapters, chapterList } = data;
  const prepared = book.status === 'ready' || book.status === 'finished';

  return (
    <Screen edges={['bottom']} scroll>
      <Stack.Screen options={{ title: book.title }} />
      <View style={{ gap: spacing.xs }}>
        <AppText variant="title">{book.title}</AppText>
        {book.author ? <AppText variant="caption">{book.author}</AppText> : null}
        {book.source === 'model_knowledge' ? <AppText variant="label">Generated from model knowledge</AppText> : null}
      </View>

      {book.status === 'generating' ? (
        <EmptyState
          mascot="generating"
          text={chapters.total > 0 ? `Preparing chapters, ${chapters.done} of ${chapters.total}` : 'Preparing chapters…'}
        />
      ) : null}
      {book.status === 'draft' ? (
        <EmptyState mascot="generating" text="Not prepared yet." buttonLabel="Prepare chapters" onPress={retry} error={retryError} />
      ) : null}
      {book.status === 'failed' ? (
        <EmptyState
          mascot="error"
          text="Preparing this book failed."
          error={retryError ?? getGenerationError(bookId) ?? 'Something went wrong. Try again.'}
          buttonLabel="Retry"
          onPress={retry}
        />
      ) : null}

      {prepared ? <PlanSection detail={data} /> : null}
      {prepared && chapterList.length > 0 ? <ChapterList chapters={chapterList} /> : null}
      <BookActions book={book} onChanged={() => void reload()} />
    </Screen>
  );
}
