import { db } from './db.js';
let initialized;
export function ensureTextbookStore() {
  if (process.env.ROSHD_DEMO !== '1' || initialized === db) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS textbook_ai_spend (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, reserved_micros INTEGER NOT NULL CHECK(reserved_micros>0),
      actual_estimate_micros INTEGER, status TEXT NOT NULL DEFAULT 'reserved', created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS textbook_quizzes (
      id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id), book_id TEXT NOT NULL,
      from_page INTEGER NOT NULL, to_page INTEGER NOT NULL, kind TEXT NOT NULL, source TEXT NOT NULL,
      questions_json TEXT NOT NULL, cache_key TEXT UNIQUE, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS textbook_attempts (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), quiz_id INTEGER NOT NULL REFERENCES textbook_quizzes(id),
      answers_json TEXT, result_json TEXT, created_at TEXT DEFAULT (datetime('now')), submitted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS textbook_papers (
      id INTEGER PRIMARY KEY, teacher_id INTEGER NOT NULL REFERENCES users(id), class_id INTEGER NOT NULL REFERENCES classes(id),
      quiz_id INTEGER NOT NULL REFERENCES textbook_quizzes(id), title TEXT NOT NULL, deadline TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS textbook_answers (
      id INTEGER PRIMARY KEY, paper_id INTEGER NOT NULL REFERENCES textbook_papers(id), student_id INTEGER NOT NULL REFERENCES users(id),
      photos_json TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', score REAL, feedback TEXT, reviewed_at TEXT,
      submitted_at TEXT DEFAULT (datetime('now')), UNIQUE(paper_id,student_id)
    );
    CREATE INDEX IF NOT EXISTS ix_textbook_attempts_user ON textbook_attempts(user_id);
    CREATE INDEX IF NOT EXISTS ix_textbook_papers_class ON textbook_papers(class_id);
  `);
  if(!db.prepare('PRAGMA table_info(textbook_ai_spend)').all().some(c=>c.name==='purpose'))db.exec("ALTER TABLE textbook_ai_spend ADD COLUMN purpose TEXT NOT NULL DEFAULT 'generate'");
  initialized=db;
}
