const { spawn } = require("child_process");

// Synthesize a small MP3 in-memory via ffmpeg's lavfi sine generator, so tests
// don't depend on committed binary fixtures. Returns a Buffer.
function makeMp3Buffer({ freq = 440, duration = 2 } = {}) {
  return new Promise((resolve, reject) => {
    const bin = process.env.FFMPEG_PATH || "ffmpeg";
    const proc = spawn(bin, [
      "-hide_banner",
      "-nostats",
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=${freq}:duration=${duration}`,
      "-ac",
      "2",
      "-b:a",
      "128k",
      "-f",
      "mp3",
      "-",
    ]);
    const chunks = [];
    let stderr = "";
    proc.stdout.on("data", (d) => chunks.push(d));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0
        ? resolve(Buffer.concat(chunks))
        : reject(new Error(`ffmpeg fixture failed (${code}): ${stderr}`))
    );
  });
}

module.exports = { makeMp3Buffer };
