const os = require("os");
const fs = require("fs");
const path = require("path");

process.env.NODE_ENV = "test";
process.env.SECRET_KEY = process.env.SECRET_KEY || "test-secret";
process.env.INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || "test-internal";
process.env.ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "test-admin";
const { TEST_DATABASE_URL } = require("./setup/testDb");
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.MEDIA_DIR = process.env.MEDIA_DIR || path.join(os.tmpdir(), `rk-media-la-${Date.now()}`);
const DATA = path.join(os.tmpdir(), `rk-appdata-${Date.now()}`);
process.env.APP_DATA_DIR = DATA;

// Expo is mocked: no real pushes. Tokens ending in "gone" report the app as
// uninstalled.
jest.mock("expo-server-sdk", () => {
  class Expo {
    static isExpoPushToken(t) {
      return /^ExponentPushToken\[.+\]$/.test(t);
    }
    chunkPushNotifications(m) {
      return [m];
    }
    async sendPushNotificationsAsync(chunk) {
      return chunk.map((m) =>
        m.to.includes("gone") ? { status: "error", details: { error: "DeviceNotRegistered" } } : { status: "ok" }
      );
    }
  }
  return { Expo };
});

const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../app");
const { runMigrations } = require("../config/migrate");
const { sequelize, Recording, NotificationToken } = require("../models");

const sign = (claims) => `Bearer ${jwt.sign(claims, process.env.SECRET_KEY)}`;
const ADMIN = sign({ role: "admin", name: "Admin" });
const DJ = sign({ role: "dj", name: "DJ Nova" });
const LISTENER = sign({});

beforeAll(async () => {
  await runMigrations();
  await Recording.destroy({ where: {} });
  await NotificationToken.destroy({ where: {} });
}, 120000);

afterAll(async () => {
  await Recording.destroy({ where: {} });
  await NotificationToken.destroy({ where: {} });
  fs.rmSync(DATA, { recursive: true, force: true });
  await sequelize.close();
});

describe("recordings archive", () => {
  let rec;
  beforeAll(async () => {
    fs.writeFileSync(path.join(DATA, "recordings", "prog1.mp3"), Buffer.alloc(1000));
    rec = await Recording.create({
      id: "rec1",
      filename: "prog1.mp3",
      stream: "recording/recordings/prog1.mp3",
      title: "Morning Delight",
      artist: "Bant Yayini (01.06.2026)",
      album: "",
      artwork: "static/assets/thumbnails/03d207b03a69ecab3b32d394ad7593cf.jpeg",
      duration: 7200,
      size: 110,
      play_count: 4,
      date: new Date(),
    });
  });

  test("lists recordings with artwork URL and file status", async () => {
    const res = await request(app).get("/api/v1/recordings").set("Authorization", DJ);
    expect(res.status).toBe(200);
    expect(res.body.items[0]).toMatchObject({
      id: "rec1",
      plays: 4,
      artworkUrl: "/static/assets/thumbnails/03d207b03a69ecab3b32d394ad7593cf.jpeg",
      fileMissing: false,
    });
  });

  test("admins edit; DJs can't; the legacy list reflects the edit", async () => {
    expect(
      (await request(app).patch("/api/v1/recordings/rec1").set("Authorization", DJ).send({ title: "x" })).status
    ).toBe(403);
    const res = await request(app)
      .patch("/api/v1/recordings/rec1")
      .set("Authorization", ADMIN)
      .send({ title: "Sunday Special", special: "featured" });
    expect(res.body).toMatchObject({ title: "Sunday Special", special: "featured" });
    const legacy = await request(app).get("/recording/recordings").set("Authorization", LISTENER);
    expect(legacy.body.recordings[0].title).toBe("Sunday Special");
  });

  test("artwork upload, in-use protection, delete", async () => {
    const up = await request(app)
      .post("/api/v1/recordings/artworks")
      .set("Authorization", ADMIN)
      .attach("artwork", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), { filename: "a.jpg", contentType: "image/jpeg" });
    expect(up.status).toBe(201);
    const list = await request(app).get("/api/v1/recordings/artworks").set("Authorization", ADMIN);
    const seeded = list.body.items.find((a) => a.file.startsWith("03d207"));
    expect(seeded.usedBy).toBe(1);
    expect((await request(app).delete(`/api/v1/recordings/artworks/${seeded.file}`).set("Authorization", ADMIN)).status).toBe(409);
    expect((await request(app).delete(`/api/v1/recordings/artworks/${up.body.file}`).set("Authorization", ADMIN)).status).toBe(200);
    expect((await request(app).delete("/api/v1/recordings/artworks/..%2Fapp.js").set("Authorization", ADMIN)).status).toBe(404);
  });

  test("recorder status is idle and stop without a recording is refused", async () => {
    const st = await request(app).get("/api/v1/recordings/recorder").set("Authorization", DJ);
    expect(st.body.recording).toBe(false);
    expect((await request(app).post("/api/v1/recordings/recorder/stop").set("Authorization", DJ)).status).toBe(409);
  });

  test("delete removes the row and the file", async () => {
    const res = await request(app).delete("/api/v1/recordings/rec1").set("Authorization", ADMIN);
    expect(res.status).toBe(200);
    expect(fs.existsSync(path.join(DATA, "recordings", "prog1.mp3"))).toBe(false);
    expect(await Recording.count()).toBe(0);
  });
});

