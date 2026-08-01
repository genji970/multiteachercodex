import "dotenv/config";
import { createAnthropicReviewer } from "./providers/anthropic.js";
import { createGeminiReviewer } from "./providers/gemini.js";
import { createOpenAICompatibleReviewer } from "./providers/openai-compatible.js";
function env(name) {
    return process.env[name]?.trim() ?? "";
}
function positiveInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
export const config = {
    port: positiveInteger(env("PORT"), 8787),
    timeoutMs: positiveInteger(env("REVIEW_TIMEOUT_MS"), 90_000),
    maxReviewers: positiveInteger(env("MAX_REVIEWERS"), 4),
};
export function loadReviewers() {
    const reviewers = [];
    const anthropicKey = env("ANTHROPIC_API_KEY");
    const anthropicModel = env("ANTHROPIC_MODEL");
    if (anthropicKey && anthropicModel) {
        reviewers.push(createAnthropicReviewer(anthropicKey, anthropicModel));
    }
    const geminiKey = env("GEMINI_API_KEY");
    const geminiModel = env("GEMINI_MODEL");
    if (geminiKey && geminiModel) {
        reviewers.push(createGeminiReviewer(geminiKey, geminiModel));
    }
    const compatibleBaseUrl = env("OPENAI_COMPATIBLE_BASE_URL");
    const compatibleKey = env("OPENAI_COMPATIBLE_API_KEY");
    const compatibleModels = env("OPENAI_COMPATIBLE_MODELS")
        .split(",")
        .map((model) => model.trim())
        .filter(Boolean);
    if (compatibleBaseUrl && compatibleKey) {
        for (const model of compatibleModels) {
            reviewers.push(createOpenAICompatibleReviewer({
                baseUrl: compatibleBaseUrl,
                apiKey: compatibleKey,
                model,
                siteUrl: env("OPENAI_COMPATIBLE_SITE_URL") || undefined,
                appName: env("OPENAI_COMPATIBLE_APP_NAME") || undefined,
            }));
        }
    }
    return reviewers.slice(0, config.maxReviewers);
}
//# sourceMappingURL=config.js.map