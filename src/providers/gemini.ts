import { REVIEW_SYSTEM_PROMPT } from "../prompt.js";
import type { Reviewer } from "../types.js";

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  error?: { message?: string };
}

export function createGeminiReviewer(apiKey: string, model: string): Reviewer {
  return {
    id: `gemini:${model}`,
    provider: "gemini",
    model,
    async review(prompt, signal) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model,
      )}:generateContent`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
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
        }),
        signal,
      });

      const data = (await response.json()) as GeminiResponse;
      if (!response.ok) {
        throw new Error(data.error?.message || `Gemini HTTP ${response.status}`);
      }

      const text = data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("\n")
        .trim();

      if (!text) throw new Error("Gemini returned no text");
      return text;
    },
  };
}
