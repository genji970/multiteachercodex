import type { Reviewer } from "../types.js";
export interface OpenAICompatibleOptions {
    baseUrl: string;
    apiKey: string;
    model: string;
    siteUrl?: string | undefined;
    appName?: string | undefined;
}
export declare function createOpenAICompatibleReviewer(options: OpenAICompatibleOptions): Reviewer;
