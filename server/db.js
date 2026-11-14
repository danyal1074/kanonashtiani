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
  // نسخه ۱۹: تخصیص کلاس به مشاور و لاگ ممیزی عملیات حساس.
  // برای جلوگیری از قطع ناگهانی کار، هر مشاورِ موجود به همهٔ کلاس‌های فعلی کانونش تخصیص می‌یابد
  // (همان دسترسی قبلی، اکنون صریح و قابل ویرایش). کلاس‌های جدید خودکار تخصیص نمی‌یابند.
  (database) => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY,
        center_id INTEGER REFERENCES centers(id) ON DELETE CASCADE,
        actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        entity TEXT NOT NULL,
        entity_id TEXT,
        detail_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS ix_audit_center ON audit_log(center_id, id);
      CREATE INDEX IF NOT EXISTS ix_audit_entity ON audit_log(entity, entity_id);
      CREATE TABLE IF NOT EXISTS counselor_classes (
        id INTEGER PRIMARY KEY,
        center_id INTEGER NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
        counselor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        assigned_at TEXT DEFAULT (datetime('now')),
        UNIQUE(counselor_id, class_id)
      );
      CREATE INDEX IF NOT EXISTS ix_counselor_classes_class ON counselor_classes(class_id);
      INSERT OR IGNORE INTO counselor_classes(center_id, counselor_id, class_id)
        SELECT u.center_id, u.id, c.id FROM users u JOIN classes c ON c.center_id = u.center_id
        WHERE u.role = 'counselor' AND u.center_id IS NOT NULL;
    `);
  },
  // نسخه ۲۰: حساب یکپارچهٔ مالی دانش‌آموز روی همان fee_invoices/payments/transactions.
  // واحد پول همهٔ مبالغ: «تومان» به‌صورت عدد صحیح (همان واحد موجود در fee_settings و payments).
  // - fee_invoice_lines: اقلام فاکتور (شهریه، بوفه، خدمات، تخفیف منفی، تعدیل ±). جمع اقلام = مبلغ فاکتور.
  // - charge_items: کاتالوگ قیمت بوفه و خدمات (دفتر حساب جدیدی نیست).
  // - idempotency_keys: جلوگیری از ثبت تکراری خرید/هزینه با تلاش مجدد یا دوبار کلیک.
  // فاکتورهای قبلی هرکدام یک قلم معادل مبلغ خود دریافت می‌کنند؛ مبالغ و پرداخت‌ها تغییر نمی‌کند.
  (database) => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS fee_invoice_lines (
        id INTEGER PRIMARY KEY,
        invoice_id INTEGER NOT NULL REFERENCES fee_invoices(id) ON DELETE CASCADE,
        center_id INTEGER NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('tuition','buffet','service','other','discount','adjustment')),
        title TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
        unit_price INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        item_id INTEGER,
        note TEXT,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT DEFAULT (datetime('now')),
        CHECK (amount = quantity * unit_price),
        CHECK ((kind = 'discount' AND amount < 0) OR (kind = 'adjustment' AND amount <> 0) OR (kind NOT IN ('discount','adjustment') AND amount > 0))
      );
      CREATE INDEX IF NOT EXISTS ix_fee_lines_invoice ON fee_invoice_lines(invoice_id);
      CREATE TABLE IF NOT EXISTS charge_items (
        id INTEGER PRIMARY KEY,
        center_id INTEGER NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
        category TEXT NOT NULL CHECK (category IN ('buffet','service','other')),
        title TEXT NOT NULL,
        unit_price INTEGER NOT NULL CHECK (unit_price > 0),
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE (center_id, category, title)
      );
      CREATE TABLE IF NOT EXISTS idempotency_keys (
        center_id INTEGER NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
        key TEXT NOT NULL,
        actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        scope TEXT NOT NULL,
        response_json TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (center_id, key)
      );
    `);
    const cols = database.prepare('PRAGMA table_info(fee_invoices)').all().map((c) => c.name);
    if (!cols.includes('voided_at')) database.exec('ALTER TABLE fee_invoices ADD COLUMN voided_at TEXT');
    if (!cols.includes('voided_by')) database.exec('ALTER TABLE fee_invoices ADD COLUMN voided_by INTEGER REFERENCES users(id)');
    if (!cols.includes('void_reason')) database.exec('ALTER TABLE fee_invoices ADD COLUMN void_reason TEXT');
    const pc = database.prepare('PRAGMA table_info(payments)').all().map((c) => c.name);
    if (!pc.includes('method')) database.exec("ALTER TABLE payments ADD COLUMN method TEXT NOT NULL DEFAULT 'receipt'");
    database.exec(`INSERT INTO fee_invoice_lines(invoice_id, center_id, kind, title, quantity, unit_price, amount)
      SELECT i.id, i.center_id,
        CASE WHEN i.fee_type IN ('tuition','buffet','service') THEN i.fee_type ELSE 'other' END,
        i.fee_type || ' — ' || i.period, 1, i.amount, i.amount
      FROM fee_invoices i WHERE NOT EXISTS (SELECT 1 FROM fee_invoice_lines l WHERE l.invoice_id = i.id)`);
  },
];

// ثبت رویداد در لاگ ممیزی (در همان تراکنش فراخواننده اجرا می‌شود)
export function audit(centerId, actorId, action, entity, entityId, detail = {}) {
  run('INSERT INTO audit_log(center_id,actor_id,action,entity,entity_id,detail_json) VALUES (?,?,?,?,?,?)',
    centerId ?? null, actorId ?? null, action, entity, entityId == null ? null : String(entityId), JSON.stringify(detail));
}

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
