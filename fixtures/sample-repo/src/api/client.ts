import https from "https";

export function createAgent() {
  return new https.Agent({ rejectUnauthorized: false }); // fixture: TLS bypass
}

export async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  return res.json();
}
