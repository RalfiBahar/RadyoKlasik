const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const logger = require("../logger");

// Write library metadata back into an audio file's own tags (Phase: library
// editing). Uses ffmpeg with stream copy, so the audio is never re-encoded and
// MP3 / FLAC / M4A / OGG are all handled the same way. Cover art is embedded
// for formats that support it. The file is replaced atomically (temp + rename)
// so a track Liquidsoap is playing right now keeps playing from the old inode.

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const ART_FORMATS = new Set([".mp3", ".flac", ".m4a", ".mp4", ".aac"]);

function run(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err.trim().split("\n").slice(-3).join(" | ")))));
  });
}

// tags: { title, artist, album, composer, year, genre, comment } (null = clear)
// artworkPath: absolute path of a new cover to embed (optional).
async function writeFileTags(filePath, tags, artworkPath = null) {
  const ext = path.extname(filePath).toLowerCase();
  const tmp = path.join(path.dirname(filePath), `.tagging-${process.pid}-${Date.now()}${ext}`);
  const withArt = !!artworkPath && ART_FORMATS.has(ext) && fs.existsSync(artworkPath);

  const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", filePath];
  if (withArt) args.push("-i", artworkPath);
  // Keep every stream (incl. an existing cover) unless a new cover replaces it.
  if (withArt) args.push("-map", "0:a", "-map", "1");
  else args.push("-map", "0");
  args.push("-c", "copy", "-map_metadata", "0");
  const meta = {
    title: tags.title,
    artist: tags.artist,
    album: tags.album,
    composer: tags.composer,
    date: tags.year != null ? String(tags.year) : tags.year,
    genre: tags.genre,
    comment: tags.comment,
  };
  for (const [k, v] of Object.entries(meta)) {
    if (v !== undefined) args.push("-metadata", `${k}=${v == null ? "" : v}`);
  }
  if (ext === ".mp3") args.push("-id3v2_version", "3");
  if (withArt) {
    args.push("-disposition:v", "attached_pic", "-metadata:s:v", "title=Album cover", "-metadata:s:v", "comment=Cover (front)");
  }
  args.push(tmp);

  try {
    await run(args);
    fs.renameSync(tmp, filePath);
    return { written: true };
  } catch (err) {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    logger.warn("writing file tags failed", { filePath, error: String(err) });
    return { written: false, error: String(err.message || err) };
  }
}

module.exports = { writeFileTags };
