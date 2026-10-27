const { Router } = require("express");
const {
  saveNotificationToken,
  sendNotificationToAll,
  notificationCenter,
  deleteAllNotificationTokens,
} = require("../controllers/notificationController.js");
const {
  loginRequired,
  tokenRequired,
  adminRequired,
} = require("../middlewares/authMiddleware");
const router = Router();

router.post("/save_notification_token", tokenRequired, saveNotificationToken);
router.post("/send_notification", adminRequired, sendNotificationToAll);
router.get("/notification-center", loginRequired, notificationCenter);
router.delete("/delete_all_notification_tokens", adminRequired, deleteAllNotificationTokens);

module.exports = router;
