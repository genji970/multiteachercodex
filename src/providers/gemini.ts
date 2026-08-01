import { request } from "node:https";
import { REVIEW_SYSTEM_PROMPT } from "../prompt.js";
import type { Reviewer } from "../types.js";

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  error?: { message?: string };
}

type HttpResult = {
  statusCode: number;
  statusMessage: string;
  body: string;
};

function postJsonIpv4(
  endpoint: URL,
  apiKey: string,
  payload: unknown,
  signal: AbortSignal,
): Promise<HttpResult> {
  const body = JSON.stringify(payload);

  return new Promise<HttpResult>((resolve, reject) => {
    const req = request(
      endpoint,
      {
        method: "POST",
        family: 4,
        signal,
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body).toString(),
          "x-goog-api-key": apiKey,
          "user-agent": "multiteachercodex/0.4.0",
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            statusMessage: res.statusMessage ?? "",
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );

    req.on("error", reject);
    req.end(body);
  });
}

function parseGeminiResponse(result: HttpResult): GeminiResponse {
  let data: GeminiResponse;
  try {
    data = JSON.parse(result.body) as GeminiResponse;
  } catch {
    const preview = result.body.trim().slice(0, 500) || "(empty body)";
    throw new Error(
      `Gemini returned non-JSON HTTP ${result.statusCode} ${result.statusMessage}: ${preview}`,
    );
  }

  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw new Error(
      data.error?.message ||
        `Gemini HTTP ${result.statusCode} ${result.statusMessage || "request failed"}`,
    );
  }

  return data;
}

export function createGeminiReviewer(apiKey: string, model: string): Reviewer {
  return {
    id: `gemini:${model}`,
    provider: "gemini",
    model,
    async review(prompt, signal) {
      const endpoint = new URL(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          model,
        )}:generateContent`,
      );

      const result = await postJsonIpv4(
        endpoint,
        apiKey,
        {
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
        },
        signal,
      );

      const data = parseGeminiResponse(result);
      const text = data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("\n")
        .trim();

      if (!text) throw new Error("Gemini returned no text");
      return text;
    },
  };
}
