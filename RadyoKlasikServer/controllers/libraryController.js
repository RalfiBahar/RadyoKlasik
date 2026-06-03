const fs = require("fs");
const path = require("path");
const { Op, fn, col } = require("sequelize");
const mime = require("mime-types");

const {
  sequelize,
  Track,
  Artist,
  Album,
  Tag,
  TrackTag,
  PlaylistItem,
} = require("../models");
const { TRACKS_DIR, ARTWORK_DIR, ensureMediaDirs } = require("../config/storage");
const ingest = require("../services/mediaIngest");
const logger = require("../logger");

const TRACK_TYPES = ["song", "jingle", "commercial"];
const SORTABLE = ["title", "artist", "album", "duration", "createdAt", "playCount"];
const DEFAULT_PAGE_SIZE = 15;

ensureMediaDirs();

// --- helpers ---------------------------------------------------------------

function artworkUrl(artworkPath) {
  return artworkPath ? `/media/${artworkPath}` : null;
}

function serializeTrack(track, tags) {
  const tagNames =
    tags !== undefined
      ? tags
      : (track.tagList || []).map((t) => t.name);
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    type: track.type,
    duration: track.duration,
    bitrate: track.bitrate,
    sampleRate: track.sampleRate,
    loudnessLufs: track.loudnessLufs,
    replaygain: track.replaygain,
    waveformUrl: `/api/v1/library/tracks/${track.id}/waveform`,
    artworkUrl: artworkUrl(track.artworkPath),
    tags: tagNames,
    size: track.size != null ? Number(track.size) : null,
    playCount: track.playCount,
    createdAt: track.createdAt,
  };
}

function normalizeTags(raw) {
  if (raw == null) return undefined;
  let list = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") return [];
    try {
      const parsed = JSON.parse(trimmed);
      list = Array.isArray(parsed) ? parsed : trimmed.split(",");
    } catch (_) {
      list = trimmed.split(",");
    }
  }
  if (!Array.isArray(list)) return undefined;
  return [...new Set(list.map((t) => String(t).trim()).filter(Boolean))];
}

async function resolveArtist(name, transaction) {
  if (!name) return null;
  const [artist] = await Artist.findOrCreate({
    where: { name },
    defaults: { name },
    transaction,
  });
  return artist;
}

async function resolveAlbum(title, artistId, transaction) {
  if (!title) return null;
  const [album] = await Album.findOrCreate({
    where: { title, artistId: artistId || null },
    defaults: { title, artistId: artistId || null },
    transaction,
  });
  return album;
}

async function setTrackTags(track, tagNames, transaction) {
  if (tagNames === undefined) return;
  const tags = [];
  for (const name of tagNames) {
    const [tag] = await Tag.findOrCreate({
      where: { name },
      defaults: { name },
      transaction,
    });
    tags.push(tag);
  }
  await track.setTagList(tags, { transaction });
}

async function loadTagMap(trackIds) {
  if (trackIds.length === 0) return {};
  const withTags = await Track.findAll({
    where: { id: trackIds },
    attributes: ["id"],
    include: [
      {
        model: Tag,
        as: "tagList",
        attributes: ["name"],
        through: { attributes: [] },
      },
    ],
  });
  const map = {};
  for (const t of withTags) map[t.id] = (t.tagList || []).map((x) => x.name);
  return map;
}

function resolveExtension(file) {
  // Prefer the uploaded filename's extension (natural + correct for mp3/aac);
  // fall back to the mimetype, then a generic extension. Note: mime.extension
  // for "audio/mpeg" is "mpga", so the filename is the better source.
  const fromName = path
    .extname(file.originalname || "")
    .replace(/^\./, "")
    .toLowerCase();
  if (fromName) return fromName;
  const fromMime = mime.extension(file.mimetype);
  return fromMime || "bin";
}

function saveArtworkBuffer(buffer, format) {
  ensureMediaDirs();
  const hash = ingest.computeHash(buffer);
  let ext = mime.extension(format) || "jpg";
  if (ext === "jpeg") ext = "jpg";
  const filename = `${hash}.${ext}`;
  const absPath = path.join(ARTWORK_DIR, filename);
  if (!fs.existsSync(absPath)) fs.writeFileSync(absPath, buffer);
  return `artwork/${filename}`;
}

