const http = require("http");
const app = require("./app");
const studioSocket = require("./ws/studioSocket");
const ingest = require("./ws/ingest");

const PORT = process.env.PORT || 8001;

// Wrap the Express app in an explicit HTTP server so the WebSocket channels can
// share the same port:
//   /ws/studio  — queue:update + studio:state broadcasts (Phase 3/4)
//   /ws/ingest  — live DJ mic audio bridge (Phase 4)
// Both attach with `noServer` + path-scoped upgrade listeners so they coexist.
const server = http.createServer(app);
studioSocket.init(server);
ingest.init(server);

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
