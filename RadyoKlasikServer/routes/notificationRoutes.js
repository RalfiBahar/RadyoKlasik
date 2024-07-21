const { Router } = require("express");
const {
  saveNotificationToken,
  sendNotificationToAll,
} = require("../controllers/notificationController.js");
const router = Router();

router.post("/save_notification_token", saveNotificationToken);
router.post("/send_notification", sendNotificationToAll);

module.exports = router;
