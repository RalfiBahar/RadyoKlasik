import type { Role } from "./types";

// Route-guard policy (client-side; Phase 7 will move this server-side with real
// role claims). Mirrors the Phase 5 spec:
//   - admin: everything
//   - dj:    studio + library + dashboard + own shows (scheduling view)
//   - guest: time-boxed studio access only
export type Section =
  | "dashboard"
  | "library"
  | "studio"
  | "analytics"
  | "scheduling"
  | "djs";

const ACCESS: Record<Role, Section[]> = {
  admin: ["dashboard", "library", "studio", "analytics", "scheduling", "djs"],
  dj: ["dashboard", "library", "studio", "scheduling"],
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
