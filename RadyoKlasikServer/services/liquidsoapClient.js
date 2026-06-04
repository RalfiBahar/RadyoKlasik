const net = require("net");

// Thin wrapper over Liquidsoap's telnet command server. Liquidsoap exposes a
// line-based protocol on LIQUIDSOAP_HOST:LIQUIDSOAP_TELNET_PORT (reachable from
// the api container over the private compose network, not published to the
// host). Each command's response is terminated by a line containing "END".
//
// Used by the control plane to drive playout: skip the current track, push a
// request (Phase 3 queue), or probe liveness. One short-lived connection per
// command keeps it simple and avoids holding a socket open.

const defaultHost = () => process.env.LIQUIDSOAP_HOST || "localhost";
const defaultPort = () => Number(process.env.LIQUIDSOAP_TELNET_PORT || 1234);
const DEFAULT_TIMEOUT = Number(process.env.LIQUIDSOAP_TELNET_TIMEOUT_MS || 4000);

// Send a single telnet command and resolve with its (trimmed) response text.
function command(cmd, options = {}) {
  const host = options.host || defaultHost();
  const port = options.port || defaultPort();
  const timeout = options.timeout || DEFAULT_TIMEOUT;

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let buffer = "";
    let settled = false;

    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch (_) {}
      if (err) reject(err);
      else resolve(value);
    };

    socket.setTimeout(timeout);

    socket.on("connect", () => {
      socket.write(`${cmd}\n`);
    });

    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      // Liquidsoap terminates each command response with a line "END".
      const match = buffer.match(/(^|\r?\n)END\r?\n?/);
      if (match) {
        const response = buffer.slice(0, match.index).replace(/\r?\n$/, "");
        socket.write("quit\n");
        finish(null, response.trim());
      }
    });

    socket.on("timeout", () =>
      finish(new Error(`liquidsoap telnet timeout after ${timeout}ms`))
    );
    socket.on("error", (err) => finish(err));
    socket.on("close", () =>
      finish(new Error("liquidsoap telnet connection closed before END"))
    );
  });
}

// Skip the current track on a named source (default: the AutoDJ rotation).
function skip(source = "autodj", options) {
  return command(`${source}.skip`, options);
}

// Push a request URI onto a Liquidsoap request queue (used by the Phase 3
// queue). The autodj source is request.dynamic, so this targets the queue
// source added in later phases.
function pushRequest(uri, options = {}) {
  const queue = options.queue || "requests";
  return command(`${queue}.push ${uri}`, options);
}

// Probe whether the telnet server answers (best-effort liveness check).
async function reachable(options) {
  try {
    await command("version", options);
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = { command, skip, pushRequest, reachable };
