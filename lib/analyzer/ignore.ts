// Ignore rules: hardcoded defaults + light parsing of the repo's own .gitignore.

const DEFAULT_IGNORE_DIRS = new Set([
  "node_modules", ".git", ".hg", ".svn", "dist", "build", "out", "output",
  "vendor", "__pycache__", ".venv", "venv", "env", ".env", "virtualenv",
  "coverage", ".nyc_output", "target", ".next", ".nuxt", ".svelte-kit",
  ".turbo", ".cache", ".parcel-cache", "bower_components", "jspm_packages",
  ".idea", ".vscode", ".gradle", ".pytest_cache", ".mypy_cache", ".ruff_cache",
  "site-packages", ".terraform", "Pods", ".dart_tool", "_build", "deps",
  "cmake-build-debug", "elm-stuff", ".stack-work", "tmp", "temp",
]);

const DEFAULT_IGNORE_FILES = new Set([
  ".ds_store", "thumbs.db", "package-lock.json.bak", "yarn.error.log",
]);

const DEFAULT_IGNORE_SUFFIXES = [
  ".min.js", ".min.css", ".bundle.js", ".chunk.js", ".map", ".d.ts.map",
  ".snap", ".rej", ".orig", ".bak", ".swp",
];

export interface IgnoreRules {
  ignoreDirs: Set<string>;
  ignoreSuffixes: string[];
  ignoreGlobs: string[]; // simple patterns: *.ext or name or path prefix
}

export function buildIgnoreRules(gitignoreContent?: string): IgnoreRules {
  const ignoreDirs = new Set(DEFAULT_IGNORE_DIRS);
  const ignoreGlobs: string[] = [];
  if (gitignoreContent) {
    for (const raw of gitignoreContent.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#") || line.startsWith("!")) continue;
      const clean = line.replace(/^\//, "").replace(/\/$/, "");
      if (!clean) continue;
      if (clean.includes("*")) {
        ignoreGlobs.push(clean.toLowerCase());
      } else if (clean.includes("/")) {
        ignoreGlobs.push(clean.toLowerCase());
      } else if (clean.includes(".")) {
        ignoreGlobs.push("*" + clean.toLowerCase());
      } else {
        ignoreDirs.add(clean.toLowerCase());
      }
    }
  }
  return {
    ignoreDirs,
    ignoreSuffixes: DEFAULT_IGNORE_SUFFIXES,
    ignoreGlobs,
  };
}

function globMatches(pathLower: string, glob: string): boolean {
  if (glob.startsWith("*.")) {
    return pathLower.endsWith(glob.slice(1));
  }
  return pathLower === glob || pathLower.startsWith(glob + "/");
}

export function isIgnored(relPath: string, rules: IgnoreRules, isDir: boolean): boolean {
  const parts = relPath.toLowerCase().split("/");
  if (isDir) {
    const base = parts[parts.length - 1];
    if (rules.ignoreDirs.has(base)) return true;
  } else {
    for (const p of parts.slice(0, -1)) {
      if (rules.ignoreDirs.has(p)) return true;
    }
    const base = parts[parts.length - 1];
    if (DEFAULT_IGNORE_FILES.has(base)) return true;
    if (rules.ignoreSuffixes.some((s) => base.endsWith(s))) return true;
    for (const g of rules.ignoreGlobs) {
      if (globMatches(relPath.toLowerCase(), g)) return true;
    }
  }
  return false;
}
