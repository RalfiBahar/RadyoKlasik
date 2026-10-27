const fs = require("fs");
const path = require("path");
const mime = require("mime-types");
const md5 = require("md5");
const recorder = require("../services/recorder");
const recordingStorage = require("../services/recordingStorage");
const scheduler = require("../services/scheduler");
const { RECORDINGS_DIR, THUMBNAILS_DIR } = require("../config/appData");
const logger = require("../logger");

// Panel API for recorded programmes (/api/v1/recordings). Same Recording
// table and files as the legacy /recording routes, so the website and mobile
// app's "past programmes" list is what's managed here.

function models() {
  return require("../models");
}

function artworkFile(artwork) {
  return artwork ? path.basename(artwork) : null;
}

function serialize(r) {
  const art = artworkFile(r.artwork);
  return {
    id: r.id,
    filename: r.filename,
    title: r.title,
    artist: r.artist,
    album: r.album || null,
    artwork: art,
    artworkUrl: art ? `/static/assets/thumbnails/${art}` : null,
    duration: r.duration,
    sizeMb: Math.round(r.size * 10) / 10,
    date: r.date,
    plays: r.play_count || 0,
    special: r.special || null,
    // "local" | "pending" | "r2" (see services/recordingStorage.js)
    storage: r.storage || "local",
    storageError: r.storageError || null,
    storedAt: r.storedAt || null,
    onDisk: fs.existsSync(path.join(RECORDINGS_DIR, r.filename)),
    fileMissing: r.storage !== "r2" && !fs.existsSync(path.join(RECORDINGS_DIR, r.filename)),
  };
}

function safeName(name) {
  // Only plain file names inside the managed folders.
  return name && path.basename(name) === name && !name.startsWith(".") ? name : null;
}

// GET /api/v1/recordings?limit=&offset=&q=
exports.list = async (req, res) => {
  try {
    const { Recording } = models();
    const { Op } = require("sequelize");
    const limit = Math.min(200, Number(req.query.limit) || 50);
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const where = req.query.q
      ? {
          [Op.or]: [
            { title: { [Op.iLike]: `%${req.query.q}%` } },
            { artist: { [Op.iLike]: `%${req.query.q}%` } },
          ],
        }
      : {};
    const { rows, count } = await Recording.findAndCountAll({
      where,
      order: [["date", "DESC"]],
      limit,
      offset,
    });
    return res.json({
      items: rows.map(serialize),
      total: count,
      limit,
      offset,
      storage: await recordingStorage.stats(),
    });
  } catch (err) {
    logger.error("recordings list failed", { error: String(err) });
    return res.status(500).json({ error: String(err) });
  }
};

// PATCH /api/v1/recordings/:id { title?, artist?, album?, artwork?, special? }
exports.update = async (req, res) => {
  try {
    const rec = await models().Recording.findByPk(req.params.id);
    if (!rec) return res.status(404).json({ error: "recording not found" });
    const b = req.body || {};
    if (b.title !== undefined) {
      if (!String(b.title).trim()) return res.status(400).json({ error: "title is required" });
      rec.title = String(b.title).trim();
    }
    if (b.artist !== undefined) rec.artist = String(b.artist || "").trim() || rec.artist;
    if (b.album !== undefined) rec.album = b.album || "";
    if (b.special !== undefined) rec.special = b.special || null;
    if (b.artwork !== undefined) {
      const f = b.artwork ? safeName(b.artwork) : null;
      if (b.artwork && (!f || !fs.existsSync(path.join(THUMBNAILS_DIR, f)))) {
        return res.status(400).json({ error: "unknown artwork" });
      }
      rec.artwork = f ? `static/assets/thumbnails/${f}` : null;
    }
    await rec.save();
    // Keep the MP3's own tags in step (players show these). A recording only
    // in R2 is fetched, re-tagged and uploaded again.
    const tagsChanged = ["title", "artist", "album", "artwork"].some((k) => b[k] !== undefined);
    const file = tagsChanged ? await recordingStorage.ensureLocal(rec) : null;
    if (file) {
      const art = artworkFile(rec.artwork);
      recorder.addMetadata(file, rec.title, rec.artist, rec.album || "", art ? path.join(THUMBNAILS_DIR, art) : undefined);
      rec.size = fs.statSync(file).size / (1024 * 1024);
      await rec.save();
      await recordingStorage.afterLocalChange(rec);
    }
    return res.json(serialize(rec));
  } catch (err) {
    logger.error("recording update failed", { error: String(err) });
    return res.status(500).json({ error: String(err) });
  }
};

// PUT /api/v1/recordings/:id/file (multipart "file") — replace the audio,
// e.g. with an edited version. Duration/size come from the new file.
exports.replaceFile = async (req, res) => {
  try {
    const rec = await models().Recording.findByPk(req.params.id);
    if (!rec) return res.status(404).json({ error: "recording not found" });
    if (!req.file) return res.status(400).json({ error: "file is required" });
    const dest = path.join(RECORDINGS_DIR, rec.filename);
    fs.writeFileSync(dest, req.file.buffer);
    const mm = await import("music-metadata");
    const meta = await mm.parseFile(dest);
    rec.duration = Math.floor(meta.format.duration || rec.duration);
    rec.size = fs.statSync(dest).size / (1024 * 1024);
    await rec.save();
    const art = artworkFile(rec.artwork);
    recorder.addMetadata(dest, rec.title, rec.artist, rec.album || "", art ? path.join(THUMBNAILS_DIR, art) : undefined);
    rec.size = fs.statSync(dest).size / (1024 * 1024);
    await rec.save();
    await recordingStorage.afterLocalChange(rec);
    return res.json(serialize(rec));
  } catch (err) {
    logger.error("recording replace failed", { error: String(err) });
    return res.status(400).json({ error: String(err) });
  }
};

