import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppText } from '../../src/components/AppText';
import { Chips } from '../../src/components/Chips';
import { EmptyState } from '../../src/components/EmptyState';
import { goToChat } from '../../src/components/nav';
import { ErrorLine, LoadingLine, Screen } from '../../src/components/Screen';
import { SessionFeed } from '../../src/components/today/SessionFeed';
import { TodayEmpty } from '../../src/components/today/TodayEmpty';
import { TodayHeader } from '../../src/components/today/TodayHeader';
import {
  loadRecap,
  loadSessionById,
  loadToday,
  REVIEW_LABEL,
  type ActiveSession,
  type Recap,
} from '../../src/components/today/todayData';
import { useFocusLoad } from '../../src/components/useFocusLoad';
import { subscribeGeneration } from '../../src/llm/pipeline';
import { TopicBadge } from '../../src/components/TopicBadge';
import { useTheme } from '../../src/theme';

export default function TodayScreen() {
  const { spacing } = useTheme();
  const params = useLocalSearchParams<{ sessionId?: string; t?: string }>();
  const { data, loading, error, reload } = useFocusLoad(loadToday);
  const [topicId, setTopicId] = useState<number | null>(null);
  const [picked, setPicked] = useState<ActiveSession | null>(null);
  const [readAhead, setReadAhead] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [recap, setRecap] = useState<Recap | null>(null);
  // Set when a session was just finished here, so the next screen celebrates once.
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => subscribeGeneration(() => void reload()), [reload]);

  // A session tapped in the topic screen arrives as a param.
  useEffect(() => {
    const id = Number(params.sessionId);
    if (!params.sessionId || !Number.isInteger(id)) return;
    let alive = true;
    loadSessionById(id)
      .then((session) => {
        if (!alive || !session) return;
        setRecap(null);
        setReviewing(false);
        setPicked(session);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [params.sessionId, params.t]);

  // The picked session can disappear while this tab stays mounted (plan changed in chat, topic
  // regenerated or deleted), so it is checked again after every reload. A new plan can also
  // reuse the id for a different session, which shows up as a changed title.
  const pickedId = picked?.id;
  useEffect(() => {
    if (pickedId == null) return;
    let alive = true;
    loadSessionById(pickedId)
      .then((session) => {
        if (!alive) return;
        setPicked((current) => {
          if (!current || current.id !== pickedId) return current;
          if (!session) return null;
          return session.title === current.title && session.topicId === current.topicId ? current : session;
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [data, pickedId]);

  if (!data) {
    return <Screen padded={false}>{loading ? <LoadingLine /> : <ErrorLine text={error ?? 'Could not load.'} />}</Screen>;
  }

  const { nextSessions, streak, topics, hasDueReviews } = data;
  const next = nextSessions.find((t) => t.topicId === topicId) ?? nextSessions[0];
  const active: ActiveSession | null = picked ?? next ?? null;
  const reading = active != null && (picked != null || !streak.doneToday || readAhead);
  const chatTopicId = active?.topicId ?? topics[0]?.id;
  const activeTopic = active ? topics.find((b) => b.id === active.topicId) : undefined;
  // Offered only where there is no session feed, which already appends due review cards.
  const startReview = hasDueReviews ? () => setReviewing(true) : undefined;

  const onCompleted = async (topicFinished: boolean) => {
    const done = active;
    setPicked(null);
    setReadAhead(false);
    setReviewing(false);
    setCelebrate(true);
    if (topicFinished && done) {
      setRecap(await loadRecap(done.topicId, done.topicTitle).catch(() => null));
    }
    await reload();
  };

  // Review only: nothing is completed, so the streak and reminders are left alone.
  const onReviewDone = () => {
    setReviewing(false);
    void reload();
  };

  let body;
  if (recap) {
    body = (
      <EmptyState
        mascot="happy"
        text={`You finished ${recap.topicTitle}: ${recap.sessions} sessions, ${recap.cards} cards.`}
        buttonLabel="Continue"
        onPress={() => {
          setRecap(null);
          setCelebrate(false);
        }}
        celebrate={celebrate}
      />
    );
  } else if (reading && active) {
    body = (
      <>
        <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.sm, gap: spacing.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <TopicBadge topic={{ id: active.topicId, icon: activeTopic?.icon ?? null }} size={36} />
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong" numberOfLines={1}>
                {active.topicTitle}
              </AppText>
              <AppText variant="caption" numberOfLines={1}>
                {active.title}
                {activeTopic?.source === 'model_knowledge' ? '  ·  model knowledge' : ''}
              </AppText>
            </View>
          </View>
          {!picked && nextSessions.length > 1 ? (
            <View style={{ paddingTop: spacing.sm }}>
              <Chips
                label="Topic"
                value={active.topicId}
                onChange={setTopicId}
                options={nextSessions.map((t) => ({ value: t.topicId, label: t.topicTitle }))}
              />
            </View>
          ) : null}
        </View>
        <SessionFeed key={`${active.id}:${active.title}`} session={active} onCompleted={onCompleted} />
      </>
    );
  } else if (reviewing) {
    body = (
      <>
        <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.sm, gap: spacing.xs }}>
          <AppText variant="bodyStrong">Review</AppText>
          <AppText variant="caption">Cards due again from sessions you have finished</AppText>
        </View>
        <SessionFeed key="review" session={null} onCompleted={onReviewDone} />
      </>
    );
  } else if (active) {
    body = (
      <EmptyState
        mascot="completed"
        done
        text={`Done for today. Streak: ${streak.current}.`}
        celebrate={celebrate}
        buttonLabel="Keep learning"
        onPress={() => {
          setCelebrate(false);
          setReadAhead(true);
        }}
        secondaryLabel={startReview ? REVIEW_LABEL : undefined}
        onSecondaryPress={startReview}
      />
    );
  } else {
    body = <TodayEmpty data={data} onReview={startReview} />;
  }

  return (
    <Screen padded={false}>
      <TodayHeader streak={streak.current} onChat={chatTopicId != null ? () => goToChat(chatTopicId) : undefined} />
      {body}
    </Screen>
  );
}
