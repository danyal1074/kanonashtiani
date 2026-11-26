// موتور انتخاب سؤال و تصحیح آزمون بدون هوش مصنوعی
import { all, get, run } from './db.js';
import { normalizeText } from './qb-validator.js';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function selectQuestionsForExam({
  centerId,
  bookId,
  editionId,
  studentId = null,
  scopeType = 'book',
  chapterIds = [],
  lessonIds = [],
  fromPage = null,
  toPage = null,
  types = [],
  difficultyMode = 'mixed',
  count = 15,
  includeDescriptive = false,
  mixRatio = { easy: 30, medium: 50, hard: 20 },
  shuffleQuestions = true,
  shuffleOptions = true,
}) {
  const where = [`q.book_id = ?`, `q.edition_id = ?`, `q.status = 'published'`, `(q.center_id IS NULL OR q.center_id = ?)`];
  const params = [bookId, editionId, centerId];

  if (!includeDescriptive) {
    where.push(`q.type != 'descriptive'`);
  }
  if (Array.isArray(types) && types.length) {
    where.push(`q.type IN (${types.map(() => '?').join(',')})`);
    params.push(...types);
  }
  if (scopeType === 'chapter' && chapterIds.length) {
    where.push(`q.chapter_id IN (${chapterIds.map(() => '?').join(',')})`);
    params.push(...chapterIds);
  } else if (scopeType === 'lesson' && lessonIds.length) {
    where.push(`q.lesson_id IN (${lessonIds.map(() => '?').join(',')})`);
    params.push(...lessonIds);
  } else if (scopeType === 'pages' && fromPage && toPage) {
    where.push(`(q.primary_page BETWEEN ? AND ? OR EXISTS (SELECT 1 FROM question_sources qs WHERE qs.question_id=q.id AND qs.page_number BETWEEN ? AND ?))`);
    params.push(Number(fromPage), Number(toPage), Number(fromPage), Number(toPage));
  }

  let pool = all(`SELECT q.* FROM questions q WHERE ${where.join(' AND ')}`, ...params);
  if (!pool.length) return { selected: [], availableCount: 0, shortages: count };

  // سابقهٔ دیده‌شدن سؤال توسط دانش‌آموز برای اولویت‌بندی سؤالات تازه‌تر
  const seenMap = new Map();
  if (studentId) {
    for (const r of all('SELECT question_id, MAX(used_at) last_used, COUNT(*) cnt FROM question_usage_history WHERE student_id=? GROUP BY question_id', studentId)) {
      seenMap.set(r.question_id, r.cnt);
    }
  }

  const filterDiff = (list) => {
    if (difficultyMode === 'easy') return list.filter((q) => q.difficulty <= 2);
    if (difficultyMode === 'medium') return list.filter((q) => q.difficulty === 3);
    if (difficultyMode === 'hard') return list.filter((q) => q.difficulty >= 4);
    return list;
  };

  if (difficultyMode !== 'mixed') {
    const strict = filterDiff(pool);
    if (strict.length) pool = strict;
  }

  // مرتب‌سازی هوشمند: کمتر دیده‌شده + توزیع متوازن موضوعات
  const scoreCandidate = (q) => (seenMap.get(q.id) || 0) * 10 + Math.random();
  pool.sort((a, b) => scoreCandidate(a) - scoreCandidate(b));

  const target = Math.min(Number(count) || 15, pool.length);
  const picked = [];
  const pickedIds = new Set();
  const topicCounts = new Map();

  const pickFrom = (candidates, limit) => {
    // اولویت با مباحثی که کمتر انتخاب شده‌اند
    const sorted = [...candidates].sort((a, b) => {
      const ta = topicCounts.get(a.topic || a.chapter_id || 'x') || 0;
      const tb = topicCounts.get(b.topic || b.chapter_id || 'x') || 0;
      if (ta !== tb) return ta - tb;
      return scoreCandidate(a) - scoreCandidate(b);
    });
    for (const q of sorted) {
      if (picked.length >= target || limit <= 0) break;
      if (pickedIds.has(q.id)) continue;
      picked.push(q);
      pickedIds.add(q.id);
      const tk = q.topic || q.chapter_id || 'x';
      topicCounts.set(tk, (topicCounts.get(tk) || 0) + 1);
      limit--;
    }
  };

  if (difficultyMode === 'mixed') {
    const totalRatio = (mixRatio.easy || 30) + (mixRatio.medium || 50) + (mixRatio.hard || 20) || 100;
    const nEasy = Math.round((target * (mixRatio.easy || 30)) / totalRatio);
    const nMed = Math.round((target * (mixRatio.medium || 50)) / totalRatio);
    const nHard = Math.max(0, target - nEasy - nMed);
    pickFrom(pool.filter((q) => q.difficulty <= 2), nEasy);
    pickFrom(pool.filter((q) => q.difficulty === 3), nMed);
    pickFrom(pool.filter((q) => q.difficulty >= 4), nHard);
  }
  if (picked.length < target) pickFrom(pool, target - picked.length);

  const ordered = shuffleQuestions ? shuffle(picked) : picked;
  const final = ordered.map((q, idx) => {
    const opts = JSON.parse(q.options_json || '[]');
    let optionOrder = opts.map((o) => o.id);
    if (shuffleOptions && (q.type === 'single_choice' || q.type === 'multiple_choice') && opts.length > 1) {
      optionOrder = shuffle(optionOrder);
    }
    return { question: q, orderIndex: idx, optionOrder };
  });

  return { selected: final, availableCount: pool.length, shortage: Math.max(0, Number(count) - final.length) };
}

