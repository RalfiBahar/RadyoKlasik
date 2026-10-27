const fs = require("fs");
const path = require("path");
const objectStorage = require("./objectStorage");
const { RECORDINGS_DIR } = require("../config/appData");
const logger = require("../logger");

// Where recorded programmes live (infra/R2_RECORDINGS_PLAN.md).
//
// Each Recording row carries `storage`:
//   local   — only on the server disk (today's behaviour)
//   pending — on disk, waiting to (re)upload; served from disk meanwhile
//   r2      — in Cloudflare R2 and verified; listeners are redirected there.
//             A local copy may still exist during the grace period.
//
// RECORDINGS_STORAGE=r2 makes new recordings upload automatically. With it
// unset/"local", nothing is uploaded, but rows already in R2 keep playing
// from R2 as long as the R2 credentials are configured.

const GRACE_DAYS = () => Number(process.env.RECORDINGS_LOCAL_GRACE_DAYS || 7);

function mode() {
  return process.env.RECORDINGS_STORAGE === "r2" ? "r2" : "local";
}

function uploadsEnabled() {
  return mode() === "r2" && objectStorage.isConfigured();
}

function key(rec) {
  return `recordings/${rec.filename}`;
}

function localPath(rec) {
  return path.join(RECORDINGS_DIR, rec.filename);
}

function hasLocal(rec) {
  return fs.existsSync(localPath(rec));
}

// How to deliver a recording: { redirect: url } | { file: path } | { missing: true }.
async function resolvePlayback(rec) {
  const configured = objectStorage.isConfigured();
  if (rec.storage === "r2" && configured) return { redirect: await objectStorage.publicUrl(key(rec)) };
  if (hasLocal(rec)) return { file: localPath(rec) };
  // Flag says local but the file is gone: use the bucket copy if there is one.
  if (configured) {
    try {
      if ((await objectStorage.head(key(rec))).exists) {
        return { redirect: await objectStorage.publicUrl(key(rec)) };
      }
    } catch (err) {
      logger.warn("recording head failed", { filename: rec.filename, error: String(err) });
    }
  }
  return { missing: true };
}

// Upload the local file, verify it, then flip the row to "r2". Never throws:
// a failure leaves the row "pending" (still served from disk) with the error.
async function push(rec) {
  if (!objectStorage.isConfigured()) return { ok: false, error: "R2 is not configured" };
  if (!hasLocal(rec)) {
    const error = "local file missing";
    await rec.update({ storageError: error });
    return { ok: false, error };
  }
  try {
    const up = await objectStorage.upload(localPath(rec), key(rec), {
      contentType: "audio/mpeg",
      cacheControl: "public, max-age=31536000",
    });
    const v = await objectStorage.verify(localPath(rec), key(rec), up.sha256);
    if (!v.ok) throw new Error(`verification failed: ${v.reason}`);
    await rec.update({ storage: "r2", storedAt: new Date(), storageError: null });
    logger.info("recording stored in R2", { filename: rec.filename, size: v.size });
    return { ok: true, size: v.size };
  } catch (err) {
    const error = String(err.message || err);
    // A bulk-migration attempt on a "local" row stays local; anything that
    // was (or was meant to be) in R2 waits as "pending" for the retry job.
    await rec.update({ storage: rec.storage === "local" ? "local" : "pending", storageError: error });
    logger.error("recording upload failed", { filename: rec.filename, error });
    return { ok: false, error };
  }
}

// A brand-new recording: upload in the background when enabled.
async function afterRecorded(rec) {
  if (!uploadsEnabled()) return { ok: false, skipped: true };
  await rec.update({ storage: "pending", storageError: null });
  return push(rec);
}

// The local file was changed (re-tagged or replaced). If the recording is in
// R2, the bucket copy is now stale: serve from disk until it's re-uploaded.
async function afterLocalChange(rec) {
  if (rec.storage === "local") return { ok: true, skipped: true };
  await rec.update({ storage: "pending" });
  return push(rec);
}

