import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MicControl from "@/components/studio/MicControl";
import * as api from "@/lib/api";
import * as mic from "@/lib/mic";
import type { StudioState } from "@/lib/types";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    startStudioSession: vi.fn(),
    stopStudioSession: vi.fn(),
    setStudioMode: vi.fn(),
  };
});

vi.mock("@/lib/mic", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mic")>();
  return {
    ...actual,
    captureMic: vi.fn(),
    connectIngest: vi.fn(),
  };
});

const idle: StudioState = {
  onAir: false,
  state: "idle",
  mode: null,
  sessionId: null,
  show: null,
  dj: null,
  levels: { mic: 0 },
};

const live: StudioState = {
  onAir: true,
  state: "voiceover",
  mode: "voiceover",
  sessionId: "sess-1",
  show: "Show",
  dj: "DJ",
  levels: { mic: 0.4 },
};

describe("MicControl — toggling drives session/start + ingest WS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.startStudioSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      sessionId: "sess-1",
      mode: "voiceover",
      ingest: { transport: "ws-opus", path: "/ws/ingest", query: { session: "sess-1" }, mount: "/live" },
    });
    (api.stopStudioSession as ReturnType<typeof vi.fn>).mockResolvedValue(idle);
    (mic.captureMic as ReturnType<typeof vi.fn>).mockResolvedValue({
      getTracks: () => [],
    });
    (mic.connectIngest as ReturnType<typeof vi.fn>).mockReturnValue({
      sendControl: vi.fn(),
      close: vi.fn(),
      stream: {},
    });
  });

  it("turning the mic ON starts a session and opens the ingest WS", async () => {
    render(<MicControl studio={idle} token="jwt.tok" onChanged={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /Turn microphone on/ }));

    await waitFor(() => expect(api.startStudioSession).toHaveBeenCalledTimes(1));
    expect(api.startStudioSession).toHaveBeenCalledWith({ mode: "voiceover" });
    await waitFor(() => expect(mic.captureMic).toHaveBeenCalled());
    expect(mic.connectIngest).toHaveBeenCalledTimes(1);
    const arg = (mic.connectIngest as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.token).toBe("jwt.tok");
    expect(arg.sessionId).toBe("sess-1");
  });

  it("turning the mic OFF stops the session", async () => {
    render(<MicControl studio={live} token="jwt.tok" onChanged={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Turn microphone off/ }));
    await waitFor(() => expect(api.stopStudioSession).toHaveBeenCalledTimes(1));
  });

  it("Autofeed toggle switches to full live takeover when on air", async () => {
    render(<MicControl studio={live} token="jwt.tok" onChanged={() => {}} />);
    // voiceover -> live (Autofeed OFF = full takeover)
    fireEvent.click(screen.getByRole("switch", { name: "Autofeed" }));
    await waitFor(() => expect(api.setStudioMode).toHaveBeenCalledWith("live"));
  });

  it("shows the mic level meter from studio:state levels", () => {
    render(<MicControl studio={live} token="jwt.tok" onChanged={() => {}} />);
    const meter = screen.getByTestId("mic-level");
    expect(meter).toHaveStyle({ width: "40%" });
  });
});
