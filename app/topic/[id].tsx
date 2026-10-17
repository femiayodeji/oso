import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppText } from '../../src/components/AppText';
import { TopicActions } from '../../src/components/topics/TopicActions';
import { UnitList, SessionPool } from '../../src/components/topics/TopicSections';
import { loadTopicDetail, type TopicDetail } from '../../src/components/topics/topicData';
import { Button } from '../../src/components/Button';
import { EmptyState } from '../../src/components/EmptyState';
import { goToChat, goToSettings, readSessionInToday } from '../../src/components/nav';
import { PopIn } from '../../src/components/motion/PopIn';
import { ProgressBar } from '../../src/components/motion/ProgressBar';
import { TopicBadge } from '../../src/components/TopicBadge';
import { ErrorLine, LoadingLine, Screen } from '../../src/components/Screen';
import { useFocusLoad } from '../../src/components/useFocusLoad';
import { describeLlmError, isNoKeyError } from '../../src/llm/errors';
import { getGenerationError, isGenerating, runGeneration, subscribeGeneration } from '../../src/llm/pipeline';
import { cardsPerDay, minDaysFor } from '../../src/plan/budget';
import { useTheme } from '../../src/theme';

// The pace of what is left, and why the plan is longer than picked when a book's chapters
// (or an upload's parts) need more days than that. Derived, not stored.
function planNotes({ topic, units, sessionsDone, sessionsTotal, cardsLeft }: TopicDetail) {
  const daysLeft = sessionsTotal - sessionsDone;
  const pace = daysLeft > 0 && cardsLeft > 0 ? `About ${cardsPerDay(cardsLeft, daysLeft)} cards a day` : null;
  const fixedUnits = topic.author !== null || topic.source === 'uploaded';
  const stretched = fixedUnits && units.total > 0 && topic.planDays === minDaysFor(units.total);
  const what = topic.source === 'uploaded' ? `Your material has ${units.total} parts` : `This book has ${units.total} chapters`;
  return { pace, stretch: stretched ? `${what}, so the plan is at least ${topic.planDays} days.` : null };
}

function PlanSection({ detail }: { detail: TopicDetail }) {
  const { spacing } = useTheme();
  const { topic, sessions, sessionsDone, sessionsTotal } = detail;
  const open = () => goToChat(topic.id);
  const { pace, stretch } = planNotes(detail);
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText variant="heading" accessibilityRole="header">
        Plan
      </AppText>
      {sessionsTotal === 0 ? (
        <>
          <AppText variant="body" color="textMuted">
            No plan yet.
          </AppText>
          <Button label="Set a plan" onPress={open} />
        </>
      ) : (
        <>
          <AppText variant="body" color="textMuted">
            {`${topic.planDays ?? sessionsTotal} days, ${sessionsDone} done${pace ? ` · ${pace}` : ''}`}
          </AppText>
          {stretch ? <AppText variant="caption">{stretch}</AppText> : null}
          <ProgressBar value={sessionsDone / sessionsTotal} />
          <SessionPool sessions={sessions} onOpen={(session) => readSessionInToday(session.id)} />
          <Button label="Change plan" variant="secondary" onPress={open} />
        </>
      )}
    </View>
  );
}

export default function TopicScreen() {
  const { spacing } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const topicId = Number(id);
  const { data, loading, error, reload } = useFocusLoad(() => loadTopicDetail(topicId));
  const [retryError, setRetryError] = useState<string | null>(null);

  useEffect(
    () =>
      subscribeGeneration((changed) => {
        if (changed === topicId) void reload();
      }),
    [topicId, reload],
  );

  const retry = () => {
    setRetryError(null);
    runGeneration(topicId)
      .catch((e: unknown) => {
        if (isNoKeyError(e)) goToSettings();
        else setRetryError(describeLlmError(e));
      })
      .finally(() => void reload());
  };

  if (loading && !data) return <Screen edges={['bottom']}><LoadingLine /></Screen>;
  if (error && !data) return <Screen edges={['bottom']}><ErrorLine text={error} /></Screen>;
  if (!data) return <Screen edges={['bottom']}><ErrorLine text="This topic no longer exists." /></Screen>;

  const { topic, units, unitList } = data;
  const prepared = topic.status === 'ready' || topic.status === 'finished';
  // Status says generating but nothing is running: the app was closed mid-generation.
  const interrupted = topic.status === 'generating' && !isGenerating(topicId);

  return (
    <Screen edges={['bottom']} scroll>
      <Stack.Screen options={{ title: topic.title }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <PopIn>
          <TopicBadge topic={topic} size={56} />
        </PopIn>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <AppText variant="title">{topic.title}</AppText>
          {topic.author ? <AppText variant="caption">{topic.author}</AppText> : null}
          {topic.source === 'model_knowledge' ? <AppText variant="label">Generated from model knowledge</AppText> : null}
        </View>
      </View>

      {topic.status === 'generating' ? (
        <EmptyState
          mascot="generating"
          text={units.total > 0 ? `Preparing units, ${units.done} of ${units.total}` : 'Preparing units…'}
          buttonLabel={interrupted ? 'Retry' : undefined}
          onPress={interrupted ? retry : undefined}
          error={interrupted ? retryError : null}
        />
      ) : null}
      {topic.status === 'generating' && units.total > 0 ? <ProgressBar value={units.done / units.total} /> : null}
      {topic.status === 'draft' ? (
        <EmptyState mascot="generating" text="Not prepared yet." buttonLabel="Prepare units" onPress={retry} error={retryError} />
      ) : null}
      {topic.status === 'failed' ? (
        <EmptyState
          mascot="error"
          text="Preparing this topic failed."
          error={retryError ?? getGenerationError(topicId) ?? 'Something went wrong. Try again.'}
          buttonLabel="Retry"
          onPress={retry}
        />
      ) : null}

      {prepared ? <PlanSection detail={data} /> : null}
      {prepared && unitList.length > 0 ? <UnitList units={unitList} /> : null}
      <TopicActions topic={topic} onChanged={() => void reload()} />
    </Screen>
  );
}
