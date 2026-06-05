import { getToken, clearAuth } from "./token";
import type {
  PlayoutStatus,
  QueueItem,
  QueueState,
  StudioMode,
  StudioSession,
  StudioState,
  Track,
  TrackListResponse,
  TrackType,
  WaveformJson,
} from "./types";

// REST client for the control-plane API. All paths are same-origin (proxied by
// Next rewrites in next.config.mjs), so no CORS. Operator routes send the JWT
// as a Bearer token; a 401 clears local auth so the guard bounces to /login.

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

function buildQuery(query?: Query): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Query;
  auth?: boolean;
  // When body is FormData we must not set Content-Type (browser sets boundary).
  formData?: FormData;
  signal?: AbortSignal;
}

export async function apiFetch<T>(
  path: string,
  opts: RequestOptions = {}
): Promise<T> {
  const { method = "GET", body, query, auth = true, formData, signal } = opts;
  const headers: Record<string, string> = {};
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let payload: BodyInit | undefined;
  if (formData) {
    payload = formData;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${path}${buildQuery(query)}`, {
    method,
    headers,
    body: payload,
    signal,
  });

  if (res.status === 401) {
    clearAuth();
    throw new ApiError(401, "Unauthorized", await safeBody(res));
  }

  if (!res.ok) {
    const errBody = await safeBody(res);
    const message =
      (errBody && typeof errBody === "object" && "error" in errBody
        ? String((errBody as { error: unknown }).error)
        : null) || `Request failed (${res.status})`;
    throw new ApiError(res.status, message, errBody);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

async function safeBody(res: Response): Promise<unknown> {
  try {
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

// --- Auth ------------------------------------------------------------------

export async function generateToken(sharedSecret: string): Promise<string> {
  const data = await apiFetch<{ access_token: string }>("/auth/generate_token", {
    method: "POST",
    auth: false,
    body: { shared_secret: sharedSecret },
  });
  return data.access_token;
}

// --- Library (Phase 1) -----------------------------------------------------

export interface ListTracksParams {
  type?: TrackType;
  q?: string;
  tag?: string;
  artist?: string;
  album?: string;
  playlist?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
  order?: "ASC" | "DESC";
}

export function listTracks(
  params: ListTracksParams = {},
  signal?: AbortSignal
): Promise<TrackListResponse> {
  return apiFetch<TrackListResponse>("/api/v1/library/tracks", {
    query: params as Query,
    signal,
  });
}

export function getTrack(id: string): Promise<Track> {
  return apiFetch<Track>(`/api/v1/library/tracks/${id}`);
}

export function getWaveform(id: string, signal?: AbortSignal): Promise<WaveformJson> {
  return apiFetch<WaveformJson>(`/api/v1/library/tracks/${id}/waveform`, {
    signal,
  });
}

export function uploadTrack(
  formData: FormData,
  onProgress?: (pct: number) => void
): Promise<Track> {
  // Use XHR for upload progress (fetch lacks an upload-progress stream).
  return new Promise<Track>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/v1/library/tracks");
    const token = getToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = xhr.responseText;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as Track);
      } else {
        if (xhr.status === 401) clearAuth();
        const message =
          body && typeof body === "object" && "error" in body
            ? String((body as { error: unknown }).error)
            : `Upload failed (${xhr.status})`;
        reject(new ApiError(xhr.status, message, body));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, "Network error during upload"));
    xhr.send(formData);
  });
}

export function updateTrack(
  id: string,
  patch: Partial<Pick<Track, "title" | "artist" | "album" | "type" | "tags">>
): Promise<Track> {
  return apiFetch<Track>(`/api/v1/library/tracks/${id}`, {
    method: "PATCH",
    body: patch,
  });
}

export function deleteTrack(id: string): Promise<{ deleted: boolean; id: string }> {
  return apiFetch(`/api/v1/library/tracks/${id}`, { method: "DELETE" });
}

export type BulkAction = "tag" | "delete" | "addToPlaylist";

export function bulkTracks(payload: {
  action: BulkAction;
  trackIds: string[];
  tags?: string[];
  playlistId?: string;
}): Promise<{ action: BulkAction; affected: number }> {
  return apiFetch("/api/v1/library/bulk", { method: "POST", body: payload });
}

// --- Queue (Phase 3) -------------------------------------------------------

export function getQueue(signal?: AbortSignal): Promise<QueueState> {
  return apiFetch<QueueState>("/api/v1/queue", { signal });
}

export function addToQueue(payload: {
  trackId: string;
  position?: number;
  requestedBy?: string;
}): Promise<{ item: QueueItem; queue: QueueState }> {
  return apiFetch("/api/v1/queue", { method: "POST", body: payload });
}

export function reorderQueue(orderedIds: string[]): Promise<QueueState> {
  return apiFetch<QueueState>("/api/v1/queue/reorder", {
    method: "PATCH",
    body: { orderedIds },
  });
}

export function removeFromQueue(id: string): Promise<QueueState> {
  return apiFetch<QueueState>(`/api/v1/queue/${id}`, { method: "DELETE" });
}

// --- Playout / transport (Phase 2/3) --------------------------------------

export function getPlayoutStatus(signal?: AbortSignal): Promise<PlayoutStatus> {
  return apiFetch<PlayoutStatus>("/api/v1/playout/status", { signal });
}

export function skipTrack(): Promise<{ ok: boolean }> {
  return apiFetch("/api/v1/playout/skip", { method: "POST" });
}

export function setAutopilot(enabled: boolean): Promise<{ autopilot: boolean }> {
  return apiFetch("/api/v1/playout/autopilot", {
    method: "POST",
    body: { enabled },
  });
}

export interface NowPlayingPublic {
  album: string | null;
  artist: string | null;
  title: string | null;
  thumb: string | null;
}

export function getNowPlaying(signal?: AbortSignal): Promise<NowPlayingPublic> {
  return apiFetch<NowPlayingPublic>("/playout/nowplaying", {
    auth: false,
    signal,
  });
}

// --- Studio live session (Phase 4) ----------------------------------------

export function getStudioState(signal?: AbortSignal): Promise<StudioState> {
  return apiFetch<StudioState>("/api/v1/studio/session", { signal });
}

export function startStudioSession(payload: {
  mode: StudioMode;
  show?: string;
  dj?: string;
  userId?: string;
}): Promise<StudioSession> {
  return apiFetch<StudioSession>("/api/v1/studio/session/start", {
    method: "POST",
    body: payload,
  });
}

export function stopStudioSession(): Promise<StudioState> {
  return apiFetch<StudioState>("/api/v1/studio/session/stop", {
    method: "POST",
  });
}

export function setStudioMode(mode: StudioMode): Promise<StudioState> {
  return apiFetch<StudioState>("/api/v1/studio/session/mode", {
    method: "POST",
    body: { mode },
  });
}
