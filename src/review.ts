import { parseReview } from "./parse-review.js";
import type { Reviewer, ReviewerResult } from "./types.js";

function objectDetails(value: object): string[] {
  const record = value as Record<string, unknown>;
  const details: string[] = [];
  for (const key of ["code", "errno", "syscall", "hostname", "address", "port"]) {
    const field = record[key];
    if (typeof field === "string" || typeof field === "number") {
      details.push(`${key}=${String(field)}`);
    }
  }
  return details;
}

function describeError(error: unknown, seen = new Set<unknown>()): string {
  if (seen.has(error)) return "(repeated error cause)";
  if (error && (typeof error === "object" || typeof error === "function")) {
    seen.add(error);
  }

  if (error instanceof AggregateError) {
    const nested = error.errors.map((item) => describeError(item, seen)).filter(Boolean);
    return [error.message || error.name, ...nested].join(" | ");
  }

  if (error instanceof Error) {
    const details = objectDetails(error);
    const cause = "cause" in error ? (error as Error & { cause?: unknown }).cause : undefined;
    const parts = [
      error.name && error.name !== "Error" ? `${error.name}: ${error.message}` : error.message,
      details.length ? details.join(", ") : "",
      cause ? `cause: ${describeError(cause, seen)}` : "",
    ].filter(Boolean);
    return parts.join(" | ");
  }

  if (error && typeof error === "object") {
    const details = objectDetails(error);
    if (details.length) return details.join(", ");
  }

  return String(error);
}

async function runOneReviewer(
  reviewer: Reviewer,
  prompt: string,
  timeoutMs: number,
): Promise<ReviewerResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const rawText = await reviewer.review(prompt, controller.signal);
    const parsed = parseReview(rawText);
    return {
      reviewer: reviewer.id,
      provider: reviewer.provider,
      model: reviewer.model,
      ok: true,
      latency_ms: Date.now() - started,
      review: parsed,
      raw_text: rawText,
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? `Timed out after ${timeoutMs} ms`
        : describeError(error);

    return {
      reviewer: reviewer.id,
      provider: reviewer.provider,
      model: reviewer.model,
      ok: false,
      latency_ms: Date.now() - started,
      review: null,
      raw_text: "",
      error: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function runReviews(
  reviewers: Reviewer[],
  prompt: string,
  timeoutMs: number,
): Promise<ReviewerResult[]> {
  return Promise.all(
    reviewers.map((reviewer) => runOneReviewer(reviewer, prompt, timeoutMs)),
  );
}

export function formatReviewsForRevision(results: ReviewerResult[]): string {
  return results
    .map((result, index) => {
      const label = `Reviewer ${index + 1}`;
      if (!result.ok) return `${label}: review failed (${result.error ?? "unknown error"})`;

      if (!result.review) {
        return `${label}:\n${result.raw_text}`;
      }

      const issues = result.review.issues.length
        ? result.review.issues
            .map(
              (issue, issueIndex) =>
                `${issueIndex + 1}. [${issue.severity}/${issue.category}]\n` +
                `   Excerpt: ${issue.excerpt || "(not specified)"}\n` +
                `   Problem: ${issue.problem}\n` +
                `   Correction: ${issue.correction}\n` +
                `   Must include: ${issue.required_content.join("; ") || "(none specified)"}`,
            )
            .join("\n")
        : "No concrete issue identified.";

      return `${label}:\nSummary: ${result.review.summary || "(none)"}\n${issues}`;
    })
    .join("\n\n");
}
