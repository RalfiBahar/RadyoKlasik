const net = require("net");

// Lightweight TCP reachability probe used by the health controller to check
// whether Icecast / Liquidsoap are accepting connections. Resolves true on a
// successful connect, false on timeout/error. Never rejects.
function checkTcp(host, port, timeout = 1500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (ok) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };

    socket.setTimeout(timeout);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(Number(port), host);
  });
}

module.exports = { checkTcp };
