// How many of a chat's newest messages to send. The window drops old messages in steps
// of `step`, not one per turn, so between drops each request starts with the same bytes
// as the last one and the provider's prompt cache can reuse the history.
export function historyWindow(total: number, limit: number, step: number): number {
  if (total <= limit) return total;
  const start = Math.ceil((total - limit) / step) * step;
  return total - start;
}
