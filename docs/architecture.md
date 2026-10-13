# Architecture

Oso is a single React Native app with no server. This document explains how the code is laid out and how the main flows move through it.

## Layers

```
app/            screens (expo-router)
  │
src/components  UI pieces and per-screen data loaders
  │
src/llm         provider calls, prompts, generation pipeline, chat
src/plan        splitting cards into tasks
src/streak      streak calculation (pure)
src/notifications  reminder scheduling
  │
src/db          repositories over SQLite — the only place SQL lives
```

Rules that hold across the codebase:

- Screens and components never run SQL. They call repository functions in `src/db/`.
- Anything that can be a pure function is one, and has unit tests: the streak, the plan splitter, JSON parsing, the reminder schedule, chapter detection.
- There is no global state library. Screens load their own data on focus; the one shared context holds settings.

## Folder map

```
app/
  _layout.tsx           startup: fonts, database, settings, notifications, root stack
  (tabs)/_layout.tsx    the three tabs
  (tabs)/index.tsx      Today
  (tabs)/books.tsx      Books
  (tabs)/settings.tsx   Settings
  add-book.tsx          Add a book
  book/[id].tsx         Book detail
  chat.tsx              Chat

src/
  types.ts              shared row and domain types
  lib/dates.ts          local YYYY-MM-DD helpers
  db/                   schema, migration runner, one repository per table
  llm/                  adapters, client, prompts, schemas, pipeline, chat, file parsing
  plan/                 splitPlan (pure) and applyPlan
  streak/               computeStreak and computeBestStreak (pure)
  notifications/        syncReminders, schedule builder, copy
  settings/             SettingsContext
  sound/                the three UI sounds
  theme/                colour, spacing, radius and type tokens
  components/           shared UI, plus books/, chat/, settings/, today/

assets/                 icons, splash, fonts, mascots, sounds, source art
scripts/                build-icons.sh, build-mascots.sh, dev-phone.sh
```

## Startup

`app/_layout.tsx` runs this sequence:

1. Keep the splash screen up and load the three Nunito font files.
2. Open the database and run pending migrations (`initDb`). A failure shows "Oso could not open its library."
3. Mount `SettingsProvider`, which reads settings from SQLite.
4. Once settings are ready, hide the splash, set up the notification handler and Android channel, then run `onAppActive`.

`onAppActive` runs at startup and every time the app returns to the foreground. It does two things:

- `resumePendingGenerations()` continues any book left in `generating`.
- `syncReminders()` reschedules reminders from the current streak.

## Screen data loading

Every async screen uses `useFocusLoad(loader)` from `src/components/useFocusLoad.ts`. It:

- loads when the screen gains focus, and again when the app returns to the foreground while focused;
- exposes `data`, `loading`, `error` and `reload`;
- discards the result of an older load if a newer one has started.

Loaders live next to their screens: `components/today/todayData.ts` and `components/books/bookData.ts`. Screens that show generation progress also subscribe with `subscribeGeneration()` and reload when a book changes.

Navigation helpers are in `src/components/nav.ts` (`goToSettings`, `goToChat`, `goToBook`, `goToAddBook`, `readTaskInToday`, `goToToday`).

## Main flows

### Adding a book

1. `add-book.tsx` checks for an API key and redirects to Settings without one.
2. A picked file is copied into the app's document directory (`importBookFile`); pasted text is saved as a `.txt` file there.
3. `createBook` inserts the row with `source` set from whether a file exists.
4. `runGeneration(book.id)` starts in the background and the screen moves to the book page.

### Generating content

`src/llm/pipeline.ts` owns this. See [llm.md](llm.md) for detail.

1. Build the outline if the book has no chapters: from the file for uploaded books, from the model otherwise.
2. For each chapter not yet `done`, make one model call, replace the chapter's cards, and mark it `done`. Each chapter is saved before the next begins.
3. If every chapter is done the book becomes `ready`; otherwise `failed`.
4. If the book already had a plan, the new cards are fitted back into it.

### Setting a plan

1. `sendChatMessage` sends the conversation with a system prompt describing the book and plan state.
2. `parseChatReply` pulls any JSON object with an `action` key out of the reply and validates it.
3. A valid `set_plan` action calls `applyPlan(bookId, days)`.
4. `replacePlanTasks` (one transaction) deletes incomplete tasks, renumbers completed ones, asks the pure splitter for new tasks, and writes them with `plan_days`.

### Reading a task

1. Today picks the next task with `listNextTasks()`: the lowest-index incomplete task of each `ready` book.
2. `TaskFeed` loads the task's cards and up to 10 due review cards.
3. Finish calls `completeTask(taskId, todayLocal())`, which in one transaction:
   - sets `completed_at`;
   - increments `daily_activity` for today;
   - moves the task's recall cards into Leitner box 1;
   - marks the book `finished` if no incomplete task remains.
4. The feed then calls `syncReminders()` and Today reloads.

### Streak

`getStreak()` in `src/db/activity.ts` reads the active dates, updates the stored best streak if it grew, and returns `computeStreak(dates, today)`. Nothing else writes the streak.

### Reminders

`syncReminders()` is the single entry point. It is serialised through a promise queue so two syncs cannot interleave. Each run:

1. returns early unless notification permission is granted;
2. builds the schedule with the pure `buildReminderSchedule`;
3. cancels every scheduled notification and schedules the new set.

## Settings and secrets

- Non-secret settings are key/value rows in the `settings` table, read through `getSettings()` and exposed by `SettingsContext`.
- The API key lives only in `expo-secure-store` under one key name. It is read at call time, never stored in SQLite, never logged, and scrubbed from provider error messages.
- One key is stored for all providers. Switching provider means replacing the key.

## Theme

`useTheme()` returns colours, spacing, radius and fonts. It follows the system colour scheme unless Settings overrides it. `src/theme/tokens.ts` is the only file with raw colour values.

## Concurrency notes

- `withTransaction` queues transactions so two cannot interleave on the shared connection. Do not call it from inside another transaction; pass the `db` handle down.
- Single writes outside a transaction go through `write()`, which uses the same queue.
- The pipeline keeps an in-memory set of running book ids so a book is never generated twice at once. A book whose status is `generating` while nothing is running was interrupted.
