import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { launchChatGptBrowser } from "./browser.js";
import { config, loadReviewers } from "./config.js";
import { buildReviewPrompt, buildRevisionInstruction } from "./prompt.js";
import { formatReviewsForRevision, runReviews } from "./review.js";
const MCP_PATH = "/mcp";
const REVIEW_PATH = "/review";
const EVENT_PATH = "/event";
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXTENSION_PATH = resolve(PROJECT_ROOT, "extension");
const LOG_WIDTH = 100;
const reviewOutputSchema = {
    review_id: z.string(),
    successful_reviewers: z.number(),
    failed_reviewers: z.number(),
    issue_count: z.number(),
    reviewer_results: z.array(z.object({
        reviewer: z.string(),
        provider: z.string(),
        model: z.string(),
        ok: z.boolean(),
        latency_ms: z.number(),
        review: z
            .object({
            summary: z.string(),
            issues: z.array(z.object({
                severity: z.enum(["critical", "major", "minor"]),
                category: z.string(),
                excerpt: z.string(),
                problem: z.string(),
                correction: z.string(),
                required_content: z.array(z.string()),
            })),
            confidence: z.number().nullable(),
        })
            .nullable(),
        raw_text: z.string(),
        error: z.string().optional(),
    })),
    revision_instruction: z.string(),
};
function timestamp() {
    return new Date().toISOString();
}
function line(character = "=") {
    return character.repeat(LOG_WIDTH);
}
function logHeader(title, reviewId) {
    console.log(`\n${line()}`);
    console.log(`[${timestamp()}] ${title}${reviewId ? ` | review_id=${reviewId}` : ""}`);
    console.log(line());
}
function logSection(title, content) {
    console.log(`\n--- ${title} ${"-".repeat(Math.max(1, LOG_WIDTH - title.length - 5))}`);
    console.log(content || "(empty)");
}
function formatReviewerResult(result, index) {
    const lines = [
        `Reviewer ${index + 1}`,
        `id: ${result.reviewer}`,
        `provider: ${result.provider}`,
        `model: ${result.model}`,
        `status: ${result.ok ? "ok" : "failed"}`,
        `latency_ms: ${result.latency_ms}`,
    ];
    if (!result.ok) {
        lines.push(`error: ${result.error ?? "unknown error"}`);
        return lines.join("\n");
    }
    if (result.review) {
        lines.push(`summary: ${result.review.summary || "(none)"}`);
        lines.push(`confidence: ${result.review.confidence ?? "(not supplied)"}`);
        lines.push(`issues: ${result.review.issues.length}`);
        for (const [issueIndex, issue] of result.review.issues.entries()) {
            lines.push("");
            lines.push(`  Issue ${issueIndex + 1} [${issue.severity}/${issue.category}]`);
            lines.push(`  excerpt: ${issue.excerpt || "(not specified)"}`);
            lines.push(`  problem: ${issue.problem}`);
            lines.push(`  correction: ${issue.correction}`);
            lines.push(`  required_content: ${issue.required_content.length ? issue.required_content.join(" | ") : "(none)"}`);
        }
    }
    lines.push("");
    lines.push("raw reviewer output:");
    lines.push(result.raw_text || "(empty)");
    return lines.join("\n");
}
function setCors(res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "content-type, accept, mcp-session-id");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
}
function writeJson(res, status, value) {
    setCors(res);
    res
        .writeHead(status, { "content-type": "application/json; charset=utf-8" })
        .end(JSON.stringify(value));
}
async function readJsonBody(req) {
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buffer.length;
        if (total > MAX_BODY_BYTES) {
            throw new Error("Request body is too large.");
        }
        chunks.push(buffer);
    }
    const raw = Buffer.concat(chunks).toString("utf8").trim();
    if (!raw)
        throw new Error("Request body is empty.");
    return JSON.parse(raw);
}
function parseReviewRequest(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Expected a JSON object.");
    }
    const input = value;
    const originalQuestion = typeof input.original_question === "string"
        ? input.original_question.trim()
        : "";
    const chatgptAnswer = typeof input.chatgpt_answer === "string"
        ? input.chatgpt_answer.trim()
        : "";
    const focus = typeof input.focus === "string" ? input.focus.trim() : "";
    if (!originalQuestion)
        throw new Error("original_question is required.");
    if (!chatgptAnswer)
        throw new Error("chatgpt_answer is required.");
    return {
        original_question: originalQuestion,
        chatgpt_answer: chatgptAnswer,
        ...(focus ? { focus } : {}),
    };
}
function parseBrowserEvent(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Expected a JSON object.");
    }
    const input = value;
    const event = typeof input.event === "string" ? input.event : "";
    if (!new Set(["revision_submitted", "final_answer", "extension_error"]).has(event)) {
        throw new Error("Unsupported browser event.");
    }
    return {
        event: event,
        ...(typeof input.review_id === "string" && input.review_id.trim()
            ? { review_id: input.review_id.trim() }
            : {}),
        ...(typeof input.content === "string" ? { content: input.content } : {}),
        ...(typeof input.message === "string" ? { message: input.message } : {}),
    };
}
function logBrowserEvent(event) {
    if (event.event === "revision_submitted") {
        logHeader("BROWSER CONFIRMED: REVISION INSTRUCTION SUBMITTED TO CHATGPT", event.review_id);
        logSection("DELIVERED REVISION INSTRUCTION", event.content || "The extension confirmed submission, but no instruction text was supplied.");
        return;
    }
    if (event.event === "final_answer") {
        logHeader("FINAL CHATGPT ANSWER COMPLETED", event.review_id);
        logSection("FINAL ANSWER", event.content || "(empty)");
        console.log(`\n${line()}\n`);
        return;
    }
    logHeader("BROWSER EXTENSION ERROR", event.review_id);
    logSection("ERROR", event.message || event.content || "Unknown extension error.");
}
async function createReviewPayload(input, reviewId = randomUUID()) {
    const reviewers = loadReviewers();
    if (reviewers.length === 0) {
        throw new Error("No external reviewer is configured. Run npx -y . --setup and configure at least one provider.");
    }
    logHeader("CHATGPT DRAFT CAPTURED — EXTERNAL REVIEW STARTING", reviewId);
    logSection("ORIGINAL USER QUESTION", input.original_question);
    logSection("CHATGPT FIRST DRAFT", input.chatgpt_answer);
    if (input.focus)
        logSection("ADDITIONAL REVIEW FOCUS", input.focus);
    logSection("REVIEWERS", reviewers.map((reviewer) => `${reviewer.provider}:${reviewer.model}`).join("\n"));
    const reviewPrompt = buildReviewPrompt({
        originalQuestion: input.original_question,
        chatgptAnswer: input.chatgpt_answer,
        focus: input.focus,
    });
    const results = await runReviews(reviewers, reviewPrompt, config.timeoutMs);
    const successful = results.filter((result) => result.ok);
    logHeader("EXTERNAL REVIEW RESULTS", reviewId);
    for (const [index, result] of results.entries()) {
        logSection(`REVIEWER ${index + 1} RESULT`, formatReviewerResult(result, index));
    }
    if (successful.length === 0) {
        const errors = results
            .map((result) => `${result.reviewer}: ${result.error ?? "unknown error"}`)
            .join("; ");
        throw new Error(`Every external reviewer failed. ${errors}`);
    }
    const formattedReviews = formatReviewsForRevision(results);
    const revisionInstruction = buildRevisionInstruction(input.original_question, input.chatgpt_answer, formattedReviews);
    const issueCount = successful.reduce((sum, result) => sum + (result.review?.issues.length ?? 0), 0);
    logHeader("REVISION INSTRUCTION CREATED", reviewId);
    logSection("EXACT TEXT TO BE SENT BACK TO CHATGPT", revisionInstruction);
    logSection("REVIEW SUMMARY", `successful_reviewers: ${successful.length}\nfailed_reviewers: ${results.length - successful.length}\nissue_count: ${issueCount}`);
    return {
        review_id: reviewId,
        successful_reviewers: successful.length,
        failed_reviewers: results.length - successful.length,
        issue_count: issueCount,
        reviewer_results: results,
        revision_instruction: revisionInstruction,
    };
}
function createReviewerServer() {
    const server = new McpServer({
        name: "multiteachercodex",
        version: "0.5.0",
    }, {
        instructions: "For every substantive user request while this app is selected, do not immediately show a final answer. First create a complete candidate answer internally, call review_chatgpt_answer exactly once with the user's exact request and that complete candidate answer, evaluate the returned independent critique, and then provide only the revised final answer. Never expose the candidate draft, tool workflow, reviewer names, or revision prompt unless the user explicitly asks about the review process.",
    });
    server.registerTool("review_chatgpt_answer", {
        title: "Critique a hidden ChatGPT draft",
        description: "Mandatory final-quality gate for this app. After internally drafting an answer, send the exact user request and the complete hidden draft to independent frontier-model reviewers. Use the returned revision_instruction to revise the draft before showing any answer to the user.",
        inputSchema: {
            original_question: z
                .string()
                .min(1)
                .describe("The user's exact current request."),
            chatgpt_answer: z
                .string()
                .min(1)
                .describe("The complete hidden candidate answer to critique."),
            focus: z
                .string()
                .optional()
                .describe("Optional additional review focus."),
        },
        outputSchema: reviewOutputSchema,
        annotations: {
            readOnlyHint: true,
            openWorldHint: true,
            destructiveHint: false,
        },
    }, async ({ original_question, chatgpt_answer, focus }) => {
        try {
            const payload = await createReviewPayload({
                original_question,
                chatgpt_answer,
                ...(focus ? { focus } : {}),
            });
            return {
                structuredContent: payload,
                content: [
                    {
                        type: "text",
                        text: "The hidden draft has been independently reviewed. Evaluate the feedback, revise the draft, and return only the complete final answer.\n\n" +
                            payload.revision_instruction,
                    },
                ],
            };
        }
        catch (error) {
            console.error(`[${timestamp()}] MCP review failed: ${error instanceof Error ? error.message : String(error)}`);
            return {
                isError: true,
                content: [
                    {
                        type: "text",
                        text: error instanceof Error ? error.message : String(error),
                    },
                ],
            };
        }
    });
    return server;
}
const httpServer = createServer(async (req, res) => {
    if (!req.url) {
        writeJson(res, 400, { ok: false, error: "Missing URL" });
        return;
    }
    const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
    if (req.method === "OPTIONS") {
        setCors(res);
        res.writeHead(204).end();
        return;
    }
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
        const reviewers = loadReviewers().map((reviewer) => ({
            provider: reviewer.provider,
            model: reviewer.model,
        }));
        writeJson(res, 200, {
            name: "multiteachercodex",
            status: "ok",
            mode: "browser-extension-and-mcp",
            review: REVIEW_PATH,
            event: EVENT_PATH,
            mcp: MCP_PATH,
            reviewers,
        });
        return;
    }
    if (req.method === "POST" && url.pathname === REVIEW_PATH) {
        const reviewId = randomUUID();
        try {
            const input = parseReviewRequest(await readJsonBody(req));
            const payload = await createReviewPayload(input, reviewId);
            writeJson(res, 200, { ok: true, ...payload });
        }
        catch (error) {
            logHeader("REVIEW FAILED", reviewId);
            logSection("ERROR", error instanceof Error ? error.message : String(error));
            writeJson(res, 400, {
                ok: false,
                review_id: reviewId,
                error: error instanceof Error ? error.message : String(error),
            });
        }
        return;
    }
    if (req.method === "POST" && url.pathname === EVENT_PATH) {
        try {
            const event = parseBrowserEvent(await readJsonBody(req));
            logBrowserEvent(event);
            writeJson(res, 200, { ok: true });
        }
        catch (error) {
            writeJson(res, 400, {
                ok: false,
                error: error instanceof Error ? error.message : String(error),
            });
        }
        return;
    }
    if (url.pathname === MCP_PATH &&
        req.method &&
        new Set(["POST", "GET", "DELETE"]).has(req.method)) {
        setCors(res);
        const server = createReviewerServer();
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true,
        });
        res.on("close", () => {
            void transport.close();
            void server.close();
        });
        try {
            await server.connect(transport);
            await transport.handleRequest(req, res);
        }
        catch (error) {
            console.error("Error handling MCP request:", error);
            if (!res.headersSent) {
                writeJson(res, 500, { ok: false, error: "Internal server error" });
            }
        }
        return;
    }
    writeJson(res, 404, { ok: false, error: "Not Found" });
});
httpServer.listen(config.port, "127.0.0.1", () => {
    const reviewers = loadReviewers();
    console.log(`MultiTeacherCodex local review API: http://127.0.0.1:${config.port}${REVIEW_PATH}`);
    console.log(`Browser event API: http://127.0.0.1:${config.port}${EVENT_PATH}`);
    console.log(`Optional MCP endpoint: http://127.0.0.1:${config.port}${MCP_PATH}`);
    console.log(`Browser extension folder: ${EXTENSION_PATH}`);
    console.log(reviewers.length
        ? `Configured reviewers: ${reviewers.map((r) => `${r.provider}:${r.model}`).join(", ")}`
        : "No reviewer configured yet. Run npx -y . --setup.");
    console.log("Terminal logging is enabled. Questions, drafts, reviews, revision instructions, and final answers will appear here.");
    const browser = launchChatGptBrowser(EXTENSION_PATH);
    if (browser.launched) {
        console.log(`[MultiTeacherCodex] Opened ChatGPT with the extension loaded.`);
        console.log(`[MultiTeacherCodex] Browser: ${browser.executable}`);
        console.log(`[MultiTeacherCodex] Profile: ${browser.profileDir}`);
    }
    else if (process.env.MTC_AUTO_OPEN_BROWSER === "1") {
        console.warn(`[MultiTeacherCodex] Could not open ChatGPT automatically: ${browser.reason}`);
        console.warn("Open a Chromium-based browser with the extension loaded, then visit https://chatgpt.com/.");
    }
});
//# sourceMappingURL=server.js.map