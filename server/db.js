// لایه پایگاه داده: SQLite داخلی Node (بدون وابستگی خارجی)
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = process.env.ROSHD_DATA_DIR || path.join(ROOT, 'data');
export const DB_PATH = path.join(DATA_DIR, 'roshd.db');
export const UPLOAD_DIR = process.env.ROSHD_UPLOAD_DIR || path.join(ROOT, 'uploads');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const SCHEMA = `
CREATE TABLE IF NOT EXISTS centers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo TEXT,
  tagline TEXT,
  about TEXT,
  color TEXT DEFAULT '#7c3aed',
  card_number TEXT,
  card_holder TEXT,
  min_daily_study INTEGER DEFAULT 50,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  center_id INTEGER REFERENCES centers(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('student','teacher','manager','parent','admin')),
  username TEXT,
  national_code TEXT,
  mobile TEXT,
  pass_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  gender TEXT DEFAULT 'm',
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_username ON users(role, username) WHERE username IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_ncode ON users(role, national_code) WHERE national_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_mobile ON users(role, mobile) WHERE mobile IS NOT NULL AND role = 'parent';
CREATE INDEX IF NOT EXISTS ix_users_center ON users(center_id, role);

CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY,
  center_id INTEGER NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  grade INTEGER NOT NULL,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS students (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  school TEXT,
  grade INTEGER NOT NULL,
  class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
  birth_date TEXT,
  parent_phone TEXT,
  address TEXT,
  avatar TEXT DEFAULT '🦊'
);
CREATE INDEX IF NOT EXISTS ix_students_class ON students(class_id);
CREATE INDEX IF NOT EXISTS ix_students_grade ON students(grade);
CREATE TABLE IF NOT EXISTS parent_children (
  parent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (parent_id, student_id)
);
CREATE TABLE IF NOT EXISTS teacher_classes (
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  PRIMARY KEY (teacher_id, class_id, subject)
);
CREATE TABLE IF NOT EXISTS schedule (
  id INTEGER PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL,
  start TEXT NOT NULL,
  end TEXT NOT NULL,
  subject TEXT NOT NULL,
  teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  room TEXT
);
CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY,
  center_id INTEGER NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  emoji TEXT DEFAULT '📢',
  target_type TEXT NOT NULL DEFAULT 'all',
  target_value TEXT,
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS announcement_views (
  announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seen_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (announcement_id, user_id)
);
CREATE TABLE IF NOT EXISTS fee_settings (
  center_id INTEGER NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  grade INTEGER NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  lock_date TEXT,
  PRIMARY KEY (center_id, grade)
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  receipt_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reject_reason TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_payments_student ON payments(student_id, status);
CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY,
  center_id INTEGER NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  subject TEXT,
  title TEXT NOT NULL,
  description TEXT,
  deadline TEXT NOT NULL,
  reward_points INTEGER DEFAULT 5,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY,
  assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note TEXT,
  file_path TEXT,
  file_name TEXT,
  late INTEGER DEFAULT 0,
  submitted_at TEXT DEFAULT (datetime('now')),
  UNIQUE (assignment_id, student_id)
);
CREATE TABLE IF NOT EXISTS exams (
  id INTEGER PRIMARY KEY,
  center_id INTEGER NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('online','paper','comprehensive')),
  subject TEXT,
  grade INTEGER,
  class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
  duration_min INTEGER DEFAULT 15,
  questions TEXT NOT NULL,
  exam_date TEXT,
  location TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS exam_attempts (
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  PRIMARY KEY (exam_id, student_id)
);
CREATE TABLE IF NOT EXISTS exam_results (
  id INTEGER PRIMARY KEY,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answers TEXT NOT NULL,
  correct INTEGER, wrong INTEGER, blank INTEGER,
  percent REAL,
  points INTEGER DEFAULT 0,
  source TEXT DEFAULT 'online',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE (exam_id, student_id)
);
CREATE TABLE IF NOT EXISTS points (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  category TEXT NOT NULL,
  reason TEXT NOT NULL,
  ref TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_points_ref ON points(student_id, ref) WHERE ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_points_student ON points(student_id);
CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present','absent','excused')),
  sms_sent INTEGER DEFAULT 0,
  teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (class_id, student_id, date)
);
CREATE INDEX IF NOT EXISTS ix_att_date ON attendance(date);
CREATE TABLE IF NOT EXISTS study_plans (
  id INTEGER PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  week_start TEXT NOT NULL,
  subject TEXT NOT NULL,
  target INTEGER NOT NULL,
  teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (class_id, week_start, subject)
);
CREATE TABLE IF NOT EXISTS pomodoros (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  date TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_pomo ON pomodoros(student_id, date);
CREATE INDEX IF NOT EXISTS ix_pomo_date ON pomodoros(date);
CREATE TABLE IF NOT EXISTS materials (
  id INTEGER PRIMARY KEY,
  center_id INTEGER NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  grade INTEGER,
  subject TEXT,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('video','pdf','file')),
  url TEXT NOT NULL,
  size_kb INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  center_id INTEGER REFERENCES centers(id) ON DELETE CASCADE,
  from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  read_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_msg_pair ON messages(from_id, to_id);
CREATE INDEX IF NOT EXISTS ix_msg_to ON messages(to_id, read_at);
CREATE TABLE IF NOT EXISTS learning_paths (
  student_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  steps TEXT NOT NULL,
  summary TEXT,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS counsel_notes (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY,
  center_id INTEGER NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('income','expense')),
  amount INTEGER NOT NULL,
  title TEXT NOT NULL,
  category TEXT,
  date TEXT NOT NULL,
  ref TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_tx ON transactions(center_id, date);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  center_id INTEGER NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  grade TEXT,
  description TEXT,
  details TEXT,
  price INTEGER NOT NULL,
  discount_percent INTEGER DEFAULT 0,
  cover TEXT,
  color TEXT,
  download_url TEXT,
  active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS discount_codes (
  code TEXT NOT NULL,
  center_id INTEGER NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  percent INTEGER NOT NULL,
  active INTEGER DEFAULT 1,
  PRIMARY KEY (center_id, code)
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  center_id INTEGER NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  items TEXT NOT NULL,
  subtotal INTEGER NOT NULL,
  discount INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  code TEXT,
  tracking_code TEXT UNIQUE,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS game_scores (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game TEXT NOT NULL,
  score INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
`;

