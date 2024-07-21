const { Router } = require("express");
const {
  saveNotificationToken,
  sendNotificationToAll,
  notificationCenter,
} = require("../controllers/notificationController.js");
const { loginRequired } = require("../middlewares/authMiddleware");
const router = Router();

router.post("/save_notification_token", saveNotificationToken);
router.post("/send_notification", sendNotificationToAll);
router.get("/notification-center", loginRequired, notificationCenter);

module.exports = router;
