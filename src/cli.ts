#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { setDefaultResultOrder } from "node:dns";
import { createRequire } from "node:module";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";

setDefaultResultOrder("ipv4first");

const APP_NAME = "multiteachercodex";
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requireFromCli = createRequire(import.meta.url);
const RUNTIME_DEPENDENCIES = [
  "@modelcontextprotocol/sdk/package.json",
  "dotenv/package.json",
  "zod/package.json",
] as const;
const DEFAULT_CONFIG_PATH = resolve(
  homedir(),
  ".multiteachercodex",
  "config.json",
);

const ENV_KEYS = [
  "PORT",
  "REVIEW_TIMEOUT_MS",
  "MAX_REVIEWERS",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_MODEL",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "OPENAI_COMPATIBLE_BASE_URL",
  "OPENAI_COMPATIBLE_API_KEY",
  "OPENAI_COMPATIBLE_MODELS",
  "OPENAI_COMPATIBLE_SITE_URL",
  "OPENAI_COMPATIBLE_APP_NAME",
] as const;

type ConfigKey = (typeof ENV_KEYS)[number];
type SavedConfig = Partial<Record<ConfigKey, string>>;

type CliOptions = {
  configPath: string;
  forceSetup: boolean;
  reset: boolean;
  help: boolean;
  port?: string;
};

function printHelp(): void {
  console.log(`
${APP_NAME}

Run a ChatGPT MCP server that sends ChatGPT drafts to independent frontier-model reviewers.

Usage:
  npx -y .
  npx -y . --setup
  npx -y . --port 8787

Options:
  --setup              Add or replace a reviewer configuration
  --reset              Delete the saved local configuration, then run setup
  --config <path>      Use a custom config file
  --port <number>      Override the HTTP port for this run
  -h, --help           Show this help

Environment variables and a local .env file override saved configuration.
`);
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    configPath: DEFAULT_CONFIG_PATH,
    forceSetup: false,
    reset: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--setup") {
      options.forceSetup = true;
    } else if (arg === "--reset") {
      options.reset = true;
      options.forceSetup = true;
    } else if (arg === "-h" || arg === "--help") {
      options.help = true;
    } else if (arg === "--config") {
      const value = args[index + 1];
      if (!value) throw new Error("--config requires a file path.");
      options.configPath = resolve(value);
      index += 1;
    } else if (arg === "--port") {
      const value = args[index + 1];
      if (!value || !/^\d+$/.test(value)) {
        throw new Error("--port requires a positive integer.");
      }
      options.port = value;
      index += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

async function readSavedConfig(path: string): Promise<SavedConfig> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const output: SavedConfig = {};
    for (const key of ENV_KEYS) {
      const value = (parsed as Record<string, unknown>)[key];
      if (typeof value === "string" && value.trim()) output[key] = value.trim();
    }
    return output;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return {};
    throw new Error(`Could not read config at ${path}: ${String(error)}`);
  }
}

async function writeSavedConfig(path: string, config: SavedConfig): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  try {
    await chmod(path, 0o600);
  } catch {
    // Windows does not implement POSIX file permissions in the same way.
  }
}

function applySavedConfig(config: SavedConfig, overwrite = false): void {
  for (const [key, value] of Object.entries(config)) {
    if ((overwrite || !process.env[key]) && value) process.env[key] = value;
  }
}

