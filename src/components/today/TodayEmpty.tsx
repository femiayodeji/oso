import { diffDays, todayLocal } from '../../lib/dates';
import { pickSuggestions } from '../../topic/suggestions';
import { EmptyState } from '../EmptyState';
import { goToAddTopic, goToTopic, goToChat, goToSettings } from '../nav';
import { REVIEW_LABEL, type TodayData } from './todayData';

// Every Today state that is not the feed: one mascot, one line, one button, routing to the next step.
// `onReview` is passed only when recall cards are due; it adds a quiet "Review due cards" action.
export function TodayEmpty({ data, onReview }: { data: TodayData; onReview?: () => void }) {
  const { topics, hasKey, preparing } = data;
  const review = onReview ? { secondaryLabel: REVIEW_LABEL, onSecondaryPress: onReview } : null;
  const ideas = { suggestions: pickSuggestions(4, diffDays('2000-01-01', todayLocal())), onSuggest: goToAddTopic };

  if (topics.length === 0) {
    return hasKey ? (
      <EmptyState
        {...ideas}
        mascot="noTopics"
        text="What do you want to learn?"
        buttonLabel="Start learning"
        onPress={() => goToAddTopic()}
      />
    ) : (
      <EmptyState mascot="reading" text="Add an API key to start." buttonLabel="Open Settings" onPress={goToSettings} />
    );
  }

  const unplanned = topics.find((b) => b.status === 'ready');
  if (unplanned) {
    return (
      <EmptyState
        {...review}
        mascot="chat"
        text={`${unplanned.title} is ready. Set a plan to start.`}
        buttonLabel="Plan in chat"
        onPress={() => goToChat(unplanned.id)}
      />
    );
  }

  if (preparing) {
    const { topic, done, total } = preparing;
    return (
      <EmptyState
        {...review}
        mascot="generating"
        text={total > 0 ? `Preparing units, ${done} of ${total}` : 'Preparing units…'}
        buttonLabel="View topic"
        onPress={() => goToTopic(topic.id)}
      />
    );
  }

  const failed = topics.find((b) => b.status === 'failed');
  if (failed) {
    return (
      <EmptyState
        {...review}
        mascot="error"
        text={`${failed.title} could not be prepared.`}
        buttonLabel="Open topic"
        onPress={() => goToTopic(failed.id)}
      />
    );
  }

  return (
    <EmptyState
      {...review}
      {...ideas}
      mascot="happy"
      text="You finished everything."
      buttonLabel="Learn something new"
      onPress={() => goToAddTopic()}
    />
  );
}
