// Shared API types mirroring the RadyoKlasikServer control-plane responses
// (Phases 1–4). Kept intentionally close to the backend serializers.

export type Role = "admin" | "dj" | "guest";

export type TrackType = "song" | "jingle" | "commercial";

export interface Track {
  id: string;
  title: string;
  artist: string | null;
  album: string | null;
  composer?: string | null;
  year?: number | null;
  genre?: string | null;
  comment?: string | null;
  format?: string | null;
  audioUrl?: string;
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

// --- Phase 7: accounts, shows, schedule, settings --------------------------

export interface StaffUser {
  id: string;
  username: string;
  displayName: string | null;
  email: string | null;
  role: Role;
  active: boolean;
  accessFrom: string | null;
  accessUntil: string | null;
  micPreferences: Record<string, unknown> | null;
  shows: { id: string; title: string }[];
  createdAt: string;
}

export interface Show {
  id: string;
  title: string;
  tagline: string | null;
  color: string | null;
  playlistId: string | null;
  playlistName: string | null;
  hosts: { id: string; username: string; name: string }[];
}

export interface Episode {
  id: string;
  title: string;
  description: string | null;
  airedAt: string | null;
}

export interface ScheduleSlot {
  id: string;
  title: string | null;
  showId: string | null;
  showTitle: string | null;
  playlistId: string | null;
  playlistName: string | null;
  dayOfWeek: number | null;
  date: string | null;
  startMinute: number;
  durationMinutes: number;
  shuffle: boolean;
  color: string | null;
}

export interface ScheduleNow {
  active: {
    slotId: string;
    title: string;
    showId: string | null;
    showTitle: string | null;
    playlistId: string | null;
    endsAt: string | null;
    color: string | null;
  } | null;
  timezone: string;
}

export interface StationSettings {
  autopilot: boolean;
  jingleEvery: number;
  commercialEvery: number;
  timezone: string;
  enforceSchedule: boolean;
}

export interface LiveAccess {
  allowed: boolean;
  reason: string | null;
  show: { id: string; title: string } | null;
}

export interface PlaylistDetail extends Playlist {
  items: { id: string; position: number; track: Track | null }[];
}

// --- Phase 6: analytics -------------------------------------------------------

export type AnalyticsPeriod = "today" | "yesterday" | "7d" | "30d" | string;

export interface ListenersReport {
  period: string;
  from: string;
  to: string;
  bucket: "hour" | "day";
  timezone: string;
  series: { t: string; avg: number; peak: number }[];
  kpis: {
    peakListeners: number;
    avgListeners: number;
    listeningHours: number;
    totalSessions: number;
    uniqueListeners: number;
    avgSessionsPerHour: number;
    avgListeningMinutes: number;
    sessionHours: number;
    totalGb: number;
  };
}

export interface RegionalRow {
  country: string | null;
  sessions: number;
  uniqueListeners: number;
  listeningHours: number;
  pct: number;
}

export interface HourlyRow {
  hour: number;
  sessions: number;
  avgListeningMinutes: number;
  listeningHours: number;
  avgListeners: number;
  peakListeners: number;
}

export interface DeviceRow {
  device: string;
  sessions: number;
  avgListeningMinutes: number;
  pct: number;
}

export interface TrackReportRow {
  trackId: string;
  title: string;
  artist: string | null;
  album: string | null;
  type: TrackType;
  plays: number;
  requested: number;
  lastPlayed: string;
}

export interface MonthlyRow {
  month: string;
  plays: number;
  distinctTracks: number;
  topTrack: { title: string; artist: string | null; plays: number } | null;
}

export interface LiveAnalytics {
  listeners: number | null;
  timezone: string;
  countries24h: { country: string; sessions: number }[];
  lastPlayed: {
    startedAt: string;
    source: string;
    title: string | null;
    artist: string | null;
    type: TrackType | null;
  }[];
}

// --- Listener features (recordings, chat, announcement, push) ----------------

export interface RecordingItem {
  id: string;
  filename: string;
  title: string;
  artist: string;
  album: string | null;
  artwork: string | null;
  artworkUrl: string | null;
  duration: number;
  sizeMb: number;
  date: string;
  plays: number;
  special: string | null;
  /** local = server disk only, pending = waiting to upload, r2 = in Cloudflare R2 */
  storage: "local" | "pending" | "r2";
  storageError: string | null;
  storedAt: string | null;
  onDisk: boolean;
  fileMissing: boolean;
}

export interface RecordingStorageStats {
  mode: "local" | "r2";
  configured: boolean;
  counts: { local: number; pending: number; r2: number };
  failed: number;
}

export interface RecorderStatus {
  recording: boolean;
  startedAt: string | null;
  elapsedSec: number;
  title: string | null;
  artist: string | null;
  artwork: string | null;
  startedBy: string | null;
  maxHours: number;
  last: { ok: boolean; title?: string; error?: string; at: string } | null;
}

export interface ArtworkItem {
  file: string;
  url: string;
  usedBy: number;
}

export interface ChatMessage {
  id: string;
  message: string;
  sender: string;
  timestamp: string;
  admin?: boolean;
  logo?: string | null;
}

export interface Announcement {
  text: string | null;
  updatedAt: string | null;
}

export interface PushSend {
  title: string;
  subtitle: string | null;
  body: string;
  sentAt: string;
  sentBy: string | null;
  attempted: number;
  delivered: number;
  removedDevices: number;
}

export interface PushOverview {
  devices: number;
  invalidTokens: number;
  history: PushSend[];
}
