import { router } from 'expo-router';

// Any LLM action without an API key lands here instead of throwing.
export function goToSettings() {
  router.navigate('/settings');
}

export function goToChat(topicId: number) {
  router.push({ pathname: '/chat', params: { topicId: String(topicId) } });
}

export function goToTopic(topicId: number) {
  router.push({ pathname: '/topic/[id]', params: { id: String(topicId) } });
}

// `q` prefills "what do you want to learn?", e.g. from a tapped suggestion.
export function goToAddTopic(q?: string) {
  router.push(q ? { pathname: '/add-topic', params: { q } } : '/add-topic');
}

// `t` makes repeated taps on the same session count as a new request.
export function readSessionInToday(sessionId: number) {
  router.navigate({ pathname: '/', params: { sessionId: String(sessionId), t: String(Date.now()) } });
}

export function goToToday() {
  router.navigate('/');
}
