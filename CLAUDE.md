# Oso

Personal-use mobile app for habitual learning: type anything you want to learn (a topic, a skill, a question, or a book) and get a daily feed of short, engaging cards, so learning replaces doom-scrolling. Single user, single device, no backend.

## Core principles (do not violate)

1. **No backend.** The only network calls are direct LLM API calls from the device.
2. **Local-first.** All data lives in SQLite and the app's file system. The app must work offline for everything except generating new content.
3. **BYO API key.** The user pastes a key per provider in Settings (one SecureStore slot each), picks the active provider, and can change either any time.
4. **No Firebase, no analytics, no telemetry, no third-party services.**
5. **Clean UI, playful motion.** Reading stays calm (text-only cards, one font, generous whitespace), but interactions feel lively, Duolingo-style: buttons with a pressable lip, springy entrances, celebrations on finishing.
6. **Keep it simple.** This is a personal tool. Prefer the boring solution. No premature abstraction.

## Stack

- React Native with **Expo** (TypeScript, strict mode). Use a **development build**, not Expo Go (notifications need it).
- Navigation: `expo-router`
- Database: `expo-sqlite`
- Secrets: `expo-secure-store` (API key only)
- Files: `expo-file-system`, `expo-document-picker` (optional own material: pdf, epub, txt, pasted text)
- Notifications: `expo-notifications` (local scheduled notifications only)
- Validation: `zod` (validate every LLM JSON response)
- Tests: `jest` (pure logic only)
- **No** LangChain, Redux, MobX, or any global state library. Use React hooks plus direct SQLite queries. A tiny context for settings is fine.

## Product model

