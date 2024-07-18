const express = require("express");
const recordingController = require("../controllers/recordingController");

const router = express.Router();

router.use(recordingController);

module.exports = router;
