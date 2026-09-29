// Shared contracts between the analysis engine, the API and the UI.

export type Severity = "critical" | "major" | "minor" | "info";
export type Category =
  | "quality"
  | "security"
  | "documentation"
  | "testing"
  | "maintainability";

export const CATEGORY_LABELS: Record<Category, string> = {
  quality: "Code Quality",
  security: "Security",
  documentation: "Documentation",
  testing: "Testing",
  maintainability: "Maintainability",
};

export interface Finding {
  id: string;
  category: Category;
  severity: Severity;
  title: string;
  detail: string;
  file?: string;
  line?: number;
  metric?: string;
  penalty: number;
  link?: string;
}

export interface Contribution {
  title: string;
  penalty: number;
}

export interface CategoryScore {
  key: Category;
  label: string;
  score: number;
  penalty: number;
  contributions: Contribution[];
  note?: string;
}

export interface Confidence {
  filesAnalyzed: number;
  filesTotal: number;
  languages: string[];
  partial: boolean;
}

export interface ScoreReport {
  overall: number;
  grade: string;
  categories: CategoryScore[];
  confidence: Confidence;
}

export interface RepoMeta {
  owner: string;
  name: string;
  description: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  defaultBranch: string;
  primaryLanguage: string | null;
  languages: Record<string, number>;
  license: string | null;
  createdAt: string | null;
  pushedAt: string | null;
  contributors: number;
  busFactor: number;
  archived: boolean;
}

export interface GraphNode {
  id: string;
  label: string;
  kind: "module" | "file";
  loc: number;
  complexity: number;
  fanIn: number;
  fanOut: number;
  inCycle: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}

export interface ArchitectureGraph {
  level: "module" | "file";
  nodes: GraphNode[];
  edges: GraphEdge[];
  cycles: string[][];
  topFanIn: { id: string; fanIn: number }[];
  externalDeps: { name: string; count: number }[];
  unresolvedImports: number;
}

export interface PlanItem {
  rank: number;
  title: string;
  detail: string;
  impact: "high" | "medium" | "low";
  effort: "low" | "medium" | "high";
  relatedFindings: string[];
}

export interface AnalysisStats {
  filesAnalyzed: number;
  filesTotal: number;
  totalLoc: number;
  durationMs: number;
  byLanguage: Record<string, { files: number; loc: number }>;
}

export interface VulnerableDep {
  name: string;
  version: string;
  ecosystem: string;
  vulns: { id: string; summary?: string; url: string }[];
}

export interface AnalysisResult {
  id: string;
  repo: { url: string; owner: string; name: string; ref: string };
  meta: RepoMeta;
  scores: ScoreReport;
  findings: Finding[];
  architecture: ArchitectureGraph;
  fileGraph?: ArchitectureGraph;
  prescription?: { text: string; provider: string; generatedAt: string } | null;
  plan: PlanItem[];
  stats: AnalysisStats;
  vulnerableDeps: VulnerableDep[];
  notes: string[];
  analyzedAt: string;
}

export type JobStatus = "queued" | "running" | "done" | "error";

export interface Job {
  id: string;
  repoUrl: string;
  owner: string;
  repo: string;
  status: JobStatus;
  stage: string;
  progress: number;
  message: string;
  createdAt: string;
  finishedAt?: string;
  error?: string;
  cached?: boolean;
  resultId?: string;
  summary?: { overall: number; grade: string };
}
