const { QueueItem, Track } = require("../models");
const liquidsoap = require("./liquidsoapClient");
const { annotateUri } = require("./playoutUri");
const nowPlaying = require("./nowPlaying");
const icecastStatus = require("./icecastStatus");
const autopilot = require("./autopilot");
const rotation = require("./rotation");
const studioSocket = require("../ws/studioSocket");
const logger = require("../logger");

// Phase 3: keeps the DB QueueItem mirror in sync with Liquidsoap's request
// queue. The DB owns ORDER (position); Liquidsoap holds the live pending queue.
//
//   - On add: push the single new item (`requests.push <uri>`), store its RID.
//   - On remove/reorder: rebuild — `requests.clear` then re-push every pending
//     item in position order (request.queue has no per-item removal over
//     telnet). RIDs are refreshed on the rows.
//   - The metadata hook (POST /playout/metadata) flips a queued item to
//     "playing"/"done" via the round-tripped queue_item_id.

const QUEUE_ID = process.env.LIQUIDSOAP_QUEUE_ID || "requests";
const OUTPUT_ID = process.env.LIQUIDSOAP_OUTPUT_ID || "radio_out";

const PENDING_ORDER = [
  ["position", "ASC"],
  ["createdAt", "ASC"],
];

function artworkUrl(artworkPath) {
  return artworkPath ? `/media/${artworkPath}` : null;
}

function serializeTrack(track) {
  if (!track) return null;
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    type: track.type,
    duration: track.duration,
    artworkUrl: artworkUrl(track.artworkPath),
  };
}

function serializeItem(item) {
  return {
    id: item.id,
    track: serializeTrack(item.track),
    requestedBy: item.requestedBy,
    status: item.status,
    position: item.position,
    addedAt: item.createdAt,
  };
}

function serializeAutodjPreview(entry, index) {
  return {
    id: `autodj-${entry.item.id}-${index}`,
    source: "autodj",
    kind: entry.kind,
    track: serializeTrack(entry.item),
    position: index,
  };
}

// Build the annotate URI for a queued track: source="request" + the
// queue_item_id so the metadata hook can mark the matching row as aired.
function itemUri(item, track) {
  return annotateUri(track || item.track, {
    source: "request",
    extra: { queue_item_id: item.id },
  });
}

// Pending items (the studio NEXT panel), ordered.
function pendingItems() {
  return QueueItem.findAll({
    where: { status: "pending" },
    order: PENDING_ORDER,
    include: [{ model: Track, as: "track" }],
  });
}

// Push a single item onto the Liquidsoap queue and remember its RID.
async function pushItem(item) {
  const track = item.track || (await Track.findByPk(item.trackId));
  if (!track) {
    logger.warn("queueSync.pushItem: track not found", {
      itemId: item.id,
      trackId: item.trackId,
    });
    return null;
  }
  const rid = await liquidsoap.pushRequest(itemUri(item, track), {
    queue: QUEUE_ID,
  });
  item.liqRid = String(rid).trim();
  await item.save();
  return item.liqRid;
}

// Clear Liquidsoap's pending queue (custom `requests.clear` command).
async function clearLiquidsoap() {
  return liquidsoap.command(`${QUEUE_ID}.clear`);
}

// Rebuild the Liquidsoap pending queue from the DB (clear + re-push in order).
// Used for remove/reorder where individual telnet removal isn't available.
async function reconcile() {
  const items = await pendingItems();
  try {
    await clearLiquidsoap();
  } catch (err) {
    logger.warn("queueSync.reconcile: clear failed", { error: String(err) });
  }
  for (const item of items) {
    try {
      await pushItem(item);
    } catch (err) {
      logger.warn("queueSync.reconcile: push failed", {
        itemId: item.id,
        error: String(err),
      });
    }
  }
  return items;
}

// Skip the current track on air (whatever source is playing).
function skipCurrent() {
  return liquidsoap.command(`${OUTPUT_ID}.skip`);
}

// List the RIDs currently in Liquidsoap's pending queue (best-effort).
async function liquidsoapRids() {
  const res = await liquidsoap.command(`${QUEUE_ID}.queue`);
  return String(res || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

// Track-change transition driven by the metadata hook. Demotes any
// currently-"playing" queued item to "done" (air moved on) and, if the new
// track is a queued item, flips it to "playing".
async function markStarted(queueItemId) {
  await QueueItem.update({ status: "done" }, { where: { status: "playing" } });
  if (queueItemId) {
    const [n] = await QueueItem.update(
      { status: "playing" },
      { where: { id: queueItemId, status: "pending" } }
    );
    return n > 0;
  }
  return false;
}

// Current queue state for GET /api/v1/queue and the queue:update broadcast.
async function getState() {
  const items = await pendingItems();
  let np = nowPlaying.get();
  if (!np) {
    try {
      np = await icecastStatus.recoverNowPlaying();
    } catch (err) {
      logger.warn("queueSync.getState: nowplaying recovery failed", {
        error: String(err),
      });
    }
  }

  let autodjItems = [];
  if (autopilot.isEnabled()) {
    try {
      const attributes = [
        "id",
        "title",
        "artist",
        "album",
        "type",
        "duration",
        "artworkPath",
      ];
      const [songs, jingles] = await Promise.all([
        Track.findAll({ where: { type: "song" }, attributes }),
        Track.findAll({ where: { type: "jingle" }, attributes }),
      ]);
      const previewState = np?.trackId
        ? { ...rotation.getState(), lastSongId: np.trackId }
        : rotation.getState();
      autodjItems = rotation
        .preview(
          { songs, jingles },
          Number(process.env.AUTODJ_PREVIEW_COUNT || 8),
          undefined,
          previewState
        )
        .map(serializeAutodjPreview);
    } catch (err) {
      logger.warn("queueSync.getState: AutoDJ preview failed", {
        error: String(err),
      });
    }
  }

  return {
    nowPlaying: np
      ? {
          trackId: np.trackId,
          title: np.title,
          artist: np.artist,
          album: np.album,
          thumb: np.thumb,
          source: np.source,
          startedAt: np.startedAt,
        }
      : null,
    items: items.map(serializeItem),
    autodj: {
      enabled: autopilot.isEnabled(),
      items: autodjItems,
    },
  };
}

// Broadcast the current queue state to all studio WS clients.
async function broadcastUpdate() {
  const state = await getState();
  studioSocket.broadcast("queue:update", state);
  return state;
}

module.exports = {
  QUEUE_ID,
  OUTPUT_ID,
  serializeItem,
  serializeTrack,
  serializeAutodjPreview,
  itemUri,
  pendingItems,
  pushItem,
  clearLiquidsoap,
  reconcile,
  skipCurrent,
  liquidsoapRids,
  markStarted,
  getState,
  broadcastUpdate,
};
