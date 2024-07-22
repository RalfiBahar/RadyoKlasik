const NotificationToken = require("../models/notificationToken");
const { Expo } = require("expo-server-sdk");
const md5 = require("md5");
const logger = require("../logger");

const expo = new Expo({
  useFcmV1: true,
});

const saveNotificationToken = async (req, res) => {
  const notification_token = req.body.notification_token;
  if (!notification_token) {
    logger.warn("No notification token sent");
    res.status(400).json({ error: "No notification token sent" });
    return;
  }

  // Not checking for the format of the token as its format might be changed...

  const newNotificationToken = await NotificationToken.create({
    id: md5(notification_token),
    token: notification_token,
  });

  logger.info("Notification token saved", { newNotificationToken });
  res.status(200).json({ message: "Notification token saved" });
};

const sendNotificationToAll = async (req, res) => {
  const { title, subtitle, body } = req.body;

  if (!title || !body) {
    logger.error(`Title and body values not sent`);
    res.status(400).json({ error: "Title and body values not sent" });
    return;
  }

  try {
    const notificationTokens = await NotificationToken.findAll();

    let notification_messages = [];
    for (let token of notificationTokens) {
      if (!Expo.isExpoPushToken(token.token)) {
        logger.error(`Push token ${token} is not valid`);
        continue;
      }

      let message = {
        to: token.token,
        title,
        body,
        sound: "default",
        priority: "high",
      };

      if (subtitle) {
        message.subtitle = subtitle;
      }

      notification_messages.push(message);
    }

    let chunks = expo.chunkPushNotifications(notification_messages);
    let numSuccessfulMessages = 0;
    let totalMessages = notification_messages.length;

    for (let chunk of chunks) {
      try {
        let receipts = await expo.sendPushNotificationsAsync(chunk);
        logger.info("Receipts", receipts);
        console.log(receipts);
        receipts.forEach((receipt) => {
          if (receipt.status === "ok") {
            numSuccessfulMessages++;
          }
        });
      } catch (error) {
        logger.error("Error sending notification", error);
      }
    }
    let successPercentage = (numSuccessfulMessages / totalMessages) * 100;
    logger.info(`Notifications successfully sent: ${numSuccessfulMessages}`);
    logger.info(`Success percentage: ${successPercentage.toFixed(2)}%`);
    res.status(200).json({
      message: "Notifications sent",
      num_notifications_sent: numSuccessfulMessages,
      success_percentage: successPercentage.toFixed(2),
    });
  } catch (error) {
    logger.error("Error fetching notification tokens", error);
    res.status(500).json({ error: "Failed to send notifications" });
  }
};

const notificationCenter = (req, res) => {
  res.render("notification-center", {
    shared_secret_key: process.env.SHARED_SECRET_KEY,
  });
};

module.exports = {
  saveNotificationToken,
  sendNotificationToAll,
  notificationCenter,
};
