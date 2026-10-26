const os = require("os");
const path = require("path");

// Wire env BEFORE requiring app/models (config/database binds DATABASE_URL at
// require time).
process.env.NODE_ENV = "test";
process.env.SECRET_KEY = process.env.SECRET_KEY || "test-secret";
process.env.INTERNAL_API_SECRET =
  process.env.INTERNAL_API_SECRET || "test-internal";
process.env.ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "test-admin";
const { TEST_DATABASE_URL } = require("./setup/testDb");
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.MEDIA_DIR =
  process.env.MEDIA_DIR || path.join(os.tmpdir(), `rk-media-p7-${Date.now()}`);

jest.mock("../services/liquidsoapClient", () => ({
  command: jest.fn(async () => "Done."),
  pushRequest: jest.fn(async () => "1000"),
  setVar: jest.fn(async () => "Done."),
  skip: jest.fn(async () => "Done."),
  reachable: jest.fn(async () => true),
}));

const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../app");
const settings = require("../services/settings");
const scheduler = require("../services/scheduler");
const liveSession = require("../services/liveSession");
const { runMigrations } = require("../config/migrate");
const {
  sequelize,
  User,
  Show,
  ScheduleSlot,
  Playlist,
  PlaylistItem,
  Track,
  Episode,
  StationSetting,
} = require("../models");

const ADMIN = `Bearer ${jwt.sign({ role: "admin" }, process.env.SECRET_KEY)}`;
// What the public listener apps get from POST /auth/generate_token.
const LISTENER = `Bearer ${jwt.sign({}, process.env.SECRET_KEY)}`;
const INTERNAL = process.env.INTERNAL_API_SECRET;

const created = { users: [], shows: [], playlists: [], tracks: [] };

