// Recordings in Cloudflare R2 (infra/R2_RECORDINGS_PLAN.md), tested against
// MinIO standing in for R2. Start one with:
//   docker run -d --name rk-test-minio -p 9100:9000 \
//     -e MINIO_ROOT_USER=rktest -e MINIO_ROOT_PASSWORD=rktest-secret-123 minio/minio server /data
// (CI starts the same container.) Skipped with a warning if it isn't running.
const os = require("os");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { execFile } = require("child_process");

process.env.NODE_ENV = "test";
process.env.SECRET_KEY = process.env.SECRET_KEY || "test-secret";
process.env.INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || "test-internal";
process.env.ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "test-admin";
const { TEST_DATABASE_URL } = require("./setup/testDb");
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.MEDIA_DIR = path.join(os.tmpdir(), `rk-media-r2-${Date.now()}`);
const DATA = path.join(os.tmpdir(), `rk-appdata-r2-${Date.now()}`);
process.env.APP_DATA_DIR = DATA;

const ENDPOINT = process.env.TEST_S3_ENDPOINT || "http://localhost:9100";
const BUCKET = `rk-test-${Date.now()}`;
const R2_ENV = {
  R2_ENDPOINT: ENDPOINT,
  R2_REGION: "us-east-1",
  R2_BUCKET: BUCKET,
  R2_ACCESS_KEY_ID: process.env.TEST_S3_KEY || "rktest",
  R2_SECRET_ACCESS_KEY: process.env.TEST_S3_SECRET || "rktest-secret-123",
};
Object.assign(process.env, R2_ENV);
delete process.env.R2_PUBLIC_BASE;
delete process.env.RECORDINGS_STORAGE;

const request = require("supertest");
const jwt = require("jsonwebtoken");
const { S3Client, CreateBucketCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");
const { makeMp3Buffer } = require("./helpers/fixtures");
const app = require("../app");
const { runMigrations } = require("../config/migrate");
const { sequelize, Recording } = require("../models");
const objectStorage = require("../services/objectStorage");
const storage = require("../services/recordingStorage");
const { RECORDINGS_DIR, THUMBNAILS_DIR } = require("../config/appData");
const alerts = require("../services/monitoring/alerts");

const sign = (claims) => `Bearer ${jwt.sign(claims, process.env.SECRET_KEY)}`;
const ADMIN = sign({ role: "admin", name: "Admin" });
const LISTENER_TOKEN = jwt.sign({}, process.env.SECRET_KEY);

let available = false;
const s3 = new S3Client({
  endpoint: ENDPOINT,
  region: "us-east-1",
  forcePathStyle: true,
  credentials: { accessKeyId: R2_ENV.R2_ACCESS_KEY_ID, secretAccessKey: R2_ENV.R2_SECRET_ACCESS_KEY },
});
const exists = (key) =>
  s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })).then(
    () => true,
    () => false
  );

// Fetch an absolute URL (the redirect target) with an optional Range header.
function fetchUrl(url, headers = {}) {
  return new Promise((resolve, reject) => {
    http
      .get(url, { headers }, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks), headers: res.headers }));
      })
      .on("error", reject);
  });
}

let mp3;
let n = 0;
async function makeRecording(extra = {}) {
  n += 1;
  const filename = `r2test-${n}.mp3`;
  fs.writeFileSync(path.join(RECORDINGS_DIR, filename), mp3);
  return Recording.create({
    id: `r2test-${n}`,
    filename,
    stream: `recording/recordings/${filename}`,
    title: `Show ${n}`,
    artist: "Bant Yayini",
    album: "",
    artwork: null,
    duration: 2,
    size: mp3.length / (1024 * 1024),
    play_count: 0,
    date: new Date(),
    ...extra,
  });
}

beforeAll(async () => {
  try {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
    available = true;
  } catch (err) {
    console.warn(`[recordingStorage.test] MinIO not reachable at ${ENDPOINT} — skipping (${err.message})`);
  }
  await runMigrations();
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
  fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
  mp3 = await makeMp3Buffer({ duration: 3 });
}, 120000);

afterAll(async () => {
  await Recording.destroy({ where: { id: Array.from({ length: n }, (_, i) => `r2test-${i + 1}`) } });
  fs.rmSync(DATA, { recursive: true, force: true });
  await sequelize.close();
});

const it2 = (name, fn, t) => test(name, async () => (available ? fn() : undefined), t);

