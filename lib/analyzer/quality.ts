// Code Quality: cyclomatic complexity approximation, long files, nesting,
// duplication, comment density — for JS/TS and Python.

import { Finding, Severity } from "../types";
import { LoadedFile } from "./context";

export interface FunctionMetric {
  file: string;
  line: number;
  name: string;
  complexity: number;
  length: number;
  nesting: number;
  hasDoc: boolean;
}

export interface DupGroup {
  lines: number;
  occurrences: { file: string; line: number }[];
}

export interface QualityMetrics {
  functions: FunctionMetric[];
  maxComplexity: number;
  avgComplexity: number;
  totalLoc: number;
  duplicationRatio: number;
  duplicationGroups: DupGroup[];
  commentRatio: number;
  longFiles: { file: string; lines: number }[];
}

const COMPLEXITY_THRESHOLD = 15;
const WINDOW = 7;
const MIN_LINE_LEN = 10;

// Chars after which a "/" starts a regex literal rather than division.
// Deliberately excludes ")<>*+-%~^,;" — after those, "/" is almost always division.
const REGEX_PRECEDERS = new Set(["(", "=", ":", "[", "!", "&", "|", "?", "{"]);

function matchBraces(code: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < code.length; i++) {
    const c = code[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function decisionsIn(body: string): number {
  const b = body.replace(/\?\./g, ".").replace(/\?\?/g, "?");
  let count = 0;
  const kw = b.match(/\b(if|for|while|case|catch)\b/g);
  if (kw) count += kw.length;
  const andOr = b.match(/&&|\|\|/g);
  if (andOr) count += andOr.length;
  const ternary = b.match(/\?/g);
  if (ternary) count += ternary.length;
  return count;
}

// After the parameter list, locate the function body — skipping TS return-type
// annotations like `: string {` or `: { a: number } {`. A brace at depth 0 is
// the body unless it is followed by another brace / arrow / semicolon, which
// means it was an object-literal return type.
function findBody(
  code: string,
  parenClose: number
): { kind: "brace" | "arrow"; bodyStart: number } | null {
  let i = parenClose + 1;
  while (i < code.length && /\s/.test(code[i])) i++;
  if (code[i] !== ":") {
    if (code[i] === "=" && code[i + 1] === ">") return { kind: "arrow", bodyStart: i };
    if (code[i] === "{") return { kind: "brace", bodyStart: i };
    return null;
  }
  i++;
  let depth = 0;
  while (i < code.length) {
    const c = code[i];
    if (c === "{" && depth === 0) {
      const end = matchBraces(code, i);
      if (end === -1) return null;
      let j = end + 1;
      while (j < code.length && /\s/.test(code[j])) j++;
      const next = code[j];
      if (next === "{" || (next === "=" && code[j + 1] === ">") || next === ";") {
        i = end + 1; // was a return-type object literal — keep scanning
        continue;
      }
      return { kind: "brace", bodyStart: i };
    }
    if (c === "{" || c === "(" || c === "[") depth++;
    else if (c === "}" || c === ")" || c === "]") {
      depth--;
      if (depth < 0) return null;
    } else if (depth === 0) {
      if (c === "=" && code[i + 1] === ">") return { kind: "arrow", bodyStart: i };
      if (c === ";") return null;
    }
    i++;
  }
  return null;
}

function analyzeJsFunctions(f: LoadedFile): FunctionMetric[] {
  const code = f.code;
  const results: FunctionMetric[] = [];
  const patterns: { re: RegExp; methodOnly?: boolean }[] = [
    { re: /\bfunction\s*\*?\s*([A-Za-z0-9_$]+)\s*\(/g },
    { re: /\b([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?(?:function\s*)?\(/g },
    { re: /\b([A-Za-z0-9_$]+)\s*:\s*(?:async\s*)?(?:function\s*)?\(/g },
    { re: /^[\t ]+(?:export\s+)?(?:abstract\s+)?(?:static\s+)?(?:async\s+)?([A-Za-z0-9_$]+)\s*\(/gm, methodOnly: true },
  ];
  const seen = new Set<number>();
  for (const { re, methodOnly } of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code))) {
      const name = m[1];
      if (["if", "for", "while", "switch", "catch", "return", "function", "new", "else", "do", "try"].includes(name)) continue;
      const parenOpen = code.indexOf("(", m.index + m[0].length - 1);
      if (parenOpen === -1) continue;
      let depth = 0;
      let parenClose = -1;
      for (let i = parenOpen; i < code.length; i++) {
        if (code[i] === "(") depth++;
        else if (code[i] === ")") {
          depth--;
          if (depth === 0) {
            parenClose = i;
            break;
          }
        }
      }
      if (parenClose === -1) continue;
      const body = findBody(code, parenClose);
      if (!body) continue;
      let line = 1;
      for (let i = 0; i < m.index; i++) if (code.charCodeAt(i) === 10) line++;
      if (body.kind === "brace") {
        const bodyStart = body.bodyStart;
        if (seen.has(bodyStart)) continue;
        const bodyEnd = matchBraces(code, bodyStart);
        if (bodyEnd === -1) continue;
        seen.add(bodyStart);
        const bodyText = code.slice(bodyStart, bodyEnd);
        const cx = 1 + decisionsIn(bodyText);
        let nesting = 0;
        let d = 0;
        for (let i = 0; i < bodyText.length; i++) {
          if (bodyText[i] === "{") {
            d++;
            if (d > nesting) nesting = d;
          } else if (bodyText[i] === "}") d--;
        }
        const above = code.slice(Math.max(0, m.index - 300), m.index);
        const hasDoc = /\/\*\*[\s\S]*\*\/\s*$/.test(above) || /\/\/\/[^\n]*\n\s*$/.test(above);
        const length = bodyText.split("\n").length;
        if (length >= 3) {
          results.push({ file: f.file.path, line, name, complexity: cx, length, nesting, hasDoc });
        }
      } else if (!methodOnly && !seen.has(body.bodyStart)) {
        seen.add(body.bodyStart);
        let end = code.indexOf("\n", body.bodyStart);
        if (end === -1) end = code.length;
        const bodyText = code.slice(body.bodyStart, end);
        const cx = 1 + decisionsIn(bodyText);
        if (bodyText.trim().length > 10) {
          results.push({ file: f.file.path, line, name, complexity: cx, length: 1, nesting: 0, hasDoc: false });
        }
      }
    }
  }
  return results;
}

interface PyFn {
  name: string;
  indent: number;
  start: number;
  body: string[];
  doc: boolean;
}

function emitPython(fn: PyFn, f: LoadedFile, results: FunctionMetric[]) {
  if (fn.body.length < 3) return;
  const body = fn.body.join("\n");
  let count = 0;
  const kw = body.match(/\b(if|elif|for|while|except)\b/g);
  if (kw) count += kw.length;
  const andOr = body.match(/\band\b|\bor\b/g);
  if (andOr) count += andOr.length;
  const maxIndent = fn.body.reduce((max, l) => {
    const ind = (l.match(/^\s*/)?.[0] ?? "").replace(/\t/g, "    ").length;
    return ind > max ? ind : max;
  }, 0);
  results.push({
    file: f.file.path,
    line: fn.start,
    name: fn.name,
    complexity: 1 + count,
    length: fn.body.length,
    nesting: Math.max(0, Math.round((maxIndent - fn.indent - 4) / 4) + 1),
    hasDoc: fn.doc,
  });
}

function analyzePythonFunctions(f: LoadedFile): FunctionMetric[] {
  const lines = f.code.split("\n");
  const results: FunctionMetric[] = [];
  const defRe = /^(\s*)(?:async\s+)?def\s+([A-Za-z0-9_]+)\s*\(/;
  const stack: PyFn[] = [];
  const popTo = (indent: number) => {
    while (stack.length && indent <= stack[stack.length - 1].indent) {
      emitPython(stack.pop()!, f, results);
    }
  };
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    if (!line.trim()) continue;
    const indent = (line.match(/^\s*/)?.[0] ?? "").replace(/\t/g, "    ").length;
    const m = line.match(defRe);
    if (m) {
      popTo(indent);
      stack.push({ name: m[2], indent, start: li + 1, body: [], doc: false });
      continue;
    }
    popTo(indent);
    if (stack.length) {
      const top = stack[stack.length - 1];
      top.body.push(line);
      if (top.body.length <= 2 && /^("""|''')/.test(line.trim())) top.doc = true;
    }
  }
  while (stack.length) emitPython(stack.pop()!, f, results);
  return results;
}

function duplicationAnalysis(files: LoadedFile[]): { ratio: number; groups: DupGroup[] } {
  // Compact each file into significant lines, then slide a window of consecutive
  // significant lines — identical windows across files are duplicate clones.
  type Entry = { file: string; line: number; text: string };
  const byKey = new Map<string, Entry[]>();
  let eligible = 0;
  for (const f of files) {
    if (f.file.lang?.analysis === "none") continue;
    const entries: Entry[] = [];
    const lines = f.code.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].replace(/\s+/g, " ").trim();
      if (t.length < MIN_LINE_LEN) continue;
      if (/^(import |from |require\(|#include|package |using |exports\.|module\.exports|@)/.test(t)) continue;
      if (/^[{}();,\s]*$/.test(t)) continue;
      if (/^(\/\/|\/\*|\*|#)/.test(t)) continue;
      entries.push({ file: f.file.path, line: i + 1, text: t });
      eligible++;
    }
    for (let i = 0; i + WINDOW <= entries.length; i++) {
      const key = entries.slice(i, i + WINDOW).map((e) => e.text).join("\n");
      const arr = byKey.get(key);
      if (arr) arr.push(entries[i + WINDOW - 1]);
      else byKey.set(key, [entries[i + WINDOW - 1]]);
    }
  }
  const groups: DupGroup[] = [];
  let dup = 0;
  for (const [key, ends] of byKey) {
    if (ends.length < 2) continue;
    const first = ends[0];
    const startLine = first.line - (WINDOW - 1);
    const occ = ends.slice(0, 4).map((e, idx) =>
      idx === 0
        ? { file: first.file, line: startLine }
        : { file: e.file, line: e.line - (WINDOW - 1) }
    );
    groups.push({ lines: WINDOW, occurrences: occ });
    dup += (ends.length - 1) * WINDOW;
    void key;
  }
  groups.sort((a, b) => b.occurrences.length - a.occurrences.length);
  return { ratio: eligible > 0 ? dup / eligible : 0, groups: groups.slice(0, 6) };
}

export function analyzeQuality(loaded: LoadedFile[]): { findings: Finding[]; metrics: QualityMetrics } {
  const findings: Finding[] = [];
  const allFns: FunctionMetric[] = [];
  const longFiles: { file: string; lines: number }[] = [];
  let totalLoc = 0;
  let commentLines = 0;
  const codeFiles = loaded.filter((f) => ["js", "python"].includes(f.file.lang?.analysis ?? ""));

  for (const f of loaded) {
    totalLoc += f.lines;
    for (const l of f.raw.split("\n")) {
      const t = l.trimStart();
      if (/^(\/\/|\/\*|\*|#)/.test(t) && !/^#!/.test(t) && t.length > 2) commentLines++;
    }
    if (f.file.lang?.analysis === "js") allFns.push(...analyzeJsFunctions(f));
    else if (f.file.lang?.analysis === "python") allFns.push(...analyzePythonFunctions(f));
    if (["js", "python"].includes(f.file.lang?.analysis ?? "") && f.lines > 400) {
      longFiles.push({ file: f.file.path, lines: f.lines });
    }
  }

  const complex = allFns
    .filter((fn) => fn.complexity > COMPLEXITY_THRESHOLD)
    .sort((a, b) => b.complexity - a.complexity);
  if (complex.length > 0) {
    const sev: Severity = complex.length >= 15 ? "critical" : complex.length >= 5 ? "major" : "minor";
    const top = complex.slice(0, 5).map((fn) => `• \`${fn.name}\` (cx=${fn.complexity}) — ${fn.file}:${fn.line}`);
    findings.push({
      id: "quality.complexity",
      category: "quality",
      severity: sev,
      title: `${complex.length} function${complex.length > 1 ? "s" : ""} exceed cyclomatic complexity ${COMPLEXITY_THRESHOLD}`,
      detail: `Cyclomatic complexity approximated from branch points (if/loops/case/&&/||/ternaries). Top offenders:\n${top.join("\n")}`,
      metric: `max cx = ${complex[0].complexity}`,
      penalty: sev === "critical" ? 25 : sev === "major" ? 10 : 4,
    });
  }

  const veryLong = longFiles.filter((x) => x.lines > 800);
  const longish = longFiles.filter((x) => x.lines > 400 && x.lines <= 800);
  if (veryLong.length > 0) {
    findings.push({
      id: "quality.godfiles",
      category: "quality",
      severity: "major",
      title: `${veryLong.length} file${veryLong.length > 1 ? "s" : ""} over 800 lines`,
      detail: veryLong.slice(0, 5).map((x) => `• ${x.file} (${x.lines} lines)`).join("\n") +
        "\nConsider splitting god files into focused modules.",
      metric: `largest = ${Math.max(...veryLong.map((x) => x.lines))} lines`,
      penalty: 10,
    });
  } else if (longish.length > 0) {
    findings.push({
      id: "quality.longfiles",
      category: "quality",
      severity: "minor",
      title: `${longish.length} file${longish.length > 1 ? "s" : ""} over 400 lines`,
      detail: longish.slice(0, 5).map((x) => `• ${x.file} (${x.lines} lines)`).join("\n"),
      penalty: 4,
    });
  }

  const deep = allFns.filter((fn) => fn.nesting > 5);
  if (deep.length > 0) {
    findings.push({
      id: "quality.nesting",
      category: "quality",
      severity: "major",
      title: `Deep nesting in ${deep.length} function${deep.length > 1 ? "s" : ""} (more than 5 levels)`,
      detail: deep.slice(0, 5).map((fn) => `• \`${fn.name}\` (depth≈${fn.nesting}) — ${fn.file}:${fn.line}`).join("\n") +
        "\nDeep nesting usually hides a missing early-return or guard clause.",
      penalty: 10,
    });
  }

  const dup = duplicationAnalysis(codeFiles);
  if (dup.ratio > 0.2) {
    findings.push({
      id: "quality.duplication",
      category: "quality",
      severity: "major",
      title: `Significant code duplication (~${Math.round(dup.ratio * 100)}% of code lines)`,
      detail: "Top duplicated blocks:\n" + dup.groups.slice(0, 3).map((g) =>
        `• ${g.occurrences.map((o) => `${o.file}:${o.line}`).join("  ↔  ")}`).join("\n"),
      metric: `${dup.groups.length} duplicated blocks of ${WINDOW}+ lines`,
      penalty: 10,
    });
  } else if (dup.ratio > 0.05 && dup.groups.length > 0) {
    findings.push({
      id: "quality.duplication",
      category: "quality",
      severity: "minor",
      title: `Moderate code duplication (~${Math.round(dup.ratio * 100)}% of code lines)`,
      detail: dup.groups.slice(0, 3).map((g) =>
        `• ${g.occurrences.map((o) => `${o.file}:${o.line}`).join("  ↔  ")}`).join("\n"),
      penalty: 4,
    });
  }

  const avgCx = allFns.length ? allFns.reduce((a, f) => a + f.complexity, 0) / allFns.length : 0;
  const metrics: QualityMetrics = {
    functions: allFns.sort((a, b) => b.complexity - a.complexity),
    maxComplexity: allFns.length ? Math.max(...allFns.map((f) => f.complexity)) : 0,
    avgComplexity: Math.round(avgCx * 10) / 10,
    totalLoc,
    duplicationRatio: Math.round(dup.ratio * 100) / 100,
    duplicationGroups: dup.groups,
    commentRatio: totalLoc ? Math.round((commentLines / totalLoc) * 1000) / 10 : 0,
    longFiles,
  };
  return { findings, metrics };
}
