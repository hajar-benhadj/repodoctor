// Security: committed secrets (pattern + entropy), credential files,
// dangerous code patterns.

import { Finding, Severity } from "../types";
import { LoadedFile } from "./context";
import { shannonEntropy } from "./text";

const PLACEHOLDER =
  /(xxxx|xxx{3,}|changeme|change_me|your[_-]|<[^>]*>|\$\{|\{\{|\.\.\.|placeholder|dummy|fake|dummy_|test[_-]?key|asdf|qwerty|123456|abcdef|XXXXXXXX)/i;

const ENV_CONTEXT = /\b(process\.env|os\.environ|getenv|ENV\[|import\.meta\.env|std::env|System\.getProperty)/;

interface SecretPattern {
  id: string;
  title: string;
  re: RegExp;
  severity: Severity;
  group?: number;
  entropy?: boolean;
}

const SECRET_PATTERNS: SecretPattern[] = [
  { id: "security.privatekey", title: "Private key block committed", re: /-----BEGIN\s(?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/, severity: "critical" },
  { id: "security.awskeys", title: "AWS access key ID committed", re: /\b((?:AKIA|ASIA)[0-9A-Z]{16})\b/, severity: "critical", group: 1 },
  { id: "security.tokens.gh", title: "GitHub token committed", re: /\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/, severity: "critical", group: 1 },
  { id: "security.tokens.google", title: "Google API key committed", re: /\b(AIza[0-9A-Za-z_\-]{30,})\b/, severity: "critical", group: 1 },
  { id: "security.tokens.slack", title: "Slack token committed", re: /\b(xox[baprs]-[A-Za-z0-9\-]{10,})\b/, severity: "critical", group: 1 },
  { id: "security.tokens.stripe", title: "Stripe live secret key committed", re: /\b(sk_live_[A-Za-z0-9]{16,})\b/, severity: "critical", group: 1 },
  { id: "security.tokens.npm", title: "npm publish token committed", re: /\b(npm_[A-Za-z0-9]{30,})\b/, severity: "critical", group: 1 },
  { id: "security.tokens.gitlab", title: "GitLab personal access token committed", re: /\b(glpat-[A-Za-z0-9_\-]{20,})\b/, severity: "critical", group: 1 },
  { id: "security.tokens.openai", title: "OpenAI API key committed", re: /\b(sk-(?:proj-)?[A-Za-z0-9_\-]{40,})\b/, severity: "critical", group: 1 },
  { id: "security.tokens.sendgrid", title: "SendGrid API key committed", re: /\b(SG\.[A-Za-z0-9_\-]{16,}\.[A-Za-z0-9_\-]{16,})\b/, severity: "critical", group: 1 },
  { id: "security.tokens.telegram", title: "Telegram bot token committed", re: /\b([0-9]{8,10}:AA[A-Za-z0-9_\-]{33})\b/, severity: "critical", group: 1 },
  {
    id: "security.generic",
    title: "Hardcoded credential-like assignment",
    // No leading \b: names like ADMIN_PASSWORD must match too.
    re: /(password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|client[_-]?secret|auth[_-]?token)\s*[:=]\s*["']([^"'\n]{10,})["']/gi,
    severity: "major",
    group: 2,
    entropy: true,
  },
];

interface DangerousPattern {
  id: string;
  title: string;
  hint: string;
  re: RegExp;
  langs: ("js" | "python")[];
  severity: Severity;
}

const DANGEROUS: DangerousPattern[] = [
  { id: "security.pattern.eval", title: "Use of eval()/new Function()", hint: "Executing dynamic strings enables code injection — replace with explicit logic or a safe parser.", re: /\beval\s*\(|new\s+Function\s*\(/, langs: ["js", "python"], severity: "major" },
  { id: "security.pattern.tls", title: "TLS certificate verification disabled", hint: "rejectUnauthorized: false / NODE_TLS_REJECT_UNAUTHORIZED=0 disables MITM protection.", re: /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*[=:]\s*["']?0/, langs: ["js"], severity: "major" },
  { id: "security.pattern.shell", title: "Shell command built from interpolated input", hint: "Interpolated exec/execSync or shell=True allows command injection — use argument arrays (execFile/spawn without shell).", re: /(exec(Sync)?\s*\(\s*[`"'][^\n]*\$\{|shell\s*=\s*True)/, langs: ["js", "python"], severity: "major" },
  { id: "security.pattern.pickle", title: "Unsafe deserialization with pickle", hint: "pickle.load on untrusted input executes arbitrary code — prefer JSON or signed payloads.", re: /pickle\.loads?\s*\(/, langs: ["python"], severity: "major" },
  { id: "security.pattern.pyverify", title: "SSL verification disabled (verify=False)", hint: "requests calls with verify=False disable MITM protection.", re: /verify\s*=\s*False/, langs: ["python"], severity: "major" },
  { id: "security.pattern.yamload", title: "yaml.load without safe Loader", hint: "yaml.load without Loader=SafeLoader can execute constructors — use yaml.safe_load.", re: /yaml\.load\s*\(/, langs: ["python"], severity: "major" },
  { id: "security.pattern.pyexec", title: "Use of exec()/eval() in Python", hint: "Dynamic code execution — refactor to explicit dispatch.", re: /(^|[^\w.])exec\s*\(/, langs: ["python"], severity: "minor" },
  { id: "security.pattern.dangerhtml", title: "dangerouslySetInnerHTML usage", hint: "Direct HTML injection in React — sanitize with DOMPurify or render text instead.", re: /dangerouslySetInnerHTML/, langs: ["js"], severity: "minor" },
  { id: "security.pattern.mktemp", title: "Insecure temp file (mktemp)", hint: "tempfile.mktemp is racy — use tempfile.NamedTemporaryFile or mkstemp.", re: /tempfile\.mktemp\s*\(/, langs: ["python"], severity: "minor" },
];

function lineOf(text: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}

function downgrade(s: Severity): Severity {
  return s === "critical" ? "major" : s === "major" ? "minor" : "info";
}

function sevWeight(s: Severity): number {
  return s === "critical" ? 30 : s === "major" ? 10 : s === "minor" ? 4 : 1;
}

export function analyzeSecurity(loaded: LoadedFile[]): { findings: Finding[]; secretsFound: number } {
  const findings: Finding[] = [];
  let secretsFound = 0;

  // --- secret patterns ---
  for (const p of SECRET_PATTERNS) {
    const locations: { file: string; line: number; snippet: string }[] = [];
    for (const f of loaded) {
      if (f.file.isLock || (f.file.lang?.analysis === "none")) continue;
      if (f.file.size > 300_000) continue;
      let m: RegExpExecArray | null;
      const re = new RegExp(p.re.source, p.re.flags.includes("g") ? p.re.flags : p.re.flags + "g");
      while ((m = re.exec(f.raw))) {
        const value = (p.group ? m[p.group] : m[0]) ?? "";
        const lineText = f.raw.slice(m.index, f.raw.indexOf("\n", m.index) === -1 ? f.raw.length : f.raw.indexOf("\n", m.index));
        if (PLACEHOLDER.test(value)) continue;
        if (ENV_CONTEXT.test(lineText)) continue;
        if (p.entropy) {
          if (value.length < 10) continue;
          if (shannonEntropy(value) < 3.0) continue;
          if (/^(password|secret|token|none|null|true|false|undefined|changeme)$/i.test(value)) continue;
        }
        locations.push({ file: f.file.path, line: lineOf(f.raw, m.index), snippet: value.slice(0, 6) + "…" });
        if (locations.length >= 12) break;
      }
      if (locations.length >= 12) break;
    }
    if (locations.length > 0) {
      secretsFound += locations.length;
      let sev = p.severity;
      if (locations.some((l) => l.file.match(/tests?\/|__tests__|spec\//i))) sev = downgrade(sev);
      findings.push({
        id: p.id,
        category: "security",
        severity: sev,
        title: `${p.title} (${locations.length} location${locations.length > 1 ? "s" : ""})`,
        detail:
          locations.slice(0, 5).map((l) => `• ${l.file}:${l.line} (\`${l.snippet}\`)`).join("\n") +
          (locations.length > 5 ? `\n… and ${locations.length - 5} more` : "") +
          "\nRotate this credential and purge it from git history (git filter-repo), even after removal.",
        penalty: sevWeight(sev),
      });
    }
  }

  // --- credential files ---
  const credFiles: { file: string; kind: string; sev: Severity }[] = [];
  for (const f of loaded) {
    const base = f.file.path.split("/").pop()!;
    if (/^\.env(\..+)?$/.test(base) && !/(example|sample|template|dist)/i.test(base)) {
      credFiles.push({ file: f.file.path, kind: ".env file committed to the repository", sev: "major" });
    } else if (/\.(pem|p12|pfx)$/.test(base) || /^id_(rsa|dsa|ecdsa|ed25519)/.test(base)) {
      credFiles.push({ file: f.file.path, kind: "key material committed to the repository", sev: "critical" });
    } else if (/\.tfstate$/.test(base)) {
      credFiles.push({ file: f.file.path, kind: "terraform state (often contains secrets)", sev: "major" });
    } else if (/^(credentials?|service[-_]?account[^/]*)\.json$/i.test(base)) {
      credFiles.push({ file: f.file.path, kind: "credential JSON committed to the repository", sev: "critical" });
    }
  }
  if (credFiles.length > 0) {
    const worst = credFiles.some((c) => c.sev === "critical") ? "critical" : "major";
    findings.push({
      id: "security.credentialfiles",
      category: "security",
      severity: worst,
      title: `${credFiles.length} credential file${credFiles.length > 1 ? "s" : ""} committed`,
      detail: credFiles.slice(0, 6).map((c) => `• ${c.file} — ${c.kind}`).join("\n") +
        "\nRemove from the repo, add to .gitignore, and rotate anything inside.",
      penalty: sevWeight(worst),
    });
    secretsFound += credFiles.length;
  }

  // --- dangerous patterns ---
  for (const p of DANGEROUS) {
    const locations: { file: string; line: number }[] = [];
    for (const f of loaded) {
      if (!p.langs.includes(f.file.lang?.analysis as "js" | "python")) continue;
      if (f.file.isTest) continue;
      const lines = f.raw.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (p.re.test(lines[i])) {
          locations.push({ file: f.file.path, line: i + 1 });
          if (locations.length >= 12) break;
        }
      }
      if (locations.length >= 12) break;
    }
    if (locations.length > 0) {
      findings.push({
        id: p.id,
        category: "security",
        severity: p.severity,
        title: `${p.title} (${locations.length} location${locations.length > 1 ? "s" : ""})`,
        detail: locations.slice(0, 5).map((l) => `• ${l.file}:${l.line}`).join("\n") +
          (locations.length > 5 ? `\n… and ${locations.length - 5} more` : "") +
          `\n${p.hint}`,
        penalty: sevWeight(p.severity),
      });
    }
  }

  return { findings, secretsFound };
}
