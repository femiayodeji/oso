import { EmptyState } from '../EmptyState';
import { goToAddBook, goToBook, goToChat, goToSettings } from '../nav';
import type { TodayData } from './todayData';

// Every Today state that is not the feed: one mascot, one line, one button, routing to the next step.
export function TodayEmpty({ data }: { data: TodayData }) {
  const { books, hasKey, preparing } = data;

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
        mascot="error"
        text={`${failed.title} could not be prepared.`}
        buttonLabel="Open book"
        onPress={() => goToBook(failed.id)}
      />
    );
  }

  return (
    <EmptyState mascot="happy" text="You finished everything." buttonLabel="Pick your next book" onPress={goToAddBook} />
  );
}