// DELETE /api/v1/recordings/:id — row and file.
exports.remove = async (req, res) => {
  try {
    const rec = await models().Recording.findByPk(req.params.id);
    if (!rec) return res.status(404).json({ error: "recording not found" });
    await recordingStorage.removeFiles(rec);
    await rec.destroy();
    return res.json({ deleted: true, id: req.params.id });
  } catch (err) {
    logger.error("recording delete failed", { error: String(err) });
    return res.status(500).json({ error: String(err) });
  }
};

// GET /api/v1/recordings/:id/audio — preview in the panel (doesn't count as a
// listener play).
exports.audio = async (req, res) => {
  const rec = await models().Recording.findByPk(req.params.id);
  if (!rec) return res.status(404).json({ error: "recording not found" });
  const where = await recordingStorage.resolvePlayback(rec);
  if (where.missing) return res.status(404).json({ error: "file missing" });
  if (where.redirect) return res.redirect(302, where.redirect);
  return res.sendFile(where.file);
};

// POST /api/v1/recordings/:id/upload — (re)try sending it to R2 now.
exports.upload = async (req, res) => {
  const rec = await models().Recording.findByPk(req.params.id);
  if (!rec) return res.status(404).json({ error: "recording not found" });
  if (rec.storage === "local") await rec.update({ storage: "pending" });
  const result = await recordingStorage.push(rec);
  if (!result.ok) return res.status(502).json({ error: result.error, recording: serialize(rec) });
  return res.json(serialize(rec));
};

// --- Recorder -----------------------------------------------------------------

// GET /api/v1/recordings/recorder
exports.recorderStatus = (req, res) => res.json(recorder.status());

// POST /api/v1/recordings/recorder/start { title?, artist?, artwork? }
// Title defaults to the show on the schedule, then "Morning Delight".
exports.recorderStart = (req, res) => {
  try {
    const b = req.body || {};
    const artwork = b.artwork ? safeName(b.artwork) : null;
    if (b.artwork && (!artwork || !fs.existsSync(path.join(THUMBNAILS_DIR, artwork)))) {
      return res.status(400).json({ error: "unknown artwork" });
    }
    const active = scheduler.getNow().active;
    const st = recorder.start({
      title: (b.title && String(b.title).trim()) || (active && (active.showTitle || active.title)) || undefined,
      artist: (b.artist && String(b.artist).trim()) || undefined,
      artwork,
      startedBy: req.user ? req.user.name : null,
    });
    return res.status(201).json(st);
  } catch (err) {
    if (err.code === "BUSY") return res.status(409).json({ error: err.message });
    logger.error("recorder start failed", { error: String(err) });
    return res.status(500).json({ error: String(err) });
  }
};

// POST /api/v1/recordings/recorder/stop
exports.recorderStop = (req, res) => {
  try {
    return res.json(recorder.stop());
  } catch (err) {
    return res.status(409).json({ error: err.message });
  }
};

// --- Artwork (recording thumbnails) ------------------------------------------

function artworkList() {
  return fs
    .readdirSync(THUMBNAILS_DIR)
    .filter((f) => !f.startsWith(".") && fs.lstatSync(path.join(THUMBNAILS_DIR, f)).isFile())
    .map((f) => ({ file: f, url: `/static/assets/thumbnails/${f}`, mtime: fs.statSync(path.join(THUMBNAILS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
}

// GET /api/v1/recordings/artworks
exports.artworks = async (req, res) => {
  try {
    const { Recording } = models();
    const used = await Recording.findAll({ attributes: ["artwork"] });
    const counts = {};
    for (const r of used) {
      const f = artworkFile(r.artwork);
      if (f) counts[f] = (counts[f] || 0) + 1;
    }
    return res.json({
      items: artworkList().map(({ file, url }) => ({ file, url, usedBy: counts[file] || 0 })),
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
};

// POST /api/v1/recordings/artworks (multipart "artwork")
exports.uploadArtwork = (req, res) => {
  const f = req.file;
  if (!f) return res.status(400).json({ error: "artwork file is required" });
  if (!/^image\//.test(f.mimetype)) return res.status(400).json({ error: "artwork must be an image" });
  const name = `${md5(f.buffer)}.${mime.extension(f.mimetype) || "jpg"}`;
  fs.writeFileSync(path.join(THUMBNAILS_DIR, name), f.buffer);
  return res.status(201).json({ file: name, url: `/static/assets/thumbnails/${name}` });
};

// DELETE /api/v1/recordings/artworks/:file — refused while recordings use it.
exports.deleteArtwork = async (req, res) => {
  const f = safeName(req.params.file);
  if (!f || !fs.existsSync(path.join(THUMBNAILS_DIR, f))) {
    return res.status(404).json({ error: "artwork not found" });
  }
  const { Recording } = models();
  const { Op } = require("sequelize");
  const inUse = await Recording.count({ where: { artwork: { [Op.like]: `%${f}` } } });
  if (inUse) return res.status(409).json({ error: `used by ${inUse} recording(s)` });
  fs.unlinkSync(path.join(THUMBNAILS_DIR, f));
  return res.json({ deleted: true, file: f });
};
