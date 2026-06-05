const { WebSocketServer } = require("ws");
const logger = require("../logger");

// Real-time studio channel (Phase 3 queue:update + Phase 4 studio:state). A
// WebSocket server mounted at `/ws/studio` that the operator UI subscribes to.
// Controllers call `broadcast(event, payload)` on any change (queue:update,
// studio:state) so the studio panels update live.
//
// Uses `noServer` + a path-scoped `upgrade` listener so it can coexist with the
// separate Phase 4 ingest socket (/ws/ingest) on the same HTTP server: each
// listener handles ONLY its own path and ignores others (no socket destroy), so
// multiple path-scoped WS servers share one http.Server cleanly.
//
// Designed to be inert when no server is attached (e.g. under jest/supertest,
// which uses the Express app without an HTTP server), so `broadcast` is always
// safe to call.

let wss = null;
const clients = new Set();

function init(server, { path = "/ws/studio" } = {}) {
  if (wss) return wss;
  wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (socket) => {
    clients.add(socket);
    // Greet the client so it knows the channel is live.
    safeSend(socket, { event: "studio:hello", data: { ok: true } });
    socket.on("close", () => clients.delete(socket));
    socket.on("error", () => clients.delete(socket));
  });

  server.on("upgrade", (req, socket, head) => {
    let pathname;
    try {
      pathname = new URL(req.url, "http://localhost").pathname;
    } catch (_) {
      return;
    }
    // Not our path — leave the socket for other upgrade listeners (e.g. ingest).
    if (pathname !== path) return;
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  logger.info(`studio WebSocket listening on ${path}`);
  return wss;
}

function safeSend(socket, message) {
  // 1 === WebSocket.OPEN
  if (socket.readyState !== 1) return;
  try {
    socket.send(JSON.stringify(message));
  } catch (err) {
    logger.warn("studio WS send failed", { error: String(err) });
  }
}

// Broadcast an event to every connected studio client. No-op when there are no
// clients / no server (so controllers can call it unconditionally).
function broadcast(event, data) {
  const message = { event, data };
  for (const socket of clients) {
    safeSend(socket, message);
  }
}

function clientCount() {
  return clients.size;
}

module.exports = { init, broadcast, clientCount };
