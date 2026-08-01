"use strict";
function normalizeServerUrl(value) {
    return value.trim().replace(/\/+$/u, "");
}
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "multiteachercodex:health") {
        const serverUrl = normalizeServerUrl(message.serverUrl);
        void fetch(`${serverUrl}/health`, {
            headers: { accept: "application/json" },
        })
            .then(async (response) => {
            const body = (await response.json());
            sendResponse({ ok: response.ok, body });
        })
            .catch((error) => {
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
            const body = (await response.json());
            if (!response.ok || body.ok !== true) {
                throw new Error(typeof body.error === "string"
                    ? body.error
                    : `Review server returned HTTP ${response.status}`);
            }
            sendResponse({ ok: true, body });
        })
            .catch((error) => {
            sendResponse({
                ok: false,
                error: error instanceof Error ? error.message : String(error),
            });
        });
        return true;
    }
    return false;
});
