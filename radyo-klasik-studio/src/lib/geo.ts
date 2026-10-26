// Country display helpers for analytics (ISO 3166-1 alpha-2 codes).

let names: Intl.DisplayNames | null = null;

export function countryName(code: string | null): string {
  if (!code) return "Unknown";
  try {
    names = names || new Intl.DisplayNames(["en"], { type: "region" });
    return names.of(code) || code;
  } catch {
    return code;
  }
}

export function countryFlag(code: string | null): string {
  if (!code || code.length !== 2) return "🌐";
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
