#!/usr/bin/env node
// Listener load test (Phase 9). Opens N concurrent stream connections for T
// seconds and checks every listener receives audio at (at least) real-time
// speed. No dependencies — run with any Node 18+:
//
//   node listeners.js <url> [listeners=200] [seconds=60] [kbps=128]
//
// From inside the compose network (bypasses Caddy/TLS):
//   docker compose run --rm -v "$PWD/loadtest:/lt:ro" --entrypoint node api \
//     /lt/listeners.js http://icecast:8000/stream 300 60
const http = require("http");
const https = require("https");

const [url, n = "200", secs = "60", kbps = "128"] = process.argv.slice(2);
if (!url) {
  console.error("usage: node listeners.js <url> [listeners] [seconds] [kbps]");
  process.exit(1);
}
const N = Number(n);
const T = Number(secs) * 1000;
const lib = url.startsWith("https") ? https : http;
const agent = new lib.Agent({ keepAlive: false, maxSockets: Infinity });
const expectedBytes = (Number(kbps) * 1000 / 8) * (T / 1000);

const results = [];
function listen(i) {
  return new Promise((resolve) => {
    const r = { i, bytes: 0, status: 0, error: null, firstByteMs: null };
    const start = Date.now();
    const req = lib.get(url, { agent, headers: { "User-Agent": `rk-loadtest/${i}` } }, (res) => {
      r.status = res.statusCode;
      res.on("data", (d) => {
        if (r.firstByteMs == null) r.firstByteMs = Date.now() - start;
        r.bytes += d.length;
      });
      // Our own req.destroy() at the end raises "aborted" — not a failure.
      res.on("error", (e) => {
        if (!r.done) r.error = String(e);
      });
    });
    req.on("error", (e) => {
      if (!r.done) r.error = String(e);
      resolve(r);
    });
    setTimeout(() => {
      r.done = true;
      req.destroy();
      resolve(r);
    }, T);
  });
}

(async () => {
  console.log(`Opening ${N} listeners on ${url} for ${T / 1000}s ...`);
  // Ramp up over ~5 s like real traffic instead of a single burst.
  const jobs = [];
  for (let i = 0; i < N; i++) {
    jobs.push(new Promise((r) => setTimeout(() => listen(i).then(r), (i * 5000) / N)));
  }
  results.push(...(await Promise.all(jobs)));

  const ok = results.filter((r) => r.status === 200 && !r.error);
  // Ramp-up delay means later listeners had up to 5 s less time.
  const healthy = ok.filter((r) => r.bytes >= expectedBytes * 0.85 - (Number(kbps) * 1000 / 8) * 5);
  const ttfb = ok.map((r) => r.firstByteMs).filter((x) => x != null).sort((a, b) => a - b);
  const pct = (p) => ttfb[Math.min(ttfb.length - 1, Math.floor(p * ttfb.length))];
  const mbps = results.reduce((s, r) => s + r.bytes, 0) * 8 / (T / 1000) / 1e6;
  console.log(JSON.stringify({
    listeners: N,
    connected: ok.length,
    failed: N - ok.length,
    realTimeOrBetter: healthy.length,
    ttfbMs: { p50: pct(0.5), p95: pct(0.95), max: ttfb[ttfb.length - 1] },
    aggregateMbps: Math.round(mbps * 10) / 10,
    errors: [...new Set(results.filter((r) => r.error).map((r) => r.error))].slice(0, 3),
  }, null, 2));
  process.exit(healthy.length === N ? 0 : 2);
})();