// ایندکس‌های تکمیلی برای کوئری‌های پرتکرار (دانش‌آموز، والد، معلم)
const INDEXES = `
CREATE INDEX IF NOT EXISTS ix_att_student ON attendance(student_id, date);
CREATE INDEX IF NOT EXISTS ix_sub_student ON submissions(student_id);
CREATE INDEX IF NOT EXISTS ix_er_student ON exam_results(student_id);
CREATE INDEX IF NOT EXISTS ix_ann_center ON announcements(center_id, id);
CREATE INDEX IF NOT EXISTS ix_annv_user ON announcement_views(user_id);
CREATE INDEX IF NOT EXISTS ix_asg_class ON assignments(class_id, deadline);
CREATE INDEX IF NOT EXISTS ix_asg_teacher ON assignments(teacher_id);
CREATE INDEX IF NOT EXISTS ix_sched_class ON schedule(class_id, weekday);
CREATE INDEX IF NOT EXISTS ix_sched_teacher ON schedule(teacher_id);
CREATE INDEX IF NOT EXISTS ix_tc_class ON teacher_classes(class_id);
CREATE INDEX IF NOT EXISTS ix_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS ix_notes_student ON counsel_notes(student_id);
CREATE INDEX IF NOT EXISTS ix_game_student ON game_scores(student_id, game);
CREATE INDEX IF NOT EXISTS ix_pc_student ON parent_children(student_id);
CREATE INDEX IF NOT EXISTS ix_exams_center ON exams(center_id, kind, grade);
CREATE INDEX IF NOT EXISTS ix_exams_creator ON exams(created_by);
CREATE INDEX IF NOT EXISTS ix_mat_center ON materials(center_id, grade);
CREATE INDEX IF NOT EXISTS ix_points_ledger ON points(student_id, id);
CREATE INDEX IF NOT EXISTS ix_plans_class ON study_plans(class_id, week_start);
`;

export let db;

export function openDb() {
  db = new DatabaseSync(DB_PATH);
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;
    PRAGMA cache_size = -65536; PRAGMA temp_store = MEMORY; PRAGMA mmap_size = 268435456; PRAGMA journal_size_limit = 67108864; PRAGMA wal_autocheckpoint = 1000;`);
  db.exec(SCHEMA);
  db.exec(INDEXES);
  db.exec('PRAGMA optimize');
  stmtCache.clear();
  return db;
}

export function closeDb() {
  if (db) { try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch { /* */ } db.close(); db = null; }
  stmtCache.clear();
}

const stmtCache = new Map();
function stmt(sql) {
  let s = stmtCache.get(sql);
  if (!s) { s = db.prepare(sql); stmtCache.set(sql, s); }
  return s;
}

export const all = (sql, ...p) => stmt(sql).all(...p);
export const get = (sql, ...p) => stmt(sql).get(...p);
export const run = (sql, ...p) => stmt(sql).run(...p);

export function tx(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

openDb();
