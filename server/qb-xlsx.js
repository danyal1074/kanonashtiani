// خواندن و ساختن فایل Excel (.xlsx) خالص بدون وابستگی npm، بر پایه qb-zip.js
import { readZip, writeZip } from './qb-zip.js';

export const XLSX_COLUMNS = [
  'external_id', 'grade', 'book_code', 'edition', 'chapter', 'lesson',
  'primary_page', 'source_pages', 'topic', 'type', 'difficulty', 'question',
  'option_1', 'option_2', 'option_3', 'option_4', 'correct_answer',
  'explanation', 'score', 'estimated_time_seconds', 'tags',
];

function xmlEsc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function xmlUnesc(s) {
  return String(s || '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function colName(idx) {
  let s = '', n = idx + 1;
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function colIndex(ref) {
  const letters = String(ref || '').replace(/[^A-Z]/gi, '').toUpperCase();
  let n = 0;
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return Math.max(0, n - 1);
}

export function buildXlsx(rows) {
  // rows: Array<Array<string|number>>
  const sheetRows = rows.map((r, rIdx) => {
    const cells = r.map((val, cIdx) => {
      const ref = `${colName(cIdx)}${rIdx + 1}`;
      if (typeof val === 'number' && Number.isFinite(val)) {
        return `<c r="${ref}"><v>${val}</v></c>`;
      }
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(val ?? '')}</t></is></c>`;
    }).join('');
    return `<row r="${rIdx + 1}">${cells}</row>`;
  }).join('');

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Questions" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

  const sheet1 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${sheetRows}</sheetData>
</worksheet>`;

  return writeZip([
    ['[Content_Types].xml', contentTypes],
    ['_rels/.rels', rootRels],
    ['xl/workbook.xml', workbook],
    ['xl/_rels/workbook.xml.rels', wbRels],
    ['xl/worksheets/sheet1.xml', sheet1],
  ]);
}

export function parseXlsx(buffer) {
  const files = readZip(buffer);
  const shared = [];
  if (files.has('xl/sharedStrings.xml')) {
    const sst = files.get('xl/sharedStrings.xml').toString('utf8');
    const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
    let m;
    while ((m = siRe.exec(sst))) {
      const parts = [];
      const tRe = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
      let tm;
      while ((tm = tRe.exec(m[1]))) parts.push(xmlUnesc(tm[1]));
      shared.push(parts.join(''));
    }
  }

  const sheetEntry = files.get('xl/worksheets/sheet1.xml')
    || [...files.entries()].find(([k]) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(k))?.[1];
  if (!sheetEntry) throw new Error('برگه اکسل (sheet1.xml) در فایل یافت نشد');

  const xml = sheetEntry.toString('utf8');
  const rows = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rm;
  while ((rm = rowRe.exec(xml))) {
    const row = [];
    const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
    let cm;
    while ((cm = cellRe.exec(rm[1]))) {
      const attrs = cm[1], body = cm[2];
      const refM = /\br="([A-Z]+\d+)"/i.exec(attrs);
      const tM = /\bt="([^"]+)"/i.exec(attrs);
      const type = tM ? tM[1] : '';
      const idx = refM ? colIndex(refM[1]) : row.length;
      let val = '';
      if (type === 'inlineStr') {
        const parts = [];
        const tRe = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
        let tm;
        while ((tm = tRe.exec(body))) parts.push(xmlUnesc(tm[1]));
        val = parts.join('');
      } else {
        const vM = /<v>([\s\S]*?)<\/v>/.exec(body);
        const raw = vM ? xmlUnesc(vM[1]) : '';
        val = type === 's' ? (shared[Number(raw)] ?? '') : raw;
      }
      row[idx] = val;
    }
    if (row.some((x) => String(x ?? '').trim() !== '')) rows.push(row);
  }
  return rows;
}