// --- POST /api/v1/library/tracks -------------------------------------------

exports.uploadTrack = async (req, res) => {
  const audioFile =
    (req.files && req.files.file && req.files.file[0]) || req.file || null;
  if (!audioFile) {
    return res.status(400).json({ error: "Missing file" });
  }

  const buffer = audioFile.buffer;
  const hash = ingest.computeHash(buffer);

  const existing = await Track.findOne({ where: { fileHash: hash } });
  if (existing) {
    return res.status(409).json({
      error: "Duplicate track",
      message: "A track with identical audio already exists",
      track: serializeTrack(existing, []),
    });
  }

  ensureMediaDirs();
  const ext = resolveExtension(audioFile);
  const filename = `${hash}.${ext}`;
  const absPath = path.join(TRACKS_DIR, filename);
  const relPath = `tracks/${filename}`;

  let wrote = false;
  try {
    fs.writeFileSync(absPath, buffer);
    wrote = true;

    const analysis = await ingest.analyzeTrack(absPath);

    const overrides = req.body || {};
    const title =
      overrides.title ||
      analysis.tags.title ||
      path.basename(audioFile.originalname, path.extname(audioFile.originalname));
    const artistName = overrides.artist || analysis.tags.artist || null;
    const albumTitle = overrides.album || analysis.tags.album || null;
    let type = (overrides.type || "song").toLowerCase();
    if (!TRACK_TYPES.includes(type)) type = "song";
    const tagNames = normalizeTags(overrides.tags);

    // Artwork: uploaded thumbnail wins, else embedded picture.
    let artworkPath = null;
    const uploadedArt =
      req.files && req.files.artwork && req.files.artwork[0]
        ? req.files.artwork[0]
        : null;
    if (uploadedArt) {
      artworkPath = saveArtworkBuffer(uploadedArt.buffer, uploadedArt.mimetype);
    } else if (analysis.tags.picture) {
      artworkPath = saveArtworkBuffer(
        analysis.tags.picture.data,
        analysis.tags.picture.format
      );
    }

    const track = await sequelize.transaction(async (transaction) => {
      const artist = await resolveArtist(artistName, transaction);
      const album = await resolveAlbum(
        albumTitle,
        artist ? artist.id : null,
        transaction
      );
      const created = await Track.create(
        {
          title,
          artist: artistName,
          album: albumTitle,
          type,
          duration: analysis.duration,
          filePath: relPath,
          fileHash: hash,
          size: audioFile.size != null ? audioFile.size : buffer.length,
          bitrate: analysis.bitrate,
          sampleRate: analysis.sampleRate,
          loudnessLufs: analysis.loudnessLufs,
          loudnessRange: analysis.loudnessRange,
          replaygain: analysis.replaygain,
          waveformJson: analysis.waveformJson,
          artworkPath,
          artistId: artist ? artist.id : null,
          albumId: album ? album.id : null,
        },
        { transaction }
      );
      await setTrackTags(created, tagNames, transaction);
      return created;
    });

    logger.info("Track ingested", { id: track.id, title, type });
    return res.status(201).json(serializeTrack(track, tagNames || []));
  } catch (err) {
    if (wrote && fs.existsSync(absPath)) {
      try {
        fs.unlinkSync(absPath);
      } catch (_) {}
    }
    logger.error("Track ingest failed", { error: String(err) });
    return res.status(500).json({ error: "Ingest failed", message: String(err) });
  }
};

// --- GET /api/v1/library/tracks --------------------------------------------

