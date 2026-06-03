const fs = require("fs");
const os = require("os");
const path = require("path");
const ingest = require("../services/mediaIngest");
const { makeMp3Buffer } = require("./helpers/fixtures");

describe("mediaIngest service", () => {
  let filePath;
  let buffer;

  beforeAll(async () => {
    buffer = await makeMp3Buffer({ freq: 440, duration: 2 });
    filePath = path.join(os.tmpdir(), `rk-ingest-${Date.now()}.mp3`);
    fs.writeFileSync(filePath, buffer);
  });

  afterAll(() => {
    try {
      fs.unlinkSync(filePath);
    } catch (_) {}
  });

  test("computeHash is stable and detects duplicates vs. changes", () => {
    const h1 = ingest.computeHash(buffer);
    const h2 = ingest.computeHash(Buffer.from(buffer));
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
    expect(h2).toBe(h1); // identical bytes -> same hash (dedupe key)
    const changed = ingest.computeHash(Buffer.concat([buffer, Buffer.from([0x01])]));
    expect(changed).not.toBe(h1);
  });

  test("parseLoudness extracts integrated LUFS + loudness range", () => {
    const summary = [
      "  Integrated loudness:",
      "    I:         -16.0 LUFS",
      "    Threshold: -26.6 LUFS",
      "",
      "  Loudness range:",
      "    LRA:         3.7 LU",
      "    Threshold: -36.6 LUFS",
    ].join("\n");
    const { loudnessLufs, loudnessRange } = ingest.parseLoudness("\n" + summary);
    expect(loudnessLufs).toBeCloseTo(-16.0, 1);
    expect(loudnessRange).toBeCloseTo(3.7, 1);
  });

  test("analyzeTrack returns correct duration/bitrate/LUFS and a valid waveform", async () => {
    const a = await ingest.analyzeTrack(filePath);

    expect(a.duration).toBeGreaterThan(1.5);
    expect(a.duration).toBeLessThan(2.6);
    expect(a.bitrate).toBeGreaterThan(0);
    expect(a.sampleRate).toBeGreaterThan(0);
    expect(typeof a.loudnessLufs).toBe("number");
    expect(Number.isFinite(a.replaygain)).toBe(true);

    // Waveform JSON shape.
    expect(a.waveformJson).toMatchObject({
      version: 1,
      channels: 1,
      bits: 16,
    });
    expect(Array.isArray(a.waveformJson.peaks)).toBe(true);
    expect(a.waveformJson.peaks.length).toBeGreaterThan(0);
    expect(a.waveformJson.samples).toBe(a.waveformJson.peaks.length);
    for (const p of a.waveformJson.peaks) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });
});
