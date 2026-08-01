import { REVIEW_SYSTEM_PROMPT } from "../prompt.js";
export function createAnthropicReviewer(apiKey, model) {
    return {
        id: `anthropic:${model}`,
        provider: "anthropic",
        model,
        async review(prompt, signal) {
            const response = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "x-api-key": apiKey,
                    "anthropic-version": "2023-06-01",
                },
                body: JSON.stringify({
                    model,
                    max_tokens: 4096,
                    temperature: 0,
                    system: REVIEW_SYSTEM_PROMPT,
                    messages: [{ role: "user", content: prompt }],
                }),
                signal,
            });
            const data = (await response.json());
            if (!response.ok) {
                throw new Error(data.error?.message || `Anthropic HTTP ${response.status}`);
            }
            const text = data.content
                ?.filter((part) => part.type === "text")
                .map((part) => part.text ?? "")
                .join("\n")
                .trim();
            if (!text)
                throw new Error("Anthropic returned no text");
            return text;
        },
    };
}
//# sourceMappingURL=anthropic.js.map