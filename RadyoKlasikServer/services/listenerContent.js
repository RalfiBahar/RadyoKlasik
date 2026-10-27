const fs = require("fs");
const path = require("path");
const md5 = require("md5");
const { Expo } = require("expo-server-sdk");
const { CHAT_HISTORY_FILE, ANNOUNCEMENT_FILE } = require("../config/appData");
const logger = require("../logger");

// Listener-facing content managed from the panel: chat, the announcement and
// push notifications. Same storage as the legacy routes (chat JSON file,
// announcement text file, NotificationTokens table), so the website, the
// mobile app and the old EJS dashboard all see the same data.

// --- Chat --------------------------------------------------------------------

function readChat() {
  if (!fs.existsSync(CHAT_HISTORY_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(CHAT_HISTORY_FILE, "utf8"));
  } catch (err) {
    logger.error("chat history unreadable", { error: String(err) });
    return [];
  }
}

function writeChat(list) {
  fs.writeFileSync(CHAT_HISTORY_FILE, JSON.stringify(list, null, 2));
}

// Station / DJ reply. Shape matches the legacy admin chat (admin: true).
function postStationMessage({ message, sender, logo = null }) {
  const date = new Date();
  const msg = {
    id: md5(message + sender + date.toString()),
    message,
    sender,
    timestamp: date,
    admin: true,
    logo,
  };
  const list = readChat();
  list.push(msg);
  writeChat(list);
  return msg;
}

function deleteChatMessage(id) {
  const list = readChat();
  const idx = list.findIndex((c) => c.id === id);
  if (idx < 0) return false;
  list.splice(idx, 1);
  writeChat(list);
  return true;
}

function clearChat() {
  writeChat([]);
}

// --- Announcement ------------------------------------------------------------

function getAnnouncement() {
  if (!fs.existsSync(ANNOUNCEMENT_FILE)) return null;
  const text = fs.readFileSync(ANNOUNCEMENT_FILE, "utf8");
  const stat = fs.statSync(ANNOUNCEMENT_FILE);
  return { text, updatedAt: stat.mtime.toISOString() };
}

function setAnnouncement(text) {
  fs.writeFileSync(ANNOUNCEMENT_FILE, text, "utf8");
  return getAnnouncement();
}

function clearAnnouncement() {
  if (fs.existsSync(ANNOUNCEMENT_FILE)) fs.unlinkSync(ANNOUNCEMENT_FILE);
}

// --- Push notifications --------------------------------------------------------

const expo = new Expo({ useFcmV1: true });
const HISTORY_LIMIT = 50;
// Kept next to the chat file (the persistent app-data volume in docker).
const PUSH_HISTORY_FILE = path.join(path.dirname(CHAT_HISTORY_FILE), "pushHistory.json");

function readPushHistory() {
  try {
    return JSON.parse(fs.readFileSync(PUSH_HISTORY_FILE, "utf8"));
  } catch (_) {
    return [];
  }
}

async function pushStats() {
  const { NotificationToken } = require("../models");
  const tokens = await NotificationToken.findAll({ attributes: ["token"] });
  return {
    devices: tokens.filter((t) => Expo.isExpoPushToken(t.token)).length,
    invalidTokens: tokens.filter((t) => !Expo.isExpoPushToken(t.token)).length,
  };
}

// Same delivery as the legacy sendNotificationToAll; also prunes devices that
// uninstalled the app (DeviceNotRegistered) so the audience count stays true.
async function sendPush({ title, subtitle, body, sentBy = null }) {
  const { NotificationToken } = require("../models");
  const tokens = await NotificationToken.findAll();
  const messages = tokens
    .filter((t) => Expo.isExpoPushToken(t.token))
    .map((t) => ({
      to: t.token,
      title,
      body,
      sound: "default",
      priority: "high",
      ...(subtitle ? { subtitle } : {}),
    }));

  let ok = 0;
  const gone = [];
  for (const chunk of expo.chunkPushNotifications(messages)) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      tickets.forEach((ticket, i) => {
        if (ticket.status === "ok") ok += 1;
        else if (ticket.details && ticket.details.error === "DeviceNotRegistered") gone.push(chunk[i].to);
      });
    } catch (err) {
      logger.error("push chunk failed", { error: String(err) });
    }
  }
  if (gone.length) await NotificationToken.destroy({ where: { token: gone } });

  const entry = {
    title,
    subtitle: subtitle || null,
    body,
    sentAt: new Date().toISOString(),
    sentBy,
    attempted: messages.length,
    delivered: ok,
    removedDevices: gone.length,
  };
  fs.writeFileSync(
    PUSH_HISTORY_FILE,
    JSON.stringify([entry, ...readPushHistory()].slice(0, HISTORY_LIMIT), null, 2)
  );
  logger.info("push sent", entry);
  return entry;
}

function getPushHistory() {
  return readPushHistory();
}

module.exports = {
  readChat,
  postStationMessage,
  deleteChatMessage,
  clearChat,
  getAnnouncement,
  setAnnouncement,
  clearAnnouncement,
  pushStats,
  sendPush,
  getPushHistory,
};
