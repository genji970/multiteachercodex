import assert from "node:assert/strict";
import test from "node:test";
import { parseReview } from "../src/parse-review.js";

test("parses a structured reviewer response", () => {
  const parsed = parseReview(
    JSON.stringify({
      summary: "오류가 있다",
      issues: [
        {
          severity: "major",
          category: "factual",
          excerpt: "잘못된 주장",
          problem: "사실과 다르다",
          correction: "정확한 사실로 교체",
          required_content: ["근거"],
        },
      ],
      confidence: 0.9,
    }),
  );

  assert.equal(parsed?.issues.length, 1);
  assert.equal(parsed?.issues[0]?.severity, "major");
  assert.equal(parsed?.confidence, 0.9);
});
