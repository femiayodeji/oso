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

- The active provider, and each provider's base URL and model, are user-editable in Settings.
- An empty `model` setting resolves to the provider's default (`resolveModel`).
- An empty base URL, or one left over from a different provider, resolves to the selected provider's own URL (`resolveBaseUrl`).
- Each provider has its own API key (`src/llm/apiKey.ts`). The key functions take an optional provider and default to the active one; `providersWithKey()` lists which providers have one saved.

## The client

`src/llm/client.ts` exposes one interface:

```ts
complete({ system, messages, json? }): Promise<string>
completeJson(req, zodSchema): Promise<T>
testConnection(): Promise<void>
```

`complete` reads the settings from SQLite and then the key for that same provider from the secure store, on every call, so a change in Settings applies at once and the key always matches the URL. With no key it throws `LlmError('no_key')`, which screens turn into a redirect to Settings.

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
| `no_key` | No API key saved for the active provider |
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
| `outlineSchema` | `{ known?, kind?: 'book' \| 'topic', title?, author?, icon?, units: [{ title }] }`, at most 80 units |
| `unitContentSchema` | `{ summary, cards: [...] }`, 3 to 24 cards |
| `cardSchema` | `{ type, front, back?, options?, answer? }`. Recall cards need a non-empty `back`; quiz cards need 2 to 5 `options` and an `answer` index inside them. |
| `rewrittenCardSchema` | `{ front, back?, options?, answer? }` |
| `rewrittenQuizSchema` | `rewrittenCardSchema` with the quiz rule, used when the flagged card is a quiz |
| `chatActionSchema` | `{ action: 'set_plan', days }`, 1 to 365 |

The outline's `icon` is a plain string in the schema and checked against the list in `src/topic/icons.ts` afterwards, so an unknown icon name means no icon rather than a failed outline.

## Prompts

Every prompt is in `src/llm/prompts.ts`. None are written inline in components.

| Function | Used for |
|---|---|
| `outlinePrompt` | Deciding book or topic, and listing its units, title, author and icon, from model knowledge |
| `unitPrompt` | A unit's summary and cards |
| `cardRewritePrompt` | Rewriting a flagged card, with a reply shape per card type |
| `chatSystemPrompt` | The learning companion, with unit notes and plan state |
| `jsonRetryPrompt` | The retry message carrying the validation error |
| `TEST_CONNECTION_PROMPT` | Settings → Test connection |

### Card rules

`CARD_RULES` is shared by the unit and rewrite prompts. It asks for cards that are engaging, concise and precise:

- One idea per card, plain text, no markdown or emoji.
- `front` under 40 words, `back` under 30.
- Lead with the point, be specific, and use a vivid example, comparison or number where it helps. No filler ("In this unit", "It is important to note").
- State only what is true; never invent quotes, statistics, studies or names.
- The `summary` card is a one- or two-sentence hook.
- About one card in three tests the learner, mixing recall and quiz. Quiz distractors are plausible, never silly.

### Other points

- What the learner typed is wrapped in `<request>` tags in the outline prompt.
- Uploaded text is wrapped in `<source_text>` tags and the prompt says it is material to study, not instructions.
- Card counts come from `cardCountRange(sourceChars, depth)`: by depth when there is no source (4–6, 6–9 or 8–12), by length when there is (4–7, 6–10 or 8–14).
- The outline prompt asks for the depth's unit range for open topics (4–6, 8–12 or 16–24) and tells the model to ignore it for books.

## Generation pipeline

`src/llm/pipeline.ts`.

```
runGeneration(topicId)
  ├─ ensureOutline      build units if none exist; save title, author and icon
  ├─ generateUnits      one call per unit not yet 'done'
  └─ finish             'ready' if all done, else 'failed'
```

- **One call per unit** keeps context small and makes retries cheap.
- **Saved after every unit.** A unit's cards and summary are written, and it is marked `done`, before the next starts.
- **Resumable.** `resumePendingGenerations()` runs on every app foreground and continues topics stuck in `generating`. Units already `done` are skipped.
- **Stops early when it would only fail again.** After a missing or invalid key, network failure, rate limit, bad request or timeout, the remaining units are not attempted.
- **Oversized units are condensed.** If a provider rejects a unit as too large, the text is halved and retried, up to three times.
- **Progress is broadcast.** `subscribeGeneration(listener)` notifies screens; `isGenerating(topicId)` and `getGenerationError(topicId)` report the in-memory state.

### Outlines

| Source | How the outline is built |
|---|---|
| `model_knowledge` | `outlinePrompt`. The reply's title replaces what the learner typed, and its author (books only) and icon are saved. If the model returns `known: false` or no units, generation fails with a message suggesting a more specific wording or the learner's own material. |
| `uploaded` | No model call. The file is read to text and split by `buildUploadedOutline`. The title stays as typed and there is no icon, so the UI shows a book. |

`buildOutline` returns `{ units, meta }`; `meta` is null for uploads.

### Uploaded material

`src/llm/sourceText.ts` reads the file; `src/llm/textSplit.ts` splits it.

- **Formats:** txt, md, epub (unzipped with `jszip`, spine order, HTML to text) and pdf (a parser in `pdf.ts`, `pdfObjects.ts` and `pdfFonts.ts`).
- **Chapter detection:** markdown headings first, otherwise lines such as "Chapter 3", "Part II" or "Prologue". Very short sections are treated as table-of-contents noise and dropped. Each detected chapter becomes a unit.
- **Size limit:** a chapter over 60,000 characters (`MAX_UNIT_CHARS`) is split into parts.
- **Repeated titles** are prefixed with their part so two "Chapter 1"s stay distinguishable.
- Text with no detectable headings becomes one unit titled "Full text".

PDF parsing runs on the JS thread and yields every few pages to keep the UI responsive. Scanned PDFs with no text layer produce no readable text.

### Regenerating

- **A card:** `regenerateCard(cardId, note?)` rewrites one card in place, keeping its type. A quiz card gets new options and answer too.
- **A topic:** `regenerateTopic(topicId, { fileUri?, fileName? })` builds the new outline first. If that fails, the topic is left exactly as it was. Once the old content is replaced, the new title, author and icon are saved, the chat history for the topic is cleared, and generation runs as usual.

## Chat

`src/llm/chat.ts` and `src/llm/chatReply.ts`.

1. The system prompt carries the topic, the plan state and every unit's summary (trimmed to a shared budget of about 16,000 characters).
2. The last 12 messages are sent, starting on a user turn.
3. `parseChatReply` removes any JSON object with an `action` key from the visible text. Only an object that passes `chatActionSchema` is acted on.
4. A valid `set_plan` is applied only when the topic's cards are ready. If they are not, the reply is replaced with a message saying so, because the model may claim otherwise.
5. Both the user message and the final reply are stored in `chat_messages`.

The plan is never changed from free text.

## Model list

`src/llm/models.ts` powers the model dropdown in Settings.

- `listModels()` calls `GET {baseUrl}/models` for the active provider, with that provider's key.
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
| `prompts.test.ts` | Chat prompt plan wording |
| `quiz.test.ts` | Quiz validation, card mapping, outline fields, depth-based card counts |
| `textSplit.test.ts`, `epub.test.ts`, `pdf.test.ts` | Chapter detection and file parsing |
| `models.test.ts` | Model list parsing, sorting and filtering |
| `live.test.ts` | Real provider calls; skipped unless `OSO_LIVE=1` |
