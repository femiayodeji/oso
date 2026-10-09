import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Platform,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { listCardsForTask, listDueReviewCards } from '../../db/cards';
import { completeTask } from '../../db/tasks';
import { todayLocal } from '../../lib/dates';
import { syncReminders } from '../../notifications';
import { playSound } from '../../sound';
import { useTheme } from '../../theme';
import type { Card } from '../../types';
import { AppText, ErrorText } from '../AppText';
import { Button } from '../Button';
import { ErrorLine, LoadingLine } from '../Screen';
import { errorMessage } from '../useFocusLoad';
import { CardPage } from './CardPage';
import type { ActiveTask } from './todayData';

const REVIEW_LIMIT = 10;
const SETTLE_MS = 150;
// Fraction of a page the list may sit off a page boundary before it is moved back.
const SETTLE_SLACK = 0.05;

interface Item {
  key: string;
  card: Card | null;
  review: boolean;
}

interface Props {
  // null = review only: just the due review cards, and finishing completes no task.
  task: ActiveTask | null;
  onCompleted: (bookFinished: boolean) => void;
}

// One card per page, the task's own cards first, then due review cards, then Finish.
export function TaskFeed({ task, onCompleted }: Props) {
  const taskId = task?.id ?? null;
  const listRef = useRef<FlatList<Item>>(null);
  const dragging = useRef(false);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { spacing } = useTheme();
  const [cards, setCards] = useState<Card[] | null>(null);
  const [reviews, setReviews] = useState<Card[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [height, setHeight] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      taskId == null ? Promise.resolve<Card[]>([]) : listCardsForTask(taskId),
      listDueReviewCards(todayLocal(), { excludeTaskId: taskId ?? undefined, limit: REVIEW_LIMIT }),
    ])
      .then(([own, due]) => {
        if (!alive) return;
        setCards(own);
        setReviews(due);
      })
      .catch((e: unknown) => {
        if (alive) setLoadError(errorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, [taskId]);

  const items = useMemo<Item[]>(
    () => [
      ...(cards ?? []).map((card) => ({ key: `c${card.id}`, card, review: false })),
      ...reviews.map((card) => ({ key: `r${card.id}`, card, review: true })),
      { key: 'finish', card: null, review: false },
    ],
    [cards, reviews],
  );

  const replace = useCallback((fresh: Card) => {
    const swap = (list: Card[]) => list.map((c) => (c.id === fresh.id ? fresh : c));
    setCards((list) => (list ? swap(list) : list));
    setReviews(swap);
  }, []);

  const finish = async () => {
    // A review-only session completes no task, so it is not streak activity.
    if (taskId == null) {
      onCompleted(false);
      return;
    }
    setFinishing(true);
    setFinishError(null);
    try {
      const result = await completeTask(taskId, todayLocal());
      playSound('streak');
      void syncReminders();
      onCompleted(result.bookFinished);
    } catch (e) {
      setFinishError(errorMessage(e));
      setFinishing(false);
    }
  };

  // Keep the exact height. Paging snaps by the real viewport, so a rounded page height
  // drifts a fraction of a pixel per card and adds up to a visible offset.
  const onLayout = (e: LayoutChangeEvent) => setHeight(e.nativeEvent.layout.height);

  useEffect(
    () => () => {
      if (settle.current) clearTimeout(settle.current);
    },
    [],
  );

  // Android only. A long card scrolls inside its page and hands leftover movement to this list
  // through nested scrolling, which moves the list without running its page snap. If the list
  // comes to rest between two pages, move it to the nearer one.
  const onScroll =
    Platform.OS === 'android'
      ? (e: NativeSyntheticEvent<NativeScrollEvent>) => {
          const y = e.nativeEvent.contentOffset.y;
          if (settle.current) clearTimeout(settle.current);
          settle.current = setTimeout(() => {
            if (dragging.current || height === 0) return;
            const page = Math.round(y / height);
            if (Math.abs(y - page * height) > height * SETTLE_SLACK) listRef.current?.scrollToOffset({ offset: page * height });
          }, SETTLE_MS);
        }
      : undefined;

  const finishLine = task ? `End of ${task.title}` : reviews.length > 0 ? 'End of review' : 'Nothing is due for review.';

  if (loadError) return <ErrorLine text={loadError} />;

  return (
    <View style={styles.fill} onLayout={onLayout}>
      {cards === null || height === 0 ? (
        <LoadingLine />
      ) : (
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(item) => item.key}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          windowSize={21}
          onScroll={onScroll}
          onScrollBeginDrag={() => {
            dragging.current = true;
          }}
          onScrollEndDrag={() => {
            dragging.current = false;
          }}
          getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
          renderItem={({ item, index }) =>
            item.card ? (
              <CardPage
                card={item.card}
                review={item.review}
                height={height}
                position={`${index + 1} of ${items.length - 1}`}
                onReplace={replace}
              />
            ) : (
              <View style={[styles.finish, { height, padding: spacing.xl, gap: spacing.lg }]}>
                <AppText variant="caption" center>
                  {finishLine}
                </AppText>
                <ErrorText center>{finishError}</ErrorText>
                <Button label={task ? 'Finish' : 'Done'} silent disabled={finishing} onPress={finish} />
              </View>
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  finish: { justifyContent: 'center' },
});
