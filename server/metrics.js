// شمارنده‌ها و اندازه‌گیری تأخیر حلقه رویداد برای پایش سلامت سرور
import { monitorEventLoopDelay } from 'node:perf_hooks';

const loop = monitorEventLoopDelay({ resolution: 10 });
loop.enable();

export const metrics = { started: Date.now(), requests: 0, errors5xx: 0, rateLimited: 0, slow: 0, inflight: 0, peakInflight: 0 };

export function snapshot({ reset = false } = {}) {
  const ms = (ns) => Math.round(ns / 1e4) / 100;
  const mem = process.memoryUsage();
  const out = {
    uptime_s: Math.round((Date.now() - metrics.started) / 1000),
    requests: metrics.requests, errors_5xx: metrics.errors5xx, rate_limited: metrics.rateLimited, slow_requests: metrics.slow,
    inflight: metrics.inflight, peak_inflight: metrics.peakInflight,
    event_loop_ms: { mean: ms(loop.mean), p99: ms(loop.percentile(99)), max: ms(loop.max) },
    rss_mb: Math.round(mem.rss / 1048576), heap_mb: Math.round(mem.heapUsed / 1048576),
  };
  if (reset) { loop.reset(); metrics.peakInflight = metrics.inflight; }
  return out;
}
