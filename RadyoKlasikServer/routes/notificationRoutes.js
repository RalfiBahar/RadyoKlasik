const { Router } = require("express");
const {
  saveNotificationToken,
  sendNotificationToAll,
  notificationCenter,
} = require("../controllers/notificationController.js");
const {
  loginRequired,
  tokenRequired,
} = require("../middlewares/authMiddleware");
const router = Router();

router.post("/save_notification_token", tokenRequired, saveNotificationToken);
router.post("/send_notification", tokenRequired, sendNotificationToAll);
router.get("/notification-center", loginRequired, notificationCenter);

module.exports = router;
