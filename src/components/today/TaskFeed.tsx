import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

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

interface Item {
  key: string;
  card: Card | null;
  review: boolean;
}

interface Props {
  task: ActiveTask;
  onCompleted: (bookFinished: boolean) => void;
}

// One card per page, the task's own cards first, then due review cards, then Finish.
export function TaskFeed({ task, onCompleted }: Props) {
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
      listCardsForTask(task.id),
      listDueReviewCards(todayLocal(), { excludeTaskId: task.id, limit: REVIEW_LIMIT }),
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
  }, [task.id]);

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
    setFinishing(true);
    setFinishError(null);
    try {
      const result = await completeTask(task.id, todayLocal());
      playSound('streak');
      void syncReminders();
      onCompleted(result.bookFinished);
    } catch (e) {
      setFinishError(errorMessage(e));
      setFinishing(false);
    }
  };

  const onLayout = (e: LayoutChangeEvent) => setHeight(Math.floor(e.nativeEvent.layout.height));

  if (loadError) return <ErrorLine text={loadError} />;

  return (
    <View style={styles.fill} onLayout={onLayout}>
      {cards === null || height === 0 ? (
        <LoadingLine />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.key}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          windowSize={21}
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
                  {`End of ${task.title}`}
                </AppText>
                <ErrorText center>{finishError}</ErrorText>
                <Button label="Finish" silent disabled={finishing} onPress={finish} />
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
