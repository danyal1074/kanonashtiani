// باید اولین import باشد: اندازه استخر نخ‌های libuv (هش رمز، فشرده‌سازی، خواندن فایل) پیش از اولین استفاده تنظیم می‌شود.
process.env.UV_THREADPOOL_SIZE ||= String(Math.max(6, Math.min(16, (globalThis.navigator?.hardwareConcurrency || 4) * 2)));
