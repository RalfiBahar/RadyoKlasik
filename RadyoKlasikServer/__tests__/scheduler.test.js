const scheduler = require("../services/scheduler");
const rotation = require("../services/rotation");

const TZ = "Europe/Istanbul"; // UTC+3, no DST

// 2026-10-26 is a Monday. 09:30 Istanbul == 06:30 UTC.
const MON_0930 = new Date("2026-10-26T06:30:00Z");

describe("scheduler.localParts", () => {
  test("converts an instant to station-local day/minute/date", () => {
    expect(scheduler.localParts(MON_0930, TZ)).toEqual({
      date: "2026-10-26",
      dayOfWeek: 1,
      minute: 9 * 60 + 30,
    });
  });

  test("crosses midnight correctly", () => {
    // 22:30 UTC Sunday == 01:30 Monday in Istanbul.
    const p = scheduler.localParts(new Date("2026-10-25T22:30:00Z"), TZ);
    expect(p).toEqual({ date: "2026-10-26", dayOfWeek: 1, minute: 90 });
  });
});

describe("scheduler.resolveActive", () => {
  const weekly = (id, dayOfWeek, startMinute, durationMinutes) => ({
    id,
    dayOfWeek,
    date: null,
    startMinute,
    durationMinutes,
  });

  test("finds the weekly slot running now and when it ends", () => {
    const morning = weekly("m", 1, 9 * 60, 120); // Mon 09:00-11:00
    const r = scheduler.resolveActive([morning], MON_0930, TZ);
    expect(r.slot.id).toBe("m");
    expect(r.minutesInto).toBe(30);
    expect(r.endsAt.toISOString()).toBe("2026-10-26T08:00:00.000Z");
  });

  test("endsAt is minute-exact even mid-minute", () => {
    const morning = weekly("m", 1, 9 * 60, 120);
    const r = scheduler.resolveActive([morning], new Date("2026-10-26T06:30:41.512Z"), TZ);
    expect(r.endsAt.toISOString()).toBe("2026-10-26T08:00:00.000Z");
  });

  test("returns null outside every slot", () => {
    const evening = weekly("e", 1, 20 * 60, 60);
    expect(scheduler.resolveActive([evening], MON_0930, TZ)).toBeNull();
  });

  test("a slot that started Sunday night is still on air Monday morning", () => {
    const overnight = weekly("o", 0, 23 * 60, 11 * 60); // Sun 23:00 -> Mon 10:00
    expect(scheduler.resolveActive([overnight], MON_0930, TZ).slot.id).toBe("o");
  });

  test("a Saturday-night slot wraps into Sunday across the week boundary", () => {
    const sat = weekly("s", 6, 23 * 60, 120); // Sat 23:00 -> Sun 01:00
    // Sun 00:30 Istanbul == Sat 21:30 UTC.
    const r = scheduler.resolveActive([sat], new Date("2026-10-24T21:30:00Z"), TZ);
    expect(r.slot.id).toBe("s");
  });

  test("a one-off slot overrides the weekly slot", () => {
    const morning = weekly("m", 1, 9 * 60, 120);
    const special = {
      id: "x",
      dayOfWeek: null,
      date: "2026-10-26",
      startMinute: 9 * 60 + 15,
      durationMinutes: 30,
    };
    expect(scheduler.resolveActive([morning, special], MON_0930, TZ).slot.id).toBe("x");
  });

  test("a one-off on another date is ignored", () => {
    const other = {
      id: "x",
      dayOfWeek: null,
      date: "2026-10-27",
      startMinute: 9 * 60,
      durationMinutes: 60,
    };
    expect(scheduler.resolveActive([other], MON_0930, TZ)).toBeNull();
  });

  test("the most recently started of two overlapping weekly slots wins", () => {
    const long = weekly("long", 1, 6 * 60, 6 * 60);
    const nested = weekly("nested", 1, 9 * 60, 60);
    expect(scheduler.resolveActive([long, nested], MON_0930, TZ).slot.id).toBe("nested");
  });
});

describe("scheduler.minutesUntilStart", () => {
  test("counts down to the next weekly occurrence", () => {
    const slot = { dayOfWeek: 1, date: null, startMinute: 9 * 60 + 40, durationMinutes: 60 };
    expect(scheduler.minutesUntilStart(slot, MON_0930, TZ)).toBe(10);
  });
});

describe("rotation with scheduled pools", () => {
  const songs = [
    { id: "a", type: "song" },
    { id: "b", type: "song" },
    { id: "c", type: "song" },
  ];
  const commercials = [{ id: "ad1", type: "commercial" }];

  test("ordered pools play in list order and wrap", () => {
    let state = {};
    const ids = [];
    for (let i = 0; i < 5; i++) {
      const r = rotation.chooseNext(state, { songs, jingles: [], ordered: true }, 0);
      ids.push(r.item.id);
      state = r.state;
    }
    expect(ids).toEqual(["a", "b", "c", "a", "b"]);
  });

  test("a commercial airs every N songs", () => {
    let state = {};
    const kinds = [];
    for (let i = 0; i < 8; i++) {
      const r = rotation.chooseNext(state, { songs, jingles: [], commercials }, 0, 3);
      kinds.push(r.kind);
      state = r.state;
    }
    expect(kinds).toEqual([
      "song", "song", "song", "commercial", "song", "song", "song", "commercial",
    ]);
  });

  test("switching pool key rebuilds the plan", () => {
    rotation.resetAll();
    const lib = rotation.upcoming({ key: "library", songs, jingles: [] }, 4, 0);
    expect(lib.length).toBe(4);
    const only = [{ id: "z", type: "song" }];
    const pl = rotation.upcoming({ key: "playlist:p1", songs: only, jingles: [] }, 4, 0);
    expect(pl.every((e) => e.item.id === "z")).toBe(true);
  });
});
