(() => {
const DEFAULT_SERVER_URL = "http://127.0.0.1:8787";

const enabledInput = document.querySelector<HTMLInputElement>("#enabled");
const serverInput = document.querySelector<HTMLInputElement>("#server-url");
const statusNode = document.querySelector<HTMLElement>("#status");
const saveButton = document.querySelector<HTMLButtonElement>("#save");
const checkButton = document.querySelector<HTMLButtonElement>("#check");

if (!enabledInput || !serverInput || !statusNode || !saveButton || !checkButton) {
  throw new Error("Popup UI is incomplete.");
}

const enabled = enabledInput;
const server = serverInput;
const status = statusNode;
const saveAction = saveButton;
const checkAction = checkButton;

async function load(): Promise<void> {
  const settings = await chrome.storage.local.get({
    enabled: true,
    serverUrl: DEFAULT_SERVER_URL,
  });
  enabled.checked = settings.enabled !== false;
  server.value =
    typeof settings.serverUrl === "string" ? settings.serverUrl : DEFAULT_SERVER_URL;
}

async function save(): Promise<void> {
  const serverUrl = server.value.trim().replace(/\/+$/u, "") || DEFAULT_SERVER_URL;
  await chrome.storage.local.set({
    enabled: enabled.checked,
    serverUrl,
  });
  server.value = serverUrl;
  status.textContent = "Saved";
}

async function check(): Promise<void> {
  await save();
  status.textContent = "Checking…";
  const response = await chrome.runtime.sendMessage({
    type: "multiteachercodex:health",
    serverUrl: server.value,
  });
  status.textContent = response?.ok
    ? "Server connected"
    : `Failed: ${response?.error ?? "unknown error"}`;
}

saveAction.addEventListener("click", () => void save());
checkAction.addEventListener("click", () => void check());
void load();
})();
