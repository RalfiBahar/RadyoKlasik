// Unit tests for the Phase 3 queue → Liquidsoap command mapping and the
// annotate-URI builder. The Liquidsoap telnet client is mocked, so these run
// without the stack or a DB.

process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgres://radyo:dev-postgres-pw@localhost:5432/radyoklasik_unit";
process.env.MEDIA_DIR = process.env.MEDIA_DIR || "/tmp/rk-media-unit";

jest.mock("../services/liquidsoapClient", () => {
  let rid = 100;
  return {
    command: jest.fn(async (cmd) => (cmd.endsWith(".queue") ? "" : "Done.")),
    pushRequest: jest.fn(async () => String(++rid)),
    skip: jest.fn(async () => "Done."),
    reachable: jest.fn(async () => true),
  };
});

const liquidsoap = require("../services/liquidsoapClient");
const queueSync = require("../services/queueSync");
const { annotateUri, replaygainToLinear } = require("../services/playoutUri");

const track = {
  id: "track-uuid-1",
  title: "Song With Spaces",
  artist: "An Artist",
  album: "An Album",
  filePath: "tracks/abc.mp3",
  replaygain: 6.02, // ~ x2.0 linear
};

beforeEach(() => {
  liquidsoap.command.mockClear();
  liquidsoap.pushRequest.mockClear();
});

describe("playoutUri.annotateUri", () => {
  test("defaults source to autodj and computes liq_amplify", () => {
    const uri = annotateUri(track);
    expect(uri).toMatch(/^annotate:/);
    expect(uri).toContain('source="autodj"');
    expect(uri).toContain('track_id="track-uuid-1"');
    expect(uri).toContain("liq_amplify=");
    expect(uri).toMatch(/\/tracks\/abc\.mp3$/);
  });

  test("carries source=request and queue_item_id for queued items", () => {
    const uri = annotateUri(track, {
      source: "request",
      extra: { queue_item_id: "qi-1" },
    });
    expect(uri).toContain('source="request"');
    expect(uri).toContain('queue_item_id="qi-1"');
  });

  test("replaygainToLinear: null -> 1, +6.02dB -> ~2.0", () => {
    expect(replaygainToLinear(null)).toBe(1);
    expect(replaygainToLinear(6.02)).toBeCloseTo(2.0, 2);
  });
});

describe("queueSync command mapping", () => {
  test("pushItem sends requests.push with a request annotate URI", async () => {
    const item = {
      id: "qi-42",
      trackId: track.id,
      track,
      liqRid: null,
      save: jest.fn(async function () {
        return this;
      }),
    };
    const rid = await queueSync.pushItem(item);
    expect(liquidsoap.pushRequest).toHaveBeenCalledTimes(1);
    const [uriArg, opts] = liquidsoap.pushRequest.mock.calls[0];
    expect(uriArg).toContain('source="request"');
    expect(uriArg).toContain('queue_item_id="qi-42"');
    expect(opts).toMatchObject({ queue: "requests" });
    expect(item.liqRid).toBe(rid);
    expect(item.save).toHaveBeenCalled();
  });

  test("skipCurrent skips the output source (radio_out.skip)", async () => {
    await queueSync.skipCurrent();
    expect(liquidsoap.command).toHaveBeenCalledWith("radio_out.skip");
  });

  test("clearLiquidsoap sends requests.clear", async () => {
    await queueSync.clearLiquidsoap();
    expect(liquidsoap.command).toHaveBeenCalledWith("requests.clear");
  });

  test("liquidsoapRids parses a space-separated RID list", async () => {
    liquidsoap.command.mockResolvedValueOnce("12 7 99");
    const rids = await queueSync.liquidsoapRids();
    expect(rids).toEqual(["12", "7", "99"]);
  });

  test("liquidsoapRids returns [] for an empty queue", async () => {
    liquidsoap.command.mockResolvedValueOnce("");
    expect(await queueSync.liquidsoapRids()).toEqual([]);
  });
});
