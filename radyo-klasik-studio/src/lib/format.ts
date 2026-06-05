// Small display helpers.

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || Number.isNaN(seconds)) return "--:--";
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
}

export function formatClock(seconds: number | null | undefined): string {
  if (seconds == null || Number.isNaN(seconds)) return "00:00:00";
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  return [h, m, rem].map((n) => String(n).padStart(2, "0")).join(":");
}

export function formatSizeMb(mb: number | null | undefined): string {
  if (mb == null) return "0 MB";
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  const mb = bytes / (1024 * 1024);
  return formatSizeMb(mb);
}
