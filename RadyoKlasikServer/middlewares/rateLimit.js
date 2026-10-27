// Phase 9 — small in-memory fixed-window rate limiter (single API instance,
// so no shared store needed). Keyed by client IP; behind Caddy `trust proxy`
// makes req.ip the listener's address rather than Caddy's.
function rateLimit({ windowMs, max, name = "rate", message = "Too many requests, try again later." }) {
  const hits = new Map(); // ip -> { count, reset }
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, windowMs);
  if (sweep.unref) sweep.unref();

  return (req, res, next) => {
    if (process.env.RATE_LIMIT_DISABLED === "true") return next();
    const now = Date.now();
    const key = req.ip || "unknown";
    let h = hits.get(key);
    if (!h || h.reset <= now) {
      h = { count: 0, reset: now + windowMs };
      hits.set(key, h);
    }
    h.count += 1;
    res.setHeader("RateLimit-Limit", max);
    res.setHeader("RateLimit-Remaining", Math.max(0, max - h.count));
    if (h.count > max) {
      res.setHeader("Retry-After", Math.ceil((h.reset - now) / 1000));
      return res.status(429).json({ error: message, limit: name });
    }
    return next();
  };
}

// Login attempts: 10 per 15 minutes per IP.
const loginLimiter = rateLimit({
  name: "login",
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.LOGIN_RATE_MAX || 10),
  message: "Too many login attempts. Wait 15 minutes and try again.",
});

// Public listener chat: 20 messages per minute per IP.
const chatLimiter = rateLimit({ name: "chat", windowMs: 60 * 1000, max: 20 });

module.exports = { rateLimit, loginLimiter, chatLimiter };
