export const REVIEW_SYSTEM_PROMPT = `You are an independent adversarial reviewer.
Your job is not to defend, continue, or imitate ChatGPT's previous reasoning.
Evaluate the answer from scratch against the original user question.
Find concrete factual errors, logical errors, unsupported claims, missing constraints, misunderstood intent, unsafe ambiguity, and misleading wording.
Do not rewrite the whole answer. Return only actionable critique in valid JSON.`;

export interface ReviewPromptInput {
  originalQuestion: string;
  chatgptAnswer: string;
  focus?: string | undefined;
}

export function buildReviewPrompt({
  originalQuestion,
  chatgptAnswer,
  focus,
}: ReviewPromptInput): string {
  const focusBlock = focus?.trim()
    ? `\n[Additional Review Focus]\n${focus.trim()}\n`
    : "";

  return `[Original User Question]\n${originalQuestion.trim()}\n\n[ChatGPT Answer]\n${chatgptAnswer.trim()}\n${focusBlock}\n[Task]\n위 ChatGPT 답변에서 틀린 내용이나 문제점을 찾아라. 원래 사용자 질문을 기준으로 독립적으로 다시 검토하라.\n\n다음을 확인하라.\n- 사실관계 오류 또는 검증되지 않은 주장\n- 논리적 비약, 모순, 잘못된 계산이나 추론\n- 사용자의 요구·제약·의도를 놓친 부분\n- 중요한 조건, 예외, 위험 또는 설명의 누락\n- 과장되거나 오해를 부르는 표현\n- 실제로 수정할 때 필요한 구체적인 교정 방향\n\n답변 전체를 대신 작성하지 말고 ChatGPT가 답변을 수정할 수 있는 비판과 수정 지침만 제공하라.\n문제가 없다면 issues를 빈 배열로 반환하라.\n\n반드시 아래 JSON 형식만 반환하라. 마크다운 코드 펜스를 쓰지 마라.\n{\n  "summary": "전체 평가 요약",\n  "issues": [\n    {\n      "severity": "critical | major | minor",\n      "category": "factual | reasoning | instruction | omission | wording | safety | other",\n      "excerpt": "문제가 있는 ChatGPT 답변의 짧은 원문",\n      "problem": "무엇이 왜 문제인지",\n      "correction": "어떻게 고쳐야 하는지",\n      "required_content": ["수정 답변에 반드시 포함할 내용"]\n    }\n  ],\n  "confidence": 0.0\n}`;
}

export function buildRevisionInstruction(
  originalQuestion: string,
  chatgptAnswer: string,
  reviewText: string,
): string {
  return `[Original User Question]\n${originalQuestion}\n\n[Your Previous Draft]\n${chatgptAnswer}\n\n[Independent Frontier-Model Reviews]\n${reviewText}\n\n[Revision Task]\n독립 리뷰를 증거와 논리에 따라 검토하고, 타당한 지적을 모두 반영해 이전 초안을 수정하라. 리뷰 자체도 틀릴 수 있으므로 무조건 따르지는 말되, 무시한 지적이 있다면 내부적으로 타당성을 확인하라. 사용자에게는 리뷰 과정, 도구 호출, 이전 초안 또는 모델 이름을 언급하지 말고 완성된 최종 답변만 제공하라.`;
}
