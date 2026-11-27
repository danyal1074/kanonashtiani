// لایه پایگاه داده: SQLite داخلی Node (بدون وابستگی خارجی)
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedBuiltinQuestions } from './qb-builtin-seed.js';

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
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','reversed')),
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

// Rebuild the parent table with foreign keys disabled outside the transaction.
// Children keep their original users references, IDs, rows, indexes and triggers.
function counselorMigration(database) {
  const oldSql = database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get().sql;
  if (!oldSql.includes("'counselor'")) {
    const indexes = database.prepare("SELECT sql FROM sqlite_master WHERE tbl_name='users' AND type IN ('index','trigger') AND sql IS NOT NULL").all();
    const sql = oldSql.replace(/CREATE TABLE(?: IF NOT EXISTS)? ["`]?users["`]?/i, 'CREATE TABLE users_counselor_v11')
      .replace(/'admin'(?=\s*\)\s*\))/, "'admin','counselor'");
    if (!sql.includes("'counselor'")) throw new Error('Unsupported users role constraint');
    database.exec(sql);
    const columns = database.prepare('PRAGMA table_info(users)').all().map((c) => '"' + c.name.replaceAll('"', '""') + '"').join(',');
    database.exec(`INSERT INTO users_counselor_v11 (${columns}) SELECT ${columns} FROM users; DROP TABLE users; ALTER TABLE users_counselor_v11 RENAME TO users;`);
    for (const index of indexes) database.exec(index.sql);
  }
  database.exec(`
    CREATE TABLE counselor_plans (
      id INTEGER PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      counselor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      week_start TEXT NOT NULL,
      tasks_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(student_id, week_start)
    );
    CREATE INDEX ix_counselor_plans_owner ON counselor_plans(counselor_id, week_start);
    CREATE TABLE counselor_notes (
      id INTEGER PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      counselor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX ix_counselor_notes_owner ON counselor_notes(counselor_id,student_id);
    CREATE TABLE counselor_sessions (
      id INTEGER PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      counselor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('requested','scheduled','completed','cancelled')),
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX ix_counselor_sessions_owner ON counselor_sessions(counselor_id, starts_at);
  `);
}
counselorMigration.foreignKeysOff = true;

// آرایه مرتب مهاجرت‌های پایگاه داده: هر مهاجرت در نسخه (index + 1) با PRAGMA user_version اجرا می‌شود
export const migrations = [
  // نسخه ۱: ساختار و ایندکس‌های پایه سامانه رشد نخبه
  (database) => {
    database.exec(SCHEMA);
    database.exec(INDEXES);
  },
  // نسخه ۲: امکانات تکمیلی (خودسنجی، کتب هوش، لاگ حضور، نمرات مستمر، کارنامه برپا، فاکتورها، برگشت رسید، پیامک)
  (database) => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS self_exams (
        id INTEGER PRIMARY KEY,
        student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        subject TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL DEFAULT 15,
        question_count INTEGER NOT NULL DEFAULT 5,
        negative_marking INTEGER NOT NULL DEFAULT 0,
        questions_json TEXT NOT NULL,
        answers_json TEXT,
        score REAL,
        percentage REAL,
        correct_count INTEGER,
        wrong_count INTEGER,
        blank_count INTEGER,
        points_awarded INTEGER DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'completed', 'abandoned')),
        created_at TEXT DEFAULT (datetime('now')),
        finished_at TEXT
      );
      CREATE INDEX IF NOT EXISTS ix_self_exams_student ON self_exams(student_id, created_at);

      CREATE TABLE IF NOT EXISTS exam_books (
        id TEXT PRIMARY KEY,
        center_id INTEGER REFERENCES centers(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        grade TEXT NOT NULL,
        topics_count INTEGER DEFAULT 0,
        pages_count INTEGER DEFAULT 0,
        description TEXT,
        file_url TEXT,
        cover_url TEXT,
        topics_json TEXT,
        is_custom INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS ix_exam_books_grade ON exam_books(grade);

      CREATE TABLE IF NOT EXISTS attendance_changes (
        id INTEGER PRIMARY KEY,
        session_id INTEGER,
        student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        old_status TEXT,
        new_status TEXT NOT NULL,
        actor_id INTEGER NOT NULL REFERENCES users(id),
        date TEXT NOT NULL,
        changed_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS ix_att_changes_student ON attendance_changes(student_id, date);

      CREATE TABLE IF NOT EXISTS manual_scores (
        id INTEGER PRIMARY KEY,
        center_id INTEGER NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
        student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
        subject TEXT NOT NULL,
        title TEXT NOT NULL,
        score REAL NOT NULL CHECK(score >= 0 AND score <= 20),
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS ix_manual_scores_student ON manual_scores(student_id, subject);
      CREATE INDEX IF NOT EXISTS ix_manual_scores_teacher ON manual_scores(teacher_id, class_id);

      CREATE TABLE IF NOT EXISTS comprehensive_exam_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        center_id INTEGER REFERENCES centers(id) ON DELETE CASCADE,
        exam_id TEXT NOT NULL,
        exam_title TEXT NOT NULL,
        grade TEXT NOT NULL,
        student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        candidate_code TEXT,
        student_name TEXT NOT NULL,
        school_name TEXT,
        total_attendees INTEGER DEFAULT 1,
        overall_traz INTEGER,
        overall_rank_all INTEGER,
        overall_rank_center INTEGER,
        overall_percentage REAL,
        overall_correct INTEGER,
        overall_wrong INTEGER,
        overall_unanswered INTEGER,
        total_questions INTEGER DEFAULT 120,
        subjects_json TEXT NOT NULL DEFAULT '[]',
        categories_json TEXT NOT NULL DEFAULT '[]',
        answers_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(exam_id, student_id)
      );
      CREATE INDEX IF NOT EXISTS ix_comp_reports_student ON comprehensive_exam_reports(student_id);
      CREATE INDEX IF NOT EXISTS ix_comp_reports_exam ON comprehensive_exam_reports(exam_id, overall_traz);

      CREATE TABLE IF NOT EXISTS barpa_unmatched (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id TEXT NOT NULL,
  center_id INTEGER NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  candidate_code TEXT,
  full_name TEXT NOT NULL,
  school_name TEXT,
  page INTEGER,
  payload_json TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_barpa_unmatched_exam ON barpa_unmatched(exam_id, center_id);

CREATE TABLE IF NOT EXISTS fee_invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        center_id INTEGER NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
        student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        fee_type TEXT NOT NULL DEFAULT 'tuition',
        period TEXT NOT NULL,
        amount INTEGER NOT NULL CHECK(amount > 0),
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(student_id, fee_type, period)
      );
      CREATE INDEX IF NOT EXISTS ix_fee_invoices_student ON fee_invoices(student_id);

      CREATE TABLE IF NOT EXISTS sms_outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        center_id INTEGER NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
        recipient_phone TEXT NOT NULL,
        student_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        message_type TEXT NOT NULL DEFAULT 'general',
        content TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'failed')),
        provider_id TEXT,
        error_message TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        sent_at TEXT
      );
      CREATE INDEX IF NOT EXISTS ix_sms_outbox_center ON sms_outbox(center_id, status);
      CREATE INDEX IF NOT EXISTS ix_sms_outbox_student ON sms_outbox(student_id);
    `);

    const payCols = database.prepare('PRAGMA table_info(payments)').all().map((c) => c.name);
    if (!payCols.includes('invoice_id')) database.exec('ALTER TABLE payments ADD COLUMN invoice_id INTEGER REFERENCES fee_invoices(id)');
    if (!payCols.includes('fee_type')) database.exec("ALTER TABLE payments ADD COLUMN fee_type TEXT DEFAULT 'tuition'");
    if (!payCols.includes('reversed_at')) database.exec('ALTER TABLE payments ADD COLUMN reversed_at TEXT');
    if (!payCols.includes('reversed_by')) database.exec('ALTER TABLE payments ADD COLUMN reversed_by INTEGER REFERENCES users(id)');
    if (!payCols.includes('reverse_reason')) database.exec('ALTER TABLE payments ADD COLUMN reverse_reason TEXT');

    database.exec(`
      INSERT OR IGNORE INTO exam_books (id, center_id, title, grade, topics_count, pages_count, description, cover_url, is_custom)
      VALUES
        ('hoosh_6', NULL, 'هوش و استعداد تحلیلی ششم (هوش کمپلکس)', 'ششم', 58, 563, 'بانک جامع سوالات هوش و استعداد تحلیلی ورودی تیزهوشان ششم به هفتم', '/img/books/hoosh_6.jpg', 0),
        ('hoosh_8_9', NULL, 'هوش کمپلکس هشتم و نهم (طرح برپا)', 'نهم', 65, 558, 'بانک سوالات هوش منطقی، کلامی و تصویری نهم به دهم', '/img/books/hoosh_8_9.jpg', 0);
    `);
  },
  // نسخه ۳: ستون اجبار تغییر رمز عبور در اولین ورود
  (database) => {
    const userCols = database.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
    if (!userCols.includes('must_change_password')) {
      database.exec('ALTER TABLE users ADD COLUMN must_change_password INTEGER DEFAULT 0');
    }
  },

  // نسخه ۴: عمومی کردن کتاب‌های پیش‌فرض، قید وضعیت 'reversed' در پرداخت‌ها و اتصال فاکتور
  (database) => {
    // ۱. عمومی کردن کتاب‌های هوش پیش‌فرض (center_id = NULL)
    database.exec("UPDATE exam_books SET center_id = NULL WHERE id IN ('hoosh_6', 'hoosh_8_9')");

    // ۲. افزودن ستون‌های paid و status به fee_invoices در صورت نبود
    const invCols = database.prepare('PRAGMA table_info(fee_invoices)').all().map((c) => c.name);
    if (!invCols.includes('paid')) database.exec('ALTER TABLE fee_invoices ADD COLUMN paid INTEGER DEFAULT 0');
    if (!invCols.includes('status')) database.exec("ALTER TABLE fee_invoices ADD COLUMN status TEXT DEFAULT 'issued'");

    // به‌روزرسانی مقدار paid و status فاکتورهای قبلی
    database.exec(`
      UPDATE fee_invoices SET
        paid = COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = fee_invoices.id AND p.status = 'approved'), 0),
        status = CASE
          WHEN COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = fee_invoices.id AND p.status = 'approved'), 0) >= amount THEN 'paid'
          WHEN COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = fee_invoices.id AND p.status = 'approved'), 0) > 0 THEN 'partial'
          ELSE 'issued'
        END
    `);

    // ۳. بازسازی جدول payments برای افزودن 'reversed' به قید CHECK(status)
    database.exec(`
      CREATE TABLE payments_v4 (
        id INTEGER PRIMARY KEY,
        student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount INTEGER NOT NULL,
        receipt_path TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','reversed')),
        reject_reason TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        reviewed_at TEXT,
        invoice_id INTEGER REFERENCES fee_invoices(id),
        fee_type TEXT DEFAULT 'tuition',
        reversed_at TEXT,
        reversed_by INTEGER REFERENCES users(id),
        reverse_reason TEXT
      );

      INSERT INTO payments_v4 (id, student_id, amount, receipt_path, status, reject_reason, created_at, reviewed_at, invoice_id, fee_type, reversed_at, reversed_by, reverse_reason)
      SELECT id, student_id, amount, receipt_path, status, reject_reason, created_at, reviewed_at, invoice_id, fee_type, reversed_at, reversed_by, reverse_reason
      FROM payments;

      DROP TABLE payments;
      ALTER TABLE payments_v4 RENAME TO payments;
      CREATE INDEX IF NOT EXISTS ix_payments_student ON payments(student_id, status);
    `);
  },

  // نسخه ۵: تصحیح pages_count کتاب‌ها بر اساس سرفصل‌ها و جدول کارنامه‌های تطبیق‌نشده برپا
  (database) => {
    let max6 = 563;
    let max89 = 558;
    try {
      const p6 = path.join(ROOT, 'server', 'data', 'hoosh_topics.json');
      if (fs.existsSync(p6)) {
        const t6 = JSON.parse(fs.readFileSync(p6, 'utf8'));
        const m = Math.max(...t6.map((x) => x.pdfEndPage || x.bookEndPage || 0));
        if (m > 0) max6 = m;
      }
    } catch { /* */ }
    try {
      const p89 = path.join(ROOT, 'server', 'data', 'hoosh_topics_8_9.json');
      if (fs.existsSync(p89)) {
        const t89 = JSON.parse(fs.readFileSync(p89, 'utf8'));
        const m = Math.max(...t89.map((x) => x.pdfEndPage || x.bookEndPage || 0));
        if (m > 0) max89 = m;
      }
    } catch { /* */ }

    database.exec(`
      UPDATE exam_books SET pages_count = ${max6} WHERE id = 'hoosh_6';
      UPDATE exam_books SET pages_count = ${max89} WHERE id = 'hoosh_8_9';

      CREATE TABLE IF NOT EXISTS barpa_unmatched (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exam_id TEXT NOT NULL,
        center_id INTEGER NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
        candidate_code TEXT,
        full_name TEXT NOT NULL,
        school_name TEXT,
        page INTEGER,
        payload_json TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS ix_barpa_unmatched_exam ON barpa_unmatched(exam_id, center_id);
    `);
  },
  // نسخه ۶: نوع جلسه در برنامه هفتگی (درسی، تربیتی، شطرنج، رباتیک، زبان، ورزش، ...)
  (database) => {
    const cols = database.prepare('PRAGMA table_info(schedule)').all().map((c) => c.name);
    if (!cols.includes('kind')) database.exec("ALTER TABLE schedule ADD COLUMN kind TEXT NOT NULL DEFAULT 'academic'");
    database.exec('CREATE INDEX IF NOT EXISTS ix_schedule_teacher ON schedule(teacher_id, weekday)');
  },
  // نسخه ۷: اشتراک سامانه (مبلغ جدا از حق عضویت، پیش‌فرض ۱۰۰ هزار تومان) و ثبت سهم آن در هر رسید
  (database) => {
    const cc = database.prepare('PRAGMA table_info(centers)').all().map((c) => c.name);
    if (!cc.includes('system_fee')) database.exec('ALTER TABLE centers ADD COLUMN system_fee INTEGER NOT NULL DEFAULT 100000');
    const pc = database.prepare('PRAGMA table_info(payments)').all().map((c) => c.name);
    if (!pc.includes('system_fee')) database.exec('ALTER TABLE payments ADD COLUMN system_fee INTEGER NOT NULL DEFAULT 0');
  },
  // Per-center timetable colors; existing schedules are preserved.
  (database) => {
    database.exec("CREATE TABLE IF NOT EXISTS schedule_colors (center_id INTEGER PRIMARY KEY REFERENCES centers(id) ON DELETE CASCADE, config TEXT NOT NULL DEFAULT '{}')");
  },
  // نسخه ۸: تکمیل اجباری پروفایل در اولین ورود (دانش‌آموزان موجود «تکمیل‌شده» هستند)
  (database) => {
    const cols = database.prepare('PRAGMA table_info(students)').all().map((c) => c.name);
    if (!cols.includes('profile_done')) database.exec('ALTER TABLE students ADD COLUMN profile_done INTEGER NOT NULL DEFAULT 1');
  },
  // نسخه ۱۰: نام پدر دانش‌آموز (از فایل ثبت‌نام گروهی یا فرم اولین ورود)
  (database) => {
    const cols = database.prepare('PRAGMA table_info(students)').all().map((c) => c.name);
    if (!cols.includes('father_name')) database.exec('ALTER TABLE students ADD COLUMN father_name TEXT');
  },
  // نسخه ۱۱: نقش مستقل مشاور، برنامه شخصی و جلسات مشاوره
  counselorMigration,
  // اطلاعات اختیاری پروفایل دانش‌آموز: نام مادر و شمارهٔ تماس دوم
  (database) => {
    const cols = database.prepare('PRAGMA table_info(students)').all().map((c) => c.name);
    if (!cols.includes('mother_name')) database.exec('ALTER TABLE students ADD COLUMN mother_name TEXT');
    if (!cols.includes('phone2')) database.exec('ALTER TABLE students ADD COLUMN phone2 TEXT');
  },
  // اشتراک سامانه قابل خاموش/روشن (پیش‌فرض: اعمال نشود)؛ ماه حق عضویت و علامت ثبت دستی روی پرداخت‌ها
  (database) => {
    const cc = database.prepare('PRAGMA table_info(centers)').all().map((c) => c.name);
    if (!cc.includes('system_fee_enabled')) database.exec('ALTER TABLE centers ADD COLUMN system_fee_enabled INTEGER NOT NULL DEFAULT 0');
    const pc = database.prepare('PRAGMA table_info(payments)').all().map((c) => c.name);
    if (!pc.includes('period')) database.exec('ALTER TABLE payments ADD COLUMN period TEXT');
    if (!pc.includes('manual')) database.exec('ALTER TABLE payments ADD COLUMN manual INTEGER NOT NULL DEFAULT 0');
  },
  // توکن‌های خروج‌شده: کوکی کپی‌شده پس از خروج دیگر معتبر نیست
  (database) => { database.exec('CREATE TABLE IF NOT EXISTS revoked_tokens (jti TEXT PRIMARY KEY, exp INTEGER NOT NULL)'); },
  // جایگاه ۱۵ (در یک استقرار میانی خالی اجرا شد؛ برای هم‌ترازی شمارهٔ نسخهٔ پایگاه‌داده‌ها حفظ می‌شود)
  () => {},
  // صف حذف دانش‌آموزان برای «کلاس آنلاین»: اگر سرویس در دسترس نبود، بعداً دوباره تلاش می‌شود
  (database) => { database.exec('CREATE TABLE IF NOT EXISTS classroom_removals (ext_id TEXT PRIMARY KEY, created_at TEXT DEFAULT (datetime(\'now\')))'); },
  // ظاهر پنل مدیر به‌ازای هر کاربر: 'new' یا 'classic' (خالی = پیش‌فرض سامانه)
  (database) => {
    const cols = database.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
    if (!cols.includes('ui_look')) database.exec('ALTER TABLE users ADD COLUMN ui_look TEXT');
  },
  // فهرست درس‌های قابل تخصیص به معلم، قابل ویرایش توسط مدیر هر کانون (خالی = فهرست پیش‌فرض)
  (database) => {
    const cols = database.prepare('PRAGMA table_info(centers)').all().map((c) => c.name);
    if (!cols.includes('subjects')) database.exec('ALTER TABLE centers ADD COLUMN subjects TEXT');
  },
  // مهلت شرکت در آزمون آنلاین (deadline)
  (database) => {
    const cols = database.prepare('PRAGMA table_info(exams)').all().map((c) => c.name);
    if (!cols.includes('deadline')) database.exec('ALTER TABLE exams ADD COLUMN deadline TEXT');
  },
  // بانک سؤالات، ساختار کامل کتب درسی و موتور آزمون داخلی (بدون AI)
  (database) => {
    const cCols = database.prepare('PRAGMA table_info(centers)').all().map((c) => c.name);
    if (!cCols.includes('qb_mix_easy')) database.exec('ALTER TABLE centers ADD COLUMN qb_mix_easy INTEGER NOT NULL DEFAULT 30');
    if (!cCols.includes('qb_mix_medium')) database.exec('ALTER TABLE centers ADD COLUMN qb_mix_medium INTEGER NOT NULL DEFAULT 50');
    if (!cCols.includes('qb_mix_hard')) database.exec('ALTER TABLE centers ADD COLUMN qb_mix_hard INTEGER NOT NULL DEFAULT 20');

    database.exec(`
      CREATE TABLE IF NOT EXISTS textbooks (
        id TEXT PRIMARY KEY,
        center_id INTEGER REFERENCES centers(id) ON DELETE CASCADE,
        book_code TEXT UNIQUE,
        title TEXT NOT NULL,
        subject_key TEXT NOT NULL,
        grade INTEGER NOT NULL CHECK (grade BETWEEN 4 AND 9),
        cover_url TEXT,
        published INTEGER NOT NULL DEFAULT 1,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS textbook_editions (
        id INTEGER PRIMARY KEY,
        book_id TEXT NOT NULL REFERENCES textbooks(id) ON DELETE CASCADE,
        edition_label TEXT NOT NULL DEFAULT '1405',
        pub_year INTEGER DEFAULT 1405,
        pdf_path TEXT,
        printed_pages INTEGER NOT NULL DEFAULT 1,
        pdf_offset INTEGER NOT NULL DEFAULT 0,
        sha256 TEXT,
        is_default INTEGER NOT NULL DEFAULT 1,
        published INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE (book_id, edition_label)
      );
      CREATE TABLE IF NOT EXISTS textbook_chapters (
        id INTEGER PRIMARY KEY,
        edition_id INTEGER NOT NULL REFERENCES textbook_editions(id) ON DELETE CASCADE,
        number INTEGER NOT NULL,
        title TEXT NOT NULL,
        printed_start INTEGER NOT NULL,
        printed_end INTEGER NOT NULL,
        pdf_start INTEGER,
        UNIQUE (edition_id, number)
      );
      CREATE TABLE IF NOT EXISTS textbook_lessons (
        id INTEGER PRIMARY KEY,
        chapter_id INTEGER NOT NULL REFERENCES textbook_chapters(id) ON DELETE CASCADE,
        number INTEGER NOT NULL,
        title TEXT NOT NULL,
        printed_start INTEGER NOT NULL,
        printed_end INTEGER NOT NULL,
        UNIQUE (chapter_id, number)
      );
      CREATE TABLE IF NOT EXISTS textbook_pages (
        id INTEGER PRIMARY KEY,
        edition_id INTEGER NOT NULL REFERENCES textbook_editions(id) ON DELETE CASCADE,
        printed_page INTEGER NOT NULL,
        pdf_page INTEGER NOT NULL,
        chapter_id INTEGER REFERENCES textbook_chapters(id) ON DELETE SET NULL,
        lesson_id INTEGER REFERENCES textbook_lessons(id) ON DELETE SET NULL,
        excluded INTEGER NOT NULL DEFAULT 0,
        exclude_reason TEXT,
        UNIQUE (edition_id, printed_page)
      );
      CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY,
        center_id INTEGER REFERENCES centers(id) ON DELETE CASCADE,
        external_id TEXT,
        book_id TEXT NOT NULL REFERENCES textbooks(id) ON DELETE CASCADE,
        edition_id INTEGER NOT NULL REFERENCES textbook_editions(id) ON DELETE CASCADE,
        chapter_id INTEGER REFERENCES textbook_chapters(id) ON DELETE SET NULL,
        lesson_id INTEGER REFERENCES textbook_lessons(id) ON DELETE SET NULL,
        primary_page INTEGER NOT NULL,
        topic TEXT DEFAULT '',
        type TEXT NOT NULL CHECK (type IN ('single_choice','multiple_choice','true_false','fill_blank','short_answer','descriptive','numeric','matching','ordering','multipart','hotspot')),
        difficulty INTEGER NOT NULL DEFAULT 2 CHECK (difficulty BETWEEN 1 AND 5),
        stem TEXT NOT NULL,
        table_json TEXT,
        content_flags_json TEXT NOT NULL DEFAULT '{}',
        options_json TEXT NOT NULL DEFAULT '[]',
        answer_json TEXT NOT NULL,
        explanation TEXT DEFAULT '',
        score REAL NOT NULL DEFAULT 1,
        estimated_time_seconds INTEGER NOT NULL DEFAULT 60,
        tags_json TEXT NOT NULL DEFAULT '[]',
        assets_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_review','approved','published','rejected','archived')),
        content_hash TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        batch_id INTEGER,
        reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TEXT,
        review_note TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS question_sources (
        id INTEGER PRIMARY KEY,
        question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
        edition_id INTEGER NOT NULL REFERENCES textbook_editions(id) ON DELETE CASCADE,
        chapter_id INTEGER REFERENCES textbook_chapters(id) ON DELETE SET NULL,
        lesson_id INTEGER REFERENCES textbook_lessons(id) ON DELETE SET NULL,
        page_number INTEGER NOT NULL,
        is_primary INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS question_versions (
        id INTEGER PRIMARY KEY,
        question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        snapshot_json TEXT NOT NULL,
        changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        change_note TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS question_review_logs (
        id INTEGER PRIMARY KEY,
        question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
        from_status TEXT,
        to_status TEXT NOT NULL,
        actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        note TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS question_import_batches (
        id INTEGER PRIMARY KEY,
        center_id INTEGER REFERENCES centers(id) ON DELETE CASCADE,
        owner_id INTEGER NOT NULL REFERENCES users(id),
        book_id TEXT NOT NULL,
        edition_id INTEGER NOT NULL,
        format TEXT NOT NULL CHECK (format IN ('zip','json','xlsx')),
        filename TEXT NOT NULL,
        total_count INTEGER DEFAULT 0,
        valid_count INTEGER DEFAULT 0,
        invalid_count INTEGER DEFAULT 0,
        duplicate_count INTEGER DEFAULT 0,
        imported_count INTEGER DEFAULT 0,
        missing_assets_count INTEGER DEFAULT 0,
        invalid_pages_count INTEGER DEFAULT 0,
        invalid_answers_count INTEGER DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'validated' CHECK (status IN ('validated','imported','published','failed')),
        report_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS question_import_errors (
        id INTEGER PRIMARY KEY,
        batch_id INTEGER NOT NULL REFERENCES question_import_batches(id) ON DELETE CASCADE,
        row_index INTEGER,
        external_id TEXT,
        field TEXT,
        message TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS qb_exams (
        id INTEGER PRIMARY KEY,
        center_id INTEGER NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
        creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        mode TEXT NOT NULL CHECK (mode IN ('practice','official')),
        title TEXT NOT NULL,
        book_id TEXT NOT NULL,
        edition_id INTEGER NOT NULL,
        class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
        scope_type TEXT NOT NULL DEFAULT 'book',
        scope_json TEXT NOT NULL DEFAULT '{}',
        difficulty_mode TEXT NOT NULL DEFAULT 'mixed',
        question_count INTEGER NOT NULL,
        duration_minutes INTEGER NOT NULL DEFAULT 0,
        shuffle_questions INTEGER NOT NULL DEFAULT 1,
        shuffle_options INTEGER NOT NULL DEFAULT 1,
        include_descriptive INTEGER NOT NULL DEFAULT 0,
        starts_at TEXT,
        ends_at TEXT,
        status TEXT NOT NULL DEFAULT 'published',
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS qb_exam_questions (
        id INTEGER PRIMARY KEY,
        exam_id INTEGER NOT NULL REFERENCES qb_exams(id) ON DELETE CASCADE,
        question_id INTEGER NOT NULL REFERENCES questions(id),
        question_version INTEGER NOT NULL DEFAULT 1,
        order_index INTEGER NOT NULL,
        option_order_json TEXT,
        score REAL NOT NULL DEFAULT 1,
        snapshot_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS qb_exam_attempts (
        id INTEGER PRIMARY KEY,
        exam_id INTEGER NOT NULL REFERENCES qb_exams(id) ON DELETE CASCADE,
        student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        answers_json TEXT NOT NULL DEFAULT '{}',
        flagged_json TEXT NOT NULL DEFAULT '[]',
        grading_json TEXT,
        self_eval_json TEXT,
        auto_score REAL DEFAULT 0,
        manual_score REAL DEFAULT 0,
        total_score REAL DEFAULT 0,
        max_score REAL DEFAULT 0,
        percent REAL DEFAULT 0,
        correct_count INTEGER DEFAULT 0,
        wrong_count INTEGER DEFAULT 0,
        blank_count INTEGER DEFAULT 0,
        pending_count INTEGER DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started','submitted','graded')),
        started_at TEXT DEFAULT (datetime('now')),
        submitted_at TEXT,
        graded_at TEXT,
        graded_by INTEGER REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS question_usage_history (
        id INTEGER PRIMARY KEY,
        student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
        exam_id INTEGER NOT NULL,
        is_correct INTEGER,
        used_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS student_page_performance (
        id INTEGER PRIMARY KEY,
        student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        book_id TEXT NOT NULL,
        edition_id INTEGER NOT NULL,
        page_number INTEGER NOT NULL,
        attempts_count INTEGER NOT NULL DEFAULT 0,
        correct_count INTEGER NOT NULL DEFAULT 0,
        unique_questions INTEGER NOT NULL DEFAULT 0,
        mastery_status TEXT NOT NULL DEFAULT 'not_evaluated',
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE (student_id, edition_id, page_number)
      );

      CREATE INDEX IF NOT EXISTS ix_qb_questions_filter ON questions(book_id, edition_id, status, primary_page, type, difficulty);
      CREATE INDEX IF NOT EXISTS ix_qb_questions_ext ON questions(external_id, book_id);
      CREATE INDEX IF NOT EXISTS ix_qb_questions_hash ON questions(content_hash, book_id);
      CREATE INDEX IF NOT EXISTS ix_qb_sources_page ON question_sources(edition_id, page_number);
      CREATE INDEX IF NOT EXISTS ix_qb_usage_stu ON question_usage_history(student_id, question_id);
      CREATE INDEX IF NOT EXISTS ix_qb_attempts_stu ON qb_exam_attempts(student_id, exam_id);
    `);

    const catalogPath = path.join(ROOT, 'server', 'textbooks.json');
    if (fs.existsSync(catalogPath)) {
      const cat = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
      const insBook = database.prepare('INSERT OR IGNORE INTO textbooks (id, book_code, title, subject_key, grade, published) VALUES (?,?,?,?,?,1)');
      const insEd = database.prepare('INSERT OR IGNORE INTO textbook_editions (book_id, edition_label, pub_year, printed_pages, pdf_offset, sha256, is_default, published) VALUES (?,?,?,?,?,?,1,1)');
      const getEd = database.prepare('SELECT id FROM textbook_editions WHERE book_id=? AND edition_label=?');
      const insCh = database.prepare('INSERT OR IGNORE INTO textbook_chapters (edition_id, number, title, printed_start, printed_end, pdf_start) VALUES (?,?,?,?,?,?)');
      const getCh = database.prepare('SELECT id FROM textbook_chapters WHERE edition_id=? AND number=?');
      const insPg = database.prepare('INSERT OR IGNORE INTO textbook_pages (edition_id, printed_page, pdf_page, chapter_id) VALUES (?,?,?,?)');
      for (const b of cat) {
        const code = `${(b.subject_key === 'ریاضی' ? 'MATH' : b.subject_key === 'علوم' ? 'SCI' : 'BOOK')}-${String(b.grade).padStart(2, '0')}`;
        insBook.run(b.id, code, b.title, b.subject_key, b.grade);
        insEd.run(b.id, '1405', 1405, b.printed_pages || 1, b.pdf_offset || 0, b.sha256 || null);
        const ed = getEd.get(b.id, '1405');
        if (!ed) continue;
        const chMap = [];
        for (const c of (b.chapters || [])) {
          insCh.run(ed.id, c.number, c.title, c.printed_start, c.printed_end, c.pdf_start ?? null);
          const cr = getCh.get(ed.id, c.number);
          if (cr) chMap.push({ id: cr.id, start: c.printed_start, end: c.printed_end });
        }
        const offset = Number(b.pdf_offset || 0);
        for (let p = 1; p <= (b.printed_pages || 0); p++) {
          const ch = chMap.find((x) => p >= x.start && p <= x.end);
          insPg.run(ed.id, p, p + offset, ch ? ch.id : null);
        }
      }
    }
  },
  // نسخه ۲۳: ستون‌های معلم-مشاور، پایه‌های مشاور و جدول مصوبات جلسات کانون
  (database) => {
    const uCols = database.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
    if (!uCols.includes('is_counselor')) database.exec('ALTER TABLE users ADD COLUMN is_counselor INTEGER NOT NULL DEFAULT 0');
    if (!uCols.includes('counselor_grades_json')) database.exec("ALTER TABLE users ADD COLUMN counselor_grades_json TEXT DEFAULT '[]'");
    database.exec(`
      CREATE TABLE IF NOT EXISTS meeting_resolutions (
        id INTEGER PRIMARY KEY,
        center_id INTEGER NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        meeting_date TEXT NOT NULL,
        attendees TEXT DEFAULT '',
        agenda TEXT DEFAULT '',
        decisions TEXT NOT NULL,
        owner_name TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','done')),
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS ix_meetings_center ON meeting_resolutions(center_id, meeting_date);
    `);
  },
  // نسخه ۲۴: جدول یادداشت‌ها و نقاشی‌های روی صفحات کتاب درسی
  (database) => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS textbook_notes (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        book_id TEXT NOT NULL,
        page INTEGER NOT NULL,
        note_text TEXT DEFAULT '',
        drawing_json TEXT DEFAULT '',
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(user_id, book_id, page)
      );
      CREATE INDEX IF NOT EXISTS ix_tb_notes_user ON textbook_notes(user_id, book_id);
    `);
    const libPath = path.join(ROOT, 'server', 'textbooks-library.json');
    const catalogPath = fs.existsSync(libPath) ? libPath : path.join(ROOT, 'server', 'textbooks.json');
    if (fs.existsSync(catalogPath)) {
      const cat = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
      const insBook = database.prepare('INSERT OR IGNORE INTO textbooks (id, book_code, title, subject_key, grade, published) VALUES (?,?,?,?,?,1)');
      const insEd = database.prepare('INSERT OR IGNORE INTO textbook_editions (book_id, edition_label, pub_year, printed_pages, pdf_offset, sha256, is_default, published) VALUES (?,?,?,?,?,?,1,1)');
      const getEd = database.prepare('SELECT id FROM textbook_editions WHERE book_id=? AND edition_label=?');
      const insCh = database.prepare('INSERT OR IGNORE INTO textbook_chapters (edition_id, number, title, printed_start, printed_end, pdf_start) VALUES (?,?,?,?,?,?)');
      const getCh = database.prepare('SELECT id FROM textbook_chapters WHERE edition_id=? AND number=?');
      const insPg = database.prepare('INSERT OR IGNORE INTO textbook_pages (edition_id, printed_page, pdf_page, chapter_id) VALUES (?,?,?,?)');
      for (const b of cat) {
        const code = `${(b.subject_key === 'ریاضی' ? 'MATH' : b.subject_key === 'علوم' ? 'SCI' : 'BOOK')}-${String(b.grade).padStart(2, '0')}`;
        insBook.run(b.id, code, b.title, b.subject_key, b.grade);
        insEd.run(b.id, '1405', 1405, b.printed_pages || 1, b.pdf_offset || 0, b.sha256 || null);
        const ed = getEd.get(b.id, '1405');
        if (!ed) continue;
        const chMap = [];
        for (const c of (b.chapters || [])) {
          insCh.run(ed.id, c.number, c.title, c.printed_start, c.printed_end, c.pdf_start ?? null);
          const cr = getCh.get(ed.id, c.number);
          if (cr) chMap.push({ id: cr.id, start: c.printed_start, end: c.printed_end });
        }
        const offset = Number(b.pdf_offset || 0);
        for (let p = 1; p <= (b.printed_pages || 0); p++) {
          const ch = chMap.find((x) => p >= x.start && p <= x.end);
          insPg.run(ed.id, p, p + offset, ch ? ch.id : null);
        }
      }
    }
    seedBuiltinQuestions(database);
  },
];

export function migrate(database = db) {
  let version = Number(database.prepare('PRAGMA user_version').get()?.user_version || 0);
  for (let i = version; i < migrations.length; i++) {
    const nextVersion = i + 1;
    const foreignKeys = Number(database.prepare('PRAGMA foreign_keys').get().foreign_keys);
    if (migrations[i].foreignKeysOff) {
      database.exec('PRAGMA foreign_keys = OFF');
      if (Number(database.prepare('PRAGMA foreign_keys').get().foreign_keys)) throw new Error('Migration requires a connection outside an existing transaction');
    }
    database.exec('BEGIN');
    try {
      migrations[i](database);
      if (migrations[i].foreignKeysOff && database.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Foreign key integrity check failed');
      database.exec(`PRAGMA user_version = ${nextVersion}`);
      database.exec('COMMIT');
    } catch (e) {
      database.exec('ROLLBACK');
      throw new Error(`خطا در اجرای مهاجرت نسخه ${nextVersion}: ${e.message}`);
    } finally {
      if (migrations[i].foreignKeysOff) database.exec(`PRAGMA foreign_keys = ${foreignKeys}`);
    }
  }
  return Number(database.prepare('PRAGMA user_version').get()?.user_version || 0);
}

export function openDb(dbPath = DB_PATH) {
  db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;
    PRAGMA cache_size = -65536; PRAGMA temp_store = MEMORY; PRAGMA mmap_size = 268435456; PRAGMA journal_size_limit = 67108864; PRAGMA wal_autocheckpoint = 1000;`);
  migrate(db);
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
