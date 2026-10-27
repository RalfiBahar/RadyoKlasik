import type { Role } from "./types";

// Client-side route guards (UX only — the API enforces the same roles on every
// request since Phase 7):
//   - admin: everything
//   - dj:    studio + library + playlists + recordings + listener chat +
//            dashboard + schedule (read-only)
//   - guest: time-boxed studio access only
export type Section =
  | "dashboard"
  | "library"
  | "playlists"
  | "recordings"
  | "chat"
  | "announcements"
  | "studio"
  | "analytics"
  | "scheduling"
  | "djs";

const ACCESS: Record<Role, Section[]> = {
  admin: [
    "dashboard",
    "library",
    "playlists",
    "studio",
    "recordings",
    "chat",
    "announcements",
    "analytics",
    "scheduling",
    "djs",
  ],
  dj: ["dashboard", "library", "playlists", "studio", "recordings", "chat", "scheduling"],
  guest: ["studio"],
};

export function canAccess(role: Role | null, section: Section): boolean {
  if (!role) return false;
  return ACCESS[role].includes(section);
}

export function sectionsFor(role: Role | null): Section[] {
  if (!role) return [];
  return ACCESS[role];
}

// The landing section after login for a given role (first allowed section).
export function defaultSectionFor(role: Role | null): Section {
  const list = sectionsFor(role);
  return list[0] || "studio";
}