it2("upload stores a checksum; verify, download and trash work", async () => {
  const f = path.join(RECORDINGS_DIR, "raw.mp3");
  fs.writeFileSync(f, mp3);
  const up = await objectStorage.upload(f, "recordings/raw.mp3", { contentType: "audio/mpeg" });
  expect(up.size).toBe(mp3.length);
  expect(await objectStorage.verify(f, "recordings/raw.mp3")).toMatchObject({ ok: true });
  fs.appendFileSync(f, "x");
  expect((await objectStorage.verify(f, "recordings/raw.mp3")).ok).toBe(false);
  const back = path.join(DATA, "back.mp3");
  await objectStorage.download("recordings/raw.mp3", back);
  expect(fs.readFileSync(back).equals(mp3)).toBe(true);
  await objectStorage.trash("recordings/raw.mp3");
  expect(await exists("recordings/raw.mp3")).toBe(false);
  expect(await exists("trash/recordings/raw.mp3")).toBe(true);
});

it2("legacy listener URL: from disk while local, redirect to R2 once uploaded; plays count, seeking works", async () => {
  const rec = await makeRecording();
  const url = `/recording/recordings/${rec.filename}?token=${LISTENER_TOKEN}`;

  const local = await request(app).get(url);
  expect(local.status).toBe(200);
  expect(local.body.length).toBe(mp3.length);

  expect(await storage.push(rec)).toMatchObject({ ok: true });
  await rec.reload();
  expect(rec.storage).toBe("r2");
  expect(rec.storedAt).toBeTruthy();

  const res = await request(app).get(url).redirects(0);
  expect(res.status).toBe(302);
  expect(res.headers.location).toContain(`/${BUCKET}/recordings/${rec.filename}`);

  // The player then seeks against R2 directly.
  const part = await fetchUrl(res.headers.location, { Range: "bytes=100-199" });
  expect(part.status).toBe(206);
  expect(part.body.equals(mp3.subarray(100, 200))).toBe(true);

  await rec.reload();
  expect(rec.play_count).toBe(2);
});

it2("a public custom domain is used when R2_PUBLIC_BASE is set", async () => {
  const rec = await makeRecording();
  await storage.push(rec);
  process.env.R2_PUBLIC_BASE = "https://media.example.test/";
  try {
    const res = await request(app).get(`/recording/recordings/${rec.filename}?token=${LISTENER_TOKEN}`).redirects(0);
    expect(res.headers.location).toBe(`https://media.example.test/recordings/${rec.filename}`);
  } finally {
    delete process.env.R2_PUBLIC_BASE;
  }
});

it2("new recordings upload only when RECORDINGS_STORAGE=r2", async () => {
  const off = await makeRecording();
  expect(await storage.afterRecorded(off)).toMatchObject({ skipped: true });
  expect((await off.reload()).storage).toBe("local");

  process.env.RECORDINGS_STORAGE = "r2";
  try {
    const on = await makeRecording();
    expect(await storage.afterRecorded(on)).toMatchObject({ ok: true });
    expect((await on.reload()).storage).toBe("r2");
  } finally {
    delete process.env.RECORDINGS_STORAGE;
  }
});

it2("a failed upload stays playable from disk, raises an alert and succeeds on retry", async () => {
  process.env.RECORDINGS_STORAGE = "r2";
  process.env.R2_SECRET_ACCESS_KEY = "wrong-secret";
  let rec;
  try {
    rec = await makeRecording();
    const r = await storage.afterRecorded(rec);
    expect(r.ok).toBe(false);
    await rec.reload();
    expect(rec.storage).toBe("pending");
    expect(rec.storageError).toBeTruthy();
    expect(alerts.RULES.recording_upload_failed({ recordingUploadsFailed: 1 })).toMatch(/failed to upload/);
    const res = await request(app).get(`/recording/recordings/${rec.filename}?token=${LISTENER_TOKEN}`).redirects(0);
    expect(res.status).toBe(200);
  } finally {
    process.env.R2_SECRET_ACCESS_KEY = R2_ENV.R2_SECRET_ACCESS_KEY;
    delete process.env.RECORDINGS_STORAGE;
  }
  const retried = await storage.retryPending();
  expect(retried.find((x) => x.filename === rec.filename)).toMatchObject({ ok: true });
  expect((await rec.reload()).storage).toBe("r2");
});

it2("panel edit of a cloud-only recording downloads, re-tags and re-uploads it", async () => {
  const rec = await makeRecording();
  await storage.push(rec);
  fs.unlinkSync(storage.localPath(rec));

  const res = await request(app).patch(`/api/v1/recordings/${rec.id}`).set("Authorization", ADMIN).send({ title: "Renamed" });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ title: "Renamed", storage: "r2", storageError: null });
  expect((await objectStorage.verify(storage.localPath(rec), storage.key(rec))).ok).toBe(true);
  expect(require("node-id3").read(storage.localPath(rec)).title).toBe("Renamed");

  // Panel preview follows the cloud copy too.
  const prev = await request(app).get(`/api/v1/recordings/${rec.id}/audio`).set("Authorization", ADMIN).redirects(0);
  expect(prev.status).toBe(302);
});

