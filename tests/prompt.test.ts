import assert from "node:assert/strict";
import test from "node:test";
import { buildReviewPrompt } from "../src/prompt.js";

 test("review prompt contains the exact three required elements", () => {
  const prompt = buildReviewPrompt({
    originalQuestion: "원 질문",
    chatgptAnswer: "ChatGPT 답변",
  });

  assert.match(prompt, /\[Original User Question\]\n원 질문/);
  assert.match(prompt, /\[ChatGPT Answer\]\nChatGPT 답변/);
  assert.match(prompt, /틀린 내용이나 문제점을 찾아라/);
});
