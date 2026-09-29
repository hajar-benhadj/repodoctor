// Fixture: this function is duplicated verbatim in ../utils/helpers.ts

export function slugify(input: string): string {
  const map: Record<string, string> = { "ä": "a", "ö": "o", "ü": "u", "ß": "ss" };
  let out = "";
  for (const ch of input.toLowerCase()) {
    if (map[ch]) { out += map[ch]; continue; }
    if (/[a-z0-9]/.test(ch)) { out += ch; continue; }
    out += "-";
  }
  return out.replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
