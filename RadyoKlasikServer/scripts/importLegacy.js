#!/usr/bin/env node
// One-shot import of the pre-self-hosting backend's data (Phase 10 cutover).
//
// Copy the old RadyoKlasikServer folder (or just these parts of it) to the
// new server, e.g. infra/legacy/, then run from infra/:
//
//   docker compose run --rm -v "$PWD/legacy:/legacy:ro" api \
//     node scripts/importLegacy.js /legacy [--dry-run]
//
// Imports, never overwriting what's already there:
//   database.sqlite  -> Recordings + NotificationTokens rows (push tokens of
//                       existing app users) into Postgres
//   recordings/      -> past programme MP3s
//   public/static/assets/thumbnails/ -> recording artwork
//   chatHistory.json -> merged into the current chat (by message id)
//   announcement.txt -> copied if there is no current announcement
// Safe to re-run.
const fs = require("fs");
const path = require("path");
const initSqlJs = require("sql.js");
const {
  RECORDINGS_DIR,
  THUMBNAILS_DIR,
  CHAT_HISTORY_FILE,
  ANNOUNCEMENT_FILE,
  ensureAppData,
} = require("../config/appData");

const src = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!src || !fs.existsSync(src)) {
  console.error("usage: node scripts/importLegacy.js <old server folder> [--dry-run]");
  process.exit(1);
}

function rows(db, table) {
  const exists = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`);
  if (!exists.length) return [];
  const res = db.exec(`SELECT * FROM "${table}"`);
  if (!res.length) return [];
  const { columns, values } = res[0];
  return values.map((v) => Object.fromEntries(columns.map((c, i) => [c, v[i]])));
}

function copyDir(from, to, filter = () => true) {
  if (!fs.existsSync(from)) return { copied: 0, skipped: 0 };
  let copied = 0;
  let skipped = 0;
  for (const f of fs.readdirSync(from)) {
    const s = path.join(from, f);
    if (!fs.statSync(s).isFile() || !filter(f)) continue;
    const d = path.join(to, f);
    if (fs.existsSync(d)) {
      skipped += 1;
      continue;
    }
    if (!dryRun) fs.copyFileSync(s, d);
    copied += 1;
  }
  return { copied, skipped };
}

(async () => {
  const { sequelize, Recording, NotificationToken } = require("../models");
  const { runMigrations } = require("../config/migrate");
  await runMigrations();
  ensureAppData();
  const report = { dryRun };

  const dbFile = path.join(src, "database.sqlite");
  if (fs.existsSync(dbFile)) {
    const SQL = await initSqlJs();
    const db = new SQL.Database(fs.readFileSync(dbFile));
    const recs = rows(db, "Recordings").map((r) => ({
      ...r,
      // Artwork is always served from /static/assets/thumbnails/<file>.
      artwork: r.artwork ? `static/assets/thumbnails/${path.basename(r.artwork)}` : null,
    }));
    const tokens = rows(db, "NotificationTokens");
    report.recordingRows = recs.length;
    report.notificationTokens = tokens.length;
    if (!dryRun) {
      await Recording.bulkCreate(recs, { ignoreDuplicates: true });
      await NotificationToken.bulkCreate(tokens, { ignoreDuplicates: true });
    }
  } else {
    report.database = "not found (skipped)";
  }

  report.recordingFiles = copyDir(path.join(src, "recordings"), RECORDINGS_DIR, (f) => /\.mp3$/i.test(f) && !/temp/i.test(f));
  report.thumbnails = copyDir(path.join(src, "public", "static", "assets", "thumbnails"), THUMBNAILS_DIR);

  const chatFile = path.join(src, "chatHistory.json");
  if (fs.existsSync(chatFile)) {
    const old = JSON.parse(fs.readFileSync(chatFile, "utf8"));
    const cur = fs.existsSync(CHAT_HISTORY_FILE) ? JSON.parse(fs.readFileSync(CHAT_HISTORY_FILE, "utf8")) : [];
    const ids = new Set(cur.map((c) => c.id));
    const merged = [...old.filter((c) => !ids.has(c.id)), ...cur].sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
    );
    report.chatMessagesAdded = merged.length - cur.length;
    if (!dryRun) fs.writeFileSync(CHAT_HISTORY_FILE, JSON.stringify(merged, null, 2));
  }

  const ann = path.join(src, "announcement.txt");
  if (fs.existsSync(ann) && !fs.existsSync(ANNOUNCEMENT_FILE)) {
    report.announcement = "copied";
    if (!dryRun) fs.copyFileSync(ann, ANNOUNCEMENT_FILE);
  }

  // Recording rows whose MP3 is missing would show as broken past programmes.
  const missing = (await Recording.findAll({ attributes: ["filename"] }))
    .map((r) => r.filename)
    .filter((f) => !fs.existsSync(path.join(RECORDINGS_DIR, f)));
  report.recordingsWithoutFile = missing.length;
  if (missing.length) report.missingExamples = missing.slice(0, 5);

  console.log(JSON.stringify(report, null, 2));
  await sequelize.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
