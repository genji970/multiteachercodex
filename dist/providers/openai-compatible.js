import { REVIEW_SYSTEM_PROMPT } from "../prompt.js";
function extractContent(data) {
    const content = data.choices?.[0]?.message?.content;
    if (typeof content === "string")
        return content.trim();
    if (Array.isArray(content)) {
        return content
            .map((part) => (part.type === "text" ? part.text ?? "" : ""))
            .join("\n")
            .trim();
    }
    return "";
}
export function createOpenAICompatibleReviewer(options) {
    const baseUrl = options.baseUrl.replace(/\/+$/, "");
    return {
        id: `openai-compatible:${options.model}`,
        provider: "openai-compatible",
        model: options.model,
        async review(prompt, signal) {
            const headers = {
                "content-type": "application/json",
                authorization: `Bearer ${options.apiKey}`,
            };
            if (options.siteUrl)
                headers["HTTP-Referer"] = options.siteUrl;
            if (options.appName)
                headers["X-Title"] = options.appName;
            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    model: options.model,
                    temperature: 0,
                    max_tokens: 4096,
                    messages: [
                        { role: "system", content: REVIEW_SYSTEM_PROMPT },
                        { role: "user", content: prompt },
                    ],
                }),
                signal,
            });
            const data = (await response.json());
            if (!response.ok) {
                throw new Error(data.error?.message || `OpenAI-compatible HTTP ${response.status}`);
            }
            const text = extractContent(data);
            if (!text)
                throw new Error("OpenAI-compatible provider returned no text");
            return text;
        },
    };
}
//# sourceMappingURL=openai-compatible.js.map