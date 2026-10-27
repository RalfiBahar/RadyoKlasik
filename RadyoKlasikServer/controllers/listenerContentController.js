const content = require("../services/listenerContent");
const logger = require("../logger");

// Panel API for listener chat, the announcement and push notifications
// (/api/v1/chat, /api/v1/announcement, /api/v1/notifications).

const wrap = (fn) => async (req, res) => {
  try {
    return await fn(req, res);
  } catch (err) {
    logger.error("listener content request failed", { error: String(err) });
    return res.status(500).json({ error: String(err) });
  }
};

// GET /api/v1/chat?since=<iso>
exports.chatList = wrap((req, res) => {
  let items = content.readChat();
  if (req.query.since) {
    const since = new Date(req.query.since).getTime();
    items = items.filter((c) => new Date(c.timestamp).getTime() > since);
  }
  return res.json({ items });
});

// POST /api/v1/chat { message, sender? } — reply as the station / DJ.
exports.chatPost = wrap((req, res) => {
  const message = String((req.body && req.body.message) || "").trim();
  if (!message) return res.status(400).json({ error: "message is required" });
  if (message.length > 1000) return res.status(400).json({ error: "message is too long" });
  const sender =
    String((req.body && req.body.sender) || "").trim() ||
    (req.user && req.user.role !== "admin" && req.user.name) ||
    process.env.STATION_NAME ||
    "Radyo Klasik";
  return res.status(201).json(content.postStationMessage({ message, sender }));
});

// DELETE /api/v1/chat/:id
exports.chatDelete = wrap((req, res) => {
  if (!content.deleteChatMessage(req.params.id)) {
    return res.status(404).json({ error: "message not found" });
  }
  return res.json({ deleted: true });
});

// DELETE /api/v1/chat — clear the whole chat (admin).
exports.chatClear = wrap((req, res) => {
  content.clearChat();
  return res.json({ cleared: true });
});

// GET /api/v1/announcement
exports.announcementGet = wrap((req, res) => res.json(content.getAnnouncement() || { text: null, updatedAt: null }));

// PUT /api/v1/announcement { text }
exports.announcementSet = wrap((req, res) => {
  const text = String((req.body && req.body.text) || "").trim();
  if (!text) return res.status(400).json({ error: "text is required (use DELETE to remove)" });
  return res.json(content.setAnnouncement(text));
});

// DELETE /api/v1/announcement
exports.announcementClear = wrap((req, res) => {
  content.clearAnnouncement();
  return res.json({ text: null, updatedAt: null });
});

// GET /api/v1/notifications — audience size + recent sends.
exports.pushOverview = wrap(async (req, res) => {
  return res.json({ ...(await content.pushStats()), history: content.getPushHistory() });
});

// POST /api/v1/notifications { title, subtitle?, body }
exports.pushSend = wrap(async (req, res) => {
  const { title, subtitle, body } = req.body || {};
  if (!title || !String(title).trim() || !body || !String(body).trim()) {
    return res.status(400).json({ error: "title and body are required" });
  }
  const result = await content.sendPush({
    title: String(title).trim(),
    subtitle: subtitle ? String(subtitle).trim() : null,
    body: String(body).trim(),
    sentBy: req.user ? req.user.name : null,
  });
  return res.json(result);
});
