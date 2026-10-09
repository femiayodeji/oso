# Oso

Personal-use mobile app that turns a book into a scrollable feed of summaries and flashcards, so reading replaces doom-scrolling. Single user, single device, no backend.

## Core principles (do not violate)

1. **No backend.** The only network calls are direct LLM API calls from the device.
2. **Local-first.** All data lives in SQLite and the app's file system. The app must work offline for everything except generating new content.
3. **BYO API key.** The user pastes a key in Settings (OpenRouter, OpenAI, or Anthropic) and can change it any time.
4. **No Firebase, no analytics, no telemetry, no third-party services.**
5. **Minimal, calm UI.** The app feels like a book, not a game. Drama lives in notifications only.
6. **Keep it simple.** This is a personal tool. Prefer the boring solution. No premature abstraction.

## Stack

- React Native with **Expo** (TypeScript, strict mode). Use a **development build**, not Expo Go (notifications need it).
- Navigation: `expo-router`
- Database: `expo-sqlite`
- Secrets: `expo-secure-store` (API key only)
- Files: `expo-file-system`, `expo-document-picker` (optional book upload: pdf, epub, txt, pasted text)
- Notifications: `expo-notifications` (local scheduled notifications only)
- Validation: `zod` (validate every LLM JSON response)
- Tests: `jest` (pure logic only)
- **No** LangChain, Redux, MobX, or any global state library. Use React hooks plus direct SQLite queries. A tiny context for settings is fine.

## Product model

- **Book**: a target book the user wants to finish. Knowledge base is **optional**:
  - `model_knowledge`: no file; the LLM generates from what it knows. Show a small "generated from model knowledge" label.
  - `uploaded`: user supplies text; chapter text is included as context in prompts. (No vector DB or embeddings. Send the relevant chapter as context.)
- **Chapter**: a section of the book with a summary.
- **Card**: one idea, text only. Types: `summary`, `key_idea`, `recall` (question, tap to reveal answer).
- **Task**: a daily unit of reading made of ordered cards. Tasks form an **ordered pool per book**. They are **not tied to calendar dates**. Any task can be done at any time. Missing a day creates no "overdue" state.
- **Plan**: set through the **LLM chat** (for example "finish this in 5 days"). The model returns a structured action and the app splits content into tasks. All content is **generated and saved locally before the streak starts**. Editing the plan only regenerates or reshuffles tasks that are **not yet completed**; completed tasks are immutable.
- **Streak**: global across all books. Completing **at least one task from any book** on a day counts as activity.
  - **Grace rule:** one missed day is allowed. Two full days with no activity resets the streak.
  - Streak is **computed from `daily_activity`**, never stored as a mutable counter. Optionally store `best_streak`.
  - Day boundary is the device's **local midnight**. Store dates as local `YYYY-MM-DD`.
  - Assumption to confirm: a missed grace day does not add to the streak count and does not break the chain. Keep this logic in one pure function, `computeStreak()`, so it is easy to change.
- **Spaced recall (phase 2):** cards have a Leitner `box` and `due_date`. The Today feed appends due review cards from older chapters after the task's own cards.

## Data model (SQLite)