// Make sure there's a local copy to edit (downloads it from R2 if needed).
async function ensureLocal(rec) {
  if (hasLocal(rec)) return localPath(rec);
  if (rec.storage === "r2" && objectStorage.isConfigured()) {
    fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
    return objectStorage.download(key(rec), localPath(rec));
  }
  return null;
}

// Delete both copies (the bucket copy goes to trash/ for 30 days).
async function removeFiles(rec) {
  if (hasLocal(rec)) fs.unlinkSync(localPath(rec));
  if (rec.storage !== "local" && objectStorage.isConfigured()) {
    try {
      await objectStorage.trash(key(rec));
    } catch (err) {
      logger.error("recording trash failed", { filename: rec.filename, error: String(err) });
    }
  }
}

// Re-try uploads that failed (hourly job).
async function retryPending() {
  if (!objectStorage.isConfigured()) return [];
  const { Recording } = require("../models");
  const rows = await Recording.findAll({ where: { storage: "pending" } });
  const out = [];
  for (const rec of rows) out.push({ filename: rec.filename, ...(await push(rec)) });
  return out;
}

// Delete local copies of recordings verified in R2 more than `days` ago.
// Re-checks the bucket first; anything that doesn't match stays (and goes
// back to "pending" so it's re-uploaded).
async function pruneLocal({ days = GRACE_DAYS(), dryRun = false } = {}) {
  const { Recording } = require("../models");
  const { Op } = require("sequelize");
  const cutoff = new Date(Date.now() - days * 86400000);
  const rows = await Recording.findAll({ where: { storage: "r2", storedAt: { [Op.lt]: cutoff } } });
  const report = { checked: 0, pruned: 0, freedMb: 0, kept: [] };
  for (const rec of rows) {
    if (!hasLocal(rec)) continue;
    report.checked += 1;
    const v = await objectStorage.verify(localPath(rec), key(rec));
    if (!v.ok) {
      report.kept.push({ filename: rec.filename, reason: v.reason });
      if (!dryRun) await rec.update({ storage: "pending", storageError: v.reason });
      continue;
    }
    report.pruned += 1;
    report.freedMb += v.size / (1024 * 1024);
    if (!dryRun) fs.unlinkSync(localPath(rec));
  }
  report.freedMb = Math.round(report.freedMb);
  return report;
}

// Counts for the panel / monitoring.
async function stats() {
  const { Recording } = require("../models");
  const rows = await Recording.findAll({ attributes: ["storage", "storageError"] });
  const counts = { local: 0, pending: 0, r2: 0 };
  let failed = 0;
  for (const r of rows) {
    counts[r.storage] = (counts[r.storage] || 0) + 1;
    if (r.storage === "pending" && r.storageError) failed += 1;
  }
  return { mode: mode(), configured: objectStorage.isConfigured(), counts, failed };
}

// Background jobs: hourly retry; daily prune when RECORDINGS_PRUNE_LOCAL=true.
let timers = [];
function start() {
  if (timers.length) return;
  const every = (ms, fn) => {
    const t = setInterval(() => fn().catch((err) => logger.warn("recording storage job failed", { error: String(err) })), ms);
    if (t.unref) t.unref();
    timers.push(t);
  };
  every(3600 * 1000, retryPending);
  every(24 * 3600 * 1000, async () => {
    if (process.env.RECORDINGS_PRUNE_LOCAL === "true") {
      logger.info("pruned local recordings", await pruneLocal());
    }
  });
}

function stop() {
  timers.forEach(clearInterval);
  timers = [];
}

module.exports = {
  mode,
  uploadsEnabled,
  key,
  localPath,
  hasLocal,
  resolvePlayback,
  push,
  afterRecorded,
  afterLocalChange,
  ensureLocal,
  removeFiles,
  retryPending,
  pruneLocal,
  stats,
  start,
  stop,
};
