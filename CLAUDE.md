# OpenCluely - Project Instructions

## Overview
OpenCluely is an Electron-based AI desktop assistant that provides invisible, real-time help during technical interviews. It uses Google Gemini for AI responses, supports stealth overlay windows, screenshot capture, speech recognition (Azure/Whisper), and session memory.

## Architecture
- **Entry point**: `main.js` — Electron main process, `ApplicationController` class
- **Config**: `src/core/config.js` — `ConfigManager` singleton (access via `config.get('key.path')`)
- **LLM Service**: `src/services/llm.service.js` — Gemini API integration (SDK + HTTPS fallback)
- **Capture Service**: `src/services/capture.service.js` — Screenshot capture
- **Speech Service**: `src/services/speech.service.js` — Azure Speech / local Whisper
- **Window Manager**: `src/managers/window.manager.js` — Multi-window management (main, chat, LLM response, settings)
- **Session Manager**: `src/managers/session.manager.js` — Conversation history and memory
- **Prompt Loader**: `prompt-loader.js` — Loads skill prompts from `prompts/` directory
- **Preload**: `preload.js` — Electron preload script for IPC bridge

## Key Directories
- `src/core/` — Logger, config
- `src/services/` — LLM, capture, speech services
- `src/managers/` — Window and session managers
- `src/ui/` — UI-related code
- `src/styles/` — CSS (Tailwind input)
- `prompts/` — Skill prompt markdown files (dsa.md, programming.md)
- `lib/` — Utility libraries (markdown.js)
- `webapp/` — Web app variant
- `assests/` — Icons and assets (note: intentional typo in directory name)

## Tech Stack
- **Runtime**: Electron 29.x
- **AI**: Google Gemini API (`@google/generative-ai`)
- **Speech**: Azure Cognitive Services SDK / OpenAI Whisper (optional)
- **Styling**: Tailwind CSS
- **Logging**: Winston with daily rotate
- **Markdown**: marked + PrismJS for syntax highlighting

## Commands
- `npm start` — Launch the Electron app
- `npm run dev` — Launch with --no-sandbox --disable-gpu flags
- `npm run build` — Build distributable
- `npm run test-speech` — Test speech recognition setup

## Environment
- `.env` file at project root (created from `env.example`)
- `GEMINI_API_KEY` — Required for AI features
- `SPEECH_PROVIDER` — `azure` or `whisper` (optional)

## Development Notes
- The `assests/` directory is intentionally spelled that way (legacy)
- Window stealth: app disguises as Terminal/Activity Monitor/Settings
- Global shortcuts: Cmd+Shift+S (screenshot), Cmd+Shift+V (visibility), etc.
- LLM service has dual request methods: SDK and raw HTTPS fallback
- Session memory persists across questions within a session
- All IPC communication goes through `preload.js` bridge
