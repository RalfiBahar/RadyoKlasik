const { WebSocketServer } = require("ws");
const { spawn } = require("child_process");
const jwt = require("jsonwebtoken");
const liveSession = require("../services/liveSession");
const logger = require("../logger");

// Phase 4 — browser mic ingest transport (NEW in this phase).
//
//   studio browser --getUserMedia--> Opus/WebM frames --WS--> THIS --stdin-->
//   ffmpeg --(Icecast SOURCE)--> Liquidsoap input.harbor "/live" --> mixed into
//   the Icecast /stream.
//
// Binary WS messages are raw encoded audio chunks (MediaRecorder webm/opus or
// ogg/opus) piped to ffmpeg's stdin. Text (JSON) messages are control frames
// ({ mode, duckLevel, micGain }) applied to the live session. The WS is
// authenticated by the studio's JWT (?token=) plus the session reservation id
// (?session=) returned from POST /api/v1/studio/session/start.
//
// Mounted with `noServer` + a path-scoped upgrade listener so it coexists with
// the /ws/studio channel on the same HTTP server. Inert under jest (no init).

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";

function harborUrl() {
  const host = process.env.LIQUIDSOAP_HOST || "liquidsoap";
  const port = process.env.LIVE_HARBOR_PORT || 8005;
  const user = process.env.LIVE_HARBOR_USER || "source";
  const password = process.env.LIVE_HARBOR_PASSWORD || "hackme-live";
  const mount = process.env.LIVE_HARBOR_MOUNT || "live";
  return `icecast://${user}:${password}@${host}:${port}/${mount}`;
}

let wss = null;

function init(server, { path = "/ws/ingest" } = {}) {
  if (wss) return wss;
  wss = new WebSocketServer({ noServer: true });
  wss.on("connection", handleConnection);

  server.on("upgrade", (req, socket, head) => {
    let parsed;
    try {
      parsed = new URL(req.url, "http://localhost");
    } catch (_) {
      return;
    }
    // Not our path — leave the socket for other upgrade listeners (studio).
    if (parsed.pathname !== path) return;

    const token = parsed.searchParams.get("token");
    const sessionId = parsed.searchParams.get("session");
    if (!authorize(token, sessionId)) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.sessionId = sessionId;
      wss.emit("connection", ws, req);
    });
  });

  logger.info(`ingest WebSocket listening on ${path}`);
  return wss;
}

function authorize(token, sessionId) {
  if (!token || !sessionId) return false;
  try {
    jwt.verify(token, process.env.SECRET_KEY);
  } catch (_) {
    return false;
  }
  return liveSession.isValidSession(sessionId);
}

function spawnEncoder() {
  // Decode whatever container/codec the browser sends (auto-probed) and
  // re-encode to MP3, publishing as an Icecast SOURCE to the harbor mount.
  const args = [
    "-hide_banner",
    "-loglevel", "warning",
    "-fflags", "+nobuffer",
    "-i", "pipe:0",
    "-ac", "2",
    "-ar", "44100",
    "-c:a", "libmp3lame",
    "-b:a", "128k",
    "-content_type", "audio/mpeg",
    "-f", "mp3",
    harborUrl(),
  ];
  return spawn(FFMPEG, args, { stdio: ["pipe", "ignore", "pipe"] });
}

function handleConnection(ws) {
  const sessionId = ws.sessionId;
  logger.info("ingest: studio connected", { sessionId });

  let ffmpeg = null;
  let closed = false;

  try {
    ffmpeg = spawnEncoder();
  } catch (err) {
    logger.error("ingest: ffmpeg spawn failed", { error: String(err) });
    ws.close(1011, "encoder failed");
    return;
  }

  ffmpeg.on("error", (err) => {
    logger.error("ingest: ffmpeg error", { error: String(err) });
  });
  ffmpeg.stderr.on("data", (d) => {
    const line = d.toString().trim();
    if (line) logger.warn("ingest: ffmpeg", { line });
  });
  ffmpeg.on("close", (code) => {
    logger.info("ingest: ffmpeg exited", { code, sessionId });
    if (!closed) {
      try {
        ws.close(1011, "encoder closed");
      } catch (_) {}
    }
  });

  ws.on("message", async (data, isBinary) => {
    if (isBinary) {
      if (ffmpeg && ffmpeg.stdin.writable) {
        ffmpeg.stdin.write(data);
      }
      return;
    }
    // Control frame (JSON).
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch (_) {
      return;
    }
    try {
      await liveSession.applyControl(msg);
    } catch (err) {
      logger.warn("ingest: applyControl failed", { error: String(err) });
    }
  });

  const teardown = () => {
    if (closed) return;
    closed = true;
    logger.info("ingest: studio disconnected", { sessionId });
    if (ffmpeg) {
      try {
        ffmpeg.stdin.end();
      } catch (_) {}
      // Give ffmpeg a beat to flush, then ensure it's gone.
      setTimeout(() => {
        try {
          ffmpeg.kill("SIGKILL");
        } catch (_) {}
      }, 1500).unref?.();
    }
  };

  ws.on("close", teardown);
  ws.on("error", teardown);
}

module.exports = { init, authorize, harborUrl };
