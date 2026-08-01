export type Severity = "critical" | "major" | "minor";

export interface ReviewIssue {
  severity: Severity;
  category: string;
  excerpt: string;
  problem: string;
  correction: string;
  required_content: string[];
}

export interface ParsedReview {
  summary: string;
  issues: ReviewIssue[];
  confidence: number | null;
}

export interface ReviewerResult {
  reviewer: string;
  provider: string;
  model: string;
  ok: boolean;
  latency_ms: number;
  review: ParsedReview | null;
  raw_text: string;
  error?: string;
}

export interface Reviewer {
  id: string;
  provider: string;
  model: string;
  review(prompt: string, signal: AbortSignal): Promise<string>;
}
