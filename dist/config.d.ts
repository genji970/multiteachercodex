import "dotenv/config";
import type { Reviewer } from "./types.js";
export declare const config: {
    port: number;
    timeoutMs: number;
    maxReviewers: number;
};
export declare function loadReviewers(): Reviewer[];
