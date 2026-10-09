import { router } from 'expo-router';

// Any LLM action without an API key lands here instead of throwing.
export function goToSettings() {
  router.navigate('/settings');
}

export function goToChat(bookId: number) {
  router.push({ pathname: '/chat', params: { bookId: String(bookId) } });
}

export function goToBook(bookId: number) {
  router.push({ pathname: '/book/[id]', params: { id: String(bookId) } });
}

export function goToAddBook() {
  router.push('/add-book');
}

// `t` makes repeated taps on the same task count as a new request.
export function readTaskInToday(taskId: number) {
  router.navigate({ pathname: '/', params: { taskId: String(taskId), t: String(Date.now()) } });
}

export function goToToday() {
  router.navigate('/');
}
