import type { Reviewer, ReviewerResult } from "./types.js";
export declare function runReviews(reviewers: Reviewer[], prompt: string, timeoutMs: number): Promise<ReviewerResult[]>;
export declare function formatReviewsForRevision(results: ReviewerResult[]): string;
