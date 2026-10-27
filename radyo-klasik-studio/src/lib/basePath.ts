// The panel's mount point on the API domain (api.radyoklasik.online/panel).
// next/link and the router add it automatically; only raw URLs need it.
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "/panel";

// Absolute URL of a panel page, e.g. panelUrl("/guest") for invite links.
export function panelUrl(path: string): string {
  return `${window.location.origin}${BASE_PATH}${path}`;
}
