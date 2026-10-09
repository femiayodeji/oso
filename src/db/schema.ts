// Ordered migrations. Index i takes the database from user_version i to i + 1.
// Never edit a shipped entry; append a new one.
export const MIGRATIONS: string[] = [
  `
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
    source_text TEXT,
    summary TEXT,
    gen_status TEXT NOT NULL DEFAULT 'pending'
      CHECK (gen_status IN ('pending','done','failed'))
  );

  CREATE TABLE tasks (
    id INTEGER PRIMARY KEY,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    idx INTEGER NOT NULL,
    title TEXT NOT NULL,
    completed_at TEXT
  );

  CREATE TABLE cards (
    id INTEGER PRIMARY KEY,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
    idx INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('summary','key_idea','recall')),
    front TEXT NOT NULL,
    back TEXT,
    flagged INTEGER NOT NULL DEFAULT 0,
    box INTEGER NOT NULL DEFAULT 0,
    due_date TEXT
  );

  CREATE TABLE daily_activity (
    date TEXT PRIMARY KEY,
    tasks_completed INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE chat_messages (
    id INTEGER PRIMARY KEY,
    book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user','assistant')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE INDEX idx_chapters_book ON chapters(book_id, idx);
  CREATE INDEX idx_tasks_book ON tasks(book_id, idx);
  CREATE INDEX idx_cards_book ON cards(book_id);
  CREATE INDEX idx_cards_chapter ON cards(chapter_id, idx);
  CREATE INDEX idx_cards_task ON cards(task_id);
  CREATE INDEX idx_cards_due ON cards(due_date);
  CREATE INDEX idx_chat_book ON chat_messages(book_id, id);
  `,
];
