import { EmptyState } from '../EmptyState';
import { goToAddBook, goToBook, goToChat, goToSettings } from '../nav';
import { REVIEW_LABEL, type TodayData } from './todayData';

// Every Today state that is not the feed: one mascot, one line, one button, routing to the next step.
// `onReview` is passed only when recall cards are due; it adds a quiet "Review due cards" action.
export function TodayEmpty({ data, onReview }: { data: TodayData; onReview?: () => void }) {
  const { books, hasKey, preparing } = data;
  const review = onReview ? { secondaryLabel: REVIEW_LABEL, onSecondaryPress: onReview } : null;

  if (books.length === 0) {
    return hasKey ? (
      <EmptyState mascot="noBooks" text="Nothing to read yet." buttonLabel="Add your first book" onPress={goToAddBook} />
    ) : (
      <EmptyState mascot="reading" text="Add an API key to start." buttonLabel="Open Settings" onPress={goToSettings} />
    );
  }

  const unplanned = books.find((b) => b.status === 'ready');
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
    const { book, done, total } = preparing;
    return (
      <EmptyState
        {...review}
        mascot="generating"
        text={total > 0 ? `Preparing chapters, ${done} of ${total}` : 'Preparing chapters…'}
        buttonLabel="View book"
        onPress={() => goToBook(book.id)}
      />
    );
  }

  const failed = books.find((b) => b.status === 'failed');
  if (failed) {
    return (
      <EmptyState
        {...review}
        mascot="error"
        text={`${failed.title} could not be prepared.`}
        buttonLabel="Open book"
        onPress={() => goToBook(failed.id)}
      />
    );
  }

  return (
    <EmptyState
      {...review}
      mascot="happy" text="You finished everything." buttonLabel="Pick your next book" onPress={goToAddBook} />
  );
}