```sql
CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,
  source TEXT NOT NULL CHECK (source IN ('model_knowledge','uploaded')),
  file_uri TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','generating','ready','failed','finished')),
  plan_days INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE chapters (
  id INTEGER PRIMARY KEY,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  title TEXT NOT NULL,
  source_text TEXT,               -- null when generated from model knowledge
  summary TEXT,
  gen_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (gen_status IN ('pending','done','failed'))
);

CREATE TABLE tasks (
  id INTEGER PRIMARY KEY,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,           -- order within the book's pool
  title TEXT NOT NULL,
  completed_at TEXT               -- null = not done
);

CREATE TABLE cards (
  id INTEGER PRIMARY KEY,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  idx INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('summary','key_idea','recall')),
  front TEXT NOT NULL,
  back TEXT,                      -- answer for recall cards
  flagged INTEGER NOT NULL DEFAULT 0,
  box INTEGER NOT NULL DEFAULT 0, -- Leitner box (phase 2)
  due_date TEXT                   -- local YYYY-MM-DD (phase 2)
);

CREATE TABLE daily_activity (
  date TEXT PRIMARY KEY,          -- local YYYY-MM-DD
  tasks_completed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE chat_messages (
  id INTEGER PRIMARY KEY,
  book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE settings (           -- non-secret only
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

Use a simple versioned migration runner (`PRAGMA user_version`). Enable `PRAGMA foreign_keys = ON`.

## LLM layer (`src/llm/`)

- One interface: `complete({ system, messages, json?: boolean }) => Promise<string>`.
- Two adapters:
  - **OpenAI-compatible** (OpenRouter default, and OpenAI): `POST {baseUrl}/chat/completions`, `Authorization: Bearer <key>`.
  - **Anthropic**: `POST https://api.anthropic.com/v1/messages`, headers `x-api-key` and `anthropic-version`.
- Provider, base URL, and **model name are user-editable settings**. Do not hardcode model names beyond a sensible default.
- Thin `fetch` wrapper only. Add timeout, retry with backoff on 429/5xx, and clear error mapping (invalid key, rate limit, network).
- **Structured output:** instruct the model to return JSON only, strip code fences, parse, validate with `zod`. On failure, retry once with the validation error appended, then mark the item `failed`.
- If no API key is set, any LLM action **redirects to Settings** instead of throwing.
- The API key is read from SecureStore at call time. **Never** log it, store it in SQLite, or include it in prompts or error reports.

### Generation pipeline

1. **Add book** (title, optional file).
2. Generate the chapter outline (from the file if uploaded, else from model knowledge).
3. For each chapter, generate the summary and cards. One call per chapter keeps context small and makes retries cheap.
4. Chat sets the plan; the app splits cards into tasks across the chosen number of days.
5. Persist after **every** chapter. The pipeline must be **resumable**: on app open, continue chapters with `gen_status != 'done'`. Show progress ("Preparing chapters, 4 of 12") and a Retry button on failure.
6. Long uploaded books: chunk by detected chapter, and by size if a chapter exceeds the model's context.

### Chat

- Grounded in the current book (and current chapter when relevant). Keep recent history only.
- Plan changes happen via a structured action in the model reply, for example `{"action":"set_plan","days":5}`. The app parses it, applies it, and confirms in the UI. Never mutate the plan from free text.
- Users can correct the model in chat. A **flag card** action regenerates that card. Re-generating a book from an uploaded file later must be supported.

## Notifications (`src/notifications/`)

Local scheduled notifications only. No push server.

- Create an Android channel. Request permission once, with a clear explanation. If denied, show the banner with **Enable reminders** (opens system settings).
- `syncReminders()` is the single entry point. It cancels all scheduled reminders, then schedules the next 5–7 days:
  - Evening reminder (default 6pm) and a "running out" reminder (default 9pm). Times are configurable in Settings.
  - If today's activity is already done, skip today's reminders.
  - Copy depends on state: normal when streak is safe; dramatic ("Your streak dies tonight") when yesterday had no activity.
- Call `syncReminders()` on **app open** and **every task completion**.
- No background jobs. They are unreliable on mobile and Android OEM skins.
- Known limit: copy is fixed at schedule time, so after skipping days without opening the app, reminder copy may be stale until the next open. Acceptable.
- Android battery optimization (Xiaomi, Tecno, Infinix) can delay notifications. Test on the real device early.

## UI rules

- **Three screens**: Today (feed), Books, Settings. Chat opens from one button.
- Text-only cards, one idea per card, generous whitespace, **one readable font**, vertical swipe feed.
- Neutral background, **dark mode** support, **one accent color**.
- Streak: small number and icon in a corner. **No popups, confetti, or animations.** A quiet checkmark when the day is done.
- Mascot (panda) is a tiny **static** icon at most (streak badge, empty states). No wizard theming in the UI.
- Recall cards: show the question, tap to reveal the answer.

### Empty and edge states (one line of text plus one button each)

