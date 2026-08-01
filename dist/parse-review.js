const VALID_SEVERITIES = new Set(["critical", "major", "minor"]);
function asString(value) {
    return typeof value === "string" ? value.trim() : "";
}
function extractJsonCandidate(text) {
    const trimmed = text.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1])
        return fenced[1].trim();
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start)
        return trimmed.slice(start, end + 1);
    return trimmed;
}
function normalizeIssue(value) {
    if (!value || typeof value !== "object")
        return null;
    const item = value;
    const severityRaw = asString(item.severity).toLowerCase();
    const severity = VALID_SEVERITIES.has(severityRaw)
        ? severityRaw
        : "major";
    const problem = asString(item.problem);
    const correction = asString(item.correction);
    if (!problem && !correction)
        return null;
    return {
        severity,
        category: asString(item.category) || "other",
        excerpt: asString(item.excerpt),
        problem,
        correction,
        required_content: Array.isArray(item.required_content)
            ? item.required_content.map(asString).filter(Boolean)
            : [],
    };
}
export function parseReview(text) {
    try {
        const parsed = JSON.parse(extractJsonCandidate(text));
        const issues = Array.isArray(parsed.issues)
            ? parsed.issues.map(normalizeIssue).filter((x) => x !== null)
            : [];
        const confidenceValue = Number(parsed.confidence);
        return {
            summary: asString(parsed.summary),
            issues,
            confidence: Number.isFinite(confidenceValue) && confidenceValue >= 0 && confidenceValue <= 1
                ? confidenceValue
                : null,
        };
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=parse-review.js.map