describe("listener chat", () => {
  test("DJ replies show up in the public chat and can be deleted", async () => {
    const posted = await request(app).post("/api/v1/chat").set("Authorization", DJ).send({ message: "Good morning!" });
    expect(posted.status).toBe(201);
    expect(posted.body).toMatchObject({ sender: "DJ Nova", admin: true });
    const pub = await request(app).get("/chat/chats").set("Authorization", LISTENER);
    expect(pub.body.chats.map((c) => c.message)).toContain("Good morning!");
    expect((await request(app).delete(`/api/v1/chat/${posted.body.id}`).set("Authorization", DJ)).status).toBe(200);
    expect((await request(app).get("/api/v1/chat").set("Authorization", DJ)).body.items).toHaveLength(0);
  });

  test("the public token can't moderate", async () => {
    expect((await request(app).get("/api/v1/chat").set("Authorization", LISTENER)).status).toBe(403);
  });
});

describe("announcement", () => {
  test("set, read via the legacy public route, clear", async () => {
    const put = await request(app).put("/api/v1/announcement").set("Authorization", ADMIN).send({ text: "Live concert Sunday 10:00" });
    expect(put.body.text).toBe("Live concert Sunday 10:00");
    const legacy = await request(app).get("/recording/announcement").set("Authorization", LISTENER);
    expect(legacy.body.announcement).toBe("Live concert Sunday 10:00");
    expect((await request(app).put("/api/v1/announcement").set("Authorization", DJ).send({ text: "x" })).status).toBe(403);
    await request(app).delete("/api/v1/announcement").set("Authorization", ADMIN);
    expect((await request(app).get("/recording/announcement").set("Authorization", LISTENER)).status).toBe(404);
  });
});

describe("push notifications", () => {
  test("the app re-registering its token no longer errors (legacy route)", async () => {
    for (let i = 0; i < 2; i++) {
      const res = await request(app)
        .post("/notification/save_notification_token")
        .set("Authorization", LISTENER)
        .send({ notification_token: "ExponentPushToken[aaa]" });
      expect(res.status).toBe(200);
    }
  });

  test("overview counts devices; send delivers and prunes uninstalled apps", async () => {
    await request(app)
      .post("/notification/save_notification_token")
      .set("Authorization", LISTENER)
      .send({ notification_token: "ExponentPushToken[gone1]" });
    const ov = await request(app).get("/api/v1/notifications").set("Authorization", ADMIN);
    expect(ov.body.devices).toBe(2);

    const sent = await request(app)
      .post("/api/v1/notifications")
      .set("Authorization", ADMIN)
      .send({ title: "We're live", body: "Morning Delight starts now" });
    expect(sent.body).toMatchObject({ attempted: 2, delivered: 1, removedDevices: 1, sentBy: "Admin" });
    expect(await NotificationToken.count()).toBe(1);

    const after = await request(app).get("/api/v1/notifications").set("Authorization", ADMIN);
    expect(after.body.history[0].title).toBe("We're live");
  });

  test("DJs can't send pushes", async () => {
    const res = await request(app).post("/api/v1/notifications").set("Authorization", DJ).send({ title: "a", body: "b" });
    expect(res.status).toBe(403);
  });
});
