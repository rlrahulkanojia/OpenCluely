# OpenCluely UI Redesign — Match Cluely Aesthetic

**Date:** 2026-06-14
**Status:** Design approved, pending implementation

## Overview

Full UI redesign of OpenCluely to match Cluely's polished dark glassmorphism aesthetic. Consolidates 4 windows into 3, adds missing features (widget mode, extended thinking, screenshot previews), establishes a CSS design system, and strengthens the stealth-first philosophy.

## Use Case

Technical interviews (DSA, OA, coding). Not expanding toward meeting assistant.

## Decisions Summary

| Decision | Resolution |
|----------|-----------|
| Use case | Technical interviews only |
| Widget mode | Fully hidden when idle — no dock, tray, or menu bar. `Cmd+Shift+O` to summon |
| Process visibility | Activity Monitor is fine. Zero visual presence in dock/taskbar/system tray |
| Theme | Dark glassmorphism only, polished |
| Font | Inter (bundled locally) + modern mono stack for code |
| Reasoning tokens | Claude extended thinking, toggleable in settings (default OFF) |
| Screenshot previews | In-memory base64, hover preview in chat |
| LLM response layout | Single-column inline markdown (no split panel) |
| Chat + LLM response | Merged into one unified chat window |
| Unified chat dimensions | 700×600, bound below command bar, center, resizable |
| Command bar | Slimmed: status dot, screenshot, mic, skill popover, language popover. Glass popovers replace native dropdowns. Shortcut hints visible on icons |
| Settings | 3 groups: Interview, AI & Speech, Appearance & Shortcuts. Whisper in collapsible Advanced. Extended thinking toggle. Shortcuts table |
| CSS architecture | Drop Tailwind. Handwritten CSS with custom properties in `common.css` |
| Session lifecycle | Start (`Cmd+Shift+O`), Hide/pause (`Cmd+Shift+V`), End (`Cmd+Shift+Q`). Pause keeps memory, End clears it |
| Onboarding | None — shortcut hints on command bar icons are sufficient |
| Window count | 4 → 3 (command bar, unified chat, settings) |
| UI overhaul scope | Full redesign of all HTML/CSS files |

---

## 1. Design System — CSS Custom Properties & Typography

`common.css` becomes the single source of truth for all visual values. Every window references it.

### 1.1 Design Tokens

```css
:root {
  /* Glass effect */
  --glass-bg: linear-gradient(135deg, rgba(0,0,0,0.35) 0%, rgba(20,20,20,0.45) 100%);
  --glass-bg-heavy: linear-gradient(135deg, rgba(0,0,0,0.5) 0%, rgba(15,15,15,0.6) 100%);
  --glass-blur: blur(25px);
  --glass-blur-light: blur(10px);
  --glass-border: 1px solid rgba(255,255,255,0.12);
  --glass-border-hover: 1px solid rgba(255,255,255,0.22);
  --glass-shadow: 0 8px 32px rgba(0,0,0,0.25);
  --glass-radius: 12px;
  --glass-radius-sm: 8px;
  --glass-radius-xs: 6px;

  /* Colors */
  --color-accent: #10b981;
  --color-accent-glow: rgba(16, 185, 129, 0.5);
  --color-danger: #ff4757;
  --color-danger-glow: rgba(255, 71, 87, 0.5);
  --color-warning: #ffa726;
  --color-info: #60a5fa;
  --color-purple: #9c27b0;

  /* Text */
  --text-primary: rgba(255,255,255,0.95);
  --text-secondary: rgba(255,255,255,0.7);
  --text-muted: rgba(255,255,255,0.5);
  --text-dim: rgba(255,255,255,0.35);

  /* Surface overlays */
  --surface-subtle: rgba(255,255,255,0.05);
  --surface-light: rgba(255,255,255,0.08);
  --surface-medium: rgba(255,255,255,0.12);
  --surface-hover: rgba(255,255,255,0.15);

  /* Typography */
  --font-ui: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'SF Mono', 'Fira Code', 'JetBrains Mono', 'Cascadia Code', Monaco, Menlo, 'Courier New', monospace;

  /* Type scale */
  --text-2xs: 10px;
  --text-xs: 11px;
  --text-sm: 12px;
  --text-base: 13px;
  --text-md: 14px;
  --text-lg: 16px;

  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 12px;
  --space-lg: 16px;
  --space-xl: 20px;
  --space-2xl: 24px;

  /* Transitions */
  --transition-fast: 0.15s ease;
  --transition-normal: 0.2s ease;
  --transition-slow: 0.3s ease;
}
```