it2("panel lists storage state and can upload a local recording on demand", async () => {
  const rec = await makeRecording();
  const list = await request(app).get("/api/v1/recordings?limit=200").set("Authorization", ADMIN);
  expect(list.body.storage).toMatchObject({ configured: true, mode: "local" });
  expect(list.body.items.find((i) => i.id === rec.id)).toMatchObject({ storage: "local", onDisk: true });
  const up = await request(app).post(`/api/v1/recordings/${rec.id}/upload`).set("Authorization", ADMIN);
  expect(up.status).toBe(200);
  expect(up.body.storage).toBe("r2");
});

it2("deleting moves the cloud copy to trash/ and removes the local file", async () => {
  const rec = await makeRecording();
  await storage.push(rec);
  const res = await request(app).delete(`/api/v1/recordings/${rec.id}`).set("Authorization", ADMIN);
  expect(res.status).toBe(200);
  expect(fs.existsSync(storage.localPath(rec))).toBe(false);
  expect(await exists(storage.key(rec))).toBe(false);
  expect(await exists(`trash/${storage.key(rec)}`)).toBe(true);
});

it2("a 'local' row whose file is gone falls back to the bucket copy", async () => {
  const rec = await makeRecording();
  await storage.push(rec);
  await rec.update({ storage: "local" });
  fs.unlinkSync(storage.localPath(rec));
  const res = await request(app).get(`/recording/recordings/${rec.filename}?token=${LISTENER_TOKEN}`).redirects(0);
  expect(res.status).toBe(302);
});

it2("pruning deletes only verified local copies past the grace period", async () => {
  const old = await makeRecording();
  await storage.push(old);
  await old.update({ storedAt: new Date(Date.now() - 10 * 86400000) });
  const fresh = await makeRecording();
  await storage.push(fresh);
  const bad = await makeRecording();
  await storage.push(bad);
  await bad.update({ storedAt: new Date(Date.now() - 10 * 86400000) });
  fs.appendFileSync(storage.localPath(bad), "changed");

  const dry = await storage.pruneLocal({ days: 7, dryRun: true });
  expect(fs.existsSync(storage.localPath(old))).toBe(true);
  expect(dry.pruned).toBeGreaterThanOrEqual(1);

  await storage.pruneLocal({ days: 7 });
  expect(fs.existsSync(storage.localPath(old))).toBe(false);
  expect(fs.existsSync(storage.localPath(fresh))).toBe(true);
  expect(fs.existsSync(storage.localPath(bad))).toBe(true);
  expect((await bad.reload()).storage).toBe("pending");
});

function runScript(...args) {
  return new Promise((resolve) => {
    execFile(
      "node",
      [path.join(__dirname, "..", "scripts", "recordingsToR2.js"), ...args],
      { env: { ...process.env, ...R2_ENV, LOG_LEVEL: "error" } },
      (err, stdout, stderr) => {
        // The report is the pretty-printed object at the end (log lines come first).
        const at = stdout.lastIndexOf('{\n  "bucket"');
        let report = null;
        try {
          report = JSON.parse(stdout.slice(at));
        } catch (_) {
          report = { parseError: stdout.slice(-2000) + stderr.slice(-2000) };
        }
        resolve({ code: err ? err.code : 0, report, stderr });
      }
    );
  });
}

it2("bulk script: dry run, migrate, verify, back to local", async () => {
  const a = await makeRecording();
  const b = await makeRecording();
  const missing = await makeRecording();
  fs.unlinkSync(storage.localPath(missing));

  const dry = await runScript("--dry-run");
  expect(dry.code).toBe(0);
  expect(dry.report.toUpload).toBeGreaterThanOrEqual(2);
  expect(dry.report.missingExamples).toContain(missing.filename);
  expect((await a.reload()).storage).toBe("local");

  const run = await runScript();
  expect(run.report.failed).toBe(0);
  expect((await a.reload()).storage).toBe("r2");
  expect((await b.reload()).storage).toBe("r2");
  expect((await missing.reload()).storage).toBe("local");

  const again = await runScript();
  expect(again.report.toUpload).toBe(0);

  const ver = await runScript("--verify");
  expect(ver.code).toBe(0);
  expect(ver.report.mismatches).toBe(0);

  fs.unlinkSync(storage.localPath(a));
  const back = await runScript("--back-to-local");
  expect(back.report.failed).toHaveLength(0);
  expect((await a.reload()).storage).toBe("local");
  expect(fs.readFileSync(storage.localPath(a)).equals(mp3)).toBe(true);
}, 120000);
