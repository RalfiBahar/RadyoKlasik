const axios = require("axios");
const { Track } = require("../models");
const nowPlaying = require("./nowPlaying");

const ICECAST_TIMEOUT_MS = Number(process.env.ICECAST_STATUS_TIMEOUT_MS || 2000);

function icecastUrl() {
  const host = process.env.ICECAST_HOST || "localhost";
  const port = process.env.ICECAST_PORT || 8000;
  return `http://${host}:${port}/status-json.xsl`;
}

async function getStatusJson() {
  const { data } = await axios.get(icecastUrl(), { timeout: ICECAST_TIMEOUT_MS });
  return data;
}

function sourcesFromStatus(data) {
  const source = data && data.icestats && data.icestats.source;
  if (!source) return [];
  return Array.isArray(source) ? source : [source];
}

async function getListenerCount() {
  const data = await getStatusJson();
  return sourcesFromStatus(data).reduce(
    (sum, source) => sum + (Number(source.listeners) || 0),
    0
  );
}

function splitIcecastTitle(rawTitle) {
  const raw = String(rawTitle || "").trim();
  if (!raw) return null;
  const parts = raw.split(/\s+-\s+/);
  if (parts.length >= 2) {
    return {
      artist: parts[0].trim() || null,
      title: parts.slice(1).join(" - ").trim() || raw,
    };
  }
  return { artist: null, title: raw };
}

async function findMatchingTrack(parsed) {
  if (!parsed || !parsed.title) return null;
  if (parsed.artist) {
    const exact = await Track.findOne({
      where: { title: parsed.title, artist: parsed.artist },
    });
    if (exact) return exact;
  }
  return Track.findOne({ where: { title: parsed.title } });
}

async function metadataFromIcecast() {
  const data = await getStatusJson();
  const source = sourcesFromStatus(data).find((s) => s && s.title);
  const parsed = splitIcecastTitle(source && source.title);
  if (!parsed) return null;

  const track = await findMatchingTrack(parsed);
  if (track) {
    return {
      title: track.title,
      artist: track.artist,
      album: track.album,
      thumb: track.artworkPath ? `/media/${track.artworkPath}` : null,
      source: "autodj",
      trackId: track.id,
      startedAt: source.stream_start_iso8601 || new Date().toISOString(),
    };
  }

  return {
    title: parsed.title,
    artist: parsed.artist,
    album: null,
    thumb: null,
    source: "autodj",
    trackId: null,
    startedAt: source.stream_start_iso8601 || new Date().toISOString(),
  };
}

async function recoverNowPlaying() {
  const current = nowPlaying.get();
  if (current || nowPlaying.isSilent()) return current;
  const recovered = await metadataFromIcecast();
  return recovered ? nowPlaying.set(recovered) : null;
}

module.exports = {
  getListenerCount,
  getStatusJson,
  metadataFromIcecast,
  recoverNowPlaying,
  splitIcecastTitle,
};