async function loadLocalDotEnv(): Promise<void> {
  const path = resolve(process.cwd(), ".env");
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }

  for (const sourceLine of raw.split(/\r?\n/u)) {
    const line = sourceLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function runtimeDependenciesAvailable(): boolean {
  return RUNTIME_DEPENDENCIES.every((dependency) => {
    try {
      requireFromCli.resolve(dependency, { paths: [PROJECT_ROOT] });
      return true;
    } catch {
      return false;
    }
  });
}

function ensureRuntimeDependencies(): void {
  if (runtimeDependenciesAvailable()) return;

  console.log("Installing runtime dependencies for this cloned repository…");
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(
    npmCommand,
    ["install", "--omit=dev", "--no-audit", "--no-fund", "--package-lock=false"],
    {
      cwd: PROJECT_ROOT,
      env: process.env,
      stdio: "inherit",
    },
  );

  if (result.error) {
    throw new Error(`Could not run npm install: ${result.error.message}`);
  }
  if (result.status !== 0 || !runtimeDependenciesAvailable()) {
    throw new Error(
      "Runtime dependency installation failed. Check npm registry/network access and run npx -y . again.",
    );
  }
}

function hasConfiguredReviewer(): boolean {
  const env = process.env;
  const anthropic = Boolean(env.ANTHROPIC_API_KEY && env.ANTHROPIC_MODEL);
  const gemini = Boolean(env.GEMINI_API_KEY && env.GEMINI_MODEL);
  const compatible = Boolean(
    env.OPENAI_COMPATIBLE_BASE_URL &&
      env.OPENAI_COMPATIBLE_API_KEY &&
      env.OPENAI_COMPATIBLE_MODELS,
  );
  return anthropic || gemini || compatible;
}

async function askSecret(label: string): Promise<string> {
  if (!stdin.isTTY || !stdout.isTTY || typeof stdin.setRawMode !== "function") {
    const rl = createInterface({ input: stdin, output: stdout });
    const value = await rl.question(label);
    rl.close();
    return value.trim();
  }

  stdout.write(label);
  stdin.setRawMode(true);
  stdin.resume();

  return await new Promise<string>((resolveSecret, reject) => {
    let value = "";

    const finish = (): void => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
      resolveSecret(value.trim());
    };

    const fail = (): void => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
      reject(new Error("Setup cancelled."));
    };

    const onData = (chunk: Buffer): void => {
      for (const byte of chunk) {
        if (byte === 3) {
          fail();
          return;
        }
        if (byte === 13 || byte === 10) {
          finish();
          return;
        }
        if (byte === 127 || byte === 8) {
          if (value.length > 0) {
            value = value.slice(0, -1);
            stdout.write("\b \b");
          }
          continue;
        }
        const character = Buffer.from([byte]).toString("utf8");
        value += character;
        stdout.write("*");
      }
    };

    stdin.on("data", onData);
  });
}

async function promptRequired(
  question: string,
  defaultValue?: string,
): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    for (;;) {
      const suffix = defaultValue ? ` [${defaultValue}]` : "";
      const answer = (await rl.question(`${question}${suffix}: `)).trim();
      const value = answer || defaultValue || "";
      if (value) return value;
      console.log("A value is required.");
    }
  } finally {
    rl.close();
  }
}

async function setupReviewer(existing: SavedConfig): Promise<SavedConfig> {
  if (!stdin.isTTY) {
    throw new Error(
      "No reviewer is configured and interactive setup is unavailable. Set provider environment variables before running the command.",
    );
  }

  console.log("\nNo external reviewer is ready. Configure one now.");
  console.log("  1) Anthropic");
  console.log("  2) Gemini");
  console.log("  3) OpenRouter or another OpenAI-compatible API\n");

  const provider = await promptRequired("Choose a provider (1-3)", "1");
  const next = { ...existing };

  if (provider === "1") {
    next.ANTHROPIC_API_KEY = await askSecret("Anthropic API key: ");
    next.ANTHROPIC_MODEL = await promptRequired("Anthropic model ID");
  } else if (provider === "2") {
    next.GEMINI_API_KEY = await askSecret("Gemini API key: ");
    next.GEMINI_MODEL = await promptRequired("Gemini model ID");
  } else if (provider === "3") {
    next.OPENAI_COMPATIBLE_BASE_URL = await promptRequired(
      "OpenAI-compatible base URL",
      "https://openrouter.ai/api/v1",
    );
    next.OPENAI_COMPATIBLE_API_KEY = await askSecret("API key: ");
    next.OPENAI_COMPATIBLE_MODELS = await promptRequired(
      "Reviewer model ID(s), comma-separated",
    );
    next.OPENAI_COMPATIBLE_APP_NAME =
      next.OPENAI_COMPATIBLE_APP_NAME || "MultiTeacherCodex";
  } else {
    throw new Error(`Invalid provider selection: ${provider}`);
  }

  return next;
}

async function main(): Promise<void> {
  let options: CliOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    printHelp();
    process.exitCode = 1;
    return;
  }

  if (options.help) {
    printHelp();
    return;
  }

  if (options.reset) {
    await rm(options.configPath, { force: true });
    console.log(`Removed saved config: ${options.configPath}`);
  }

  await loadLocalDotEnv();
  let savedConfig = await readSavedConfig(options.configPath);
  applySavedConfig(savedConfig);
  if (options.port) process.env.PORT = options.port;

  if (options.forceSetup || !hasConfiguredReviewer()) {
    savedConfig = await setupReviewer(savedConfig);
    await writeSavedConfig(options.configPath, savedConfig);
    applySavedConfig(savedConfig, true);
    console.log(`Saved reviewer configuration to ${options.configPath}`);
  }

  if (!hasConfiguredReviewer()) {
    throw new Error("Setup finished without a valid reviewer configuration.");
  }

  ensureRuntimeDependencies();
  console.log("Starting MultiTeacherCodex…");
  await import("./server.js");
}

main().catch((error: unknown) => {
  console.error(`Fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
