// Shared API types mirroring the RadyoKlasikServer control-plane responses
// (Phases 1–4). Kept intentionally close to the backend serializers.

export type Role = "admin" | "dj" | "guest";

export type TrackType = "song" | "jingle" | "commercial";

export interface Track {
  id: string;
  title: string;
  artist: string | null;
  album: string | null;
  type: TrackType;
  duration: number | null;
  bitrate?: number | null;
  sampleRate?: number | null;
  loudnessLufs?: number | null;
  replaygain?: number | null;
  waveformUrl?: string;
  artworkUrl: string | null;
  tags?: string[];
  size?: number | null;
  playCount?: number;
  createdAt?: string;
}

export interface TrackCounts {
  all: number;
  song: number;
  jingle: number;
  commercial: number;
}

export interface TrackListResponse {
  items: Track[];
  page: number;
  pageSize: number;
  total: number;
  counts: TrackCounts;
  totalSizeMb: number;
}

export interface WaveformJson {
  version: number;
  channels: number;
  sampleRate: number;
  bits: number;
  samples: number;
  peaks: number[];
}

export type QueueStatus = "pending" | "playing" | "done" | "removed";

export interface QueueItem {
  id: string;
  track: Track | null;
  requestedBy: string | null;
  status: QueueStatus;
  position: number;
  addedAt: string;
}

export interface AutoDjQueueItem {
  id: string;
  source: "autodj";
  kind: "song" | "jingle" | null;
  track: Track | null;
  position: number;
}

export interface NowPlaying {
  trackId: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  thumb: string | null;
  source: string | null;
  startedAt?: string | null;
}

export interface QueueState {
  nowPlaying: NowPlaying | null;
  items: QueueItem[];
  autodj?: {
    enabled: boolean;
    items: AutoDjQueueItem[];
  };
}

export interface PlayoutStatus {
  source: string;
  listeners: number | null;
  uptime: number;
  currentTrack: {
    title: string | null;
    artist: string | null;
    album: string | null;
    trackId: string | null;
    startedAt?: string | null;
  } | null;
  autopilot: boolean;
}

export type StudioMode = "live" | "voiceover";

export interface StudioState {
  onAir: boolean;
  state: "idle" | "live" | "voiceover";
  mode: StudioMode | null;
  sessionId: string | null;
  show: string | null;
  dj: string | null;
  levels: { mic: number };
}

export interface StudioSession {
  sessionId: string;
  mode: StudioMode;
  prefs: Record<string, unknown>;
  ingest: {
    transport: string;
    path: string;
    query: { session: string };
    mount: string;
  };
}

export interface Playlist {
  id: string;
  name: string;
  description?: string | null;
}
