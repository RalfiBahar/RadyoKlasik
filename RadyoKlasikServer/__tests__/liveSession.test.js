// Unit tests for the Phase 4 live-session pure helpers: the session state
// machine transitions, the side-chain duck-gain function, mic-prefs
// normalization, and the mode -> Liquidsoap interactive-var mapping. No stack
// or DB needed (the telnet client is not exercised here).

process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgres://radyo:dev-postgres-pw@localhost:5432/radyoklasik_unit";

const live = require("../services/liveSession");
const { STATES } = live;

describe("liveSession.transition (state machine)", () => {
  test("idle -> live / voiceover via start", () => {
    expect(live.transition(STATES.IDLE, { type: "start", mode: "live" })).toBe(
      STATES.LIVE
    );
    expect(
      live.transition(STATES.IDLE, { type: "start", mode: "voiceover" })
    ).toBe(STATES.VOICEOVER);
  });

  test("start requires a valid mode and an idle source", () => {
    expect(live.transition(STATES.IDLE, { type: "start", mode: "bogus" })).toBeNull();
    // Can't start when already live.
    expect(live.transition(STATES.LIVE, { type: "start", mode: "live" })).toBeNull();
  });

  test("live <-> voiceover via setMode", () => {
    expect(
      live.transition(STATES.LIVE, { type: "setMode", mode: "voiceover" })
    ).toBe(STATES.VOICEOVER);
    expect(
      live.transition(STATES.VOICEOVER, { type: "setMode", mode: "live" })
    ).toBe(STATES.LIVE);
  });

  test("setMode is invalid from idle", () => {
    expect(
      live.transition(STATES.IDLE, { type: "setMode", mode: "live" })
    ).toBeNull();
  });

  test("stop / disconnect always return to idle (full cycle)", () => {
    let s = STATES.IDLE;
    s = live.transition(s, { type: "start", mode: "live" });
    expect(s).toBe(STATES.LIVE);
    s = live.transition(s, { type: "setMode", mode: "voiceover" });
    expect(s).toBe(STATES.VOICEOVER);
    s = live.transition(s, { type: "stop" });
    expect(s).toBe(STATES.IDLE);

    expect(live.transition(STATES.LIVE, { type: "disconnect" })).toBe(STATES.IDLE);
  });
});

describe("liveSession.duckGain (side-chain gate)", () => {
  test("ducks music to the duck level while the mic is above threshold", () => {
    expect(live.duckGain(0.3, { threshold: 0.05, duckLevel: 0.25 })).toBe(0.25);
  });

  test("restores music to full when the mic is below threshold (silence)", () => {
    expect(live.duckGain(0.01, { threshold: 0.05, duckLevel: 0.25 })).toBe(1);
  });

  test("clamps the duck level into [0,1] and treats NaN mic as silence", () => {
    expect(live.duckGain(1, { threshold: 0.05, duckLevel: 2 })).toBe(1);
    expect(live.duckGain(NaN, { threshold: 0.05, duckLevel: 0.25 })).toBe(1);
  });
});

describe("liveSession.normalizePrefs", () => {
  test("fills defaults for a missing/invalid blob", () => {
    const p = live.normalizePrefs(null);
    expect(p.micGain).toBe(1);
    expect(p.duckLevel).toBeGreaterThan(0);
    expect(p.timeoutMs).toBeGreaterThanOrEqual(1000);
  });

  test("clamps + carries provided values", () => {
    const p = live.normalizePrefs({
      micGain: 9, // clamped to 4
      duckLevel: 0.4,
      silenceThreshold: 0.1,
      timeoutMs: 5000,
      inputDeviceId: "mic-1",
    });
    expect(p.micGain).toBe(4);
    expect(p.duckLevel).toBe(0.4);
    expect(p.silenceThreshold).toBe(0.1);
    expect(p.timeoutMs).toBe(5000);
    expect(p.inputDeviceId).toBe("mic-1");
  });
});

describe("liveSession.modeVars (mode -> interactive vars)", () => {
  test("full takeover cuts the music bed (music_gain 0)", () => {
    const v = live.modeVars(STATES.LIVE, { duckLevel: 0.3, micGain: 1.5 });
    expect(v.live_music_gain).toBe(0);
    expect(v.live_duck).toBe(0.3);
    expect(v.live_mic_gain).toBe(1.5);
  });

  test("voice-over keeps the music bed at full (music_gain 1)", () => {
    const v = live.modeVars(STATES.VOICEOVER, { duckLevel: 0.25, micGain: 1 });
    expect(v.live_music_gain).toBe(1);
    expect(v.live_duck).toBe(0.25);
  });

  test("idle resets everything", () => {
    const v = live.modeVars(STATES.IDLE, {});
    expect(v.live_music_gain).toBe(1);
    expect(v.live_mic_gain).toBe(1);
  });
});
