# Data model

All app data is in one SQLite database, `oso.db`, opened through `expo-sqlite`. Material the user attaches is copied into the app's document directory under `books/` (the folder name predates topics and is kept so existing files stay valid). API keys are in the device's secure store and nowhere else.

## Schema

The schema is built by the migrations in `src/db/schema.ts`. After migration 3 it is:

```sql
CREATE TABLE topics (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,                    -- books only
  source TEXT NOT NULL CHECK (source IN ('model_knowledge','uploaded')),
  file_uri TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','generating','ready','failed','finished')),
  plan_days INTEGER,              -- set when the topic is added; may be stretched after a book's outline
  created_at TEXT NOT NULL,
  icon TEXT,                      -- a name from src/topic/icons.ts
  depth TEXT CHECK (depth IN ('quick','solid','deep'))  -- legacy: null for topics with a plan length
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
  back TEXT,                      -- recall: the answer; quiz: why the answer is right
  options TEXT,                   -- quiz: JSON array of strings
  answer_idx INTEGER,             -- quiz: index into options
  flagged INTEGER NOT NULL DEFAULT 0,
  box INTEGER NOT NULL DEFAULT 0, -- Leitner box; 0 = not in review yet
  due_date TEXT                   -- local YYYY-MM-DD
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

Indexes: `units(topic_id, idx)`, `sessions(topic_id, idx)`, `cards(topic_id)`, `cards(unit_id, idx)`, `cards(session_id)`, `cards(due_date)`, `chat_messages(topic_id, id)`. The first two and the chat index keep their original names from migration 1 (`idx_chapters_book`, `idx_tasks_book`, `idx_chat_book`); SQLite moved them to the renamed tables and columns.

## Relationships

```
topics ─┬─< units ─< cards >─ sessions >─ topics
        ├─< sessions
        └─< chat_messages
