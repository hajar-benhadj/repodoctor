// GitHub access: REST metadata + codeload tarball, with rate-limit friendliness.

import { createWriteStream } from "fs";
import { Readable, Transform } from "stream";
import { pipeline } from "stream/promises";

const API = "https://api.github.com";

export class GitHubError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function headers(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "RepoDoctor/0.1",
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export function parseRepoUrl(
  input: string
): { owner: string; repo: string; ref?: string } | null {
  const s = input.trim().replace(/\.git$/, "");
  let m = s.match(
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\/tree\/([^/]+))?/
  );
  if (m) return { owner: m[1], repo: m[2], ref: m[3] };
  m = s.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (m) return { owner: m[1], repo: m[2] };
  return null;
}

async function ghFetch<T>(path: string, token?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      headers: headers(token),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new GitHubError("Could not reach api.github.com (network error or timeout).", 0);
  }
  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers.get("x-ratelimit-remaining");
    if (remaining === "0") {
      throw new GitHubError(
        "GitHub API rate limit exhausted (60 req/hour without a token). Set GITHUB_TOKEN in .env.local to raise it to 5,000/hour.",
        403
      );
    }
    throw new GitHubError(`GitHub API refused the request (HTTP 403).`, 403);
  }
  if (res.status === 404) {
    throw new GitHubError(
      "Repository not found. Check the URL — private repos are not accessible without a token.",
      404
    );
  }
  if (!res.ok) {
    throw new GitHubError(`GitHub API error (HTTP ${res.status}).`, res.status);
  }
  return (await res.json()) as T;
}

interface GhRepo {
  name: string;
  full_name: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  default_branch: string;
  language: string | null;
  license: { spdx_id: string } | null;
  created_at: string;
  pushed_at: string;
  archived: boolean;
}

export async function fetchRepoMeta(
  owner: string,
  repo: string,
  token?: string
): Promise<{
  meta: import("./types").RepoMeta;
  ref: string;
}> {
  const r = await ghFetch<GhRepo>(`/repos/${owner}/${repo}`, token);
  const [langs, contributors] = await Promise.all([
    ghFetch<Record<string, number>>(`/repos/${owner}/${repo}/languages`, token).catch(
      () => ({})
    ),
    ghFetch<
      { contributions: number }[]
    >(
      `/repos/${owner}/${repo}/contributors?per_page=100&anon=1`,
      token
    ).catch(() => []),
  ]);

  const totalContrib = contributors.reduce((a, c) => a + c.contributions, 0);
  // Bus factor: how many people account for 50% of all contributions.
  let acc = 0;
  let busFactor = contributors.length;
  for (let i = 0; i < contributors.length; i++) {
    acc += contributors[i].contributions;
    if (totalContrib > 0 && acc / totalContrib >= 0.5) {
      busFactor = i + 1;
      break;
    }
  }

  return {
    ref: r.default_branch,
    meta: {
      owner,
      name: r.name,
      description: r.description,
      stars: r.stargazers_count,
      forks: r.forks_count,
      openIssues: r.open_issues_count,
      defaultBranch: r.default_branch,
      primaryLanguage: r.language,
      languages: langs,
      license: r.license?.spdx_id && r.license.spdx_id !== "NOASSERTION" ? r.license.spdx_id : null,
      createdAt: r.created_at,
      pushedAt: r.pushed_at,
      contributors: contributors.length,
      busFactor,
      archived: r.archived,
    },
  };
}

// Streams the tarball to disk with a hard size cap (protects against huge repos).
export async function downloadTarball(
  owner: string,
  repo: string,
  ref: string,
  destFile: string,
  maxBytes = 150 * 1024 * 1024,
  token?: string
): Promise<void> {
  const url = `https://codeload.github.com/${owner}/${repo}/tar.gz/refs/heads/${encodeURIComponent(ref)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: headers(token),
      redirect: "follow",
      signal: AbortSignal.timeout(120000),
    });
  } catch {
    throw new GitHubError("Could not download the repository archive (timeout or network error).", 0);
  }
  if (res.status === 404) {
    throw new GitHubError("Archive not found — repository may be empty or private.", 404);
  }
  if (!res.ok) {
    throw new GitHubError(`Failed to download repository archive (HTTP ${res.status}).`, res.status);
  }
  const out = createWriteStream(destFile);
  let written = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      written += chunk.length;
      if (written > maxBytes) {
        cb(
          new GitHubError(
            `Repository archive is larger than ${Math.round(maxBytes / 1024 / 1024)} MB — too big for RepoDoctor.`,
            413
          )
        );
        return;
      }
      cb(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(res.body as never), counter, out);
}