### 1.2 Typography Hierarchy

| Element | Size | Weight | Color |
|---------|------|--------|-------|
| Window title | `--text-md` (14px) | 600 | `--text-primary` |
| Section header | `--text-base` (13px) | 600 | `--text-primary` |
| Body text | `--text-base` (13px) | 400 | `--text-primary` |
| Secondary / labels | `--text-sm` (12px) | 500 | `--text-secondary` |
| Captions / timestamps | `--text-xs` (11px) | 500 | `--text-muted` |
| Shortcut hints | `--text-2xs` (10px) | 600 | `--text-muted` |
| Inline code | `--text-xs` (11px) | 400 | `#64ffda` on `--surface-subtle` |
| Code blocks | `--text-xs` (11px) | 400 | PrismJS GitHub Dark theme |

### 1.3 Font Loading

Inter is bundled as `assets/fonts/Inter-Variable.woff2` (~100KB). Loaded via `@font-face` in `common.css`:

```css
@font-face {
  font-family: 'Inter';
  src: url('../../assets/fonts/Inter-Variable.woff2') format('woff2-variations');
  font-weight: 100 900;
  font-display: swap;
}
```

No network requests for fonts. System fonts as fallback during load.

---

## 2. Command Bar (`index.html`)

### 2.1 Layout

```
┌──────────────────────────────────────────────┐
│  ● │ 📷 ⌘⇧S │ 🎤 │ 🧠 DSA │ 💻 C++       │
└──────────────────────────────────────────────┘
  28px height, ~400px width (down from 520px)
```

### 2.2 Components

- **Status dot:** Green pulsing = interactive. Red solid = non-interactive (click-through). One subtle separator between dot and action icons.
- **Screenshot button:** Camera icon + `⌘⇧S` shortcut hint always visible in `--text-muted`.
- **Mic button:** Microphone icon. Red glow + pulse when recording. Hidden if speech not configured.
- **Skill selector:** Brain icon + current skill name. Click → glass popover with skill options. Popover uses `--glass-bg`, `--glass-blur`, `--glass-border`. Options as hoverable rows with check mark on selected. Dismiss on click outside or selection.
- **Language selector:** Code icon + current language name. Same glass popover pattern as skill. Options: C++, C, Python, Java, JavaScript.
- **No info button** — shortcuts reference moved to settings.
- **No separators** between action items (except after status dot) — spacing only.

### 2.3 Popover Design

```css
.popover {
  position: absolute;
  top: 36px;
  background: var(--glass-bg-heavy);
  backdrop-filter: var(--glass-blur);
  border: var(--glass-border);
  border-radius: var(--glass-radius);
  box-shadow: 0 12px 30px rgba(0,0,0,0.35);
  min-width: 180px;
  padding: var(--space-sm);
  /* Hidden state */
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-4px);
  transition: opacity 120ms ease, transform 120ms ease, visibility 120ms ease;
}
.popover.is-open {
  pointer-events: auto;
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}
```

Popover option rows: `padding: 8px 12px`, `border-radius: var(--glass-radius-xs)`, hover background `var(--surface-hover)`, selected item has `--color-accent` text + check mark.

### 2.4 Window Properties

- Width: 400px (max), 200px (min, collapsed but all icons still visible). Height: 35px, locked via `will-resize` handler. Min width increased from current 60px since icons overlap below 200px.
- `transparent: true`, `frame: false`, draggable via `-webkit-app-region: drag`.
- Horizontal-only resize preserved via existing `will-resize` handler.

---

## 3. Unified Chat Window (`chat.html`)

### 3.1 Layout

