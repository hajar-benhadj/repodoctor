// Fixture: duplicated copy of slugify from ../utils/format.ts

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

export function percent(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 100);
}