exports.listTracks = async (req, res) => {
  try {
    const {
      type,
      q,
      tag,
      artist,
      album,
      playlist,
      sort = "createdAt",
      order = "DESC",
    } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(
      200,
      Math.max(1, parseInt(req.query.pageSize, 10) || DEFAULT_PAGE_SIZE)
    );

    const where = {};
    if (q) {
      where[Op.or] = [
        { title: { [Op.iLike]: `%${q}%` } },
        { artist: { [Op.iLike]: `%${q}%` } },
        { album: { [Op.iLike]: `%${q}%` } },
      ];
    }
    if (artist) where.artist = { [Op.iLike]: `%${artist}%` };
    if (album) where.album = { [Op.iLike]: `%${album}%` };

    // tag / playlist filters resolve to a set of track ids.
    let idConstraint;
    if (tag) {
      const tagRow = await Tag.findOne({ where: { name: tag } });
      const links = tagRow
        ? await TrackTag.findAll({ where: { tagId: tagRow.id } })
        : [];
      idConstraint = links.map((l) => l.trackId);
    }
    if (playlist) {
      const items = await PlaylistItem.findAll({
        where: { playlistId: playlist },
      });
      const ids = items.map((i) => i.trackId);
      idConstraint =
        idConstraint === undefined
          ? ids
          : idConstraint.filter((id) => ids.includes(id));
    }
    if (idConstraint !== undefined) {
      where.id = { [Op.in]: idConstraint.length ? idConstraint : [null] };
    }

    // Per-type counts over the same filter, ignoring the active type filter.
    const grouped = await Track.findAll({
      attributes: ["type", [fn("COUNT", col("id")), "count"]],
      where,
      group: ["type"],
      raw: true,
    });
    const counts = { all: 0, song: 0, jingle: 0, commercial: 0 };
    for (const row of grouped) {
      const n = Number(row.count);
      counts[row.type] = n;
      counts.all += n;
    }

    if (type && TRACK_TYPES.includes(type)) where.type = type;

    const total = type && TRACK_TYPES.includes(type) ? counts[type] : counts.all;
    const sizeSum = await Track.sum("size", { where });
    const totalSizeMb = Number((((sizeSum || 0) / (1024 * 1024))).toFixed(2));

    const sortCol = SORTABLE.includes(sort) ? sort : "createdAt";
    const sortDir = String(order).toUpperCase() === "ASC" ? "ASC" : "DESC";

    const rows = await Track.findAll({
      where,
      order: [[sortCol, sortDir]],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    const tagMap = await loadTagMap(rows.map((r) => r.id));
    const items = rows.map((r) => serializeTrack(r, tagMap[r.id] || []));

    return res.json({
      items,
      page,
      pageSize,
      total,
      counts,
      totalSizeMb,
    });
  } catch (err) {
    logger.error("List tracks failed", { error: String(err) });
    return res.status(500).json({ error: String(err) });
  }
};

// --- GET /api/v1/library/tracks/:id ----------------------------------------

exports.getTrack = async (req, res) => {
  const track = await Track.findByPk(req.params.id, {
    include: [
      { model: Tag, as: "tagList", attributes: ["name"], through: { attributes: [] } },
    ],
  });
  if (!track) return res.status(404).json({ error: "Track not found" });
  return res.json(serializeTrack(track));
};

// --- GET /api/v1/library/tracks/:id/waveform -------------------------------

exports.getWaveform = async (req, res) => {
  const track = await Track.findByPk(req.params.id, {
    attributes: ["id", "waveformJson"],
  });
  if (!track) return res.status(404).json({ error: "Track not found" });
  if (!track.waveformJson) {
    return res.status(404).json({ error: "Waveform not available" });
  }
  return res.json(track.waveformJson);
};

// --- PATCH /api/v1/library/tracks/:id --------------------------------------

exports.updateTrack = async (req, res) => {
  const track = await Track.findByPk(req.params.id);
  if (!track) return res.status(404).json({ error: "Track not found" });

  try {
    const { title, artist, album, type, tags } = req.body || {};
    const tagNames = normalizeTags(tags);

    await sequelize.transaction(async (transaction) => {
      const updates = {};
      if (title !== undefined) updates.title = title;
      if (artist !== undefined) {
        updates.artist = artist || null;
        const artistRow = await resolveArtist(artist, transaction);
        updates.artistId = artistRow ? artistRow.id : null;
      }
      if (album !== undefined) {
        updates.album = album || null;
        const artistRow = await resolveArtist(
          artist !== undefined ? artist : track.artist,
          transaction
        );
        const albumRow = await resolveAlbum(
          album,
          artistRow ? artistRow.id : null,
          transaction
        );
        updates.albumId = albumRow ? albumRow.id : null;
      }
      if (type !== undefined && TRACK_TYPES.includes(String(type).toLowerCase())) {
        updates.type = String(type).toLowerCase();
      }
      await track.update(updates, { transaction });
      if (tagNames !== undefined) await setTrackTags(track, tagNames, transaction);
    });

    const reloaded = await Track.findByPk(track.id, {
      include: [
        { model: Tag, as: "tagList", attributes: ["name"], through: { attributes: [] } },
      ],
    });
    return res.json(serializeTrack(reloaded));
  } catch (err) {
    logger.error("Update track failed", { error: String(err) });
    return res.status(500).json({ error: String(err) });
  }
};

// --- DELETE /api/v1/library/tracks/:id -------------------------------------

exports.deleteTrack = async (req, res) => {
  const track = await Track.findByPk(req.params.id);
  if (!track) return res.status(404).json({ error: "Track not found" });

  try {
    const absPath = path.join(TRACKS_DIR, path.basename(track.filePath));
    await track.destroy();
    if (fs.existsSync(absPath)) {
      try {
        fs.unlinkSync(absPath);
      } catch (_) {}
    }
    logger.info("Track deleted", { id: track.id });
    return res.json({ deleted: true, id: track.id });
  } catch (err) {
    logger.error("Delete track failed", { error: String(err) });
    return res.status(500).json({ error: String(err) });
  }
};

// --- POST /api/v1/library/bulk ---------------------------------------------
// { action: "tag" | "delete" | "addToPlaylist", trackIds: [], tags?, playlistId? }

exports.bulk = async (req, res) => {
  const { action, trackIds, tags, playlistId } = req.body || {};
  if (!Array.isArray(trackIds) || trackIds.length === 0) {
    return res.status(400).json({ error: "trackIds is required" });
  }

  try {
    if (action === "delete") {
      const tracks = await Track.findAll({ where: { id: trackIds } });
      for (const track of tracks) {
        const absPath = path.join(TRACKS_DIR, path.basename(track.filePath));
        await track.destroy();
        if (fs.existsSync(absPath)) {
          try {
            fs.unlinkSync(absPath);
          } catch (_) {}
        }
      }
      return res.json({ action, affected: tracks.length });
    }

    if (action === "tag") {
      const tagNames = normalizeTags(tags) || [];
      if (tagNames.length === 0) {
        return res.status(400).json({ error: "tags is required" });
      }
      await sequelize.transaction(async (transaction) => {
        const tagRows = [];
        for (const name of tagNames) {
          const [tag] = await Tag.findOrCreate({
            where: { name },
            defaults: { name },
            transaction,
          });
          tagRows.push(tag);
        }
        const tracks = await Track.findAll({
          where: { id: trackIds },
          transaction,
        });
        for (const track of tracks) {
          await track.addTagList(tagRows, { transaction });
        }
      });
      return res.json({ action, affected: trackIds.length, tags: tagNames });
    }

    if (action === "addToPlaylist") {
      if (!playlistId) {
        return res.status(400).json({ error: "playlistId is required" });
      }
      const created = await sequelize.transaction(async (transaction) => {
        const last = await PlaylistItem.findOne({
          where: { playlistId },
          order: [["position", "DESC"]],
          transaction,
        });
        let position = last ? last.position + 1 : 0;
        const items = [];
        for (const trackId of trackIds) {
          items.push(
            await PlaylistItem.create(
              { playlistId, trackId, position: position++ },
              { transaction }
            )
          );
        }
        return items;
      });
      return res.json({ action, affected: created.length, playlistId });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    logger.error("Bulk operation failed", { error: String(err) });
    return res.status(500).json({ error: String(err) });
  }
};

exports.serializeTrack = serializeTrack;