```
┌─────────────────────────────────────────────────────────┐
│  💬 OpenCluely Chat                    🗑️ Clear  ✕ Close │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [Messages area — scrollable, all content expanded]     │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  [Input: textarea + mic button + send button]           │
│  [Listening indicator when recording]                   │
└─────────────────────────────────────────────────────────┘
  700×600 default, resizable, bound below command bar (center)
```

### 3.2 Message Types

| Type | Left border color | Background | Use |
|------|------------------|------------|-----|
| `system` | `--color-info` | `rgba(96,165,250,0.08)` | Session events |
| `user` | `--color-warning` | `rgba(255,152,0,0.08)` | Typed messages |
| `transcription` | `--color-accent` | `rgba(16,185,129,0.08)` | Voice input |
| `assistant` | `--color-purple` | `rgba(156,39,176,0.08)` | AI responses |
| `error` | `--color-danger` | `rgba(255,71,87,0.08)` | Errors |

All messages: `border-radius: var(--glass-radius-sm)`, `border-left: 3px solid`, `backdrop-filter: var(--glass-blur-light)`, full markdown rendering, always expanded.

### 3.3 Extended Thinking Display

When extended thinking is enabled and the response includes a `thinking` block:

- Collapsible section at top of assistant message.
- Default: **collapsed** — shows `▸ Thinking (click to expand)`.
- Expanded: `▾ Thinking` with thinking content in `--text-muted`, `--text-sm` size, subtle left border in `--text-dim`.
- Toggle via click. Smooth expand/collapse via `max-height` + `overflow: hidden` CSS transition (200ms).

### 3.4 Screenshot Preview on Hover

When a message was triggered by a screenshot:

- Message shows `📷 Sent with screenshot` label.
- Hover → popover with the screenshot image: `max-width: 400px`, `max-height: 300px`, glassmorphism background, positioned above the label.
- Base64 image stored in `chatHistory` array alongside the message.
- Cap: 20 screenshots in memory. Oldest garbage collected. Label remains but hover shows "Preview expired".

### 3.5 Screenshot-Triggered Response Flow

1. `Cmd+Shift+S` → screenshot captured.
2. `user` message in chat: `📷 Sent with screenshot` (base64 stored for hover).
3. Thinking indicator (`•••` bouncing dots) as assistant message.
4. AI response appears as `assistant` message — full inline markdown with code blocks, always expanded.
5. Chat auto-scrolls to bottom.

### 3.6 Code Blocks

All code blocks render inline within messages:

- Language label header (`CPP`, `PYTHON`, etc.) in `--text-2xs`, `--text-muted`.
- PrismJS syntax highlighting (GitHub Dark theme).
- Copy button: top-right, `position: absolute`, glass-styled. Click → "Copied" feedback (1.2s).
- Container: `background: rgba(0,0,0,0.35)`, `border-radius: var(--glass-radius-sm)`, `border: 1px solid rgba(255,255,255,0.1)`.

### 3.7 Listening Indicator

- Positioned inside the chat window between message area and input (not `position: fixed` on viewport).
- 5 green wave bars animating with staggered delays.
- Duration counter in `--font-mono`.
- Appears when recording is active, disappears when stopped.

### 3.8 Input Area

- Glass-styled container: `--surface-light` background, `--glass-border`.
- Auto-resizing `<textarea>`, max height 140px.
- Mic button: hidden when speech unavailable. Red glow when recording.
- Send button: paper plane icon.
- Focus state: border transitions to `--color-accent`.

### 3.9 Window Properties

- 700×600 default. Resizable. Bound below command bar with `windowGap`.
- Same stealth properties as all other windows.

---

## 4. Settings Window (`settings.html`)

### 4.1 Layout — 3 Collapsible Groups

**Group 1: Interview**
- Coding Language (custom glass dropdown)
- Active Skill (custom glass dropdown)
- Extended Thinking toggle (custom toggle switch, default OFF)
  - Description: "Show AI reasoning process before answers"

**Group 2: AI & Speech**
- API Key (password input)
- Speech Provider (custom glass dropdown: Azure / Local Whisper)
- Azure Speech Key (shown when provider = azure)
- Azure Region (shown when provider = azure)
- Collapsible "Advanced Whisper Settings" (shown when provider = whisper):
  - Whisper Command
  - Whisper Model
  - Whisper Language
  - Segment Length

