// Per-instance limiter: update checks do not read or write the journal database.
const windows = new Map<string, { until: number; count: number }>();
export class UpdateRateLimited extends Error {
  constructor(public readonly retryAfter: number) {
    super("rateLimited");
  }
}
export function limitUpdates(id: string, write: boolean, now = Date.now()) {
  const key = (write ? "write:" : "read:") + id;
  if (windows.size >= 1000)
    for (const [key, value] of windows)
      if (value.until <= now) windows.delete(key);
  if (windows.size >= 1000 && !windows.has(key))
    throw new UpdateRateLimited(60);
  let window = windows.get(key);
  if (!window || window.until <= now) {
    window = { until: now + 60000, count: 0 };
    windows.set(key, window);
  }
  if (++window.count > (write ? 2 : 12))
    throw new UpdateRateLimited(
      Math.max(1, Math.ceil((window.until - now) / 1000)),
    );
}
