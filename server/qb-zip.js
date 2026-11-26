// پردازشگر خالص ZIP (خواندن و ساختن) بدون وابستگی خارجی با محافظت کامل در برابر Zip Slip و Zip Bomb
import zlib from 'node:zlib';
import path from 'node:path';

const MAX_ENTRIES = 2000;
const MAX_TOTAL_UNCOMPRESSED = 50 * 1024 * 1024; // 50 MB
const MAX_ENTRY_BYTES = 5 * 1024 * 1024; // 5 MB

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function sanitizeZipPath(name) {
  const clean = String(name || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!clean || clean.includes('\0')) return null;
  const parts = clean.split('/').filter(Boolean);
  if (!parts.length || parts.some((p) => p === '.' || p === '..' || p.includes(':'))) return null;
  return parts.join('/');
}

export function sanitizeSvg(svgText) {
  let s = String(svgText || '');
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
  s = s.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '');
  s = s.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  s = s.replace(/(href|xlink:href|src)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*')/gi, '$1="#"');
  return s;
}

export function readZip(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (buf.length < 22) throw new Error('فایل ZIP نامعتبر یا ناقص است');
  // جستجوی End of Central Directory
  let eocd = -1;
  const minOff = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= minOff; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ساختار مرکزی فایل ZIP یافت نشد');

  const totalEntries = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (totalEntries > MAX_ENTRIES) throw new Error(`تعداد فایل‌های داخل ZIP بیش از حد مجاز (${MAX_ENTRIES}) است`);

  const files = new Map();
  let off = cdOffset;
  let totalUncompressed = 0;

  for (let i = 0; i < totalEntries; i++) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== 0x02014b50) {
      throw new Error('فهرست مرکزی فایل ZIP آسیب دیده است');
    }
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const uncompSize = buf.readUInt32LE(off + 24);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const rawName = buf.subarray(off + 46, off + 46 + nameLen).toString('utf8');
    off += 46 + nameLen + extraLen + commentLen;

    if (rawName.endsWith('/')) continue; // پوشه
    const safeName = sanitizeZipPath(rawName);
    if (!safeName) throw new Error(`مسیر غیرمجاز در ZIP (Zip Slip): ${rawName}`);
    if (uncompSize > MAX_ENTRY_BYTES) throw new Error(`حجم فایل ${safeName} از ۵ مگابایت بیشتر است`);
    totalUncompressed += uncompSize;
    if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED) throw new Error('حجم کل فایل‌های استخراج‌شده از سقف مجاز ۵۰ مگابایت بیشتر است');

    if (localOff + 30 > buf.length || buf.readUInt32LE(localOff) !== 0x04034b50) {
      throw new Error(`هدر محلی فایل ${safeName} نامعتبر است`);
    }
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const compSlice = buf.subarray(dataStart, dataStart + compSize);

    let data;
    if (method === 0) {
      data = Buffer.from(compSlice);
    } else if (method === 8) {
      data = zlib.inflateRawSync(compSlice, { maxOutputLength: MAX_ENTRY_BYTES + 1024 });
    } else {
      throw new Error(`روش فشرده‌سازی پشتیبانی‌نشده (${method}) برای ${safeName}`);
    }
    if (data.length > MAX_ENTRY_BYTES) throw new Error(`حجم واقعی فایل ${safeName} از ۵ مگابایت بیشتر است`);
    files.set(safeName, data);
  }
  return files;
}

export function writeZip(entries) {
  // entries: Array<[name, Buffer | string]>
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const [rawName, rawData] of entries) {
    const name = sanitizeZipPath(rawName);
    if (!name) throw new Error(`نام نامعتبر در ZIP: ${rawName}`);
    const nameBuf = Buffer.from(name, 'utf8');
    const data = Buffer.isBuffer(rawData) ? rawData : Buffer.from(String(rawData), 'utf8');
    const crc = crc32(data);
    const comp = zlib.deflateRawSync(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    localChunks.push(local, nameBuf, comp);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(comp.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    centralChunks.push(cd, nameBuf);

    offset += 30 + nameBuf.length + comp.length;
  }

  const cdBuf = Buffer.concat(centralChunks);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localChunks, cdBuf, eocd]);
}

export const ALLOWED_ASSET_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg']);
export function isAllowedAsset(filePath) {
  return ALLOWED_ASSET_EXTS.has(path.extname(String(filePath || '')).toLowerCase());
}