- **Topic**: anything the user wants to learn, typed as free text ("Stoicism", "How TCP works", "Atomic Habits"). The outline call decides whether it is a **book** the model knows (units are its real chapters) or an open **topic** (the model designs a syllabus). It also returns a clean title, a book's author, and an **icon** from a fixed list (`src/topic/icons.ts`). Source material is **optional**:
  - `model_knowledge`: no file; the LLM generates from what it knows. Show a small "generated from model knowledge" label on the topic screen (not in the reading view, where it can't be acted on).
  - `uploaded`: user supplies a file or pasted text; unit text is included as context in prompts. (No vector DB or embeddings. Send the relevant unit as context.)
- **Plan length**: 3 days / 1 week / 2 weeks / 1 month, chosen when adding and stored as `plan_days` **before generation**. It sizes the content (`src/plan/budget.ts`): budget = days × 10 cards, so a session is about **10 new cards (cap 12) plus at most 5 reviews**, about 5 minutes. Open topics get about one unit per 8 cards; each unit gets its share (3 to 12 cards). A book keeps its chapters; if they can't fit 12 cards a day the plan is stretched and the topic screen says so. Why: `docs/learning-science.md`. `depth` (`src/topic/depth.ts`) is legacy, only for topics without `plan_days`.
- **Unit**: one section of a topic (a book chapter, or one step of a syllabus) with a summary.
- **Card**: one idea, text only. Types: `summary` (the hook), `key_idea`, `recall` (question, tap to reveal answer), `quiz` (multiple choice, 2 to 5 options, instant right/wrong feedback, `back` explains why).
- **Session**: a day's learning made of ordered cards. Sessions form an **ordered pool per topic**. They are **not tied to calendar dates**. Any session can be done at any time. Missing a day creates no "overdue" state.
- **Plan**: first set by the plan length when adding; sessions are split as soon as generation finishes. Changed later through the **LLM chat** (for example "finish this in 5 days"): the model returns a structured action and the app re-splits. A plan heavier than 12 cards a day is warned about (with a better-days chip), never blocked. All content is **generated and saved locally before the streak starts**. Editing the plan only regenerates or reshuffles sessions that are **not yet completed**; completed sessions are immutable.
- **Retake**: a completed session can be opened again from the topic screen and read in Today as read-only practice (labelled "Retake"). It records nothing: no `daily_activity`, no `completed_at` change, no Leitner updates, no due reviews appended, no recap; finishing shows a light confetti burst and Today returns to what it showed before.
- **Topic order**: the Today topic chips and the Topics list put the topic whose session was completed most recently first (`MAX(sessions.completed_at)`); never-studied topics follow by creation date. Review never completes a session, so it never reorders.
- **Streak**: global across all topics. Completing **at least one session from any topic** on a day counts as activity.
  - **Grace rule:** one missed day is allowed. Two full days with no activity resets the streak.
  - Streak is **computed from `daily_activity`**, never stored as a mutable counter. Optionally store `best_streak`.
  - Day boundary is the device's **local midnight**. Store dates as local `YYYY-MM-DD`.
  - Assumption to confirm: a missed grace day does not add to the streak count and does not break the chain. Keep this logic in one pure function, `computeStreak()`, so it is easy to change.
- **Spaced recall (phase 2):** cards have a Leitner `box` and `due_date`. Recall and quiz cards come back for review. The Today feed appends the same topic's due review cards after the session's own cards (other topics' reviews stay behind the "Review due cards" button), and opens on the topic last read; answering a quiz in review counts as remembered or not.

## Data model (SQLite)

```sql
CREATE TABLE topics (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,                    -- books only
  source TEXT NOT NULL CHECK (source IN ('model_knowledge','uploaded')),
  file_uri TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','generating','ready','failed','finished')),
  plan_days INTEGER,
  created_at TEXT NOT NULL,
  icon TEXT,                      -- a name from src/topic/icons.ts
  depth TEXT CHECK (depth IN ('quick','solid','deep'))  -- legacy; null when plan_days set at creation
);

CREATE TABLE units (
  id INTEGER PRIMARY KEY,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  title TEXT NOT NULL,
  source_text TEXT,               -- null when generated from model knowledge
  summary TEXT,
  gen_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (gen_status IN ('pending','done','failed'))
);

CREATE TABLE sessions (
  id INTEGER PRIMARY KEY,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,           -- order within the topic's pool
  title TEXT NOT NULL,
  completed_at TEXT               -- null = not done
);

CREATE TABLE cards (
  id INTEGER PRIMARY KEY,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
  idx INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('summary','key_idea','recall','quiz')),
  front TEXT NOT NULL,
  back TEXT,                      -- recall: answer; quiz: why the answer is right
  options TEXT,                   -- quiz: JSON array of strings
  answer_idx INTEGER,             -- quiz: index into options
  flagged INTEGER NOT NULL DEFAULT 0,
  box INTEGER NOT NULL DEFAULT 0, -- Leitner box (phase 2)
  due_date TEXT                   -- local YYYY-MM-DD (phase 2)
);

CREATE TABLE daily_activity (
  date TEXT PRIMARY KEY,          -- local YYYY-MM-DD
  sessions_completed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE chat_messages (
  id INTEGER PRIMARY KEY,
  topic_id INTEGER REFERENCES topics(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE settings (           -- non-secret only
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

Use a simple versioned migration runner (`PRAGMA user_version`). Migrations are append-only: never edit an old one (migration 3 renamed books/chapters/tasks to topics/units/sessions). Enable `PRAGMA foreign_keys = ON`.

## LLM layer (`src/llm/`)

- One interface: `complete({ system, messages, json?: boolean }) => Promise<string>`.
- Two adapters:
  - **OpenAI-compatible** (OpenRouter default, and OpenAI): `POST {baseUrl}/chat/completions`, `Authorization: Bearer <key>`.
  - **Anthropic**: `POST https://api.anthropic.com/v1/messages`, headers `x-api-key` and `anthropic-version`.
- Provider, base URL, and **model name are user-editable settings**. Do not hardcode model names beyond a sensible default.
- Thin `fetch` wrapper only. Add timeout, retry with backoff on 429/5xx, and clear error mapping (invalid key, rate limit, network).
- **Structured output:** instruct the model to return JSON only, strip code fences, parse, validate with `zod`. On failure, retry once with the validation error appended, then mark the item `failed`.
- If no API key is set, any LLM action **redirects to Settings** instead of throwing.
- **Prompt caching** (the user pays for tokens): unit generation sets `cache: 'system'`, chat `cache: 'conversation'`; one-off calls set nothing. Anthropic (and `anthropic/` models on OpenRouter) get explicit `cache_control` markers; other providers cache prefixes automatically. Keep shared prompt content first and changing content last (unit specifics in the user message, chat plan state at the end), never timestamps in a system prompt. Chat history drops in steps, not one message per turn.
- The API key is read from SecureStore at call time. **Never** log it, store it in SQLite, or include it in prompts or error reports.

### Generation pipeline

1. **Add topic**: one free-text field ("What do you want to learn?"), "How long?" chips, optional own material.
2. Generate the outline (from the file if uploaded, else from model knowledge, which also returns title, author and icon).
3. For each unit, generate the summary and its budgeted number of cards. One call per unit keeps context small and makes retries cheap.
4. When all units are done the app splits cards into `plan_days` sessions. Chat only changes the plan later.
5. Persist after **every** unit. The pipeline must be **resumable**: on app open, continue units with `gen_status != 'done'`. Show progress ("Preparing units, 4 of 12") and a Retry button on failure.
6. Long uploaded material: chunk by detected chapter, and by size if a chapter exceeds the model's context.

**Content quality** (card rules in `src/llm/prompts.ts`): lead with the point, be specific, use a concrete example or number where it helps, cut filler, never invent facts. About one card in three tests the learner (recall or quiz).

### Chat

- Grounded in the current topic (and current unit when relevant). Keep recent history only.
- Plan changes happen via a structured action in the model reply, for example `{"action":"set_plan","days":5}`. The app parses it, applies it, and confirms in the UI. Never mutate the plan from free text.
- Users can correct the model in chat. A **flag card** action regenerates that card. Re-generating a topic from an uploaded file later must be supported.

## Notifications (`src/notifications/`)

Local scheduled notifications only. No push server.

- Create an Android channel. Request permission once, with a clear explanation. If denied, show the banner with **Enable reminders** (opens system settings).
- `syncReminders()` is the single entry point. It cancels all scheduled reminders, then schedules the next 5–7 days:
  - Evening reminder (default 6pm) and a "running out" reminder (default 9pm). Times are configurable in Settings.
  - If today's activity is already done, skip today's reminders.
  - Copy depends on state: normal when streak is safe; dramatic ("Your streak dies tonight") when yesterday had no activity.
- Call `syncReminders()` on **app open** and **every session completion**.
- No background jobs. They are unreliable on mobile and Android OEM skins.
- Known limit: copy is fixed at schedule time, so after skipping days without opening the app, reminder copy may be stale until the next open. Acceptable.
- Android battery optimization (Xiaomi, Tecno, Infinix) can delay notifications. Test on the real device early.
- Known limit: a reminder whose time passes while the phone is off is dropped, not delivered late. expo-notifications re-arms only future reminders on boot, and some OEMs (Tecno, Infinix, Xiaomi) block that boot receiver unless the app has Auto-start enabled. The next app open resyncs.

## UI rules

- **Three screens**: Today (feed), Topics, Settings. Chat opens from one button.
- Text-only cards, one idea per card, generous whitespace, **one readable font**, vertical swipe feed.
- Neutral background, **dark mode** and a warm **Reading** style, **one accent color** per palette.
- Streak: small number and icon in a corner, greyed out (`border` tile, `textMuted` flame and number) until a session is done today; the flame jumps when the streak goes up. Finishing a session or topic shows confetti and a popping checkmark. No popups or modals for celebrations.
- Confirmations (delete, regenerate) use the themed `Dialog` (`src/components/Dialog.tsx`, via `useConfirm()`), never native `Alert`.
- Mascot (panda) appears in empty states and chat, with a gentle idle float. No wizard theming in the UI.
- Recall cards: show the question, tap to reveal the answer.
- Quiz cards: tap an option. Right: it turns `accent` and pops. Wrong: it shakes in `danger` and the right one is shown. The explanation follows.
- Each topic shows its icon on a tile in one of the `celebration` colours (`TopicBadge`), in the topic list, topic screen and Today header.

### Empty and edge states (one line of text plus one button each)

| Where | Text | Button |
|---|---|---|
| Today, no topics | What do you want to learn? | Start learning (plus suggestion chips) |
| Today, all sessions done | Done for today. Streak: N. | Keep learning |
| Today, all topics finished | You finished everything. | Learn something new (plus suggestion chips) |
| Topics, empty | No topics yet. | Start learning |
| Topic, generating | Preparing units, X of Y | (Retry on failure) |
| Chat, no plan | How many days do you want to finish this in? | Start planning |
| Settings, no API key | Add an API key to start. | (highlight the field) |
| Notifications denied | Reminders are off. | Enable reminders |

First-run flow: Settings (API key) → Add topic (with plan length) → Today. Each empty state routes to the next step; no tutorial.

## Design

Brand: **Oso**. Tagline: "Better books. A calmer mind." (optional alternative: "Read more. Scroll less.").
Reference mockup: `docs/design/oso-brand-sheet.png` (icons and mascot states).

### Theme tokens (`src/theme/`)

Define all colors once as tokens. Components never use raw hex values.

| Token | Light | Dark | Reading light | Reading dark |
|---|---|---|---|---|
| `background` | `#F7F6F2` | `#121614` | `#F4ECD8` | `#1E1A16` |
| `surface` | `#EFEDE6` | `#1B201D` | `#EBE1C9` | `#28231D` |
| `text` | `#1A1F1C` | `#E8E6E1` | `#2E241A` | `#E6DCC8` |
| `textMuted` | `#6B726D` | `#9AA29C` | `#6E5E4B` | `#A89A85` |
| `border` | `#E2DFD6` | `#2A302C` | `#DDD0B3` | `#3A332A` |
| `accent` | `#1F6B4A` | `#4FB387` | `#1D6343` | `#5FB58A` |
| `accentShade` | `#14482F` | `#2F7A57` | `#123F2A` | `#357857` |
| `onAccent` | `#F7F6F2` | `#0E1411` | `#F4ECD8` | `#1A1611` |
| `danger` | `#B3412F` | `#E07A67` | `#A63A28` | `#E08A70` |
| `scrim` | `rgba(26,31,28,0.45)` | `rgba(8,11,9,0.7)` | `rgba(46,36,26,0.45)` | `rgba(12,10,8,0.7)` |

- Follow the system color scheme by default. Manual override lives in Settings.
- **Reading** is a warm paper variant of both light and dark, chosen in Settings (Style: Standard / Reading) on top of the light/dark choice. `pickPalette(style, scheme)` in `src/theme/tokens.ts` selects the colours; text, `textMuted`, `accent` and `danger` meet WCAG AA on `background` and `surface` in every palette. `celebration` stays per scheme.
- **Never use pure white or pure black** as a background.
- **Accent is used only for:** the streak badge, primary buttons (with `accentShade` as their lip), the active tab, progress bars, and the "done" checkmark. Confetti uses the `celebration` colours in `src/theme/tokens.ts`, and nothing else does. Everything else is `text`, `textMuted`, `surface`, or `border`. Do not add more accent colors: each palette has exactly one accent.
- `danger` is for error text only (failed generation, invalid key).
- `scrim` only dims the screen behind a `Dialog`.

### Typography

- **One font family** across the whole app. System font by default (a bookish serif such as Literata is optional if added via `expo-font`).
- Card body text: 20-22pt, line height about 1.5, left-aligned, max one idea per card.
- Use size and weight for hierarchy, not extra fonts or colors. Respect the system font-size setting.

### Layout and motion

- Generous padding (at least 24px on card edges). Rounded corners (12-16px) on surfaces and buttons.
- No shadows or gradients. The only decorative edge is the pressable lip on buttons and quiz options.
- Motion lives in `src/components/motion/` and uses React Native's built-in `Animated` with the native driver (no animation library). Use those primitives (`PopIn`, `Float`, `ProgressBar`, `Confetti`, `TypingDots`, `usePressScale`) rather than one-off animations.
- Every animation checks `useReduceMotion()` and goes still when the system "reduce motion" setting is on.
- Card text itself never moves or bounces; motion is for entrances, presses, progress, and celebrations.

### App icon

- **Primary: the reading panda** (panda holding the green book) on a cream tile `#F7F1E3`. It is distinctive; the plain "O" was not.
- **Dark variant:** the same panda on a dark tile `#132122`, used for iOS dark mode (`ios.icon.dark`).
- **Do not use the "Minimal" icon** (white "O" on green) as the app icon. The "O" survives only as the Android themed (monochrome) icon, which must be a single-colour shape.
- Android: provide an adaptive icon (panda foreground plus `#F7F1E3` background; Android has no dark adaptive icon) and a **monochrome** notification small icon: the brand panda head (`pandaIcon`) with a solid face and faint ears and eye patches, built by `scripts/build-icons.sh`. The head, not the reading panda, because the book and arms blur away at 24 dp. Notification small icons cannot be full color: Android keeps only the alpha and tints it.
- Rebuild with `scripts/build-icons.sh [master.png]` after changing the reading panda art.

### Mascot (panda)

Static illustrations (motion comes only from the shared `Float`/`PopIn` wrappers), **never inside the card feed**. Store in `assets/mascot/` as transparent PNG at @2x and @3x (or SVG), one file per state with consistent style and canvas size.

| State | Used in |
|---|---|
| Reading | Splash screen, first-run |
| No Topics (brand sheet: "No Books") | Today (no topics), Topics (empty) |
| Generating | Topic generation progress, topic not prepared yet |
| Chat | Chat screen, new topic with no plan |
| Thinking | Chat while waiting for an LLM reply |
| Happy / Progress | All topics finished, topic completion recap, plan set in chat |
| Completed | Today (done for the day) |
| Reminder | Notifications-denied banner, Settings reminder section |
| Error / Retry | Failed generation, invalid API key or failed connection test, chat send error |
| Streak | **Badge only**: an `accent` tile with the flame and number in `onAccent`, in a screen corner. Do not show the full panda for the streak. |

- Keep each mascot at a modest size (about 120-160px) above a single line of text and one button.
- If new states are needed, generate them in the same style and add them to this table.

### Asset dimensions

Replace art by overwriting these files; names and sizes are what the code and `app.json` expect. The original mockups are kept in `assets/source/`.

| Asset | File(s) | Size | Notes |
|---|---|---|---|
| Mascot state | `assets/mascot/<state>.png`, `@2x`, `@3x` | 160, 320, 480 px square | Transparent. Draw a square master at 960 px (480 minimum), panda centred at the same scale in every state, then run `scripts/build-mascots.sh <folder>`. States: `reading`, `noTopics`, `generating`, `chat`, `thinking`, `happy`, `completed`, `reminder`, `error`. |
| Panda head | `assets/mascot/pandaIcon.png`, `@2x`, `@3x` | 48, 96, 144 px square | Transparent. Master at 288 px; same script. |
| App icon | `assets/icon.png` | 1024 px square | Reading panda on opaque, full-bleed `#F7F1E3`, no rounded corners (the OS masks it). Built by `scripts/build-icons.sh`. |
| iOS dark icon | `assets/icon-dark.png` (`ios.icon.dark` in `app.json`) | 1024 px square | Reading panda on opaque `#132122`. Same script. |
| Android adaptive foreground | `assets/android-icon-foreground.png` | 1024 px square | Transparent reading panda; keep the art inside the centre 66%. Background is the colour `#F7F1E3` in `app.json`. Same script. |
| Android themed icon | `assets/android-icon-monochrome.png` | 1024 px square | White on transparent, same safe zone. |
| Notification small icon | `assets/notification-icon.png` | 96 px square | White panda head on transparent, black fur as partial alpha. Built from `pandaIcon@3x.png` by `scripts/build-icons.sh`. |
| Splash | `assets/splash-icon.png` | 1024 px square (currently 400) | Transparent; shown 160 pt wide on `#F7F6F2` / `#121614`. |
| Sounds | `assets/sounds/{tap,click,streak}.m4a` | short, quiet (about -30 dB mean) | AAC; `.webm` does not play on iOS. |

Icon, splash and notification changes need a new native build; mascots and sounds only need a reload.

## Project structure

```
app/                  # expo-router screens
  (tabs)/index.tsx    # Today
  (tabs)/topics.tsx
  add-topic.tsx
  topic/[id].tsx
  (tabs)/settings.tsx
  chat.tsx
src/
  db/                 # schema, migrations, repositories (one file per table)
  llm/                # adapters, client, prompts, zod schemas, pipeline
  streak/             # computeStreak() and date helpers (pure)
  plan/               # session splitter, plan length budget (pure)
  topic/              # icons, legacy depth presets, suggestions (pure)
  notifications/      # syncReminders(), copy
  components/
    motion/           # shared animation primitives
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
