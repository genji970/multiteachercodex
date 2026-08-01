(() => {
  const INTERNAL_MARKER = "[MULTITEACHERCODEX_INTERNAL_REVISION_V1]";
  const DEFAULT_SERVER_URL = "http://127.0.0.1:8787";
  const STABLE_MS = 1600;
  const RECONCILE_DELAY_MS = 180;

  type Phase =
    | "idle"
    | "awaiting-draft"
    | "reviewing"
    | "sending-revision"
    | "awaiting-final";

  type Settings = {
    enabled: boolean;
    serverUrl: string;
  };

  type ReviewResponse = {
    ok: boolean;
    body?: {
      review_id?: unknown;
      revision_instruction?: unknown;
      successful_reviewers?: unknown;
      issue_count?: unknown;
    };
    error?: string;
  };

  type BrowserEvent =
    | "revision_submitted"
    | "final_answer"
    | "extension_error";

  type Turn = {
    role: "user" | "assistant";
    node: HTMLElement;
    container: HTMLElement;
    text: string;
  };

  let settings: Settings = {
    enabled: true,
    serverUrl: DEFAULT_SERVER_URL,
  };
  let phase: Phase = "idle";
  let activeUserNode: HTMLElement | null = null;
  let activeDraftNode: HTMLElement | null = null;
  let internalUserNode: HTMLElement | null = null;
  let activeReviewId: string | null = null;
  let lastDraftText = "";
  let lastDraftChangeAt = 0;
  let reconcileTimer: number | undefined;
  let operationToken = 0;
  const processedUserNodes = new WeakSet<HTMLElement>();

  function messageText(node: HTMLElement): string {
    return (node.innerText || node.textContent || "").trim();
  }

  function messageContainer(node: HTMLElement): HTMLElement {
    return (
      node.closest<HTMLElement>("article") ??
      node.closest<HTMLElement>('[data-testid^="conversation-turn"]') ??
      node.parentElement ??
      node
    );
  }

  function getTurns(): Turn[] {
    return Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-message-author-role="user"], [data-message-author-role="assistant"]',
      ),
    ).map((node) => {
      const rawRole = node.getAttribute("data-message-author-role");
      return {
        role: rawRole === "assistant" ? "assistant" : "user",
        node,
        container: messageContainer(node),
        text: messageText(node),
      };
    });
  }

  function hideTurn(turn: Turn | HTMLElement | null): void {
    if (!turn) return;
    const container =
      turn instanceof HTMLElement ? messageContainer(turn) : turn.container;
    container.classList.add("mtc-hidden-turn");
  }

  function showTurn(turn: Turn | HTMLElement | null): void {
    if (!turn) return;
    const container =
      turn instanceof HTMLElement ? messageContainer(turn) : turn.container;
    container.classList.remove("mtc-hidden-turn");
  }

  function setStatus(
    text: string,
    tone: "working" | "error" | "done" = "working",
  ): void {
    let badge = document.getElementById("multiteachercodex-status");
    if (!badge) {
      badge = document.createElement("div");
      badge.id = "multiteachercodex-status";
      document.documentElement.appendChild(badge);
    }
    badge.dataset.tone = tone;
    badge.textContent = text;
    badge.classList.add("mtc-visible");
  }

  function clearStatus(delayMs = 0): void {
    window.setTimeout(() => {
      document
        .getElementById("multiteachercodex-status")
        ?.classList.remove("mtc-visible");
    }, delayMs);
  }

  function isGenerating(): boolean {
    return Boolean(
      document.querySelector(
        'button[data-testid="stop-button"], button[aria-label*="Stop"], button[aria-label*="중지"]',
      ),
    );
  }

  function findNextTurn(
    turns: Turn[],
    node: HTMLElement,
    role: Turn["role"],
  ): Turn | null {
    const index = turns.findIndex((turn) => turn.node === node);
    if (index < 0) return null;
    for (let offset = index + 1; offset < turns.length; offset += 1) {
      const candidate = turns[offset];
      if (candidate?.role === role) return candidate;
    }
    return null;
  }

  function hidePersistedInternalTurns(turns: Turn[]): void {
    for (let index = 0; index < turns.length; index += 1) {
      const turn = turns[index];
      if (turn?.role !== "user" || !turn.text.startsWith(INTERNAL_MARKER)) {
        continue;
      }
      hideTurn(turn);
      let previousAssistantIndex = -1;
      for (let previous = index - 1; previous >= 0; previous -= 1) {
        const previousTurn = turns[previous];
        if (previousTurn?.role === "assistant") {
          hideTurn(previousTurn);
          previousAssistantIndex = previous;
          break;
        }
      }
      for (
        let previous = previousAssistantIndex - 1;
        previous >= 0;
        previous -= 1
      ) {
        const previousTurn = turns[previous];
        if (
          previousTurn?.role === "user" &&
          !previousTurn.text.startsWith(INTERNAL_MARKER)
        ) {
          processedUserNodes.add(previousTurn.node);
          break;
        }
      }
    }
  }

  function resetCycle(): void {
    phase = "idle";
    activeUserNode = null;
    activeDraftNode = null;
    internalUserNode = null;
    activeReviewId = null;
    lastDraftText = "";
    lastDraftChangeAt = 0;
  }

  async function loadSettings(): Promise<void> {
    const stored = await chrome.storage.local.get({
      enabled: true,
      serverUrl: DEFAULT_SERVER_URL,
    });
    settings = {
      enabled: stored.enabled !== false,
      serverUrl:
        typeof stored.serverUrl === "string" && stored.serverUrl.trim()
          ? stored.serverUrl.trim().replace(/\/+$/u, "")
          : DEFAULT_SERVER_URL,
    };
  }

  function callReviewServer(
    originalQuestion: string,
    chatgptAnswer: string,
  ): Promise<ReviewResponse> {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: "multiteachercodex:review",
          serverUrl: settings.serverUrl,
          originalQuestion,
          chatgptAnswer,
        },
        (response: ReviewResponse | undefined) => {
          if (chrome.runtime.lastError) {
            resolve({
              ok: false,
              error:
                chrome.runtime.lastError.message ?? "Extension runtime error.",
            });
            return;
          }
          resolve(
            response ?? {
              ok: false,
              error: "No response from extension background.",
            },
          );
        },
      );
    });
  }

  function sendBrowserEvent(
    event: BrowserEvent,
    values: { content?: string; message?: string } = {},
  ): void {
    chrome.runtime.sendMessage(
      {
        type: "multiteachercodex:event",
        serverUrl: settings.serverUrl,
        event,
        ...(activeReviewId ? { reviewId: activeReviewId } : {}),
        ...(typeof values.content === "string"
          ? { content: values.content }
          : {}),
        ...(typeof values.message === "string"
          ? { message: values.message }
          : {}),
      },
      () => {
        void chrome.runtime.lastError;
      },
    );
  }

  function composer(): HTMLElement | null {
    return document.querySelector<HTMLElement>(
      '#prompt-textarea, div[contenteditable="true"][data-lexical-editor="true"]',
    );
  }

  function sendButton(): HTMLButtonElement | null {
    return document.querySelector<HTMLButtonElement>(
      'button[data-testid="send-button"], button[data-testid="composer-submit-button"], button[aria-label="Send prompt"], button[aria-label="프롬프트 보내기"]',
    );
  }

  async function sendInternalRevision(instruction: string): Promise<void> {
    const editor = composer();
    if (!editor) throw new Error("Could not find the ChatGPT prompt box.");

    const prompt = `${INTERNAL_MARKER}\n${instruction}`;
    editor.focus();

    const inserted = document.execCommand("insertText", false, prompt);
    if (!inserted || !messageText(editor)) {
      editor.textContent = prompt;
      editor.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          inputType: "insertText",
          data: prompt,
        }),
      );
    }

    const deadline = Date.now() + 8000;
    let button = sendButton();
    while ((!button || button.disabled) && Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 120));
      button = sendButton();
    }

    if (!button || button.disabled) {
      throw new Error("Could not submit the hidden revision prompt.");
    }
    button.click();
  }

  async function reviewAndRevise(
    question: string,
    draft: string,
    token: number,
  ): Promise<void> {
    phase = "reviewing";
    setStatus("MultiTeacherCodex: external model reviewing…");

    const response = await callReviewServer(question, draft);
    if (token !== operationToken) return;

    const instruction = response.body?.revision_instruction;
    const reviewId = response.body?.review_id;
    if (typeof reviewId === "string" && reviewId.trim()) {
      activeReviewId = reviewId.trim();
    }

    if (!response.ok || typeof instruction !== "string" || !instruction.trim()) {
      const errorMessage = response.error ?? "invalid review response";
      showTurn(activeDraftNode);
      setStatus(`MultiTeacherCodex failed: ${errorMessage}`, "error");
      sendBrowserEvent("extension_error", { message: errorMessage });
      clearStatus(7000);
      resetCycle();
      return;
    }

    phase = "sending-revision";
    setStatus("MultiTeacherCodex: asking ChatGPT to revise…");

    try {
      await sendInternalRevision(instruction);
      if (token !== operationToken) return;
      sendBrowserEvent("revision_submitted", { content: instruction });
      phase = "awaiting-final";
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      showTurn(activeDraftNode);
      setStatus(`MultiTeacherCodex failed: ${errorMessage}`, "error");
      sendBrowserEvent("extension_error", { message: errorMessage });
      clearStatus(7000);
      resetCycle();
    }
  }

  function reconcile(): void {
    reconcileTimer = undefined;
    const turns = getTurns();
    hidePersistedInternalTurns(turns);

    if (!settings.enabled) {
      clearStatus();
      resetCycle();
      return;
    }

    if (phase === "idle") {
      const latestUser = [...turns]
        .reverse()
        .find(
          (turn) =>
            turn.role === "user" &&
            !turn.text.startsWith(INTERNAL_MARKER) &&
            !processedUserNodes.has(turn.node),
        );
      if (!latestUser) return;

      const nextAssistant = findNextTurn(turns, latestUser.node, "assistant");
      if (!nextAssistant) return;

      processedUserNodes.add(latestUser.node);
      activeUserNode = latestUser.node;
      activeDraftNode = nextAssistant.node;
      phase = "awaiting-draft";
      lastDraftText = "";
      lastDraftChangeAt = Date.now();
      hideTurn(nextAssistant);
      setStatus("MultiTeacherCodex: waiting for ChatGPT draft…");
    }

    if (phase === "awaiting-draft" && activeUserNode) {
      const draftTurn = findNextTurn(turns, activeUserNode, "assistant");
      if (!draftTurn) return;
      activeDraftNode = draftTurn.node;
      hideTurn(draftTurn);

      if (!draftTurn.text) return;
      if (draftTurn.text !== lastDraftText) {
        lastDraftText = draftTurn.text;
        lastDraftChangeAt = Date.now();
        scheduleReconcile(STABLE_MS);
        return;
      }

      if (isGenerating() || Date.now() - lastDraftChangeAt < STABLE_MS) {
        scheduleReconcile(350);
        return;
      }

      const question = messageText(activeUserNode);
      const draft = draftTurn.text;
      const token = ++operationToken;
      void reviewAndRevise(question, draft, token);
      return;
    }

    if (
      (phase === "sending-revision" || phase === "awaiting-final") &&
      activeDraftNode
    ) {
      hideTurn(activeDraftNode);
      const latestInternal = [...turns]
        .reverse()
        .find(
          (turn) =>
            turn.role === "user" && turn.text.startsWith(INTERNAL_MARKER),
        );
      if (latestInternal) {
        internalUserNode = latestInternal.node;
        hideTurn(latestInternal);
      }
    }

    if (phase === "awaiting-final" && internalUserNode) {
      const finalTurn = findNextTurn(turns, internalUserNode, "assistant");
      if (!finalTurn) {
        scheduleReconcile(250);
        return;
      }

      showTurn(finalTurn);
      setStatus("MultiTeacherCodex: final answer generating…");
      if (isGenerating()) {
        scheduleReconcile(400);
        return;
      }

      sendBrowserEvent("final_answer", { content: finalTurn.text });
      setStatus("MultiTeacherCodex: reviewed", "done");
      clearStatus(1800);
      resetCycle();
    }
  }

  function scheduleReconcile(delay = RECONCILE_DELAY_MS): void {
    if (reconcileTimer !== undefined) window.clearTimeout(reconcileTimer);
    reconcileTimer = window.setTimeout(reconcile, delay);
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes.enabled) settings.enabled = changes.enabled.newValue !== false;
    if (
      changes.serverUrl &&
      typeof changes.serverUrl.newValue === "string"
    ) {
      settings.serverUrl = changes.serverUrl.newValue
        .trim()
        .replace(/\/+$/u, "");
    }
    operationToken += 1;
    resetCycle();
    scheduleReconcile();
  });

  const observer = new MutationObserver(() => scheduleReconcile());

  async function initialize(): Promise<void> {
    await loadSettings();
    const existingTurns = getTurns();
    hidePersistedInternalTurns(existingTurns);
    for (const turn of existingTurns) {
      if (
        turn.role === "user" &&
        !turn.text.startsWith(INTERNAL_MARKER)
      ) {
        processedUserNodes.add(turn.node);
      }
    }
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  void initialize();
})();
