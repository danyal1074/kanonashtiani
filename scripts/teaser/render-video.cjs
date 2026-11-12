// رندر صفحه‌ی تیزر به ویدیوی MP4 (اندازه‌ی بوم صفحه، ۳۰ فریم) همراه با موسیقی.
// پیش‌نیاز: playwright + ffmpeg، و یک سرور ایستا روی پوشه public:
//   python3 -m http.server 8765 -d public &
//   node scripts/teaser/render-video.cjs http://localhost:8765/teaser.html public/teaser/teaser.mp4
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const [url = 'http://localhost:8765/teaser.html', out = 'public/teaser/teaser.mp4', audioArg] = process.argv.slice(2);
const FPS = 30;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1920 } });
  await page.goto(url + (url.includes('?') ? '&' : '?') + 'render');
  await page.waitForFunction(() => window.teaserReady && window.renderAt);
  await page.evaluate(() => window.teaserReady);
  const dur = await page.evaluate(() => window.TEASER_DURATION);
  const music = audioArg || path.join(path.dirname(out), 'teaser-music.mp3');
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-i', music, '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    '-c:a', 'aac', '-b:a', '192k', '-shortest', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const total = Math.round(dur * FPS);
  for (let i = 0; i < total; i++) {
    const d = await page.evaluate(t => window.renderAt(t), i / FPS);
    if (!ff.stdin.write(Buffer.from(d.split(',')[1], 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 150 === 0) process.stdout.write(`frame ${i}/${total}\n`);
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r)); await browser.close();
  console.log('wrote', out);
})();
