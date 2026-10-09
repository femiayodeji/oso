import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppText } from '../../src/components/AppText';
import { Chips } from '../../src/components/Chips';
import { EmptyState } from '../../src/components/EmptyState';
import { goToChat } from '../../src/components/nav';
import { ErrorLine, LoadingLine, Screen } from '../../src/components/Screen';
import { TaskFeed } from '../../src/components/today/TaskFeed';
import { TodayEmpty } from '../../src/components/today/TodayEmpty';
import { TodayHeader } from '../../src/components/today/TodayHeader';
import {
  loadRecap,
  loadTaskById,
  loadToday,
  type ActiveTask,
  type Recap,
} from '../../src/components/today/todayData';
import { useFocusLoad } from '../../src/components/useFocusLoad';
import { subscribeGeneration } from '../../src/llm/pipeline';
import { useTheme } from '../../src/theme';

export default function TodayScreen() {
  const { spacing } = useTheme();
  const params = useLocalSearchParams<{ taskId?: string; t?: string }>();
  const { data, loading, error, reload } = useFocusLoad(loadToday);
  const [bookId, setBookId] = useState<number | null>(null);
  const [picked, setPicked] = useState<ActiveTask | null>(null);
  const [readAhead, setReadAhead] = useState(false);
  const [recap, setRecap] = useState<Recap | null>(null);

  useEffect(() => subscribeGeneration(() => void reload()), [reload]);

  // A task tapped in the book screen arrives as a param.
  useEffect(() => {
    const id = Number(params.taskId);
    if (!params.taskId || !Number.isInteger(id)) return;
    let alive = true;
    loadTaskById(id)
      .then((task) => {
        if (!alive || !task) return;
        setRecap(null);
        setPicked(task);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [params.taskId, params.t]);

  if (!data) {
    return <Screen padded={false}>{loading ? <LoadingLine /> : <ErrorLine text={error ?? 'Could not load.'} />}</Screen>;
  }

  const { nextTasks, streak, books } = data;
  const next = nextTasks.find((t) => t.bookId === bookId) ?? nextTasks[0];
  const active: ActiveTask | null = picked ?? next ?? null;
  const reading = active != null && (picked != null || !streak.doneToday || readAhead);
  const chatBookId = active?.bookId ?? books[0]?.id;
  const activeBook = active ? books.find((b) => b.id === active.bookId) : undefined;

  const onCompleted = async (bookFinished: boolean) => {
    const done = active;
    setPicked(null);
    setReadAhead(false);
    if (bookFinished && done) {
      setRecap(await loadRecap(done.bookId, done.bookTitle).catch(() => null));
    }
    await reload();
  };

  let body;
  if (recap) {
    body = (
      <EmptyState
        mascot="happy"
        text={`You finished ${recap.bookTitle}: ${recap.tasks} tasks, ${recap.cards} cards.`}
        buttonLabel="Continue"
        onPress={() => setRecap(null)}
      />
    );
  } else if (reading && active) {
    body = (
      <>
        <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.sm, gap: spacing.xs }}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {active.bookTitle}
          </AppText>
          <AppText variant="caption" numberOfLines={1}>
            {active.title}
            {activeBook?.source === 'model_knowledge' ? '  ·  model knowledge' : ''}
          </AppText>
          {!picked && nextTasks.length > 1 ? (
            <View style={{ paddingTop: spacing.sm }}>
              <Chips
                label="Book"
                value={active.bookId}
                onChange={setBookId}
                options={nextTasks.map((t) => ({ value: t.bookId, label: t.bookTitle }))}
              />
            </View>
          ) : null}
        </View>
        <TaskFeed key={active.id} task={active} onCompleted={onCompleted} />
      </>
    );
  } else if (active) {
    body = (
      <EmptyState
        mascot="completed"
        done
        text={`Done for today. Streak: ${streak.current}.`}
        buttonLabel="Read ahead"
        onPress={() => setReadAhead(true)}
      />
    );
  } else {
    body = <TodayEmpty data={data} />;
  }

  return (
    <Screen padded={false}>
      <TodayHeader streak={streak.current} onChat={chatBookId != null ? () => goToChat(chatBookId) : undefined} />
      {body}
    </Screen>
  );
}