**Group 3: Appearance & Shortcuts**
- App Icon (icon grid: Terminal, Activity Monitor, Settings)
- Window Gap (number input, px)
- Keyboard Shortcuts table:

| Shortcut | Action |
|----------|--------|
| `⌘⇧O` | Toggle session: start / resume / pause |
| `⌘⇧S` | Capture screenshot & analyze |
| `⌘⇧V` | Toggle visibility (pause) |
| `⌘⇧Q` | End session (clear memory) |
| `⌘⇧I` | Toggle click-through |
| `⌘⇧C` | Toggle chat window |
| `Alt+R` | Toggle speech recording |
| `⌘,` | Open settings |

**Bottom:** End Session button (`--color-danger` background). Clears memory, hides all windows.

### 4.2 Extended Thinking Toggle

Custom glass pill switch: `40px × 20px`, `16px` dot, `2px` inset.
- OFF: `--text-dim` track color.
- ON: `--color-accent` track with glow.
- Transition: `0.2s ease` on `transform` + `background`.

### 4.3 Custom Dropdowns

All `<select>` elements replaced with custom glass popovers. Same pattern as command bar popovers. Provider dropdown dynamically shows/hides Azure vs Whisper fields.

### 4.4 Section Headers

Collapsible — click `▾`/`▸` to expand/collapse. All expanded by default. Smooth `max-height` transition.

### 4.5 Window Properties

- 400×600. Centered. Glassmorphism.
- Same stealth properties as all other windows.

---

## 5. Window Manager & Backend Changes

### 5.1 Window Configs (4 → 3)

```js
windowConfigs = {
  main: { width: 400, height: 35, file: 'index.html' },
  chat: { width: 700, height: 600, file: 'chat.html' },
  settings: { width: 400, height: 600, file: 'settings.html' }
}
```

`llmResponse` window removed entirely.

### 5.2 Window Binding

`main` + `chat` are the new bound pair. Same vertical column layout — command bar on top, chat below with `windowGap`.

### 5.3 Session Lifecycle Methods

- `startSession()` — shows main + chat, positions bound windows. Called from `Cmd+Shift+O`.
- `endSession()` — hides all windows, clears session memory. Called from `Cmd+Shift+Q` or settings End Session button.
- `pauseSession()` — hides all windows, keeps memory. Called from `Cmd+Shift+V`.
- `resumeSession()` — shows main + chat at last position. Called from `Cmd+Shift+O` when paused.

### 5.4 Removed Methods

`showLLMResponse()`, `showLLMLoading()`, `hideLLMResponse()`, `expandLLMWindow()`, `calculateOptimalWindowSize()` — all LLM response display moves into chat renderer.

### 5.5 Launch Behavior

On app start: `app.dock.hide()`, no windows shown. Background process until `Cmd+Shift+O`.

### 5.6 LLM Service — Extended Thinking

Request body addition when enabled:
```js
body.thinking = { type: "enabled", budget_tokens: 10000 };
delete body.temperature; // Required by Claude API
```

Response parsing extracts both `thinking` and `text` blocks. Return value includes `thinking: thinkingText || null`.

Config key: `llm.extendedThinking` (boolean, default `false`).

### 5.7 IPC Changes

**New channels:**
- `start-session` / `end-session` / `pause-session`
- `screenshot-data` (base64 to chat for preview)
- `thinking-enabled-changed`

**Modified:**
- `display-llm-response` → sent to chat window. Adds `thinking` and `screenshotBase64` fields.

**Removed:**
- `show-loading` (llmResponse)
- `resize-llm-window-for-content`

### 5.8 Screenshot Flow

1. `Cmd+Shift+S` pressed.
2. Screenshot captured, base64 stored.
3. `screenshot-data` sent to chat window (for preview storage).
4. Chat displays `user` message: "📷 Sent with screenshot".
5. OCR + LLM processing.
6. `display-llm-response` sent to chat window with `{ response, thinking, screenshotBase64 }`.
7. Chat displays `assistant` message with full response + optional thinking section.