// تبدیل سؤال بانک به نسخهٔ امن دانش‌آموز (بدون افشای پاسخ صحیح و توضیح)
export function toSafeStudentQuestion(qRow, optionOrder = null) {
  const opts = JSON.parse(qRow.options_json || '[]');
  const orderedOpts = Array.isArray(optionOrder) && optionOrder.length
    ? optionOrder.map((id) => opts.find((o) => o.id === id)).filter(Boolean)
    : opts;
  const ans = JSON.parse(qRow.answer_json || '{}');
  const safe = {
    id: qRow.id,
    type: qRow.type,
    difficulty: qRow.difficulty,
    stem: qRow.stem,
    table: qRow.table_json ? JSON.parse(qRow.table_json) : null,
    content_flags: JSON.parse(qRow.content_flags_json || '{}'),
    assets: JSON.parse(qRow.assets_json || '[]'),
    options: orderedOpts.map((o) => ({ id: o.id, text: o.text, asset_path: o.asset_path || null })),
    score: qRow.score,
    estimated_time_seconds: qRow.estimated_time_seconds,
    primary_page: qRow.primary_page,
    chapter_id: qRow.chapter_id,
    lesson_id: qRow.lesson_id,
    topic: qRow.topic,
  };
  if (qRow.type === 'matching' && Array.isArray(ans.left) && Array.isArray(ans.right)) {
    safe.matching = { left: ans.left, right: shuffle(ans.right) };
  }
  if (qRow.type === 'ordering' && Array.isArray(ans.items)) {
    safe.ordering_items = shuffle(ans.items);
  }
  if (qRow.type === 'multipart' && Array.isArray(ans.parts)) {
    safe.parts = ans.parts.map((p) => ({
      id: p.id, stem: p.stem, type: p.type, options: p.options || [], score: p.score || 1,
    }));
  }
  return safe;
}

