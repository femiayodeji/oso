# Product specification

This document states what Oso does and the rules it must keep. It describes the app as built. Implementation detail lives in [architecture.md](architecture.md), [data-model.md](data-model.md) and [llm.md](llm.md).

## Core principles

These are not negotiable. A change that breaks one of them is the wrong change.

1. **No backend.** The only network calls are direct LLM API calls from the device.
2. **Local-first.** All data lives in SQLite and the app's file system. Everything except generating new content works offline.
3. **Bring your own API key.** The user pastes a key in Settings and can change it at any time.
4. **No third-party services.** No Firebase, analytics or telemetry.
5. **Minimal, calm UI.** The app feels like a book, not a game. Drama lives in notifications only.
6. **Keep it simple.** This is a personal tool. Prefer the boring solution and avoid premature abstraction.

## Non-goals

Accounts, sync, social or competitive features, leaderboards, cloud storage, analytics, vector databases, in-app book reading, and monetization.

## Concepts

### Book

A book the user wants to finish. Its knowledge base is optional:

- **`model_knowledge`**: no file. The model generates from what it knows. The app labels such books "Generated from model knowledge".
- **`uploaded`**: the user supplies the text as a pdf, epub, txt or md file, or pastes it. The relevant chapter's text is sent as context in each prompt. There are no embeddings.

A book moves through these statuses:

| Status | Meaning |
|---|---|
| `draft` | Created, generation not started |
| `generating` | Outline or chapters are being prepared |
| `ready` | Every chapter is prepared; the book can be planned and read |
| `failed` | Generation stopped with at least one chapter not done |
| `finished` | Every task is completed |

### Chapter

A section of the book with a summary and cards. Each chapter has its own generation status (`pending`, `done`, `failed`) so generation can resume where it stopped.

### Card

One idea, text only. Three types:

| Type | Content |
|---|---|
| `summary` | A short overview of the chapter. Exactly one per chapter, shown first. |
| `key_idea` | One concrete idea, argument or example that stands on its own. |
| `recall` | A question on the front and the answer on the back. The reader taps to reveal. |

### Task

A daily unit of reading: an ordered run of cards. Tasks form an **ordered pool per book** and are **not tied to calendar dates**. Any task can be done at any time. Missing a day creates no "overdue" state.

### Plan

The plan is the number of days the reader wants to take. It is set only through chat (for example "finish this in 5 days"):

- The model returns a structured action, `{"action":"set_plan","days":5}`. The app parses, validates and applies it. Free text never changes the plan.
- `days` means **days remaining from now**, not the plan's total length.
- The app splits the unread cards into that many balanced, contiguous tasks.
- **Completed tasks are immutable.** Changing the plan only re-splits cards that are not in a completed task.
- All content is generated and saved before a plan can be set.

### Streak

The streak is global across all books.

- Completing at least one task from any book on a day counts as activity for that day.
- **Grace rule:** one missed day is allowed. It does not add to the count and does not break the chain. Two full days in a row with no activity reset the streak to zero.
- Today is still in progress, so an empty today is never counted as a missed day.
- The day boundary is the device's local midnight. Dates are stored as local `YYYY-MM-DD`.
- The streak is always computed from the `daily_activity` table. Only the all-time best streak is stored.
- A review-only session completes no task, so it is not streak activity.

### Spaced recall

Recall cards use Leitner boxes 1 to 5 with intervals of 1, 3, 7, 14 and 30 days.

- A recall card enters box 1 when its task is completed.
- "Got it" moves the card up one box; "Not yet" sends it back to box 1.
- Up to 10 due review cards are appended to a task's feed after its own cards.
- When there is nothing to read, due cards can be reviewed on their own.

## Screens

Three tabs, plus stack screens opened from them.

| Screen | Route | Purpose |
|---|---|---|
| Today | `/` | The feed for the next task, or an empty state |
| Books | `/books` | List of books with a status line each |
| Settings | `/settings` | API key, provider and model, reminders, appearance, sounds |
| Add a book | `/add-book` | Title, optional author, optional file or pasted text |
| Book | `/book/[id]` | Generation progress, plan, task pool, chapters, regenerate and delete |
| Chat | `/chat?bookId=` | Questions about the book and setting the plan |

