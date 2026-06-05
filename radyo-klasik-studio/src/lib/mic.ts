import { ingestSocketUrl } from "./ws";
import type { StudioMode } from "./types";

// Browser mic capture -> /ws/ingest bridge (Phase 4 ingest contract):
//   getUserMedia -> MediaRecorder(audio/webm;codecs=opus) -> binary WS frames
//   -> Node ffmpeg -> Liquidsoap input.harbor "/live".
// JSON control frames { mode, duckLevel, micGain } are sent over the same WS.

export interface IngestControl {
  sendControl: (msg: { mode?: StudioMode; duckLevel?: number; micGain?: number }) => void;
  close: () => void;
  readonly stream: MediaStream;
}

export async function captureMic(
  deviceId?: string | null
): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone capture is not supported in this browser");
  }
  const audio: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
  };
  if (deviceId) audio.deviceId = { exact: deviceId };
  return navigator.mediaDevices.getUserMedia({ audio, video: false });
}

function pickMimeType(): string | undefined {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];
  if (typeof MediaRecorder === "undefined") return undefined;
  return candidates.find((t) => MediaRecorder.isTypeSupported?.(t));
}

// Open the ingest WS and start streaming the given MediaStream to it.
// timeslice (ms) controls how often MediaRecorder emits a chunk.
export function connectIngest(opts: {
  token: string;
  sessionId: string;
  stream: MediaStream;
  timesliceMs?: number;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (err: Event) => void;
}): IngestControl {
  const { token, sessionId, stream, timesliceMs = 250 } = opts;
  const ws = new WebSocket(ingestSocketUrl(token, sessionId));
  ws.binaryType = "arraybuffer";

  let recorder: MediaRecorder | null = null;

  ws.onopen = () => {
    const mimeType = pickMimeType();
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
        ws.send(e.data);
      }
    };
    recorder.start(timesliceMs);
    opts.onOpen?.();
  };
  ws.onclose = () => {
    stopRecorder();
    opts.onClose?.();
  };
  ws.onerror = (err) => opts.onError?.(err);

  function stopRecorder() {
    try {
      if (recorder && recorder.state !== "inactive") recorder.stop();
    } catch {
      // ignore
    }
    recorder = null;
  }

  return {
    stream,
    sendControl(msg) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    },
    close() {
      stopRecorder();
      for (const track of stream.getTracks()) track.stop();
      try {
        ws.close();
      } catch {
        // ignore
      }
    },
  };
}
