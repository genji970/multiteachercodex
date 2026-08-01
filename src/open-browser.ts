#!/usr/bin/env node

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchChatGptBrowser } from "./browser.js";

process.env.MTC_AUTO_OPEN_BROWSER = "1";
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const result = launchChatGptBrowser(resolve(projectRoot, "extension"));

if (!result.launched) {
  console.error(`[MultiTeacherCodex] Could not open ChatGPT automatically: ${result.reason}`);
  process.exitCode = 1;
} else {
  console.log(`[MultiTeacherCodex] Opened ChatGPT with the extension loaded.`);
  console.log(`[MultiTeacherCodex] Browser: ${result.executable}`);
  console.log(`[MultiTeacherCodex] Profile: ${result.profileDir}`);
}
