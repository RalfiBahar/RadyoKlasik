import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  generateToken,
  listTracks,
  reorderQueue,
  setAutopilot,
  startStudioSession,
} from "@/lib/api";
import { getToken, setToken } from "@/lib/token";

function mockFetchOnce(body: unknown, init: { status?: number } = {}) {
  const status = init.status ?? 200;
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  } as Response);
}

describe("api client", () => {
  beforeEach(() => {
    setToken("tok.tok.tok");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a Bearer token and builds query params for listTracks", async () => {
    const fetchMock = mockFetchOnce({ items: [], counts: {}, total: 0 });
    vi.stubGlobal("fetch", fetchMock);

    await listTracks({ type: "song", q: "bach", page: 2, pageSize: 15 });

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/v1/library/tracks?");
    expect(url).toContain("type=song");
    expect(url).toContain("q=bach");
    expect(url).toContain("page=2");
    expect(opts.headers.Authorization).toBe("Bearer tok.tok.tok");
  });

  it("PATCHes queue reorder with orderedIds", async () => {
    const fetchMock = mockFetchOnce({ items: [], nowPlaying: null });
    vi.stubGlobal("fetch", fetchMock);

    await reorderQueue(["a", "b", "c"]);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/v1/queue/reorder");
    expect(opts.method).toBe("PATCH");
    expect(JSON.parse(opts.body)).toEqual({ orderedIds: ["a", "b", "c"] });
  });

  it("posts autopilot toggle", async () => {
    const fetchMock = mockFetchOnce({ autopilot: false });
    vi.stubGlobal("fetch", fetchMock);
    await setAutopilot(false);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/playout/autopilot");
    expect(JSON.parse(opts.body)).toEqual({ enabled: false });
  });

  it("starts a studio session with mode + show/dj", async () => {
    const fetchMock = mockFetchOnce({
      sessionId: "s1",
      mode: "voiceover",
      ingest: { path: "/ws/ingest", query: { session: "s1" }, mount: "/live" },
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await startStudioSession({ mode: "voiceover", dj: "Ada" });
    expect(res.sessionId).toBe("s1");
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/studio/session/start");
    expect(JSON.parse(opts.body)).toMatchObject({ mode: "voiceover", dj: "Ada" });
  });

  it("generateToken does NOT send auth and returns the access token", async () => {
    const fetchMock = mockFetchOnce({ access_token: "new.jwt.here" });
    vi.stubGlobal("fetch", fetchMock);
    const tok = await generateToken("dev-shared");
    expect(tok).toBe("new.jwt.here");
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.headers.Authorization).toBeUndefined();
  });

  it("clears auth and throws ApiError on 401", async () => {
    const fetchMock = mockFetchOnce({ message: "Token is missing!" }, { status: 401 });
    vi.stubGlobal("fetch", fetchMock);
    await expect(listTracks()).rejects.toBeInstanceOf(ApiError);
    expect(getToken()).toBeNull();
  });
});
