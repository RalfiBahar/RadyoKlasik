const fs = require("fs");
const path = require("path");
const { Router } = require("express");
const {
  tokenRequired,
  loginRequired,
} = require("../middlewares/authMiddleware");
const logger = require("../logger");
const md5 = require("md5");

const router = Router();
const chatHistoryFilePath = path.join(__dirname, "..", "chatHistory.json");

// Helper function to read chat history from the file
const readChatHistory = () => {
  if (!fs.existsSync(chatHistoryFilePath)) {
    return [];
  }
  const chatData = fs.readFileSync(chatHistoryFilePath, "utf8");
  return JSON.parse(chatData);
};

// Helper function to write chat history to the file
const writeChatHistory = (chatHistory) => {
  fs.writeFileSync(
    chatHistoryFilePath,
    JSON.stringify(chatHistory, null, 2),
    "utf8"
  );
};

// Get chat history
router.get("/chats", tokenRequired, (req, res) => {
  try {
    const chatHistory = readChatHistory();
    logger.info("Chat history retrieved", { chatCount: chatHistory.length });
    res.json({ chats: chatHistory });
  } catch (error) {
    logger.error("Error retrieving chat history", { error });
    res.status(500).json({ error: "Error retrieving chat history" });
  }
});

// Send a new chat message (Regular users)
router.post("/send_chat", tokenRequired, (req, res) => {
  const { message, sender } = req.body;

  if (!message || !sender) {
    return res.status(400).json({ error: "Message and sender are required" });
  }

  try {
    const chatHistory = readChatHistory();
    const date = new Date();
    const newChat = {
      id: md5(message + sender + date.toString()),
      message,
      sender,
      timestamp: date,
    };

    chatHistory.push(newChat);
    writeChatHistory(chatHistory);

    logger.info("New chat message added", { newChat });
    res.json({ message: "Chat message sent", newChat });
  } catch (error) {
    logger.error("Error sending chat message", { error });
    res.status(500).json({ error: "Error sending chat message" });
  }
});

// Send an admin message with a logo/icon
router.post("/send_admin_chat", loginRequired, (req, res) => {
  const { message, sender, logo } = req.body;

  if (!message || !sender) {
    return res.status(400).json({ error: "Message and sender are required" });
  }

  try {
    const chatHistory = readChatHistory();
    const date = new Date();
    console.log(md5(message + sender + date.toString()));
    const newAdminChat = {
      id: md5(message + sender + date.toString()),
      message,
      sender,
      timestamp: date,
      admin: true,
      logo: logo || null,
    };

    chatHistory.push(newAdminChat);
    writeChatHistory(chatHistory);

    logger.info("New admin message added", { newAdminChat });
    res.json({ message: "Admin chat message sent", newAdminChat });
  } catch (error) {
    logger.error("Error sending admin chat message", { error });
    res.status(500).json({ error: "Error sending admin chat message" });
  }
});

// Delete a user message (admin only)
router.delete("/delete_chat/:id", [loginRequired], (req, res) => {
  const chatId = req.params.id;

  try {
    let chatHistory = readChatHistory();
    const chatIndex = chatHistory.findIndex((chat) => chat.id === chatId);

    if (chatIndex === -1) {
      return res.status(404).json({ message: "Chat message not found" });
    }

    chatHistory.splice(chatIndex, 1); // Remove the message
    writeChatHistory(chatHistory);

    logger.info("Chat message deleted", { chatId });
    res.json({ message: "Chat message deleted" });
  } catch (error) {
    logger.error("Error deleting chat message", { error });
    res.status(500).json({ error: "Error deleting chat message" });
  }
});

router.get("/", loginRequired, (req, res) => {
  res.render("chat-center", {
    shared_secret_key: process.env.SHARED_SECRET_KEY,
  });
});

module.exports = router;
