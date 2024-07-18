const axios = require("axios");
const ffmpeg = require("fluent-ffmpeg");
const { format } = require("date-fns");
const crypto = require("crypto");
const { PassThrough } = require("stream");
const fs = require("fs");
const path = require("path");

let recordingStream;
let recordingProcess;

// Get the URL from command line arguments
const url = process.argv[2];
if (!url) {
  console.error("No URL provided.");
  process.send({ status: "error", error: "No URL provided." });
  process.exit(1);
}

const generateFileName = () => {
  const now = new Date();
  const dateStr = format(now, "ddMMyyyy");
  const hash = crypto
    .createHash("md5")
    .update(now.toString())
    .digest("hex")
    .slice(0, 6);
  const fileName = `${dateStr}_LiveProgramme${hash}.mp3`;
  return fileName;
};

const recordingStartTime = Date.now();
const outputDir = path.join(__dirname, "recordings");
const dateString = new Date().toISOString().replace(/:/g, "-"); // Replace colons to make it filesystem friendly
const outputFilePath = path.join(outputDir, generateFileName());

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

async function recordStream(url) {
  recordingStream = new PassThrough();
  try {
    const response = await axios({
      method: "get",
      url: url,
      responseType: "stream",
    });

    response.data.pipe(recordingStream);

    recordingProcess = ffmpeg(recordingStream)
      .audioCodec("libmp3lame")
      .format("mp3")
      .on("end", () => {
        process.send({
          status: "finished",
          filePath: outputFilePath,
          duration: Date.now() - recordingStartTime,
        });
        process.exit(0);
      })
      .on("error", (error) => {
        process.send({ status: "error", error: error.message });
        process.exit(1);
      })
      .save(outputFilePath);
  } catch (error) {
    console.error("Recording error:", error);
    process.send({ status: "error", error: error.message });
    process.exit(1);
  }
}

process.on("message", (msg) => {
  if (msg === "stop") {
    recordingStream.end();
    recordingProcess.on("end", () => {
      process.send({ status: "stopped" });
      process.exit(0);
    });
  }
});

recordStream(url);
