#!/usr/bin/env node
// Reverse sync, step 2 of 2: runs ON THE LEGACY DROPLET with its own Node and
// its own sqlite3 package, and applies a bundle made by exportToLegacy.js:
//
//   node ~/rk-sync/apply.js ~/rk-sync [~/RadyoKlasik/RadyoKlasikServer] [--dry-run]
//
// Writes only data, never code:
//   recordings/        new MP3s moved in from the bundle
//   public/static/assets/thumbnails/  artwork they use
//   database.sqlite    Recordings rows (only for files present) upserted —
//                      metadata follows the new server, play_count never
//                      goes down; NotificationTokens added if unknown
//   chatHistory.json   replaced by the new server's chat (it already holds
//                      the legacy history, plus deletions made there)
//   announcement.txt   replaced / removed to match
// Nothing is deleted from the legacy archive. Safe to re-run.
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));
const bundle = path.resolve(positional[0] || path.join(os.homedir(), "rk-sync"));
const serverDir = path.resolve(positional[1] || path.join(os.homedir(), "RadyoKlasik", "RadyoKlasikServer"));
const dryRun = args.indexOf("--dry-run") !== -1;

const recDir = path.join(serverDir, "recordings");
const thumbDir = path.join(serverDir, "public", "static", "assets", "thumbnails");
const dbFile = path.join(serverDir, "database.sqlite");
const chatFile = path.join(serverDir, "chatHistory.json");
const annFile = path.join(serverDir, "announcement.txt");

function fail(msg) {
  console.error(msg);
  process.exit(1);
}
if (!fs.existsSync(path.join(bundle, "data.json"))) fail("no data.json in " + bundle);
if (!fs.existsSync(dbFile)) fail("legacy database not found: " + dbFile);

const sqlite3 = require(path.join(serverDir, "node_modules", "sqlite3"));
const data = JSON.parse(fs.readFileSync(path.join(bundle, "data.json"), "utf8"));

// Sequelize's SQLite date format, so the legacy app reads them as before.
function sqlDate(v) {
  if (!v) return null;
  return new Date(v).toISOString().replace("T", " ").replace("Z", " +00:00");
}

function freeBytes(dir) {
  const outp = execFileSync("df", ["-Pk", dir]).toString().trim().split("\n");
  return Number(outp[outp.length - 1].split(/\s+/)[3]) * 1024;
}

function move(src, dest) {
  try {
    fs.renameSync(src, dest);
  } catch (err) {
    if (err.code !== "EXDEV") throw err;
    fs.copyFileSync(src, dest);
    fs.unlinkSync(src);
  }
}

function writeAtomic(file, text) {
  const tmp = file + ".sync-tmp";
  fs.writeFileSync(tmp, text, "utf8");
  fs.renameSync(tmp, file);
}