```

- Deleting a topic cascades to its units, sessions, cards and chat messages.
- Deleting a session sets `session_id` to null on its cards (`ON DELETE SET NULL`). Plan changes rely on this: dropping incomplete sessions releases their cards for re-splitting.
- A card always belongs to a unit. It belongs to a session only once a plan exists.

## Invariants

These are the rules the code depends on. Keep them when changing anything in `src/db/`.

| Rule | Where it is enforced |
|---|---|
| A completed session never changes: its cards, title and `completed_at` are kept | `replacePlanSessions` only deletes rows with `completed_at IS NULL`; `replaceCardsForUnit` keeps cards in completed sessions |
| Session `idx` is dense per topic, completed sessions first | `replacePlanSessions` renumbers completed sessions to 0..n-1 |
| New session ids are always higher than every existing id | `replacePlanSessions` assigns ids from `MAX(id) + 1`, so a reused id can never be mistaken for the old session |
| Completing a session twice records activity once | `completeSession` writes only when `completed_at` is null |
| A quiz card's `answer_idx` points into its `options` | Validated by `cardSchema` before saving; `CardPage` shows only the question of a quiz whose options are unusable |
| Only recall and quiz cards enter review | `completeSession` and `listDueReviewCards` filter on `type IN ('recall','quiz')` |
| The streak is never stored | Derived from `daily_activity` by `computeStreak`; only `bestStreak` is saved, in `settings` |
| "Today" is a local date | Always `todayLocal()` from `src/lib/dates.ts`, never `toISOString().slice(0, 10)` |
| API keys are never in SQLite | `settings` holds non-secret values only |

## Dates and times

| Kind | Format | Helper | Used for |
|---|---|---|---|
| Local calendar date | `YYYY-MM-DD` | `todayLocal()`, `addDays()`, `diffDays()` | `daily_activity.date`, `cards.due_date` |
| Instant | UTC ISO timestamp | `nowIso()` | `created_at`, `completed_at` |

Day arithmetic runs on the UTC calendar from the date string, so it does not depend on the device timezone or daylight saving shifts.

## Settings keys

Stored as strings in `settings`; parsed in `src/db/settings.ts`. Missing or unreadable values fall back to the default.

| Key | Default | Notes |
|---|---|---|
| `provider` | `openrouter` | The active provider: `openrouter`, `gemini`, `groq`, `anthropic` or `openai` |
| `baseUrl.<provider>` | empty | Empty means the provider's own URL. Used by the OpenAI-compatible adapter. |
| `model.<provider>` | empty | Empty means the provider's default model |
| `reminderEvening` | `18:00` | 24-hour local `HH:MM` |
| `reminderLate` | `21:00` | 24-hour local `HH:MM` |
| `colorScheme` | `system` | `system`, `light` or `dark` |
| `soundsEnabled` | `true` | |
| `bestStreak` | `0` | Updated by `getStreak()` when the best chain grows |

`getSettings()` returns `model` and `baseUrl` for the active provider; `updateSettings()` writes them under the provider in the patch, or the stored one.

API keys are in the secure store as `oso_llm_api_key_<provider>`.

## Migrations

`src/db/index.ts` runs a small versioned runner on open:

1. Read `PRAGMA user_version`.
2. For each entry in `MIGRATIONS` from that index onward, run it and bump `user_version` in one transaction.

`MIGRATIONS[i]` takes the database from version `i` to `i + 1`. **Never edit an entry that has shipped; append a new one.**

| Version | Change |
|---|---|
| 1 | The original schema: `books`, `chapters`, `tasks`, `cards`, `daily_activity`, `chat_messages`, `settings` |
| 2 | `model` and `baseUrl` settings move to per-provider keys, assigned to the provider that was active |
| 3 | `books`, `chapters`, `tasks` renamed to `topics`, `units`, `sessions`, with their `*_id` columns and `tasks_completed`. `topics` gains `icon` and `depth`. `cards` is rebuilt to allow `quiz` and gain `options` and `answer_idx`, because SQLite cannot change a `CHECK` in place. |

The connection also sets `PRAGMA journal_mode = WAL` and `PRAGMA foreign_keys = ON`. The foreign keys pragma must run outside a transaction, because SQLite ignores it inside one.

## Repositories

One file per table in `src/db/`. Components call these and never write SQL.

| File | Main functions |
|---|---|
| `topics.ts` | `createTopic`, `getTopic`, `listTopics`, `updateTopic`, `deleteTopic` |
| `units.ts` | `insertUnits`, `listUnitHeads`, `getUnit`, `updateUnit`, `replaceUnitsForTopic`, `getUnitProgress` |
| `cards.ts` | `replaceCardsForUnit`, `getCard`, `listCardsForSession`, `listCardsForTopic`, `updateCardContent`, `setCardFlagged`, `listDueReviewCards`, `reviewCard` |
| `sessions.ts` | `listSessions`, `getSession`, `listNextSessions`, `completeSession` |
| `plan.ts` | `replacePlanSessions` |
| `activity.ts` | `listActiveDates`, `getStreak` |
| `chat.ts` | `addChatMessage`, `listChatMessages`, `clearChat` |
| `settings.ts` | `getSettings`, `updateSettings` |
| `leitner.ts` | `initialReview`, `nextReview` (pure) |
| `sql.ts` | `buildSet`, `chunk`, `placeholders` helpers |
| `index.ts` | `getDb`, `initDb`, `withTransaction`, `write` |

`listUnitHeads` returns units without `source_text`, so listing a long uploaded book does not load its full text. Use `getUnit` for one unit's text.

## Row types

`src/types.ts` mirrors the tables in camelCase (`Topic`, `Unit`, `Session`, `Card`, `ChatMessage`, `AppSettings`, `StreakInfo`). Each repository maps its snake_case rows to these types. `Card.options` is parsed from JSON; anything unreadable becomes `null`. `Topic.icon` and `Topic.depth` are checked against their allowed values and become `null` otherwise.
