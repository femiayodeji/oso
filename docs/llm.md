# LLM layer

Everything that talks to a model lives in `src/llm/`. The app calls the provider directly from the device with the user's own key.

## Providers

Defined once in `src/llm/providers.ts`. This is the only place default model ids live.

| Provider | Adapter | Base URL | Default model |
|---|---|---|---|
| OpenRouter | OpenAI-compatible | `https://openrouter.ai/api/v1` | `openrouter/free` |
| Gemini | OpenAI-compatible | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-flash-latest` |
| Groq | OpenAI-compatible | `https://api.groq.com/openai/v1` | `openai/gpt-oss-120b` |
| Anthropic | Anthropic | `https://api.anthropic.com/v1` | `claude-haiku-5-5` |
| OpenAI | OpenAI-compatible | `https://api.openai.com/v1` | `gpt-6.1-sol` |

Defaults are the free option where the provider has one, otherwise its low-cost model. Model ids go stale; check them against the provider's model list when a default stops working.

- The provider, base URL and model are user-editable in Settings.
- An empty `model` setting resolves to the provider's default (`resolveModel`).
- An empty base URL, or one left over from a different provider, resolves to the selected provider's own URL (`resolveBaseUrl`).
- One API key is stored for all providers. Switching provider means pasting that provider's key.

## The client

`src/llm/client.ts` exposes one interface:

```ts
complete({ system, messages, json? }): Promise<string>
completeJson(req, zodSchema): Promise<T>
testConnection(): Promise<void>
```

`complete` reads the key from the secure store and the settings from SQLite on every call, so a change in Settings applies at once. With no key it throws `LlmError('no_key')`, which screens turn into a redirect to Settings.

### Adapters

| File | Request | Notes |
|---|---|---|
| `adapters/openaiCompatible.ts` | `POST {baseUrl}/chat/completions`, `Authorization: Bearer <key>` | Uses JSON mode when the prompt mentions JSON; retries once without it if the model rejects `response_format` |
| `adapters/anthropic.ts` | `POST {baseUrl}/messages`, headers `x-api-key` and `anthropic-version` | `max_tokens` is 16,000; a `refusal` stop reason becomes a readable error |

### HTTP wrapper

`src/llm/http.ts` is a thin `fetch` wrapper with `postJson` and `getJson`:

- Timeout of 180 seconds by default.
- Up to 2 retries on 429 and 5xx, with exponential backoff capped at 30 seconds, honouring `Retry-After`.
- Every failure becomes an `LlmError`.

### Errors

`LlmError` has a `kind` and a message that is always safe to show: it never contains the key, headers or prompts. The key is scrubbed from any provider error text.

| Kind | Cause |
|---|---|
| `no_key` | No API key saved |
| `invalid_key` | 401 |
| `rate_limit` | 429 after retries |
| `server` | 5xx after retries |
| `bad_request` | Any other 4xx; shows the provider's reason. A 402 says to pick a free or cheaper model. |
| `network`, `timeout` | Fetch failed or took too long |
| `bad_response` | Empty, unparseable or invalid reply |

## Structured output

Every JSON reply is validated before it is used (`src/llm/jsonCompletion.ts`):

1. The prompt tells the model to return a single JSON object and nothing else.
2. `parseJsonLoose` strips code fences and extracts the JSON.
3. The result is validated with a `zod` schema from `src/llm/schemas.ts`.
4. On failure the request is retried **once**, with the model's reply and the validation error appended.
5. A second failure throws `bad_response`, and the item is marked failed.

Schemas:

| Schema | Shape |
|---|---|
| `outlineSchema` | `{ known?, chapters: [{ title }] }`, at most 80 chapters |
| `chapterContentSchema` | `{ summary, cards: [...] }`, 3 to 24 cards |
| `cardSchema` | `{ type, front, back? }`; recall cards must have a non-empty `back` |
| `rewrittenCardSchema` | `{ front, back? }` |
| `chatActionSchema` | `{ action: 'set_plan', days }`, 1 to 365 |

## Prompts

Every prompt is in `src/llm/prompts.ts`. None are written inline in components.

| Function | Used for |
|---|---|
| `outlinePrompt` | Listing a book's chapters from model knowledge |
| `chapterPrompt` | A chapter's summary and cards |
| `cardRewritePrompt` | Rewriting a flagged card |
| `chatSystemPrompt` | The chat companion, with chapter notes and plan state |
| `jsonRetryPrompt` | The retry message carrying the validation error |
| `TEST_CONNECTION_PROMPT` | Settings → Test connection |

Points worth knowing before editing a prompt:

- Uploaded text is wrapped in `<source_text>` tags and the prompt says it is material to study, not instructions.
- Card counts scale with the chapter's length (`cardCountRange`): 4–7, 6–10 or 8–14 cards.
- About one card in three should be a recall card.
- Card rules cap `front` at about 45 words and `back` at about 35.

## Generation pipeline

`src/llm/pipeline.ts`.

```
runGeneration(bookId)
  ├─ ensureOutline      build chapters if none exist
  ├─ generateChapters   one call per chapter not yet 'done'
  └─ finish             'ready' if all done, else 'failed'
```

- **One call per chapter** keeps context small and makes retries cheap.
- **Saved after every chapter.** A chapter's cards and summary are written, and it is marked `done`, before the next starts.
- **Resumable.** `resumePendingGenerations()` runs on every app foreground and continues books stuck in `generating`. Chapters already `done` are skipped.
- **Stops early when it would only fail again.** After a missing or invalid key, network failure, rate limit, bad request or timeout, the remaining chapters are not attempted.
- **Oversized chapters are condensed.** If a provider rejects a chapter as too large, the text is halved and retried, up to three times.
- **Progress is broadcast.** `subscribeGeneration(listener)` notifies screens; `isGenerating(bookId)` and `getGenerationError(bookId)` report the in-memory state.

### Outlines

| Source | How the outline is built |
|---|---|
| `model_knowledge` | `outlinePrompt`. If the model returns `known: false` or no chapters, generation fails with a message suggesting the book text be attached. |
| `uploaded` | No model call. The file is read to text and split by `buildUploadedOutline`. |

### Uploaded books

`src/llm/bookText.ts` reads the file; `src/llm/textSplit.ts` splits it.

- **Formats:** txt, md, epub (unzipped with `jszip`, spine order, HTML to text) and pdf (a parser in `pdf.ts`, `pdfObjects.ts` and `pdfFonts.ts`).
- **Chapter detection:** markdown headings first, otherwise lines such as "Chapter 3", "Part II" or "Prologue". Very short sections are treated as table-of-contents noise and dropped.
- **Size limit:** a chapter over 60,000 characters (`MAX_CHAPTER_CHARS`) is split into parts.
- **Repeated titles** are prefixed with their part so two "Chapter 1"s stay distinguishable.
- Text with no detectable headings becomes one chapter titled "Full text".

PDF parsing runs on the JS thread and yields every few pages to keep the UI responsive. Scanned PDFs with no text layer produce no readable text.

### Regenerating

- **A card:** `regenerateCard(cardId, note?)` rewrites one card in place, keeping its type.
- **A book:** `regenerateBook(bookId, { fileUri?, fileName? })` builds the new outline first. If that fails, the book is left exactly as it was. Once the old content is replaced, the chat history for the book is cleared and generation runs as usual.

## Chat

`src/llm/chat.ts` and `src/llm/chatReply.ts`.

1. The system prompt carries the book, the plan state and every chapter's summary (trimmed to a shared budget of about 16,000 characters).
2. The last 12 messages are sent, starting on a user turn.
3. `parseChatReply` removes any JSON object with an `action` key from the visible text. Only an object that passes `chatActionSchema` is acted on.
4. A valid `set_plan` is applied only when the book's cards are ready. If they are not, the reply is replaced with a message saying so, because the model may claim otherwise.
5. Both the user message and the final reply are stored in `chat_messages`.

The plan is never changed from free text.

## Model list

`src/llm/models.ts` powers the model dropdown in Settings.

- `listModels()` calls `GET {baseUrl}/models` with the same authentication as completions.
- `parseModelList()` reads the `{ data: [{ id, ... }] }` shape all supported providers return.
- Models that cannot generate text (speech, embeddings, image, video and safety models) are filtered out.
- Where the provider reports prices (OpenRouter), free models come first, then cheapest. Otherwise the list is alphabetical.
- A model id can always be typed by hand in the picker, for models the provider does not list.

## Tests

| File | Covers |
|---|---|
| `adapters.test.ts` | Request bodies, response parsing, model and base URL resolution |
| `http.test.ts` | Retries, backoff, error mapping, key scrubbing |
| `json.test.ts`, `jsonCompletion.test.ts` | Fence stripping, extraction, the one-retry rule |
| `chatReply.test.ts` | Action extraction and validation |
| `prompts.test.ts` | Prompt content and card count ranges |
| `textSplit.test.ts`, `epub.test.ts`, `pdf.test.ts` | Chapter detection and file parsing |
| `models.test.ts` | Model list parsing, sorting and filtering |
| `live.test.ts` | Real provider calls; skipped unless `OSO_LIVE=1` |
