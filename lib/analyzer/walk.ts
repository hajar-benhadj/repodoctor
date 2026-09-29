// Walk the extracted tarball, classify files, enforce caps.

import { promises as fs } from "fs";
import path from "path";
import { classifyFile, isLockFile, isTestPath, LangInfo } from "./lang";
import { buildIgnoreRules, isIgnored, IgnoreRules } from "./ignore";

export interface RepoFile {
  path: string; // repo-relative, forward slashes
  size: number;
  lang?: LangInfo;
  ext: string;
  isTest: boolean;
  isLock: boolean;
  skippedContent: boolean;
}

export interface WalkResult {
  files: RepoFile[];
  filesTotal: number;
  skippedIgnored: number;
  gitignore: string | undefined;
}

export const CAPS = {
  maxFiles: 4000,
  maxFileBytes: 400_000,
  maxTotalTextBytes: 60 * 1024 * 1024,
  maxArchiveBytes: 150 * 1024 * 1024,
};

export async function walkRepo(root: string): Promise<WalkResult> {
  let gitignore: string | undefined;
  try {
    gitignore = await fs.readFile(path.join(root, ".gitignore"), "utf8");
  } catch {
    /* no .gitignore — itself a mild signal, handled elsewhere */
  }
  const rules: IgnoreRules = buildIgnoreRules(gitignore);

  const files: RepoFile[] = [];
  let filesTotal = 0;
  let skippedIgnored = 0;

  async function visit(dir: string, rel: string) {
    let entries: import("fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (isIgnored(relPath, rules, true)) {
          skippedIgnored++;
          continue;
        }
        await visit(path.join(dir, entry.name), relPath);
      } else if (entry.isFile()) {
        filesTotal++;
        if (isIgnored(relPath, rules, false)) {
          skippedIgnored++;
          continue;
        }
        const { ext, lang, binary } = classifyFile(entry.name);
        if (binary) continue;
        if (files.length >= CAPS.maxFiles) continue;
        const stat = await fs.stat(path.join(dir, entry.name)).catch(() => null);
        const size = stat?.size ?? 0;
        files.push({
          path: relPath,
          size,
          lang,
          ext,
          isTest: isTestPath(relPath),
          isLock: isLockFile(relPath),
          skippedContent: size > CAPS.maxFileBytes,
        });
      }
    }
  }

  await visit(root, "");
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { files, filesTotal, skippedIgnored, gitignore };
}

export async function readFileSafe(root: string, relPath: string, maxBytes: number): Promise<string | null> {
  try {
    const buf = await fs.readFile(path.join(root, relPath));
    if (buf.length > maxBytes) return null;
    return buf.toString("utf8");
  } catch {
    return null;
  }
}

export function findFile(files: RepoFile[], relPath: string): RepoFile | undefined {
  const p = relPath.toLowerCase();
  return files.find((f) => f.path.toLowerCase() === p);
}
