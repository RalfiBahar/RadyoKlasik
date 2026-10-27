#!/usr/bin/env node
// Move the recordings archive to Cloudflare R2 (infra/R2_RECORDINGS_PLAN.md).
// Needs the R2_* settings in .env. Run from infra/:
//
//   docker compose run --rm api node scripts/recordingsToR2.js --dry-run
//   docker compose run --rm api node scripts/recordingsToR2.js            # upload + verify
//   docker compose run --rm api node scripts/recordingsToR2.js --verify   # re-check all in R2
//   docker compose run --rm api node scripts/recordingsToR2.js --prune-local --older-than 7 [--dry-run]
//   docker compose run --rm api node scripts/recordingsToR2.js --back-to-local   # full rollback
//
// Safe to re-run and to interrupt: a row only becomes "r2" after its upload
// is verified (size + SHA-256). Nothing local is deleted except by
// --prune-local, which re-verifies each file first.
const objectStorage = require("../services/objectStorage");
const storage = require("../services/recordingStorage");

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
const dryRun = has("--dry-run");
const concurrency = Math.max(1, Number(val("--concurrency", 4)));

async function pool(items, fn) {
  const out = [];
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return out;
}

const mb = (bytes) => Math.round((bytes / (1024 * 1024)) * 10) / 10;

async function migrate(Recording) {
  const { Op } = require("sequelize");
  const rows = await Recording.findAll({ where: { storage: { [Op.ne]: "r2" } }, order: [["date", "ASC"]] });
  const fs = require("fs");
  const withFile = rows.filter((r) => storage.hasLocal(r));
  const missing = rows.filter((r) => !storage.hasLocal(r)).map((r) => r.filename);
  const bytes = withFile.reduce((n, r) => n + fs.statSync(storage.localPath(r)).size, 0);
  const report = { toUpload: withFile.length, totalMb: mb(bytes), missingOnDisk: missing.length, missingExamples: missing.slice(0, 10) };
  if (dryRun) return { dryRun: true, ...report };

  let done = 0;
  const results = await pool(withFile, async (rec) => {
    const r = await storage.push(rec);
    done += 1;
    console.error(`[${done}/${withFile.length}] ${r.ok ? "ok  " : "FAIL"} ${rec.filename}${r.ok ? "" : ` — ${r.error}`}`);
    return { filename: rec.filename, ...r };
  });
  const failed = results.filter((r) => !r.ok);
  return { ...report, uploaded: results.length - failed.length, failed: failed.length, failures: failed.slice(0, 20) };
}

async function verifyAll(Recording) {
  const rows = await Recording.findAll({ where: { storage: "r2" } });
  const problems = [];
  await pool(rows, async (rec) => {
    const h = await objectStorage.head(storage.key(rec));
    if (!h.exists) return problems.push({ filename: rec.filename, reason: "missing in bucket" });
    if (storage.hasLocal(rec)) {
      const v = await objectStorage.verify(storage.localPath(rec), storage.key(rec));
      if (!v.ok) problems.push({ filename: rec.filename, reason: v.reason });
    } else if (!h.sha256) {
      problems.push({ filename: rec.filename, reason: "no checksum stored" });
    }
  });
  // A mismatch with the file still on disk goes back to "pending" (re-upload).
  let requeued = 0;
  if (!dryRun) {
    for (const p of problems) {
      const rec = rows.find((r) => r.filename === p.filename);
      if (storage.hasLocal(rec)) {
        await rec.update({ storage: "pending", storageError: p.reason });
        requeued += 1;
      }
    }
  }
  return { checked: rows.length, mismatches: problems.length, requeued, problems: problems.slice(0, 20) };
}

async function backToLocal(Recording) {
  const { Op } = require("sequelize");
  const rows = await Recording.findAll({ where: { storage: { [Op.ne]: "local" } } });
  const report = { rows: rows.length, downloaded: 0, failed: [] };
  if (dryRun) {
    report.needDownload = rows.filter((r) => !storage.hasLocal(r)).length;
    return { dryRun: true, ...report };
  }
  await pool(rows, async (rec) => {
    try {
      if (!storage.hasLocal(rec)) {
        await objectStorage.download(storage.key(rec), storage.localPath(rec));
        report.downloaded += 1;
      }
      await rec.update({ storage: "local", storedAt: null, storageError: null });
    } catch (err) {
      report.failed.push({ filename: rec.filename, error: String(err.message || err) });
    }
  });
  return report;
}

(async () => {
  if (!objectStorage.isConfigured()) {
    console.error("R2 is not configured: set R2_ACCOUNT_ID (or R2_ENDPOINT), R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY");
    process.exit(1);
  }
  const { sequelize, Recording } = require("../models");
  const { runMigrations } = require("../config/migrate");
  await runMigrations();

  let report;
  if (has("--verify")) report = await verifyAll(Recording);
  else if (has("--prune-local")) report = await storage.pruneLocal({ days: Number(val("--older-than", 7)), dryRun });
  else if (has("--back-to-local")) report = await backToLocal(Recording);
  else report = await migrate(Recording);

  console.log(JSON.stringify({ bucket: objectStorage.config().bucket, ...report }, null, 2));
  await sequelize.close();
  const bad = report.failed && (Array.isArray(report.failed) ? report.failed.length : report.failed);
  process.exit(bad || report.mismatches ? 2 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