function run(db, sql, params) {
  return new Promise(function (resolve, reject) {
    db.run(sql, params || [], function (err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
}
function all(db, sql, params) {
  return new Promise(function (resolve, reject) {
    db.all(sql, params || [], function (err, rows) {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

(async function main() {
  const report = {
    dryRun: dryRun,
    generatedAt: data.generatedAt,
    filesMoved: 0,
    thumbnailsAdded: 0,
    recordingsInserted: 0,
    recordingsUpdated: 0,
    recordingsWithoutFile: 0,
    onlyOnLegacy: 0,
    tokensAdded: 0,
    chatMessages: (data.chat || []).length,
    announcement: data.announcement != null ? "set" : "cleared",
  };

  // 1. Files. The bundle already sits on this disk (sync-legacy.sh sized it
  // to leave --min-free-gb free), so moving files in costs no extra space.
  const bundleRec = path.join(bundle, "recordings");
  const incoming = fs.existsSync(bundleRec) ? fs.readdirSync(bundleRec) : [];
  for (const f of incoming) {
    const dest = path.join(recDir, f);
    if (fs.existsSync(dest)) continue;
    if (!dryRun) move(path.join(bundleRec, f), dest);
    report.filesMoved += 1;
  }
  const bundleThumb = path.join(bundle, "thumbnails");
  for (const f of fs.existsSync(bundleThumb) ? fs.readdirSync(bundleThumb) : []) {
    const dest = path.join(thumbDir, f);
    if (fs.existsSync(dest)) continue;
    if (!dryRun) fs.copyFileSync(path.join(bundleThumb, f), dest);
    report.thumbnailsAdded += 1;
  }
  report.freeGbAfter = Math.round((freeBytes(recDir) / 1024 ** 3) * 10) / 10;

  // 2. Database rows.
  const db = new sqlite3.Database(dbFile);
  db.configure("busyTimeout", 15000);
  const cols = (await all(db, 'PRAGMA table_info("Recordings")')).map(function (c) {
    return c.name;
  });
  const existing = new Map(
    (await all(db, 'SELECT id, play_count FROM "Recordings"')).map(function (r) {
      return [r.id, r];
    })
  );
  const newIds = new Set(data.recordings.map(function (r) {
    return r.id;
  }));
  existing.forEach(function (_, id) {
    if (!newIds.has(id)) report.onlyOnLegacy += 1;
  });

  const want = ["id", "filename", "stream", "title", "artist", "album", "artwork", "duration", "size", "play_count", "special", "date", "createdAt", "updatedAt"].filter(function (c) {
    return cols.indexOf(c) !== -1;
  });
  const updatable = ["title", "artist", "album", "artwork", "special", "duration", "size", "updatedAt"].filter(function (c) {
    return want.indexOf(c) !== -1;
  });
  const upsert =
    'INSERT INTO "Recordings" (' + want.map(function (c) { return '"' + c + '"'; }).join(", ") + ") VALUES (" +
    want.map(function () { return "?"; }).join(", ") + ') ON CONFLICT("id") DO UPDATE SET ' +
    updatable.map(function (c) { return '"' + c + '" = excluded."' + c + '"'; }).join(", ") +
    ', "play_count" = MAX(COALESCE("Recordings"."play_count", 0), COALESCE(excluded."play_count", 0))';

  if (!dryRun) await run(db, "BEGIN");
  try {
    for (const r of data.recordings) {
      if (!fs.existsSync(path.join(recDir, r.filename)) && !(dryRun && incoming.indexOf(r.filename) !== -1)) {
        report.recordingsWithoutFile += 1;
        continue;
      }
      const row = Object.assign({}, r, {
        date: sqlDate(r.date),
        createdAt: sqlDate(r.createdAt || r.date),
        updatedAt: sqlDate(r.updatedAt || r.date),
      });
      if (existing.has(r.id)) report.recordingsUpdated += 1;
      else report.recordingsInserted += 1;
      if (!dryRun) await run(db, upsert, want.map(function (c) { return row[c] === undefined ? null : row[c]; }));
    }
    for (const t of data.notificationTokens || []) {
      const params = [t.id, t.token, sqlDate(t.date), sqlDate(t.createdAt || t.date), sqlDate(t.updatedAt || t.date), t.id, t.token];
      const sql =
        'INSERT INTO "NotificationTokens" ("id", "token", "date", "createdAt", "updatedAt") SELECT ?, ?, ?, ?, ? ' +
        'WHERE NOT EXISTS (SELECT 1 FROM "NotificationTokens" WHERE "id" = ? OR "token" = ?)';
      if (dryRun) {
        const hit = await all(db, 'SELECT 1 FROM "NotificationTokens" WHERE "id" = ? OR "token" = ?', [t.id, t.token]);
        if (!hit.length) report.tokensAdded += 1;
      } else {
        report.tokensAdded += await run(db, sql, params);
      }
    }
    if (!dryRun) await run(db, "COMMIT");
  } catch (err) {
    if (!dryRun) await run(db, "ROLLBACK").catch(function () {});
    throw err;
  } finally {
    db.close();
  }

  // 3. Chat + announcement (the legacy app re-reads these on every request).
  if (!dryRun) {
    writeAtomic(chatFile, JSON.stringify(data.chat || [], null, 2));
    if (data.announcement != null) writeAtomic(annFile, data.announcement);
    else if (fs.existsSync(annFile)) fs.unlinkSync(annFile);
  }

  console.log(JSON.stringify(report, null, 2));
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
