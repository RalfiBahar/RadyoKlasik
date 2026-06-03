const crypto = require("crypto");
const { spawn } = require("child_process");
const ffmpeg = require("fluent-ffmpeg");
const NodeID3 = require("node-id3");

if (process.env.FFMPEG_PATH) ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
if (process.env.FFPROBE_PATH) ffmpeg.setFfprobePath(process.env.FFPROBE_PATH);

const FFMPEG_BIN = process.env.FFMPEG_PATH || "ffmpeg";

// Reference loudness for replaygain. -18 LUFS is a common streaming target;
// Phase 2 uses replaygain (= REFERENCE - integratedLufs) to normalize playout.
const REFERENCE_LUFS = -18;
const WAVEFORM_PEAKS = 1000;
const WAVEFORM_SAMPLE_RATE = 8000;

// sha256 of the file bytes — the dedupe key (stored as Track.fileHash, unique).
function computeHash(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

// ffprobe → duration (s), bitrate (bps), sampleRate (Hz), channels.
function probe(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);
      const format = data.format || {};
      const audioStream =
        (data.streams || []).find((s) => s.codec_type === "audio") || {};
      resolve({
        duration:
          format.duration != null ? Number(format.duration) : undefined,
        bitrate: format.bit_rate ? Number(format.bit_rate) : undefined,
        sampleRate: audioStream.sample_rate
          ? Number(audioStream.sample_rate)
          : undefined,
        channels: audioStream.channels,
      });
    });
  });
}

// Parse the EBU R128 summary printed by `ffmpeg -af ebur128` on stderr.
// Returns integrated loudness (LUFS) + loudness range (LU).
function parseLoudness(stderr) {
  const iMatch = stderr.match(/\n\s*I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/);
  const lraMatch = stderr.match(/\n\s*LRA:\s*(-?\d+(?:\.\d+)?)\s*LU\b/);
  return {
    loudnessLufs: iMatch ? Number(iMatch[1]) : undefined,
    loudnessRange: lraMatch ? Number(lraMatch[1]) : undefined,
  };
}

// Run EBU R128 loudness analysis. Computes replaygain from the integrated value.
function analyzeLoudness(filePath) {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_BIN, [
      "-hide_banner",
      "-nostats",
      "-i",
      filePath,
      "-af",
      "ebur128=framelog=verbose",
      "-f",
      "null",
      "-",
    ]);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`ffmpeg ebur128 exited with code ${code}`));
      }
      const { loudnessLufs, loudnessRange } = parseLoudness(stderr);
      const replaygain =
        loudnessLufs != null
          ? Number((REFERENCE_LUFS - loudnessLufs).toFixed(2))
          : undefined;
      resolve({ loudnessLufs, loudnessRange, replaygain });
    });
  });
}

// Build a compact waveform: decode to mono PCM s16le @ 8kHz, bucket into N
// peaks, each the normalized (0..1) absolute peak of its bucket. Shape is
// consumed by the studio UI (Phase 5).
function generateWaveform(filePath, peaks = WAVEFORM_PEAKS) {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_BIN, [
      "-hide_banner",
      "-nostats",
      "-i",
      filePath,
      "-ac",
      "1",
      "-filter:a",
      `aresample=${WAVEFORM_SAMPLE_RATE}`,
      "-map",
      "0:a",
      "-c:a",
      "pcm_s16le",
      "-f",
      "s16le",
      "-",
    ]);
    const chunks = [];
    let stderr = "";
    proc.stdout.on("data", (d) => chunks.push(d));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(
          new Error(`ffmpeg waveform exited with code ${code}: ${stderr}`)
        );
      }
      const buf = Buffer.concat(chunks);
      const sampleCount = Math.floor(buf.length / 2);
      const bucketSize = Math.max(1, Math.floor(sampleCount / peaks));
      const out = [];
      for (let i = 0; i < sampleCount; i += bucketSize) {
        let max = 0;
        const end = Math.min(i + bucketSize, sampleCount);
        for (let j = i; j < end; j++) {
          const sample = Math.abs(buf.readInt16LE(j * 2));
          if (sample > max) max = sample;
        }
        out.push(Number((max / 32768).toFixed(4)));
      }
      resolve({
        version: 1,
        channels: 1,
        sampleRate: WAVEFORM_SAMPLE_RATE,
        bits: 16,
        samples: out.length,
        peaks: out,
      });
    });
  });
}

// Read embedded ID3 tags + first embedded picture. Uses node-id3 (CommonJS) so
// the ingest path stays require-able under jest (music-metadata is ESM-only).
function extractTags(filePath) {
  let tags = {};
  try {
    tags = NodeID3.read(filePath) || {};
  } catch (_) {
    tags = {};
  }
  const image =
    tags.image && typeof tags.image === "object" && tags.image.imageBuffer
      ? tags.image
      : null;
  return {
    title: tags.title || undefined,
    artist: tags.artist || undefined,
    album: tags.album || undefined,
    picture: image
      ? { data: image.imageBuffer, format: image.mime || "image/jpeg" }
      : null,
  };
}

// Full analysis of an on-disk audio file: probe + loudness + waveform + tags.
async function analyzeTrack(filePath) {
  const [probeData, loudness, waveformJson] = await Promise.all([
    probe(filePath),
    analyzeLoudness(filePath),
    generateWaveform(filePath),
  ]);
  const tags = extractTags(filePath);
  return {
    duration: probeData.duration,
    bitrate: probeData.bitrate,
    sampleRate: probeData.sampleRate,
    channels: probeData.channels,
    loudnessLufs: loudness.loudnessLufs,
    loudnessRange: loudness.loudnessRange,
    replaygain: loudness.replaygain,
    waveformJson,
    tags,
  };
}

module.exports = {
  computeHash,
  probe,
  parseLoudness,
  analyzeLoudness,
  generateWaveform,
  extractTags,
  analyzeTrack,
  REFERENCE_LUFS,
};
