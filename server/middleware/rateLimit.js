// Simple in-memory rate limiter for public endpoints.
// Suitable for a single-process deployment; swap for redis-backed
// limiting if the app is ever scaled horizontally.

const buckets = new Map();

function rateLimit({ windowMs = 60000, max = 10 } = {}) {
  return (req, res, next) => {
    const key = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown') + ':' + req.baseUrl;
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
