import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
function pathCandidates(command) {
    const pathValue = process.env.PATH ?? "";
    const extensions = platform() === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
    const candidates = [];
    for (const directory of pathValue.split(delimiter)) {
        if (!directory)
            continue;
        for (const extension of extensions) {
            candidates.push(join(directory, `${command}${extension}`));
        }
    }
    return candidates;
}
function firstExisting(candidates) {
    for (const candidate of candidates) {
        if (candidate && existsSync(candidate))
            return candidate;
    }
    return null;
}
function resolveBrowserExecutable() {
    if (process.env.MTC_BROWSER_EXECUTABLE?.trim()) {
        const explicit = resolve(process.env.MTC_BROWSER_EXECUTABLE.trim());
        return existsSync(explicit) ? explicit : null;
    }
    if (platform() === "win32") {
        const programFilesX86 = process.env["ProgramFiles(x86)"];
        const programFiles = process.env.ProgramFiles;
        const localAppData = process.env.LOCALAPPDATA;
        return firstExisting([
            programFilesX86
                ? join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe")
                : undefined,
            programFiles
                ? join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe")
                : undefined,
            localAppData
                ? join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe")
                : undefined,
            programFilesX86
                ? join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe")
                : undefined,
            programFiles
                ? join(programFiles, "Google", "Chrome", "Application", "chrome.exe")
                : undefined,
            localAppData
                ? join(localAppData, "Google", "Chrome", "Application", "chrome.exe")
                : undefined,
            ...pathCandidates("msedge"),
            ...pathCandidates("chrome"),
        ]);
    }
    if (platform() === "darwin") {
        return firstExisting([
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
            ...pathCandidates("microsoft-edge"),
            ...pathCandidates("google-chrome"),
            ...pathCandidates("chromium"),
        ]);
    }
    return firstExisting([
        ...pathCandidates("microsoft-edge"),
        ...pathCandidates("microsoft-edge-stable"),
        ...pathCandidates("google-chrome"),
        ...pathCandidates("google-chrome-stable"),
        ...pathCandidates("chromium"),
        ...pathCandidates("chromium-browser"),
    ]);
}
function stopBrowserUsingProfile(profileDir) {
    const marker = `--user-data-dir=${profileDir}`;
    if (platform() === "win32") {
        const script = [
            "$marker = $env:MTC_PROFILE_MARKER",
            "Get-CimInstance Win32_Process |",
            "  Where-Object {",
            "    ($_.Name -eq 'msedge.exe' -or $_.Name -eq 'chrome.exe') -and",
            "    $_.CommandLine -and $_.CommandLine.Contains($marker)",
            "  } |",
            "  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
            "Start-Sleep -Milliseconds 350",
        ].join("\n");
        spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
            env: { ...process.env, MTC_PROFILE_MARKER: marker },
            stdio: "ignore",
            windowsHide: true,
        });
        return;
    }
    const processList = spawnSync("ps", ["-axo", "pid=,command="], {
        encoding: "utf8",
    });
    if (processList.status !== 0 || !processList.stdout)
        return;
    for (const line of processList.stdout.split("\n")) {
        if (!line.includes(marker))
            continue;
        if (!/(chrome|chromium|microsoft-edge)/iu.test(line))
            continue;
        const match = line.trim().match(/^(\d+)\s+/u);
        if (!match?.[1])
            continue;
        const pid = Number(match[1]);
        if (!Number.isSafeInteger(pid) || pid <= 0 || pid === process.pid)
            continue;
        try {
            process.kill(pid, "SIGTERM");
        }
        catch {
            // The process may have already exited.
        }
    }
}
function defaultProfileDir() {
    if (platform() === "win32") {
        const root = process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local");
        return join(root, "MultiTeacherCodex", "browser-profile");
    }
    if (platform() === "darwin") {
        return join(homedir(), "Library", "Application Support", "MultiTeacherCodex", "browser-profile");
    }
    const dataRoot = process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");
    return join(dataRoot, "multiteachercodex", "browser-profile");
}
export function launchChatGptBrowser(extensionDir) {
    if (process.env.MTC_AUTO_OPEN_BROWSER !== "1") {
        return { launched: false, reason: "automatic browser launch is disabled" };
    }
    if (platform() !== "win32" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
        return {
            launched: false,
            reason: "no graphical desktop was detected (DISPLAY/WAYLAND_DISPLAY is unset)",
        };
    }
    const executable = resolveBrowserExecutable();
    if (!executable) {
        return {
            launched: false,
            reason: "Microsoft Edge, Google Chrome, or Chromium was not found",
        };
    }
    const profileDir = process.env.MTC_BROWSER_PROFILE_DIR?.trim() || defaultProfileDir();
    const absoluteExtensionDir = resolve(extensionDir);
    stopBrowserUsingProfile(profileDir);
    const args = [
        `--user-data-dir=${profileDir}`,
        `--disable-extensions-except=${absoluteExtensionDir}`,
        `--load-extension=${absoluteExtensionDir}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--new-window",
        "https://chatgpt.com/",
    ];
    const child = spawn(executable, args, {
        detached: true,
        stdio: "ignore",
    });
    child.unref();
    return { launched: true, executable, profileDir };
}
//# sourceMappingURL=browser.js.map