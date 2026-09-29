// Language detection by extension + source/text classification.

export interface LangInfo {
  name: string;
  analysis: "js" | "python" | "generic" | "none";
}

const EXT_MAP: Record<string, LangInfo> = {
  ".ts": { name: "TypeScript", analysis: "js" },
  ".tsx": { name: "TypeScript", analysis: "js" },
  ".mts": { name: "TypeScript", analysis: "js" },
  ".cts": { name: "TypeScript", analysis: "js" },
  ".js": { name: "JavaScript", analysis: "js" },
  ".jsx": { name: "JavaScript", analysis: "js" },
  ".mjs": { name: "JavaScript", analysis: "js" },
  ".cjs": { name: "JavaScript", analysis: "js" },
  ".py": { name: "Python", analysis: "python" },
  ".pyi": { name: "Python", analysis: "python" },
  ".go": { name: "Go", analysis: "generic" },
  ".rs": { name: "Rust", analysis: "generic" },
  ".java": { name: "Java", analysis: "generic" },
  ".kt": { name: "Kotlin", analysis: "generic" },
  ".rb": { name: "Ruby", analysis: "generic" },
  ".php": { name: "PHP", analysis: "generic" },
  ".cs": { name: "C#", analysis: "generic" },
  ".c": { name: "C", analysis: "generic" },
  ".h": { name: "C", analysis: "generic" },
  ".cpp": { name: "C++", analysis: "generic" },
  ".cc": { name: "C++", analysis: "generic" },
  ".hpp": { name: "C++", analysis: "generic" },
  ".swift": { name: "Swift", analysis: "generic" },
  ".sh": { name: "Shell", analysis: "generic" },
  ".bash": { name: "Shell", analysis: "generic" },
  ".sql": { name: "SQL", analysis: "none" },
  ".md": { name: "Markdown", analysis: "none" },
  ".json": { name: "JSON", analysis: "none" },
  ".yml": { name: "YAML", analysis: "none" },
  ".yaml": { name: "YAML", analysis: "none" },
  ".toml": { name: "TOML", analysis: "none" },
  ".html": { name: "HTML", analysis: "none" },
  ".css": { name: "CSS", analysis: "none" },
  ".scss": { name: "CSS", analysis: "none" },
  ".vue": { name: "Vue", analysis: "none" },
  ".svelte": { name: "Svelte", analysis: "none" },
};

const BINARY_EXTS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".svg",
  ".pdf", ".zip", ".gz", ".tgz", ".tar", ".bz2", ".7z", ".rar",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ".mp3", ".mp4", ".mov", ".avi", ".webm", ".wav",
  ".exe", ".dll", ".so", ".dylib", ".bin", ".wasm", ".class", ".jar",
  ".pyc", ".pyo", ".o", ".a", ".obj", ".pdb",
  ".db", ".sqlite", ".sqlite3", ".parquet", ".csv", ".xlsx", ".docx",
  ".node", ".psd", ".ai", ".sketch", ".onnx", ".pt", ".h5", ".pkl",
]);

export function classifyFile(path: string): {
  ext: string;
  lang?: LangInfo;
  binary: boolean;
} {
  const dot = path.lastIndexOf(".");
  const ext = dot >= 0 ? path.slice(dot).toLowerCase() : "";
  if (BINARY_EXTS.has(ext)) return { ext, binary: true };
  const lang = EXT_MAP[ext];
  return { ext, lang, binary: false };
}

export function isTestPath(path: string): boolean {
  const p = path.toLowerCase();
  if (/(^|\/)(tests?|__tests__|spec|e2e|cypress)(\/|$)/.test(p)) return true;
  if (/(\.test|\.spec|_test|\.e2e)\.[a-z]+$/.test(p)) return true;
  if (/(^|\/)test_[^/]+\.py$/.test(p)) return true;
  if (/cypress\.config\.|playwright\.config\.|vitest\.config\.|jest\.config\./.test(p)) return true;
  return false;
}

export function isLockFile(path: string): boolean {
  const base = path.split("/").pop()!.toLowerCase();
  return [
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "npm-shrinkwrap.json",
    "poetry.lock", "pdm.lock", "cargo.lock", "composer.lock", "gemfile.lock",
    "pipfile.lock", "uv.lock", "go.sum",
  ].includes(base);
}
