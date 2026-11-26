import fs from 'node:fs';
import { buildXlsx, XLSX_COLUMNS } from '../server/qb-xlsx.js';
import { writeZip } from '../server/qb-zip.js';

const rows = [
  XLSX_COLUMNS,
  ['XLS-Q001', 4, 'MATH-04', '1405', 1, 'الگوهای عددی', 4, '4', 'الگو', 'single_choice', 2, 'عدد بعدی الگوی ۵، ۱۰، ۱۵، ۲۰ کدام است؟', '۲۲', '۲۴', '۲۵', '۳۰', 'c', 'هر مرحله ۵ واحد اضافه می‌شود.', 1, 45, 'الگو|ریاضی'],
  ['XLS-Q002', 4, 'MATH-04', '1405', 1, 'اعداد', 6, '6', 'ارزش مکانی', 'numeric', 2, 'بزرگ‌ترین عدد سه‌رقمی زوج چند است؟', '', '', '', '', '998', 'بزرگ‌ترین عدد سه‌رقمی ۹۹۹ است و زوج قبل از آن ۹۹۸ است.', 1, 60, 'اعداد'],
];
fs.writeFileSync('templates/question-bank-template.xlsx', buildXlsx(rows));

const tmpl = JSON.parse(fs.readFileSync('templates/question-bank-template.json', 'utf8'));
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 120"><rect x="20" y="20" width="180" height="80" fill="#eef7f7" stroke="#0b6b70" stroke-width="3"/><text x="110" y="65" text-anchor="middle" font-size="16" fill="#0f1b2d">6 x 4</text></svg>';
const pkgQuestions = [
  ...tmpl.questions,
  {
    external_id: 'TMPL-Q004',
    type: 'single_choice',
    chapter: 4,
    source: { primary_page: 78, pages: [78] },
    topic: 'مساحت مستطیل',
    difficulty: 2,
    stem: 'مساحت مستطیل نشان‌داده‌شده در شکل چند واحد مربع است؟',
    content_flags: { has_image: true, is_geometric: true },
    assets: [{ path: 'assets/diagram-001.svg', role: 'question_image', alt: 'مستطیل ۶ در ۴' }],
    options: [
      { id: 'a', text: '۱۰' },
      { id: 'b', text: '۲۰' },
      { id: 'c', text: '۲۴' },
      { id: 'd', text: '۲۸' },
    ],
    answer: { correct_option_ids: ['c'] },
    explanation: 'مساحت مستطیل برابر طول ضربدر عرض است: ۶ × ۴ = ۲۴.',
    score: 1,
    estimated_time_seconds: 50,
    tags: ['هندسه', 'مساحت'],
  },
];
tmpl.manifest.question_count = pkgQuestions.length;
const zipBuf = writeZip([
  ['manifest.json', JSON.stringify(tmpl.manifest, null, 2)],
  ['questions.json', JSON.stringify(pkgQuestions, null, 2)],
  ['assets/diagram-001.svg', svg],
]);
fs.writeFileSync('templates/question-package-example.zip', zipBuf);
console.log('Templates generated:', fs.statSync('templates/question-bank-template.xlsx').size, fs.statSync('templates/question-package-example.zip').size);
