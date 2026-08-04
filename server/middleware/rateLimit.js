// Simple in-memory rate limiter for public endpoints.
// Suitable for a single-process deployment; swap for redis-backed
// limiting if the app is ever scaled horizontally.

const buckets = new Map();

// Each rateLimit() call gets its own namespace. Keying on req.baseUrl instead
// would make two limiters mounted on the same router share one bucket while
// comparing it against different maxes — e.g. the 60/min availability check and
// the 5/hour inquiry POST both key on '/api/inquire', so page loads would burn
// the submission budget and 429 the first real inquiry.
let limiterCount = 0;

function rateLimit({ windowMs = 60000, max = 10, name } = {}) {
  const namespace = name || `rl${++limiterCount}`;
  return (req, res, next) => {
    // req.ip respects the `trust proxy` setting, so it resolves to the real
    // client rather than whatever a caller puts in X-Forwarded-For. Keying on
    // the raw header makes the limit bypassable by rotating a spoofed value.
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = ip + ':' + namespace;
    const now = Date.now();
    let bucket = buckets.get(key);

    if (!bucket || now - bucket.start > windowMs) {
      bucket = { start: now, count: 0 };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    if (bucket.count > max) {
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    next();
  };
}

// Periodically clear stale buckets so the map doesn't grow unbounded
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.start > 300000) buckets.delete(key);
  }
}, 300000).unref();

module.exports = rateLimit;
