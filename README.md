# MultiTeacherCodex

MultiTeacherCodex automatically reviews ChatGPT's first draft with an independent frontier model and sends the critique back to ChatGPT for revision.

The user submits **one prompt only**:

```text
User prompt
  → ChatGPT draft (hidden)
  → External frontier-model critique
  → Critique is automatically sent back to ChatGPT (hidden)
  → Revised ChatGPT answer shown to the user
```

## Windows PowerShell: one-line install/update/run

Run this from any PowerShell directory. It updates an existing checkout at `$HOME\multiteachercodex`, or clones it when missing, then starts everything:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/genji970/multiteachercodex/main/install.ps1 | iex"
```

Manual clone plus one command also works:

```powershell
git clone https://github.com/genji970/multiteachercodex.git $HOME\multiteachercodex
& $HOME\multiteachercodex\run.cmd
```

Do not run `git clone ...` while already inside an older `multiteachercodex` directory, because that creates `multiteachercodex\multiteachercodex`. Use the installer above instead.

The launcher automatically:

1. Uses Node.js 20+ or installs portable Node.js 22 without administrator rights.
2. Installs missing npm dependencies.
3. Starts the review server in the current PowerShell window.
4. Loads the extension into a dedicated Edge or Chrome profile.
5. Opens `https://chatgpt.com/`.

You do not need to open `edge://extensions`, paste an Edge launch script, run `npm install`, or configure an MCP URL.

Keep the PowerShell window open. It displays the complete runtime trace for every request:

```text
Original user question
ChatGPT first draft
Reviewer provider/model and latency
Reviewer summary and every issue
Raw reviewer output
Exact revision instruction sent back to ChatGPT
Browser confirmation that the revision prompt was submitted
Final revised ChatGPT answer
```

API keys are never printed.

### Later Windows runs

Use the same installer command to update and run, or run:

```powershell
& $HOME\multiteachercodex\run.cmd
```

## Linux desktop: one-line install/update/run

Run this from any directory:

```bash
curl -fsSL https://raw.githubusercontent.com/genji970/multiteachercodex/main/install.sh | sh
```

Manual clone plus one command also works:

```bash
git clone https://github.com/genji970/multiteachercodex.git "$HOME/multiteachercodex"
sh "$HOME/multiteachercodex/run.sh"
```

`run.sh` performs the same setup. If Node.js 20+ is unavailable, it installs portable Node.js 22 under the user's data directory without `sudo`. It supports x86-64 and ARM64 Linux.

The automatic browser launch requires a graphical desktop and one of:

- Microsoft Edge
- Google Chrome
- Chromium

On a headless Linux server, the review server still starts and prints logs, but no local ChatGPT browser can be opened because there is no graphical display.

### Later Linux runs

Use the same installer command to update and run, or run:

```bash
sh "$HOME/multiteachercodex/run.sh"
```

## First run

The terminal asks you to configure one external reviewer:

1. Anthropic
2. Gemini
3. OpenRouter or another OpenAI-compatible API

The configuration is saved at:

```text
~/.multiteachercodex/config.json
```

Then a dedicated browser profile opens. Sign in to ChatGPT in that browser window and submit a normal prompt once.

## Local endpoints

```text
GET  http://127.0.0.1:8787/health
POST http://127.0.0.1:8787/review
POST http://127.0.0.1:8787/event
     http://127.0.0.1:8787/mcp   (optional MCP endpoint)
```

The browser-extension workflow uses `/review` and `/event`. The MCP endpoint is optional.

## Reset reviewer configuration

Windows:

```powershell
.\run.cmd --reset
```

Linux:

```bash
sh ./run.sh --reset
```

## Environment variables

Interactive setup can be skipped with environment variables or a local `.env` file.

Gemini:

```env
GEMINI_API_KEY=...
GEMINI_MODEL=...
```

Anthropic:

```env
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=...
```

OpenRouter or another OpenAI-compatible API:

```env
OPENAI_COMPATIBLE_BASE_URL=https://openrouter.ai/api/v1
OPENAI_COMPATIBLE_API_KEY=...
OPENAI_COMPATIBLE_MODELS=provider/model-name
```

Optional browser override:

```env
MTC_BROWSER_EXECUTABLE=/absolute/path/to/browser
```

## Privacy and limitations

- The original prompt and ChatGPT draft are sent to the configured external model provider.
- The terminal deliberately prints the question, draft, critique, revision instruction, and final answer so the complete process can be audited locally.
- External API charges are separate from a ChatGPT subscription.
- The extension depends on the current ChatGPT web interface and may need selector updates after major UI changes.
- The dedicated browser profile avoids silently modifying the user's normal Edge or Chrome profile.
