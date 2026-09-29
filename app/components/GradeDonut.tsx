"use client";

export default function GradeDonut({ score, grade }: { score: number; grade: string }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  const color =
    score >= 85 ? "#34d399" : score >= 70 ? "#a3e635" : score >= 55 ? "#fbbf24" : score >= 40 ? "#fb923c" : "#fb7185";

  return (
    <div className="relative w-36 h-36">
      <svg viewBox="0 0 128 128" className="w-full h-full -rotate-90">
        <circle cx="64" cy="64" r={r} fill="none" stroke="#1c2942" strokeWidth="12" />
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circ}`}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black" style={{ color }}>
          {grade}
        </span>
        <span className="text-sm font-mono text-slate-400">{score}%</span>
      </div>
    </div>
  );
}
