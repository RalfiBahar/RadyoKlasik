#!/usr/bin/env node
// Reverse sync, step 1 of 2 (infra/DEPLOY_PLAN.md, rule 4): bundle what
// happened on the new server so the legacy droplet can stay a current
// fallback during the transition. Step 2 is scripts/legacyApply.js, run on
// the droplet. infra/scripts/sync-legacy.sh runs both nightly.
//
//   node scripts/exportToLegacy.js <out dir> [--since 2026-11-01]
//        [--skip-list <file of filenames legacy already has>] [--max-gb 2]
//
// The bundle (<out dir>):
//   data.json    recordings (all rows), push tokens, chat, announcement
//   recordings/  MP3s legacy doesn't have yet, recorded since --since
//                (default: LEGACY_SYNC_SINCE or the last 60 days), newest
//                first, at most --max-gb (legacy's disk is nearly full)
//   thumbnails/  artwork those recordings use
//   apply.js     a copy of legacyApply.js
// Recordings only in R2 are downloaded for the bundle. Read-only on this
// server; the out dir is wiped and rebuilt each run.
const fs = require("fs");
const path = require("path");
const objectStorage = require("../services/objectStorage");
const storage = require("../services/recordingStorage");
const listenerContent = require("../services/listenerContent");
const { THUMBNAILS_DIR } = require("../config/appData");

const args = process.argv.slice(2);
const out = args[0] && !args[0].startsWith("--") ? path.resolve(args[0]) : null;
const val = (f, d) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
if (!out) {
  console.error("usage: node scripts/exportToLegacy.js <out dir> [--since YYYY-MM-DD] [--skip-list file] [--max-gb 2]");
  process.exit(1);
}
const since = new Date(val("--since", process.env.LEGACY_SYNC_SINCE || new Date(Date.now() - 60 * 86400000).toISOString()));
if (Number.isNaN(since.getTime())) {
  console.error("--since is not a date");
  process.exit(1);
}
const maxBytes = Number(val("--max-gb", process.env.LEGACY_SYNC_MAX_GB || 2)) * 1024 ** 3;
const skipFile = val("--skip-list", null);
const legacyHas = new Set(
  skipFile && fs.existsSync(skipFile)
    ? fs.readFileSync(skipFile, "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    : []
);

const iso = (d) => (d ? new Date(d).toISOString() : null);

(async () => {
  const { sequelize, Recording, NotificationToken } = require("../models");
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, "recordings"), { recursive: true });
  fs.mkdirSync(path.join(out, "thumbnails"), { recursive: true });

  const recs = await Recording.findAll({ order: [["date", "DESC"]] });
  const report = { since: since.toISOString(), recordings: recs.length, filesBundled: 0, bundledMb: 0, skippedOld: 0, skippedSize: [], unavailable: [] };
  let bytes = 0;
  const thumbs = new Set();

  for (const rec of recs) {
    const art = rec.artwork ? path.basename(rec.artwork) : null;
    if (legacyHas.has(rec.filename)) {
      if (art) thumbs.add(art);
      continue;
    }
    if (new Date(rec.date) < since) {
      report.skippedOld += 1;
      continue;
    }
    const dest = path.join(out, "recordings", rec.filename);
    try {
      if (storage.hasLocal(rec)) {
        const size = fs.statSync(storage.localPath(rec)).size;
        if (bytes + size > maxBytes) {
          report.skippedSize.push(rec.filename);
          continue;
        }
        fs.copyFileSync(storage.localPath(rec), dest);
        bytes += size;
      } else if (rec.storage === "r2" && objectStorage.isConfigured()) {
        const h = await objectStorage.head(storage.key(rec));
        if (!h.exists) throw new Error("missing in bucket");
        if (bytes + h.size > maxBytes) {
          report.skippedSize.push(rec.filename);
          continue;
        }
        await objectStorage.download(storage.key(rec), dest);
        bytes += h.size;
      } else {
        throw new Error("file missing");
      }
      report.filesBundled += 1;
      if (art) thumbs.add(art);
    } catch (err) {
      report.unavailable.push({ filename: rec.filename, error: String(err.message || err) });
    }
  }
  for (const t of thumbs) {
    const src = path.join(THUMBNAILS_DIR, t);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(out, "thumbnails", t));
  }
  report.bundledMb = Math.round(bytes / (1024 * 1024));

  const tokens = await NotificationToken.findAll();
  const ann = listenerContent.getAnnouncement();
  const data = {
    generatedAt: new Date().toISOString(),
    since: since.toISOString(),
    recordings: recs.map((r) => ({
      id: r.id,
      filename: r.filename,
      stream: r.stream,
      title: r.title,
      artist: r.artist,
      album: r.album,
      artwork: r.artwork ? `static/assets/thumbnails/${path.basename(r.artwork)}` : null,
      duration: r.duration,
      size: r.size,
      play_count: r.play_count || 0,
      special: r.special,
      date: iso(r.date),
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
    })),
    notificationTokens: tokens.map((t) => ({
      id: t.id,
      token: t.token,
      date: iso(t.date),
      createdAt: iso(t.createdAt),
      updatedAt: iso(t.updatedAt),
    })),
    chat: listenerContent.readChat(),
    announcement: ann ? ann.text : null,
  };
  fs.writeFileSync(path.join(out, "data.json"), JSON.stringify(data));
  fs.copyFileSync(path.join(__dirname, "legacyApply.js"), path.join(out, "apply.js"));

  report.notificationTokens = data.notificationTokens.length;
  report.chatMessages = data.chat.length;
  report.announcement = data.announcement != null;
  console.log(JSON.stringify(report, null, 2));
  await sequelize.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
