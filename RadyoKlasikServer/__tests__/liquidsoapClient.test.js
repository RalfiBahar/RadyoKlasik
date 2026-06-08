const net = require("net");
const client = require("../services/liquidsoapClient");

// Spin up a tiny loopback TCP server that emulates Liquidsoap's telnet command
// server: it records the command it received and replies with a body followed
// by an "END" terminator line (and closes on "quit").
function makeFakeTelnet(responder) {
  return new Promise((resolve) => {
    const received = [];
    const server = net.createServer((socket) => {
      let buf = "";
      socket.on("data", (chunk) => {
        buf += chunk.toString();
        let idx;
        while ((idx = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (line === "quit") {
            socket.end();
            continue;
          }
          received.push(line);
          const body = responder(line);
          socket.write(`${body}\r\nEND\r\n`);
        }
      });
    });
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, port: server.address().port, received });
    });
  });
}

describe("liquidsoapClient", () => {
  test("sends a command and parses the response up to END", async () => {
    const { server, port, received } = await makeFakeTelnet(() => "2.2.5");
    try {
      const res = await client.command("version", { host: "127.0.0.1", port });
      expect(res).toBe("2.2.5");
      expect(received).toContain("version");
    } finally {
      server.close();
    }
  });

  test("skip() formats `<source>.skip`", async () => {
    const { server, port, received } = await makeFakeTelnet(() => "OK");
    try {
      const res = await client.skip("autodj", { host: "127.0.0.1", port });
      expect(res).toBe("OK");
      expect(received).toContain("autodj.skip");
    } finally {
      server.close();
    }
  });

  test("pushRequest() formats `<queue>.push <uri>`", async () => {
    const { server, port, received } = await makeFakeTelnet(() => "1");
    try {
      await client.pushRequest("annotate:title=\"x\":/m/a.mp3", {
        host: "127.0.0.1",
        port,
        queue: "requests",
      });
      expect(received).toContain('requests.push annotate:title="x":/m/a.mp3');
    } finally {
      server.close();
    }
  });

  test("setVar() formats interactive variable assignments", async () => {
    const { server, port, received } = await makeFakeTelnet(() => "Done.");
    try {
      await client.setVar("autopilot_on", false, { host: "127.0.0.1", port });
      await client.setVar("station_name", "Radyo Klasik", {
        host: "127.0.0.1",
        port,
      });
      expect(received).toContain("var.set autopilot_on = false");
      expect(received).toContain('var.set station_name = "Radyo Klasik"');
    } finally {
      server.close();
    }
  });

  test("reachable() returns true when the server answers", async () => {
    const { server, port } = await makeFakeTelnet(() => "2.2.5");
    try {
      await expect(
        client.reachable({ host: "127.0.0.1", port })
      ).resolves.toBe(true);
    } finally {
      server.close();
    }
  });

  test("reachable() returns false when nothing is listening", async () => {
    // Port 1 is privileged / closed; connection should fail fast.
    await expect(
      client.reachable({ host: "127.0.0.1", port: 1, timeout: 1000 })
    ).resolves.toBe(false);
  });

  test("command() rejects on timeout when no END arrives", async () => {
    // Server that accepts but never replies.
    const server = net.createServer(() => {});
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const port = server.address().port;
    try {
      await expect(
        client.command("hang", { host: "127.0.0.1", port, timeout: 300 })
      ).rejects.toThrow(/timeout/i);
    } finally {
      server.close();
    }
  });
});
