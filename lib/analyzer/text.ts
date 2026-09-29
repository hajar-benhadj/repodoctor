// Text utilities: comment/string stripping (line-preserving), entropy, line counts.

export function shannonEntropy(s: string): number {
  if (!s.length) return 0;
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let h = 0;
  for (const count of freq.values()) {
    const p = count / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

export function countLines(text: string): number {
  if (!text) return 0;
  let n = 1;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

const REGEX_PRECEDERS = new Set([
  "(", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", ",", "<", ">", "+", "-", "*", "%", "~", "^",
]);

/**
 * Replaces comments and string contents with spaces, preserving offsets and
 * newlines, so downstream metrics can operate on "code only" text safely.
 * Handles JS/TS (incl. template literals with ${}) and Python (incl. triple quotes).
 */
export function stripCommentsAndStrings(code: string, analysis: "js" | "python" | "generic"): string {
  if (analysis === "js") return stripJs(code);
  if (analysis === "python") return stripPython(code);
  return stripGeneric(code);
}

function blank(s: string): string {
  return s.replace(/[^\n]/g, " ");
}

function stripJs(src: string): string {
  const out = src.split("");
  const n = src.length;
  // mode stack: 'code' or 'template' (template literal with ${} interpolation)
  const stack: ("code" | "template")[] = ["code"];
  let i = 0;
  let prevMeaningful = ""; // last non-space code char emitted
  while (i < n) {
    const mode = stack[stack.length - 1];
    const c = src[i];
    const next = i + 1 < n ? src[i + 1] : "";
    if (mode === "template") {
      if (c === "\\") {
        out[i] = " "; out[i + 1] = " "; i += 2; continue;
      }
      if (c === "`") { out[i] = " "; stack.pop(); i++; continue; }
      if (c === "$" && next === "{") {
        out[i] = " "; out[i + 1] = " "; stack.push("code"); i += 2; continue;
      }
      out[i] = " "; i++; continue;
    }
    // code mode
    if (c === "/" && next === "/") {
      while (i < n && src[i] !== "\n") { out[i] = " "; i++; }
      continue;
    }
    if (c === "/" && next === "*") {
      out[i] = " "; out[i + 1] = " "; i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] !== "\n") out[i] = " ";
        i++;
      }
      if (i < n) { out[i] = " "; out[i + 1] = " "; i += 2; }
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      out[i] = " "; i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === "\\") { out[i] = " "; if (i + 1 < n) out[i + 1] = " "; i += 2; continue; }
        if (src[i] === "\n") break; // unterminated string: bail at EOL
        out[i] = " "; i++;
      }
      if (i < n && src[i] === quote) { out[i] = " "; i++; }
      continue;
    }
    if (c === "`") { out[i] = " "; stack.push("template"); i++; continue; }
    if (c === "/") {
      // regex literal heuristic: division vs regex — look at previous meaningful char
      const isRegex =
        prevMeaningful === "" || REGEX_PRECEDERS.has(prevMeaningful) ||
        prevMeaningful === "n" && /return$/.test(src.slice(Math.max(0, i - 7), i));
      if (isRegex) {
        let j = i + 1;
        let closed = false;
        let inClass = false;
        while (j < n) {
          if (src[j] === "\\") { j += 2; continue; }
          if (src[j] === "\n") break;
          if (src[j] === "[") inClass = true;
          else if (src[j] === "]") inClass = false;
          else if (src[j] === "/" && !inClass) { closed = true; break; }
          j++;
        }
        if (closed) {
          for (let k = i; k <= j; k++) if (src[k] !== "\n") out[k] = " ";
          i = j + 1;
          while (i < n && /[gimsuyvd]/.test(src[i])) { out[i] = " "; i++; }
          prevMeaningful = "x";
          continue;
        }
      }
      prevMeaningful = "/";
      i++;
      continue;
    }
    if (!/\s/.test(c)) prevMeaningful = c;
    i++;
  }
  return out.join("");
}

function stripPython(src: string): string {
  const out = src.split("");
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src[i];
    if (c === "#") {
      while (i < n && src[i] !== "\n") { out[i] = " "; i++; }
      continue;
    }
    if (c === '"' || c === "'") {
      const triple = src.slice(i, i + 3) === c.repeat(3);
      const quote = triple ? c.repeat(3) : c;
      let j = i + quote.length;
      while (j < n) {
        if (src[j] === "\\") { out[j] = " "; if (j + 1 < n) out[j + 1] = " "; j += 2; continue; }
        if (src.slice(j, j + quote.length) === quote) break;
        if (!triple && src[j] === "\n") break;
        j++;
      }
      for (let k = i; k < Math.min(j + quote.length, n); k++) {
        if (src[k] !== "\n") out[k] = " ";
      }
      i = j + quote.length;
      continue;
    }
    i++;
  }
  return out.join("");
}

function stripGeneric(src: string): string {
  // C-like-ish: // and /* */ plus "..." '...' strings — best effort.
  return stripJs(src);
}
