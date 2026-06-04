const { WebSocketServer } = require("ws");
const logger = require("../logger");

// Real-time studio channel (Phase 3). A WebSocket server mounted at
// `/ws/studio` that the operator UI subscribes to. The queue controller calls
// `broadcast("queue:update", payload)` on any queue change so the NEXT panel
// updates live. Designed to be inert when no server is attached (e.g. under
// jest/supertest, which uses the Express app without an HTTP server), so
// `broadcast` is always safe to call.

let wss = null;
const clients = new Set();

// Attach the WS server to an existing http.Server. Called from server.js.
function init(server, { path = "/ws/studio" } = {}) {
  if (wss) return wss;
  wss = new WebSocketServer({ server, path });

  wss.on("connection", (socket) => {
    clients.add(socket);
    // Greet the client so it knows the channel is live.
    safeSend(socket, { event: "studio:hello", data: { ok: true } });
    socket.on("close", () => clients.delete(socket));
    socket.on("error", () => clients.delete(socket));
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