function uniq(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

async function createDj(fields = {}) {
  const res = await request(app)
    .post("/api/v1/users")
    .set("Authorization", ADMIN)
    .send({ username: uniq("dj"), password: "s3cret-pass", role: "dj", ...fields });
  expect(res.status).toBe(201);
  created.users.push(res.body.id);
  return res.body;
}

function tokenFor(user) {
  return `Bearer ${jwt.sign({ sub: user.id, role: user.role }, process.env.SECRET_KEY)}`;
}

beforeAll(async () => {
  await runMigrations();
  await settings.load();
}, 120000);

afterEach(async () => {
  await liveSession.stop();
  await ScheduleSlot.destroy({ where: {} });
  await StationSetting.destroy({ where: {} });
  settings._reset();
  scheduler._setActive(null);
});

afterAll(async () => {
  await Episode.destroy({ where: { showId: created.shows } });
  await Show.destroy({ where: { id: created.shows } });
  await PlaylistItem.destroy({ where: { playlistId: created.playlists } });
  await Playlist.destroy({ where: { id: created.playlists } });
  await Track.destroy({ where: { id: created.tracks } });
  await User.destroy({ where: { id: created.users } });
  await sequelize.close();
});

describe("staff auth", () => {
  test("the public shared-secret token is rejected on the operator API", async () => {
    const res = await request(app).get("/api/v1/queue").set("Authorization", LISTENER);
    expect(res.status).toBe(403);
    const skip = await request(app)
      .post("/api/v1/playout/skip")
      .set("Authorization", LISTENER);
    expect(skip.status).toBe(403);
  });

  test("studio_login issues a role-carrying token for the env admin", async () => {
    const res = await request(app)
      .post("/auth/studio_login")
      .send({ username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD });
    expect(res.status).toBe(200);
    expect(jwt.decode(res.body.access_token).role).toBe("admin");
  });

  test("a DJ logs in with their password; a wrong password is 401", async () => {
    const dj = await createDj({ displayName: "DJ Nova" });
    const ok = await request(app)
      .post("/auth/studio_login")
      .send({ username: dj.username, password: "s3cret-pass" });
    expect(ok.status).toBe(200);
    const claims = jwt.decode(ok.body.access_token);
    expect(claims).toMatchObject({ sub: dj.id, role: "dj", name: "DJ Nova" });

    const bad = await request(app)
      .post("/auth/studio_login")
      .send({ username: dj.username, password: "nope-nope" });
    expect(bad.status).toBe(401);
  });

  test("disabling a DJ revokes their existing token immediately", async () => {
    const dj = await createDj();
    const auth = tokenFor(dj);
    expect((await request(app).get("/api/v1/queue").set("Authorization", auth)).status).toBe(200);
    await request(app)
      .patch(`/api/v1/users/${dj.id}`)
      .set("Authorization", ADMIN)
      .send({ active: false });
    expect((await request(app).get("/api/v1/queue").set("Authorization", auth)).status).toBe(403);
  });

  test("DJs can't manage users", async () => {
    const dj = await createDj();
    const res = await request(app).get("/api/v1/users").set("Authorization", tokenFor(dj));
    expect(res.status).toBe(403);
  });
});

describe("guest invites", () => {
  test("a guest token works inside its window and dies outside it", async () => {
    const now = Date.now();
    const res = await request(app)
      .post("/api/v1/users/guest")
      .set("Authorization", ADMIN)
      .send({
        name: "Visiting Pianist",
        accessFrom: new Date(now - 60000).toISOString(),
        accessUntil: new Date(now + 3600000).toISOString(),
      });
    expect(res.status).toBe(201);
    created.users.push(res.body.user.id);
    const guest = `Bearer ${res.body.token}`;

    expect((await request(app).get("/api/v1/studio/session").set("Authorization", guest)).status).toBe(200);
    // Guests are studio-only: no library uploads.
    expect(
      (await request(app).post("/api/v1/library/bulk").set("Authorization", guest).send({})).status
    ).toBe(403);

    // Close the window -> rejected.
    await User.update(
      { accessUntil: new Date(now - 1000) },
      { where: { id: res.body.user.id } }
    );
    expect((await request(app).get("/api/v1/studio/session").set("Authorization", guest)).status).toBe(403);
  });
});

describe("shows + schedule", () => {
  async function makeShow(hostIds = []) {
    const res = await request(app)
      .post("/api/v1/shows")
      .set("Authorization", ADMIN)
      .send({ title: uniq("Show"), tagline: "Classics", color: "#e8743b", hostIds });
    expect(res.status).toBe(201);
    created.shows.push(res.body.id);
    return res.body;
  }

  function nowSlot(extra = {}) {
    const local = scheduler.localParts(new Date(), settings.get("timezone"));
    return {
      dayOfWeek: local.dayOfWeek,
      startMinute: Math.max(0, local.minute - 5),
      durationMinutes: 60,
      ...extra,
    };
  }

  test("creates a show with hosts and lists it", async () => {
    const dj = await createDj();
    const show = await makeShow([dj.id]);
    expect(show.hosts.map((h) => h.id)).toEqual([dj.id]);
    const list = await request(app).get("/api/v1/shows").set("Authorization", ADMIN);
    expect(list.body.items.map((s) => s.id)).toContain(show.id);
  });

  test("validates slots", async () => {
    const res = await request(app)
      .post("/api/v1/schedule")
      .set("Authorization", ADMIN)
      .send({ dayOfWeek: 9, startMinute: 0, durationMinutes: 60 });
    expect(res.status).toBe(400);
  });

  test("a slot running now becomes the active slot", async () => {
    const show = await makeShow();
    const res = await request(app)
      .post("/api/v1/schedule")
      .set("Authorization", ADMIN)
      .send(nowSlot({ showId: show.id }));
    expect(res.status).toBe(201);
    const now = await request(app).get("/api/v1/schedule/now").set("Authorization", ADMIN);
    expect(now.body.active.showId).toBe(show.id);
  });

  test("a scheduled playlist narrows AutoDJ to its songs", async () => {
    const pl = await Playlist.create({ name: uniq("Morning") });
    created.playlists.push(pl.id);
    const t = await Track.create({
      title: "Scheduled Only",
      type: "song",
      duration: 5,
      filePath: "x.mp3",
      fileHash: uniq("hash"),
    });
    created.tracks.push(t.id);
    await PlaylistItem.create({ playlistId: pl.id, trackId: t.id, position: 0 });

    await request(app)
      .post("/api/v1/schedule")
      .set("Authorization", ADMIN)
      .send(nowSlot({ playlistId: pl.id, title: "Morning block" }));

    const pools = await scheduler.rotationPools(["id", "title", "type"]);
    expect(pools.key).toMatch(/^playlist:/);
    expect(pools.songs.map((s) => s.id)).toEqual([t.id]);
  });

  test("with the schedule enforced, only the show's host may go live", async () => {
    const host = await createDj();
    const other = await createDj();
    const show = await makeShow([host.id]);
    await request(app)
      .post("/api/v1/schedule")
      .set("Authorization", ADMIN)
      .send(nowSlot({ showId: show.id }));
    await request(app)
      .patch("/api/v1/settings")
      .set("Authorization", ADMIN)
      .send({ enforceSchedule: true });

    const denied = await request(app)
      .post("/api/v1/studio/session/start")
      .set("Authorization", tokenFor(other))
      .send({ mode: "voiceover" });
    expect(denied.status).toBe(403);

    const allowed = await request(app)
      .post("/api/v1/studio/session/start")
      .set("Authorization", tokenFor(host))
      .send({ mode: "voiceover" });
    expect(allowed.status).toBe(201);

    // Reaching air logs an episode for the show.
    await request(app)
      .post("/api/v1/playout/harbor")
      .set("X-Internal-Secret", INTERNAL)
      .send({ event: "connect" });
    const eps = await request(app)
      .get(`/api/v1/shows/${show.id}/episodes`)
      .set("Authorization", ADMIN);
    expect(eps.body.items.length).toBe(1);
  });
});

describe("settings", () => {
  test("persists break cadence and rejects bad values", async () => {
    const ok = await request(app)
      .patch("/api/v1/settings")
      .set("Authorization", ADMIN)
      .send({ jingleEvery: 3, commercialEvery: 5 });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ jingleEvery: 3, commercialEvery: 5 });

    settings._reset();
    await settings.load();
    expect(settings.get("commercialEvery")).toBe(5);

    const bad = await request(app)
      .patch("/api/v1/settings")
      .set("Authorization", ADMIN)
      .send({ timezone: "Mars/Olympus" });
    expect(bad.status).toBe(400);
  });

  test("autopilot survives a reload (no reset to ON on restart)", async () => {
    await request(app)
      .post("/api/v1/playout/autopilot")
      .set("Authorization", ADMIN)
      .send({ enabled: false });
    settings._reset();
    await settings.load();
    expect(settings.get("autopilot")).toBe(false);
  });
});
