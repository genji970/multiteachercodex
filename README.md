# MultiTeacherCodex

MultiTeacherCodex makes the normal ChatGPT web experience run this loop automatically:

```text
One user prompt
  → ChatGPT generates a first draft
  → the draft is hidden from the user
  → an independent frontier model critiques the draft
  → the critique is automatically sent back to ChatGPT
  → ChatGPT writes a revised answer
  → only the revised final answer remains visible
```

The external reviewer does **not** replace ChatGPT. It receives:

```text
Original user question
+ ChatGPT's first draft
+ "Find anything incorrect or problematic in this answer"
```

It returns factual errors, reasoning problems, omissions, misunderstood requirements, and concrete revision instructions. ChatGPT then evaluates that feedback and rewrites its own answer.

## What runs where

MultiTeacherCodex contains two parts:

1. A local TypeScript review server that calls Gemini, Anthropic, OpenRouter, or another OpenAI-compatible provider.
2. A Chrome/Edge extension that watches ChatGPT, hides the first draft and internal revision message, and leaves only the final revised answer visible.

This browser-extension mode works with the regular ChatGPT web app. It does not require a custom ChatGPT MCP workspace.

## Requirements

- Node.js 20 or newer
- npm/npx
- Chrome or Microsoft Edge
- An API key for at least one external reviewer

## 1. Clone and start the local server

```bash
git clone https://github.com/genji970/multiteachercodex.git
cd multiteachercodex
npx -y .
```

You can run all three commands in one line:

```bash
git clone https://github.com/genji970/multiteachercodex.git && cd multiteachercodex && npx -y .
```

On the first run, choose a provider and enter its API key and model ID. The configuration is saved at:

```text
~/.multiteachercodex/config.json
```

The local API starts at:

```text
http://127.0.0.1:8787/review
```

Leave this terminal open while using ChatGPT.

Configuration commands:

```bash
npx -y . --setup
npx -y . --reset
npx -y . --port 9000
```

## 2. Load the browser extension once

### Microsoft Edge

1. Open `edge://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the repository's `extension` folder

### Google Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the repository's `extension` folder

The repository already includes compiled extension files under `extension/dist`, so regular users do not need to build the extension.

## 3. Use ChatGPT normally

Open `https://chatgpt.com`, type one prompt, and send it normally.

MultiTeacherCodex then automatically:

1. Detects the new user prompt.
2. Hides ChatGPT's first draft while it is generated.
3. Sends the original prompt and draft to the local review server.
4. Sends the returned critique back to ChatGPT as a hidden internal revision request.
5. Hides the first draft and internal request.
6. Displays ChatGPT's revised final answer.

No second user prompt is required.

The extension popup lets you:

- Enable or disable automatic review
- Change the local server address
- Check whether the local server is reachable

## Supported reviewer providers

### Anthropic

```env
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=...
```

### Gemini

```env
GEMINI_API_KEY=...
GEMINI_MODEL=...
```

### OpenRouter or another OpenAI-compatible API

```env
OPENAI_COMPATIBLE_BASE_URL=https://openrouter.ai/api/v1
OPENAI_COMPATIBLE_API_KEY=...
OPENAI_COMPATIBLE_MODELS=provider/model-a,provider/model-b
```

Environment variables and a `.env` file in the repository override the saved user configuration.

## Local HTTP API

### Health check

```text
GET http://127.0.0.1:8787/health
```

### Review a ChatGPT draft

```text
POST http://127.0.0.1:8787/review
Content-Type: application/json
```

```json
{
  "original_question": "The user's original question",
  "chatgpt_answer": "ChatGPT's first draft",
  "focus": "Optional review focus"
}
```

The response includes structured reviewer results and a `revision_instruction` that the browser extension sends back to ChatGPT.

## Optional MCP mode

The server still exposes an MCP endpoint at:

```text
http://127.0.0.1:8787/mcp
```

In supported ChatGPT workspace plans, the MCP instructions require ChatGPT to create a hidden draft, call `review_chatgpt_answer`, and return only the revised answer. The browser extension is the practical mode for ordinary ChatGPT web use.

## Development

```bash
npm install
npm run check
npm run build
```

Server source:

```text
src/
```

Browser extension source and compiled output:

```text
extension/src/
extension/dist/
```

## Important notes

- The original user prompt and first ChatGPT draft are sent to the external provider configured by the user.
- ChatGPT subscriptions do not include external API usage fees.
- Reviewer models can also be wrong. ChatGPT is instructed to evaluate the feedback rather than copy it blindly.
- ChatGPT's web interface can change. If its DOM selectors change, the extension may require an update.
- The hidden first draft and hidden internal revision request still exist in the ChatGPT conversation history; the extension hides them in the web interface.
- This extension targets the ChatGPT website in Chrome and Edge. Browser extensions do not run inside the native ChatGPT desktop or mobile apps.