### Today

- Shows the lowest-numbered incomplete task of a `ready` book. With several books in progress, chips switch between them.
- The feed is a vertical pager: the task's cards, then due review cards, then a Finish page.
- Finishing completes the task, plays a quiet sound, and reschedules reminders.
- Once the day has activity, Today shows "Done for today" with a **Read ahead** button.
- A flag control on each card asks the model to rewrite that card, with an optional note.
- Finishing a book's last task shows a one-line recap.

### Book

- While generating: "Preparing chapters, X of Y". If the app was closed mid-generation, a **Retry** button appears.
- When prepared: the plan summary, the task pool (tap a task to read it in Today), and the chapter list.
- Actions: attach or replace a file and regenerate, regenerate, delete. Regenerating replaces chapters, cards and tasks; the streak is kept.

### Chat

- Grounded in one book: the system prompt carries the chapter summaries and the plan state.
- Only recent history is sent (the last 12 messages).
- With no plan set, quick-reply chips offer 5, 7 and 14 days.
- When the plan changes, the UI confirms it and offers **Go to Today**.

### Settings

- **API key**: saved to the device's secure store and never shown again.
- **Model**: provider chips, base URL (hidden for Anthropic), a model dropdown fetched from the provider, and **Test connection**.
- **Reminders**: permission state and the two reminder times.
- **Appearance**: system, light or dark. **Sounds**: on or off.

## Empty and edge states

Each is one line of text plus one button, with a small static mascot.

| Where | Text | Button |
|---|---|---|
| Today, no books | Nothing to read yet. | Add your first book |
| Today, no API key | Add an API key to start. | Open Settings |
| Today, book ready without a plan | *Title* is ready. Set a plan to start. | Plan in chat |
| Today, book generating | Preparing chapters, X of Y | View book |
| Today, book failed | *Title* could not be prepared. | Open book |
| Today, all tasks done | Done for today. Streak: N. | Read ahead |
| Today, all books finished | You finished everything. | Pick your next book |
| Books, empty | No books yet. | Add a book |
| Book, generating | Preparing chapters, X of Y | Retry (only if interrupted) |
| Book, failed | Preparing this book failed. | Retry |
| Chat, no plan | How many days do you want to finish this in? | Start planning |
| Settings, no API key | Add an API key to start. | (the key field is highlighted) |
| Notifications denied | Reminders are off. | Enable reminders |

**First-run flow:** Settings (API key) → Add book → Chat to set the plan → Today. Each empty state routes to the next step; there is no tutorial.

Any LLM action taken without an API key sends the user to Settings instead of showing an error.

## Notifications

Local scheduled notifications only. There is no push server and no background job.

- Two reminders a day: evening (default 18:00) and "running out" (default 21:00). Both times are set in Settings.
- The next 7 days are scheduled each time. If today already has activity, today's reminders are skipped.
- Copy depends on the streak state at the time of scheduling:

| Tone | When | Example title |
|---|---|---|
| Calm | The streak is safe | Time to read |
| At risk | Yesterday had no activity | Your streak dies tonight |
| Fresh | No live streak | Time to read |

- Reminders are rescheduled on every app open and every task completion.
- **Known limit:** copy is fixed when scheduled. If the user skips days without opening the app, the copy can be stale until the next open. This is accepted.
- Some Android skins (Xiaomi, Tecno, Infinix) delay notifications through battery optimisation.

## UI rules

- Text-only cards, one idea per card, generous whitespace, one font family.
- A neutral background, dark mode, and one accent colour.
- The streak is a small number and icon in a corner. No popups, confetti or animations beyond native swipes and screen transitions.
- The panda mascot is a small static illustration in empty states and never appears inside the card feed.

Colours, type and assets are specified in [design.md](design.md).
