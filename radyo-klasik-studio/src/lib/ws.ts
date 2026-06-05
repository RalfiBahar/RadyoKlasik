// WebSocket helpers for the studio channels. WS upgrades are NOT proxied by
// Next rewrites, so the browser connects directly to the API via
// NEXT_PUBLIC_WS_URL. Studio messages are JSON `{ event, data }`.

function wsBase(): string {
  const base = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8001";
  return base.replace(/\/$/, "");
}

export function studioSocketUrl(token?: string | null): string {
  const q = token ? `?token=${encodeURIComponent(token)}` : "";
  return `${wsBase()}/ws/studio${q}`;
}

export function ingestSocketUrl(token: string, sessionId: string): string {
  const params = new URLSearchParams({ token, session: sessionId });
  return `${wsBase()}/ws/ingest?${params.toString()}`;
}

export interface StudioMessage<T = unknown> {
  event: string;
  data: T;
}

type Listener = (msg: StudioMessage) => void;

// Auto-reconnecting subscription to /ws/studio. Returns a disposer.
export function subscribeStudio(
  onMessage: Listener,
  opts: { token?: string | null; onOpen?: () => void; onClose?: () => void } = {}
): () => void {
  let socket: WebSocket | null = null;
  let closedByUser = false;
  let retry: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    socket = new WebSocket(studioSocketUrl(opts.token));
    socket.onopen = () => opts.onOpen?.();
    socket.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(ev.data) as StudioMessage;
        onMessage(parsed);
      } catch {
        // ignore non-JSON frames
      }
    };
    socket.onclose = () => {
      opts.onClose?.();
      if (!closedByUser) {
        retry = setTimeout(connect, 2000);
      }
    };
    socket.onerror = () => {
      socket?.close();
    };
  };

  connect();

  return () => {
    closedByUser = true;
    if (retry) clearTimeout(retry);
    socket?.close();
  };
}