export function gradeQuestionResponse(qRow, studentAns) {
  const ans = JSON.parse(qRow.answer_json || '{}');
  const maxScore = Number(qRow.score || 1);
  const emptyAns = studentAns == null || studentAns === '' || (Array.isArray(studentAns) && !studentAns.length);
  if (emptyAns) return { status: 'blank', is_correct: null, score: 0, max_score: maxScore };

  if (qRow.type === 'descriptive') {
    return { status: 'pending_review', is_correct: null, score: 0, max_score: maxScore };
  }
  if (qRow.type === 'single_choice') {
    const ok = String(studentAns) === String((ans.correct_option_ids || [])[0] ?? '');
    return { status: ok ? 'correct' : 'wrong', is_correct: ok, score: ok ? maxScore : 0, max_score: maxScore };
  }
  if (qRow.type === 'multiple_choice') {
    const given = new Set((Array.isArray(studentAns) ? studentAns : [studentAns]).map(String));
    const corr = new Set((ans.correct_option_ids || []).map(String));
    const ok = given.size === corr.size && [...corr].every((x) => given.has(x));
    return { status: ok ? 'correct' : 'wrong', is_correct: ok, score: ok ? maxScore : 0, max_score: maxScore };
  }
  if (qRow.type === 'true_false') {
    const val = typeof studentAns === 'boolean' ? studentAns : studentAns === 'true';
    const ok = val === Boolean(ans.value);
    return { status: ok ? 'correct' : 'wrong', is_correct: ok, score: ok ? maxScore : 0, max_score: maxScore };
  }
  if (qRow.type === 'numeric') {
    const given = Number(normalizeText(studentAns));
    const tol = Number(ans.tolerance || 0);
    const ok = Number.isFinite(given) && Math.abs(given - Number(ans.value)) <= tol;
    return { status: ok ? 'correct' : 'wrong', is_correct: ok, score: ok ? maxScore : 0, max_score: maxScore };
  }
  if (qRow.type === 'fill_blank' || qRow.type === 'short_answer') {
    const normGiven = normalizeText(studentAns);
    const accepted = (ans.accepted || []).map(normalizeText).filter(Boolean);
    const ok = accepted.includes(normGiven);
    return { status: ok ? 'correct' : 'wrong', is_correct: ok, score: ok ? maxScore : 0, max_score: maxScore };
  }
  if (qRow.type === 'matching') {
    const pairs = ans.pairs || [];
    const given = studentAns && typeof studentAns === 'object' ? studentAns : {};
    const ok = pairs.length > 0 && pairs.every((p) => String(given[p.left_id] || '') === String(p.right_id));
    return { status: ok ? 'correct' : 'wrong', is_correct: ok, score: ok ? maxScore : 0, max_score: maxScore };
  }
  if (qRow.type === 'ordering') {
    const corr = ans.correct_order || [];
    const given = Array.isArray(studentAns) ? studentAns.map(String) : [];
    const ok = corr.length > 0 && corr.length === given.length && corr.every((v, i) => String(v) === given[i]);
    return { status: ok ? 'correct' : 'wrong', is_correct: ok, score: ok ? maxScore : 0, max_score: maxScore };
  }
  if (qRow.type === 'hotspot') {
    const gx = Number(studentAns?.x), gy = Number(studentAns?.y);
    const regions = ans.regions || [];
    const ok = Number.isFinite(gx) && Number.isFinite(gy) && regions.some((r) => Math.hypot(gx - r.x, gy - r.y) <= (r.r || 10));
    return { status: ok ? 'correct' : 'wrong', is_correct: ok, score: ok ? maxScore : 0, max_score: maxScore };
  }
  if (qRow.type === 'multipart') {
    const parts = ans.parts || [];
    const given = studentAns && typeof studentAns === 'object' ? studentAns : {};
    let partScore = 0, partMax = 0, hasPending = false;
    for (const p of parts) {
      const pMax = Number(p.score || 1);
      partMax += pMax;
      const res = gradeQuestionResponse({ type: p.type, score: pMax, answer_json: JSON.stringify(p.answer || {}) }, given[p.id]);
      if (res.status === 'pending_review') hasPending = true;
      partScore += res.score;
    }
    const scaled = partMax ? (partScore / partMax) * maxScore : 0;
    if (hasPending) return { status: 'pending_review', is_correct: null, score: scaled, max_score: maxScore };
    const ok = Math.abs(scaled - maxScore) < 0.01;
    return { status: ok ? 'correct' : 'wrong', is_correct: ok, score: scaled, max_score: maxScore };
  }
  return { status: 'pending_review', is_correct: null, score: 0, max_score: maxScore };
}

export function computePageMastery(attemptsCount, correctCount, uniqueQuestions) {
  if (!attemptsCount) return 'not_evaluated';
  if (uniqueQuestions < 3 || attemptsCount < 3) return 'learning';
  const ratio = correctCount / attemptsCount;
  if (ratio >= 0.85) return 'excellent';
  if (ratio >= 0.7) return 'good';
  if (ratio >= 0.45) return 'learning';
  return 'needs_practice';
}

export function updateStudentPagePerformance(studentId, bookId, editionId, pageNumber, isCorrect) {
  if (!studentId || !bookId || !editionId || !pageNumber || isCorrect == null) return;
  const uniqueQ = get(
    `SELECT COUNT(DISTINCT quh.question_id) c FROM question_usage_history quh
     JOIN questions q ON q.id=quh.question_id
     WHERE quh.student_id=? AND q.edition_id=? AND q.primary_page=? AND quh.is_correct IS NOT NULL`,
    studentId, editionId, pageNumber
  )?.c || 1;
  const existing = get('SELECT * FROM student_page_performance WHERE student_id=? AND edition_id=? AND page_number=?', studentId, editionId, pageNumber);
  const attempts = (existing?.attempts_count || 0) + 1;
  const corrects = (existing?.correct_count || 0) + (isCorrect ? 1 : 0);
  const uniq = Math.max(uniqueQ, existing?.unique_questions || 0);
  const mastery = computePageMastery(attempts, corrects, uniq);
  if (existing) {
    run(`UPDATE student_page_performance SET attempts_count=?, correct_count=?, unique_questions=?, mastery_status=?, updated_at=datetime('now') WHERE id=?`,
      attempts, corrects, uniq, mastery, existing.id);
  } else {
    run(`INSERT INTO student_page_performance (student_id, book_id, edition_id, page_number, attempts_count, correct_count, unique_questions, mastery_status)
         VALUES (?,?,?,?,?,?,?,?)`, studentId, bookId, editionId, pageNumber, attempts, corrects, uniq, mastery);
  }
}
