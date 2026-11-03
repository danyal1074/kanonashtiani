// استخراج و تفکیک خودکار کارنامه آزمون برپا با PyMuPDF
import { execFile } from 'node:child_process';

const pyBin = process.platform === 'win32' ? 'python' : 'python3';

export function parseBarpaPdfFile(scriptPath, pdfPath) {
  return new Promise((resolve, reject) => {
    execFile(pyBin, [scriptPath, pdfPath, '--json-stdout'], { maxBuffer: 25 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      const sIdx = stdout.indexOf('___JSON_START___');
      const eIdx = stdout.indexOf('___JSON_END___');
      if (sIdx === -1 || eIdx === -1) return reject(new Error('قالب خروجی آزمون معتبر نیست'));
      try {
        const jsonStr = stdout.substring(sIdx + '___JSON_START___'.length, eIdx);
        resolve(JSON.parse(jsonStr));
      } catch (e) {
        reject(e);
      }
    });
  });
}