| Where | Text | Button |
|---|---|---|
| Today, no books | Nothing to read yet. | Add your first book |
| Today, all tasks done | Done for today. Streak: N. | Read ahead |
| Today, all books finished | You finished everything. | Pick your next book |
| Books, empty | No books yet. | Add a book |
| Book, generating | Preparing chapters, X of Y | (Retry on failure) |
| Chat, no plan | How many days do you want to finish this in? | Start planning |
| Settings, no API key | Add an API key to start. | (highlight the field) |
| Notifications denied | Reminders are off. | Enable reminders |

First-run flow: Settings (API key) → Add book → Chat to set plan → Today. Each empty state routes to the next step; no tutorial.

## Design

Brand: **Oso**. Tagline: "Better books. A calmer mind." (optional alternative: "Read more. Scroll less.").
Reference mockup: `docs/design/oso-brand-sheet.png` (icons and mascot states).

### Theme tokens (`src/theme/`)

Define all colors once as tokens. Components never use raw hex values.

| Token | Light | Dark |
|---|---|---|
| `background` | `#F7F6F2` | `#121614` |
| `surface` | `#EFEDE6` | `#1B201D` |
| `text` | `#1A1F1C` | `#E8E6E1` |
| `textMuted` | `#6B726D` | `#9AA29C` |
| `border` | `#E2DFD6` | `#2A302C` |
| `accent` | `#1F6B4A` | `#4FB387` |
| `onAccent` | `#F7F6F2` | `#0E1411` |
| `danger` | `#B3412F` | `#E07A67` |

- Follow the system color scheme by default. Manual override lives in Settings.
- **Never use pure white or pure black** as a background.
- **Accent is used only for:** the streak badge, primary buttons, the active tab, and the "done" checkmark. Everything else is `text`, `textMuted`, `surface`, or `border`. Do not add more accent colors.
- `danger` is for error text only (failed generation, invalid key).

### Typography

- **One font family** across the whole app. System font by default (a bookish serif such as Literata is optional if added via `expo-font`).
- Card body text: 20-22pt, line height about 1.5, left-aligned, max one idea per card.
- Use size and weight for hierarchy, not extra fonts or colors. Respect the system font-size setting.

### Layout and motion

- Generous padding (at least 24px on card edges). Rounded corners (12-16px) on surfaces and buttons.
- No shadows, gradients, or decorative borders.
- **No animations** beyond the native swipe and screen transitions. No confetti, bounce, or pulsing.

### App icon

- **Primary: the "Minimal" icon** (white "O" on deep green `#1F6B4A`). It stays legible at small sizes and on any wallpaper.
- **Dark variant:** use the panda-on-dark icon for iOS dark mode and Android themed icons if supported.
- **Do not use the "Light" icon** (cream panda on cream tile). It washes out on light home screens.
- Android: provide an adaptive icon (foreground plus `#1F6B4A` background) and a **monochrome** notification small icon (white-on-transparent, simple shape). Notification small icons cannot be full color.

### Mascot (panda)

Static illustrations only, never animated, **never inside the card feed**. Store in `assets/mascot/` as transparent PNG at @2x and @3x (or SVG), one file per state with consistent style and canvas size.

| State | Used in |
|---|---|
| Reading | Splash screen, first-run |
| No Books | Today (no books), Books (empty) |
| Generating | Book generation progress |
| Chat | Chat screen, new book with no plan |
| Thinking | Chat while waiting for an LLM reply |
| Happy / Progress | All books finished, book completion recap |
| Completed | Today (done for the day) |
| Reminder | Notifications-denied banner, Settings reminder section |
| Error / Retry | Failed generation, invalid API key, network error |
| Streak | **Badge only**: flame plus number in a screen corner. Do not show the full panda for the streak. |

- Keep each mascot at a modest size (about 120-160px) above a single line of text and one button.
- If new states are needed, generate them in the same style and add them to this table.

### Asset dimensions

Replace art by overwriting these files; names and sizes are what the code and `app.json` expect. The original mockups are kept in `assets/source/`.

