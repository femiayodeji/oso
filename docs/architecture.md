# Architecture

Oso is a single React Native app with no server. This document explains how the code is laid out and how the main flows move through it.

## Layers

```
app/            screens (expo-router)
  │
src/components  UI pieces, motion primitives, per-screen data loaders
  │
src/llm         provider calls, prompts, generation pipeline, chat
src/plan        splitting cards into sessions
src/streak      streak calculation (pure)
src/topic       icon list, depth presets, suggestions (pure)
src/notifications  reminder scheduling
  │
src/db          repositories over SQLite — the only place SQL lives
```

Rules that hold across the codebase:

- Screens and components never run SQL. They call repository functions in `src/db/`.
- Anything that can be a pure function is one, and has unit tests: the streak, the plan splitter, JSON parsing, the reminder schedule, chapter detection in uploads, and the topic helpers.
- There is no global state library. Screens load their own data on focus; the one shared context holds settings.

## Folder map

```
app/
  _layout.tsx           startup: fonts, database, settings, notifications, root stack
  (tabs)/_layout.tsx    the three tabs
  (tabs)/index.tsx      Today
  (tabs)/topics.tsx     Topics
  (tabs)/settings.tsx   Settings
  add-topic.tsx         New topic
  topic/[id].tsx        Topic detail
  chat.tsx              Chat

src/
  types.ts              shared row and domain types
  lib/dates.ts          local YYYY-MM-DD helpers
  db/                   schema, migration runner, one repository per table
  llm/                  adapters, client, prompts, schemas, pipeline, chat, file parsing
  plan/                 splitPlan (pure) and applyPlan
  streak/               computeStreak and computeBestStreak (pure)
  topic/                icons, depth, suggestions (pure)
  notifications/        syncReminders, schedule builder, copy
  settings/             SettingsContext
  sound/                the three UI sounds
  theme/                colour, spacing, radius and type tokens
  components/           shared UI, plus chat/, motion/, settings/, today/, topics/

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

- `resumePendingGenerations()` continues any topic left in `generating`.
- `syncReminders()` reschedules reminders from the current streak.

## Screen data loading

Every async screen uses `useFocusLoad(loader)` from `src/components/useFocusLoad.ts`. It:

- loads when the screen gains focus, and again when the app returns to the foreground while focused;
- exposes `data`, `loading`, `error` and `reload`;
- discards the result of an older load if a newer one has started.

Loaders live next to their screens: `components/today/todayData.ts` and `components/topics/topicData.ts`. Screens that show generation progress also subscribe with `subscribeGeneration()` and reload when a topic changes.

Navigation helpers are in `src/components/nav.ts`: `goToSettings`, `goToChat`, `goToTopic`, `goToAddTopic(q?)`, `readSessionInToday`, `goToToday`.

## Main flows

### Adding a topic

1. `add-topic.tsx` checks for an API key for the active provider and redirects to Settings without one.
2. A picked file is copied into the app's document directory (`importSourceFile`); pasted text is saved as a `.txt` file there.
3. `createTopic` inserts the row with the typed text as its title, the chosen depth, and `source` set from whether material was given.
4. `runGeneration(topic.id)` starts in the background and the screen moves to the topic page.

### Generating content

`src/llm/pipeline.ts` owns this. See [llm.md](llm.md) for detail.

1. Build the outline if the topic has no units: from the file for uploaded material, from the model otherwise. The model's outline also carries a clean title, a book's author and an icon, which are saved onto the topic.
2. For each unit not yet `done`, make one model call, replace the unit's cards, and mark it `done`. Each unit is saved before the next begins.
3. If every unit is done the topic becomes `ready`; otherwise `failed`.
4. If the topic already had a plan, the new cards are fitted back into it.

### Setting a plan

1. `sendChatMessage` sends the conversation with a system prompt describing the topic and plan state.
2. `parseChatReply` pulls any JSON object with an `action` key out of the reply and validates it.
3. A valid `set_plan` action calls `applyPlan(topicId, days)`.
4. `replacePlanSessions` (one transaction) deletes incomplete sessions, renumbers completed ones, asks the pure splitter for new sessions, and writes them with `plan_days`.

### Studying a session

1. Today picks the next session with `listNextSessions()`: the lowest-index incomplete session of each `ready` topic.
2. `SessionFeed` loads the session's cards and up to 10 due review cards, and tracks the visible page for the progress bar.
3. `CardPage` renders each card. Recall cards reveal on tap; quiz cards render `QuizOptions`, which reports right or wrong and, during review, records the result with `reviewCard`.
4. Finish calls `completeSession(sessionId, todayLocal())`, which in one transaction:
   - sets `completed_at`;
   - increments `daily_activity` for today;
   - moves the session's recall and quiz cards into Leitner box 1;
   - marks the topic `finished` if no incomplete session remains.
5. The feed then calls `syncReminders()`, and Today reloads into the "Done for today" state with `celebrate` set, which plays the confetti.

### Streak

`getStreak()` in `src/db/activity.ts` reads the active dates, updates the stored best streak if it grew, and returns `computeStreak(dates, today)`. Nothing else writes the streak. `StreakBadge` animates when the count it is given goes up.

### Reminders

`syncReminders()` is the single entry point. It is serialised through a promise queue so two syncs cannot interleave. Each run:

1. returns early unless notification permission is granted;
2. builds the schedule with the pure `buildReminderSchedule`;
3. cancels every scheduled notification and schedules the new set.

## Settings and secrets

- Non-secret settings are key/value rows in the `settings` table, read through `getSettings()` and exposed by `SettingsContext`. `model` and `baseUrl` are stored per provider (`model.groq`, `baseUrl.groq`), and `AppSettings` always holds the values for the active provider.
- API keys live only in `expo-secure-store`, one entry per provider (`oso_llm_api_key_<provider>`). A key is read at call time for the provider in the settings just read, never stored in SQLite, never logged, and scrubbed from provider error messages.
- The single key from before per-provider keys is moved to the provider that was active, the first time any key is read.

## Theme and motion

- `useTheme()` returns colours, spacing, radius and fonts. It follows the system colour scheme unless Settings overrides it. `src/theme/tokens.ts` is the only file with raw colour values.
- Animations come from `src/components/motion/` and use `Animated` with the native driver. Each primitive checks `useReduceMotion()` and goes still when the system setting is on. See [design.md](design.md).

## Concurrency notes

- `withTransaction` queues transactions so two cannot interleave on the shared connection. Do not call it from inside another transaction; pass the `db` handle down.
- Single writes outside a transaction go through `write()`, which uses the same queue.
- The pipeline keeps an in-memory set of running topic ids so a topic is never generated twice at once. A topic whose status is `generating` while nothing is running was interrupted.
