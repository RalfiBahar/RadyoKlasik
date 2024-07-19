const axios = require("axios");
const ffmpeg = require("fluent-ffmpeg");
const { format } = require("date-fns");
const crypto = require("crypto");
const { PassThrough } = require("stream");
const fs = require("fs");
const path = require("path");

let recordingStream;
let recordingProcess;

const url = process.argv[2];
if (!url) {
  console.error("No URL provided.");
  process.send({ status: "error", error: "No URL provided." });
  process.exit(1);
}

const generateFileName = (prefix = "") => {
  const now = new Date();
  const dateStr = format(now, "ddMMyyyy");
  const hash = crypto
    .createHash("md5")
    .update(now.toString())
    .digest("hex")
    .slice(0, 6);
  const fileName = `${dateStr}_${prefix}LiveProgramme${hash}.mp3`;
  return fileName;
};

const recordingStartTime = Date.now();
const outputDir = path.join(__dirname, "recordings");
const dateString = new Date().toISOString().replace(/:/g, "-");
const outputFilePath = path.join(outputDir, generateFileName());
const tempFilePath = path.join(outputDir, generateFileName("temp"));

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
      .on("end", async () => {
        console.log("Recording ended.");
        const recordedDuration = (Date.now() - recordingStartTime) / 1000;
        console.log(`Recorded duration: ${recordedDuration} seconds.`);
        await trimRecording(outputFilePath, recordedDuration);
        if (isRecordingStopped) {
          process.send({ status: "stopped" });
          process.exit(0);
        }
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

async function trimRecording(filePath, duration) {
  console.log("Starting trimming process...");
  return new Promise((resolve, reject) => {
    ffmpeg(filePath)
      .setStartTime(0)
      .setDuration(duration)
      .output(tempFilePath)
      .on("end", () => {
        console.log("Trimming completed.");
        fs.rename(tempFilePath, filePath, (err) => {
          if (err) {
            console.error("Error renaming file:", err);
            process.send({ status: "error", error: err.message });
            reject(err);
          } else {
            console.log(`Trimmed file saved as ${filePath}`);
            process.send({
              status: "finished",
              filePath: filePath,
              duration: duration,
            });
            resolve();
          }
        });
      })
      .on("error", (error) => {
        console.error("Trimming error:", error);
        process.send({ status: "error", error: error.message });
        reject(error);
      })
      .run();
  });
}

process.on("message", (msg) => {
  if (msg === "stop") {
    console.log("Stopping recording...");
    recordingStream.end();
    isRecordingStopped = true;
  }
});

recordStream(url);