### 5.9 Global Shortcuts

| Shortcut | Action | When |
|----------|--------|------|
| `Cmd+Shift+O` | Toggle session visibility: if no session → start new session; if paused → resume; if visible → pause (same as `Cmd+Shift+V`) | Always |
| `Cmd+Shift+S` | Capture screenshot | Session active |
| `Cmd+Shift+V` | Pause session (hide, keep memory) | Session active |
| `Cmd+Shift+Q` | End session (hide, clear memory) | Session active |
| `Cmd+Shift+I` or `Alt+A` | Toggle click-through | Session active |
| `Cmd+Shift+C` | Toggle chat visibility | Session active |
| `Alt+R` | Toggle speech recording | Session active |
| `Cmd+,` | Open settings | Session active |

---

## 6. Stealth & Invisibility

### 6.1 Preserved Measures (All Windows)

- `window.setContentProtection(true)` — prevents OS screen capture APIs from seeing windows
- `frame: false`, `transparent: true`, `backgroundColor: '#00000000'`
- `skipTaskbar: true` + `app.dock.hide()`
- `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`
- Always-on-top multi-level enforcement: `screen-saver` → `pop-up-menu` → `floating`, periodic re-enforcement every 3s
- `type: 'panel'` on macOS (excludes from Mission Control / app switcher)
- Screen sharing detection via `desktopCapturer.getSources()` polling (Zoom, Teams, Meet, Discord)
- Auto-hide on sharing detection, auto-restore on end

### 6.2 Strengthened by Redesign

- Widget mode: zero windows when idle = nothing to detect
- No `Tray` instance created (no system tray icon)
- `app.dock.hide()` called on launch, not just during sessions
- Font bundled locally (no network requests that could be monitored)
- All popovers are DOM elements inside protected windows (not separate windows)

### 6.3 Stealth Validation Checklist (Per Window)

Every window must pass:

```
□ setContentProtection(true)
□ frame: false
□ transparent: true
□ skipTaskbar: true
□ setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
□ alwaysOnTop with platform-specific level enforcement
□ type: 'panel' on macOS
□ No dock icon
□ No system tray
□ Screen sharing detection active
□ Auto-hide on sharing detection
```

### 6.4 Risk Mitigations

| Risk | Mitigation |
|------|-----------|
| `applyStealthMeasures()` accidentally removed during refactor | Applied in `createWindow()` — all windows go through this |
| New chat window missing transparency | `windowConfigs` explicitly sets `transparent: true` for all types |
| Font loading making network request | Bundled locally as `.woff2`, no CDN |
| Popovers breaking content protection | DOM elements inside protected window, not separate windows |
| Electron upgrade breaking `setContentProtection` | Pin Electron 29.x, test stealth on any upgrade |

---

## 7. File Changes

### 7.1 Removed

- `llm-response.html` — merged into chat
- `src/ui/llm-response-window.js` — merged into chat-window.js
- `dist/output.css` — Tailwind build output
- `src/input.css` — Tailwind input
- `tailwind.config.js` — Tailwind config

### 7.2 Added

- `assets/fonts/Inter-Variable.woff2` — bundled Inter font (~100KB)

### 7.3 Modified (Full Rewrite)

- `src/styles/common.css` — design tokens, shared components, all reusable styles
- `index.html` — command bar with glass popovers
- `chat.html` — unified chat with extended thinking, screenshot previews, inline code
- `settings.html` — 3-group layout, toggle switch, collapsible sections, shortcuts table
- `src/ui/main-window.js` — popover logic, remove info button logic
- `src/ui/chat-window.js` — absorbs LLM response display, screenshot previews, thinking UI
- `src/ui/settings-window.js` — new layout, toggle, collapsible sections, dynamic field visibility
- `src/managers/window.manager.js` — 3 windows, session lifecycle, remove llmResponse methods
- `src/services/llm.service.js` — extended thinking in request/response
- `preload.js` — new/modified/removed IPC channels
- `main.js` — new shortcuts, updated screenshot flow, dock hiding on launch
