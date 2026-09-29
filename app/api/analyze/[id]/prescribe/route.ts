// Optional LLM layer: turns the deterministic findings digest into a written
// prescription. Falls back gracefully when no provider key is configured.

import { NextResponse } from "next/server";
import { getResult, saveResult } from "@/lib/store";
import { AnalysisResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildDigest(result: AnalysisResult): string {
  const lines: string[] = [];
  lines.push(`Repository: ${result.repo.owner}/${result.repo.name} (${result.repo.ref})`);
  lines.push(`Overall: ${result.scores.overall}/100 (grade ${result.scores.grade})`);
  for (const c of result.scores.categories) {
    lines.push(`- ${c.label}: ${c.score}/100`);
  }
  lines.push(`Stats: ${result.stats.filesAnalyzed} files, ${result.stats.totalLoc} lines, languages: ${Object.keys(result.stats.byLanguage).join(", ") || "n/a"}`);
  lines.push("");
  lines.push("Findings (id | severity | title):");
  for (const f of result.findings.slice(0, 30)) {
    lines.push(`- ${f.id} | ${f.severity} | ${f.title}${f.file ? ` | e.g. ${f.file}:${f.line ?? 0}` : ""}`);
  }
  lines.push("");
  lines.push("Rule-based plan already suggested:");
  for (const p of result.plan) {
    lines.push(`- [${p.impact} impact / ${p.effort} effort] ${p.title}`);
  }
  return lines.join("\n");
}

const SYSTEM = `You are RepoDoctor, a senior software auditor. You receive static-analysis findings for a GitHub repository and write a short, prioritized improvement prescription in Markdown.
Rules: 3-6 numbered actions max; each action = bold one-line title, then 1-2 sentences tying it to concrete findings and giving the first concrete step. No code dumps, no fluff, no repeating the input verbatim. Write in English. Max 300 words.`;

async function callOpenAI(digest: string, key: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: digest },
      ],
      temperature: 0.3,
      max_tokens: 700,
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
  const j = await res.json();
  return j.choices?.[0]?.message?.content ?? "";
}

async function callAnthropic(digest: string, key: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-latest",
      max_tokens: 700,
      system: SYSTEM,
      messages: [{ role: "user", content: digest }],
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`);
  const j = await res.json();
  return j.content?.[0]?.text ?? "";
}

async function callGemini(digest: string, key: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL ?? "gemini-2.0-flash"}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ parts: [{ text: digest }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 800 },
      }),
      signal: AbortSignal.timeout(45000),
    }
  );
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const j = await res.json();
  return j.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = getResult(id);
  if (!result) {
    return NextResponse.json({ error: "Result not found (or analysis still running)." }, { status: 404 });
  }
  if (result.prescription) {
    return NextResponse.json({ available: true, ...result.prescription });
  }

  const openai = process.env.OPENAI_API_KEY;
  const anthropic = process.env.ANTHROPIC_API_KEY;
  const gemini = process.env.GEMINI_API_KEY;
  if (!openai && !anthropic && !gemini) {
    return NextResponse.json({
      available: false,
      message:
        "No LLM key configured. The rule-based plan below is fully deterministic. To enable the AI prescription, set OPENAI_API_KEY, ANTHROPIC_API_KEY or GEMINI_API_KEY in .env.local and restart.",
    });
  }

  const digest = buildDigest(result);
  const providers: [string, string, (d: string, k: string) => Promise<string>][] = [
    ["openai", openai ?? "", callOpenAI],
    ["anthropic", anthropic ?? "", callAnthropic],
    ["gemini", gemini ?? "", callGemini],
  ];
  for (const [name, key, fn] of providers) {
    if (!key) continue;
    try {
      const text = await fn(digest, key);
      if (text.trim()) {
        const prescription = { text: text.trim(), provider: name, generatedAt: new Date().toISOString() };
        result.prescription = prescription;
        saveResult(result);
        return NextResponse.json({ available: true, ...prescription });
      }
    } catch {
      // try the next provider
    }
  }
  return NextResponse.json(
    { available: false, message: "All configured LLM providers failed. The rule-based plan below remains available." },
    { status: 502 }
  );
}
