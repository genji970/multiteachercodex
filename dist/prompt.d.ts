export declare const REVIEW_SYSTEM_PROMPT = "You are an independent adversarial reviewer.\nYour job is not to defend, continue, or imitate ChatGPT's previous reasoning.\nEvaluate the answer from scratch against the original user question.\nFind concrete factual errors, logical errors, unsupported claims, missing constraints, misunderstood intent, unsafe ambiguity, and misleading wording.\nDo not rewrite the whole answer. Return only actionable critique in valid JSON.";
export interface ReviewPromptInput {
    originalQuestion: string;
    chatgptAnswer: string;
    focus?: string | undefined;
}
export declare function buildReviewPrompt({ originalQuestion, chatgptAnswer, focus, }: ReviewPromptInput): string;
export declare function buildRevisionInstruction(originalQuestion: string, chatgptAnswer: string, reviewText: string): string;