| Asset | File(s) | Size | Notes |
|---|---|---|---|
| Mascot state | `assets/mascot/<state>.png`, `@2x`, `@3x` | 160, 320, 480 px square | Transparent. Draw a square master at 960 px (480 minimum), panda centred at the same scale in every state, then run `scripts/build-mascots.sh <folder>`. States: `reading`, `noBooks`, `generating`, `chat`, `thinking`, `happy`, `completed`, `reminder`, `error`. |
| Panda head | `assets/mascot/pandaIcon.png`, `@2x`, `@3x` | 48, 96, 144 px square | Transparent. Master at 288 px; same script. |
| App icon | `assets/icon.png` | 1024 px square | Opaque, full-bleed `#1F6B4A`, no rounded corners (the OS masks it). |
| Android adaptive foreground | `assets/android-icon-foreground.png` | 1024 px square | Transparent; keep the art inside the centre 66%. Background is the colour `#1F6B4A` in `app.json`. |
| Android themed icon | `assets/android-icon-monochrome.png` | 1024 px square | White on transparent, same safe zone. |
| Notification small icon | `assets/notification-icon.png` | 96 px square | White on transparent, simple shape. |
| Splash | `assets/splash-icon.png` | 1024 px square (currently 400) | Transparent; shown 160 pt wide on `#F7F6F2` / `#121614`. |
| iOS dark icon (not added yet) | `assets/icon-dark.png` + `ios.icon.dark` in `app.json` | 1024 px square | Panda on dark. |
| Sounds | `assets/sounds/{tap,click,streak}.m4a` | short, quiet (about -30 dB mean) | AAC; `.webm` does not play on iOS. |

Icon, splash and notification changes need a new native build; mascots and sounds only need a reload.

## Project structure

```
app/                  # expo-router screens
  (tabs)/index.tsx    # Today
  (tabs)/books.tsx
  (tabs)/settings.tsx
  chat.tsx
src/
  db/                 # schema, migrations, repositories (one file per table)
  llm/                # adapters, client, prompts, zod schemas, pipeline
  streak/             # computeStreak() and date helpers (pure)
  notifications/      # syncReminders(), copy
  components/
  theme/
```

## Code conventions

- TypeScript `strict`. No `any` without a comment.
- DB access only through repository functions in `src/db/`. No raw SQL in components.
- Logic that can be pure **is** pure (`computeStreak`, plan splitter, JSON parser, reminder schedule builder). These get unit tests.
- Prompts live in `src/llm/prompts.ts`, not inline in components.
- Dates: always local `YYYY-MM-DD` strings via one helper. Never `toISOString().slice(0,10)` for "today" (that is UTC).
- Small files, small functions. Handle loading, empty, and error states for every async screen.

## Testing

- Unit tests: `computeStreak` (grace rule, gap of exactly 2 days, timezone and midnight edges), plan splitter, LLM JSON parsing and retry, reminder schedule builder.
- Manual on a real Android/iOS device: notifications firing, cancel-on-complete, resync on open, offline behavior.

## Commands

```bash
npx create-expo-app@latest oso --template blank-typescript
npx expo install expo-sqlite expo-secure-store expo-file-system expo-document-picker expo-notifications expo-router
npm i zod
npm i -D jest jest-expo @types/jest
npx expo run:android      # or run:ios (development build)
npx jest
```

## Build order

1. Project scaffold, theme, navigation, empty states.
2. SQLite schema, migrations, repositories.
3. Settings: API key (SecureStore), provider and model, reminder times.
4. LLM client and adapters, with a test call from Settings.
5. Add book and generation pipeline (resumable), model-knowledge path first.
6. Today feed with cards, task completion, `daily_activity`, `computeStreak`.
7. Chat with grounded Q&A and the `set_plan` action.
8. Notifications: permission, `syncReminders`, copy states.
9. Flag and regenerate card; optional file upload (knowledge base).
10. Phase 2: spaced recall (Leitner), best streak, recap on book completion.

## Non-goals

Accounts, sync, social or competitive features, leaderboards, cloud storage, analytics, vector databases, in-app book reading, monetization.
