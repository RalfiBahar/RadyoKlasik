const http = require("http");
const app = require("./app");
const studioSocket = require("./ws/studioSocket");

const PORT = process.env.PORT || 8001;

// Wrap the Express app in an explicit HTTP server so the studio WebSocket
// (/ws/studio, Phase 3 queue:update broadcasts) can share the same port.
const server = http.createServer(app);
studioSocket.init(server);

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
