type ReviewMessage = {
  type: "multiteachercodex:review";
  serverUrl: string;
  originalQuestion: string;
  chatgptAnswer: string;
};

type HealthMessage = {
  type: "multiteachercodex:health";
  serverUrl: string;
};

type EventMessage = {
  type: "multiteachercodex:event";
  serverUrl: string;
  event: "revision_submitted" | "final_answer" | "extension_error";
  reviewId?: string;
  content?: string;
  message?: string;
};

type ExtensionMessage = ReviewMessage | HealthMessage | EventMessage;

function normalizeServerUrl(value: string): string {
  return value.trim().replace(/\/+$/u, "");
}

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    if (message.type === "multiteachercodex:health") {
      const serverUrl = normalizeServerUrl(message.serverUrl);
      void fetch(`${serverUrl}/health`, {
        headers: { accept: "application/json" },
      })
        .then(async (response) => {
          const body = (await response.json()) as unknown;
          sendResponse({ ok: response.ok, body });
        })
        .catch((error: unknown) => {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      return true;
    }

    if (message.type === "multiteachercodex:review") {
      const serverUrl = normalizeServerUrl(message.serverUrl);
      void fetch(`${serverUrl}/review`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          original_question: message.originalQuestion,
          chatgpt_answer: message.chatgptAnswer,
        }),
      })
        .then(async (response) => {
          const body = (await response.json()) as Record<string, unknown>;
          if (!response.ok || body.ok !== true) {
            throw new Error(
              typeof body.error === "string"
                ? body.error
                : `Review server returned HTTP ${response.status}`,
            );
          }
          sendResponse({ ok: true, body });
        })
        .catch((error: unknown) => {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      return true;
    }

    if (message.type === "multiteachercodex:event") {
      const serverUrl = normalizeServerUrl(message.serverUrl);
      void fetch(`${serverUrl}/event`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          event: message.event,
          ...(message.reviewId ? { review_id: message.reviewId } : {}),
          ...(typeof message.content === "string" ? { content: message.content } : {}),
          ...(typeof message.message === "string" ? { message: message.message } : {}),
        }),
      })
        .then(async (response) => {
          const body = (await response.json()) as Record<string, unknown>;
          sendResponse({ ok: response.ok && body.ok === true, body });
        })
        .catch((error: unknown) => {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      return true;
    }

    return false;
  },
);
