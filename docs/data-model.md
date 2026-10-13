# Data model

All app data is in one SQLite database, `oso.db`, opened through `expo-sqlite`. Book files the user attaches are copied into the app's document directory under `books/`. The API key is in the device's secure store and nowhere else.

## Schema

The schema is defined in `src/db/schema.ts` as migration 1.

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
  box INTEGER NOT NULL DEFAULT 0, -- Leitner box; 0 = not in review yet
  due_date TEXT                   -- local YYYY-MM-DD
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

Indexes: `chapters(book_id, idx)`, `tasks(book_id, idx)`, `cards(book_id)`, `cards(chapter_id, idx)`, `cards(task_id)`, `cards(due_date)`, `chat_messages(book_id, id)`.

## Relationships

```
books ─┬─< chapters ─< cards >─ tasks >─ books
       ├─< tasks
       └─< chat_messages
```

- Deleting a book cascades to its chapters, tasks, cards and chat messages.
- Deleting a task sets `task_id` to null on its cards (`ON DELETE SET NULL`). Plan changes rely on this: dropping incomplete tasks releases their cards for re-splitting.
- A card always belongs to a chapter. It belongs to a task only once a plan exists.

## Invariants

These are the rules the code depends on. Keep them when changing anything in `src/db/`.

| Rule | Where it is enforced |
|---|---|
| A completed task never changes: its cards, title and `completed_at` are kept | `replacePlanTasks` only deletes rows with `completed_at IS NULL` |
| Task `idx` is dense per book, completed tasks first | `replacePlanTasks` renumbers completed tasks to 0..n-1 |
| New task ids are always higher than every existing id | `replacePlanTasks` assigns ids from `MAX(id) + 1`, so a reused id can never be mistaken for the old task |
| Completing a task twice records activity once | `completeTask` writes only when `completed_at` is null |
| The streak is never stored | Derived from `daily_activity` by `computeStreak`; only `bestStreak` is saved, in `settings` |
| "Today" is a local date | Always `todayLocal()` from `src/lib/dates.ts`, never `toISOString().slice(0, 10)` |
| The API key is never in SQLite | `settings` holds non-secret values only |

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
| `provider` | `openrouter` | One of `openrouter`, `gemini`, `groq`, `anthropic`, `openai` |
| `baseUrl` | OpenRouter's URL | Used by the OpenAI-compatible adapter |
| `model` | empty | Empty means "use the provider's default model" |
| `reminderEvening` | `18:00` | 24-hour local `HH:MM` |
| `reminderLate` | `21:00` | 24-hour local `HH:MM` |
| `colorScheme` | `system` | `system`, `light` or `dark` |
| `soundsEnabled` | `true` | |
| `bestStreak` | `0` | Updated by `getStreak()` when the best chain grows |

## Migrations

`src/db/index.ts` runs a small versioned runner on open:

1. Read `PRAGMA user_version`.
2. For each entry in `MIGRATIONS` from that index onward, run it and bump `user_version` in one transaction.

`MIGRATIONS[i]` takes the database from version `i` to `i + 1`. **Never edit an entry that has shipped; append a new one.** There is one migration today.

The connection also sets `PRAGMA journal_mode = WAL` and `PRAGMA foreign_keys = ON`. The foreign keys pragma must run outside a transaction, because SQLite ignores it inside one.

## Repositories

One file per table in `src/db/`. Components call these and never write SQL.

| File | Main functions |
|---|---|
| `books.ts` | `createBook`, `getBook`, `listBooks`, `updateBook`, `deleteBook` |
| `chapters.ts` | `insertChapters`, `listChapterHeads`, `getChapter`, `updateChapter`, `replaceChaptersForBook`, `getChapterProgress` |
| `cards.ts` | `replaceCardsForChapter`, `getCard`, `listCardsForTask`, `listCardsForBook`, `updateCardContent`, `setCardFlagged`, `listDueReviewCards`, `reviewCard` |
| `tasks.ts` | `listTasks`, `getTask`, `listNextTasks`, `completeTask` |
| `plan.ts` | `replacePlanTasks` |
| `activity.ts` | `listActiveDates`, `getStreak` |
| `chat.ts` | `addChatMessage`, `listChatMessages`, `clearChat` |
| `settings.ts` | `getSettings`, `updateSettings` |
| `leitner.ts` | `initialReview`, `nextReview` (pure) |
| `sql.ts` | `buildSet`, `chunk`, `placeholders` helpers |
| `index.ts` | `getDb`, `initDb`, `withTransaction`, `write` |

`listChapterHeads` returns chapters without `source_text`, so listing a long uploaded book does not load its full text. Use `getChapter` for one chapter's text.

## Row types

`src/types.ts` mirrors the tables in camelCase (`Book`, `Chapter`, `Task`, `Card`, `ChatMessage`, `AppSettings`, `StreakInfo`). Each repository maps its snake_case rows to these types.
