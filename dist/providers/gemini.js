import { request } from "node:https";
import { REVIEW_SYSTEM_PROMPT } from "../prompt.js";
function postJsonIpv4(endpoint, apiKey, payload, signal) {
    const body = JSON.stringify(payload);
    return new Promise((resolve, reject) => {
        const req = request(endpoint, {
            method: "POST",
            family: 4,
            signal,
            headers: {
                "content-type": "application/json",
                "content-length": Buffer.byteLength(body).toString(),
                "x-goog-api-key": apiKey,
                "user-agent": "multiteachercodex/0.4.0",
            },
        }, (res) => {
            const chunks = [];
            res.on("data", (chunk) => {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            });
            res.on("end", () => {
                resolve({
                    statusCode: res.statusCode ?? 0,
                    statusMessage: res.statusMessage ?? "",
                    body: Buffer.concat(chunks).toString("utf8"),
                });
            });
        });
        req.on("error", reject);
        req.end(body);
    });
}
function parseGeminiResponse(result) {
    let data;
    try {
        data = JSON.parse(result.body);
    }
    catch {
        const preview = result.body.trim().slice(0, 500) || "(empty body)";
        throw new Error(`Gemini returned non-JSON HTTP ${result.statusCode} ${result.statusMessage}: ${preview}`);
    }
    if (result.statusCode < 200 || result.statusCode >= 300) {
        throw new Error(data.error?.message ||
            `Gemini HTTP ${result.statusCode} ${result.statusMessage || "request failed"}`);
    }
    return data;
}
export function createGeminiReviewer(apiKey, model) {
    return {
        id: `gemini:${model}`,
        provider: "gemini",
        model,
        async review(prompt, signal) {
            const endpoint = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`);
            const result = await postJsonIpv4(endpoint, apiKey, {
                system_instruction: {
                    parts: [{ text: REVIEW_SYSTEM_PROMPT }],
                },
                contents: [
                    {
                        role: "user",
                        parts: [{ text: prompt }],
                    },
                ],
                generationConfig: {
                    temperature: 0,
                    maxOutputTokens: 4096,
                    responseMimeType: "application/json",
                },
            }, signal);
            const data = parseGeminiResponse(result);
            const text = data.candidates?.[0]?.content?.parts
                ?.map((part) => part.text ?? "")
                .join("\n")
                .trim();
            if (!text)
                throw new Error("Gemini returned no text");
            return text;
        },
    };
}
//# sourceMappingURL=gemini.js.map