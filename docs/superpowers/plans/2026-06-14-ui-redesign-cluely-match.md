# UI Redesign — Match Cluely Aesthetic: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full UI redesign of OpenCluely to match Cluely's polished dark glassmorphism, consolidating 4 windows into 3, adding widget mode, extended thinking, and screenshot previews.

**Architecture:** CSS custom properties as design tokens in `common.css`. Three Electron windows (command bar, unified chat, settings). Session lifecycle managed by window manager. Extended thinking via Claude API `thinking` parameter. Screenshot previews stored in-memory as base64.

**Tech Stack:** Electron 29.x, Inter font (bundled), PrismJS, Claude Messages API with extended thinking, CSS custom properties (no Tailwind).

**Spec:** `docs/superpowers/specs/2026-06-14-ui-redesign-cluely-match-design.md`

---

## File Structure

### New Files
- `assets/fonts/Inter-Variable.woff2` — bundled Inter variable font

### Removed Files
- `llm-response.html` — merged into chat.html
- `src/ui/llm-response-window.js` — merged into chat-window.js
- `dist/output.css` — Tailwind build output
- `src/input.css` — Tailwind input
- `tailwind.config.js` — Tailwind config

### Modified Files (Full Rewrite)
- `src/styles/common.css` — design system tokens + shared components
- `index.html` — command bar with glass popovers
- `chat.html` — unified chat (absorbs LLM response)
- `settings.html` — 3-group collapsible layout
- `src/ui/main-window.js` — popover logic
- `src/ui/chat-window.js` — absorbs LLM response, extended thinking, screenshot previews
- `src/ui/settings-window.js` — new layout logic
- `src/managers/window.manager.js` — 3 windows, session lifecycle
- `src/services/llm.service.js` — extended thinking
- `preload.js` — new/modified IPC channels
- `main.js` — new shortcuts, screenshot flow, session lifecycle, dock hiding

### Dependency Graph

```
Task 1 (Font + CSS) ──┬──> Task 2 (Command Bar HTML/JS)
                       ├──> Task 3 (Chat HTML/JS)
                       └──> Task 4 (Settings HTML/JS)

Task 5 (LLM Extended Thinking) ──> Task 6 (Preload + IPC)

Task 6 (Preload + IPC) ──┬──> Task 7 (Window Manager)
                          └──> Task 8 (Main Process)

Task 9 (Cleanup + Integration) depends on ALL above
```

**Parallelizable groups:**
- Group A (Tasks 2, 3, 4) — all depend on Task 1, independent of each other
- Group B (Task 5) — independent, no file overlap
- Task 6 depends on Task 5
- Tasks 7, 8 depend on Task 6
- Task 9 is the final integration pass

---

### Task 1: Design System — Font Bundle + CSS Rewrite

**Files:**
- Create: `assets/fonts/Inter-Variable.woff2`
- Rewrite: `src/styles/common.css`
- Remove: `src/input.css`, `tailwind.config.js`

This is the foundation — every other task depends on these tokens existing.

- [ ] **Step 1: Download and bundle Inter variable font**

Download Inter variable font woff2 from Google Fonts CDN and save locally:

```bash
curl -L "https://fonts.gstatic.com/s/inter/v18/UcCo3FwrK3iLTcviYwY.woff2" -o assets/fonts/Inter-Variable.woff2
```

Verify the file exists and is ~100KB:
```bash
ls -la assets/fonts/Inter-Variable.woff2
```

- [ ] **Step 2: Rewrite `src/styles/common.css` with design tokens**

Replace the entire file. The new `common.css` has these sections in order:

1. **@font-face** — Inter variable font from local bundle
2. **:root** — all design tokens (glass, colors, text, surface, typography, spacing, transitions) — copy exactly from spec section 1.1
3. **Base styles** — body, *, scrollbars
4. **Glass containers** — `.glass-container`, `.glass-header`
5. **Popover system** — `.popover`, `.popover.is-open`, `.popover-option`
6. **Message types** — `.message`, `.message.system`, `.message.user`, `.message.transcription`, `.message.assistant`, `.message.error`
7. **Thinking section** — `.thinking-section`, `.thinking-toggle`, `.thinking-content`
8. **Screenshot preview** — `.screenshot-label`, `.screenshot-popover`
9. **Code blocks** — `.code-block`, `.code-header`, `.code-content`, `.copy-btn`
10. **Form elements** — `.input-field`, `.toggle-switch`, `.custom-select`
11. **Buttons** — `.btn`, `.btn-danger`, `.btn-recording`
12. **Status indicators** — `.status-dot`, `.status-dot.interactive`, `.status-dot.non-interactive`
13. **Animations** — `@keyframes pulse`, `pulse-green`, `bounce`, `waveAnimation`, `fadeIn`, `fadeInSlide`, `thinking`
14. **Listening indicator** — `.listening-indicator`, `.wave-bar`
15. **Utilities** — `.hidden`, `.visible`, font sizes, spacing

Key design token values (from spec):

```css
@font-face {
  font-family: 'Inter';
  src: url('../../assets/fonts/Inter-Variable.woff2') format('woff2-variations');
  font-weight: 100 900;
  font-display: swap;
}

:root {
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

  --color-accent: #10b981;
  --color-accent-glow: rgba(16, 185, 129, 0.5);
  --color-danger: #ff4757;
  --color-danger-glow: rgba(255, 71, 87, 0.5);
  --color-warning: #ffa726;
  --color-info: #60a5fa;
  --color-purple: #9c27b0;

  --text-primary: rgba(255,255,255,0.95);
  --text-secondary: rgba(255,255,255,0.7);
  --text-muted: rgba(255,255,255,0.5);
  --text-dim: rgba(255,255,255,0.35);

  --surface-subtle: rgba(255,255,255,0.05);
  --surface-light: rgba(255,255,255,0.08);
  --surface-medium: rgba(255,255,255,0.12);
  --surface-hover: rgba(255,255,255,0.15);

  --font-ui: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'SF Mono', 'Fira Code', 'JetBrains Mono', 'Cascadia Code', Monaco, Menlo, 'Courier New', monospace;

  --text-2xs: 10px;
  --text-xs: 11px;
  --text-sm: 12px;
  --text-base: 13px;
  --text-md: 14px;
  --text-lg: 16px;

  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 12px;
  --space-lg: 16px;
  --space-xl: 20px;
  --space-2xl: 24px;

  --transition-fast: 0.15s ease;
  --transition-normal: 0.2s ease;
  --transition-slow: 0.3s ease;
}
```

Glass container base class (used by chat, settings):
```css
.glass-container {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  border: var(--glass-border);
  border-radius: var(--glass-radius);
  box-shadow: var(--glass-shadow);
}

.glass-header {
  padding: var(--space-lg) var(--space-xl);
  border-bottom: 1px solid rgba(255,255,255,0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(0,0,0,0.2);
  backdrop-filter: var(--glass-blur-light);
  -webkit-app-region: drag;
}
```

Popover system (shared by command bar, settings):
```css
.popover {
  position: absolute;
  background: var(--glass-bg-heavy);
  backdrop-filter: var(--glass-blur);
  border: var(--glass-border);
  border-radius: var(--glass-radius);
  box-shadow: 0 12px 30px rgba(0,0,0,0.35);
  min-width: 180px;
  padding: var(--space-sm);
  z-index: 1000;
  -webkit-app-region: no-drag;
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

.popover-option {
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--glass-radius-xs);
  color: var(--text-primary);
  font-size: var(--text-base);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: background var(--transition-fast);
}

.popover-option:hover {
  background: var(--surface-hover);
}

.popover-option.selected {
  color: var(--color-accent);
}

.popover-option .check {
  opacity: 0;
  font-size: var(--text-sm);
}

.popover-option.selected .check {
  opacity: 1;
}
```

Message types:
```css
.message {
  margin-bottom: var(--space-lg);
  padding: var(--space-md) var(--space-lg);
  background: var(--surface-light);
  border-radius: var(--glass-radius-sm);
  border-left: 3px solid rgba(255,255,255,0.2);
  backdrop-filter: var(--glass-blur-light);
  word-wrap: break-word;
  word-break: break-word;
}

.message.system { border-left-color: var(--color-info); background: rgba(96,165,250,0.08); }
.message.user { border-left-color: var(--color-warning); background: rgba(255,152,0,0.08); }
.message.transcription { border-left-color: var(--color-accent); background: rgba(16,185,129,0.08); animation: fadeInSlide 0.1s ease-out; }
.message.assistant { border-left-color: var(--color-purple); background: rgba(156,39,176,0.08); }
.message.error { border-left-color: var(--color-danger); background: rgba(255,71,87,0.08); }
```

Thinking section:
```css
.thinking-section {
  margin-bottom: var(--space-md);
  border-left: 2px solid var(--text-dim);
  padding-left: var(--space-md);
}

.thinking-toggle {
  cursor: pointer;
  color: var(--text-muted);
  font-size: var(--text-sm);
  font-weight: 500;
  user-select: none;
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.thinking-toggle:hover { color: var(--text-secondary); }

.thinking-content {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.2s ease;
  color: var(--text-muted);
  font-size: var(--text-sm);
  line-height: 1.5;
  margin-top: 0;
}

.thinking-content.expanded {
  max-height: 2000px;
  margin-top: var(--space-sm);
}
```

Screenshot preview:
```css
.screenshot-label {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  color: var(--text-secondary);
  font-size: var(--text-sm);
  cursor: pointer;
  position: relative;
}

.screenshot-popover {
  position: absolute;
  bottom: calc(100% + var(--space-sm));
  left: 0;
  background: var(--glass-bg-heavy);
  backdrop-filter: var(--glass-blur);
  border: var(--glass-border);
  border-radius: var(--glass-radius-sm);
  padding: var(--space-sm);
  box-shadow: 0 12px 30px rgba(0,0,0,0.35);
  pointer-events: none;
  opacity: 0;
  transition: opacity var(--transition-fast);
  z-index: 1000;
}

.screenshot-label:hover .screenshot-popover {
  opacity: 1;
  pointer-events: auto;
}

.screenshot-popover img {
  max-width: 400px;
  max-height: 300px;
  border-radius: var(--glass-radius-xs);
}

.screenshot-popover .expired {
  color: var(--text-dim);
  font-size: var(--text-xs);
  font-style: italic;
  padding: var(--space-lg);
}
```

Code blocks:
```css
.code-block-wrapper {
  position: relative;
  margin: var(--space-sm) 0;
}

.code-block-wrapper .code-lang {
  font-size: var(--text-2xs);
  color: var(--text-muted);
  font-family: var(--font-mono);
  padding: var(--space-xs) var(--space-md);
  background: rgba(0,0,0,0.4);
  border-radius: var(--glass-radius-sm) var(--glass-radius-sm) 0 0;
  border: 1px solid rgba(255,255,255,0.1);
  border-bottom: none;
}

.code-block-wrapper pre {
  background: rgba(0,0,0,0.35);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 0 0 var(--glass-radius-sm) var(--glass-radius-sm);
  padding: var(--space-lg);
  margin: 0;
  overflow-x: auto;
  position: relative;
}

.code-block-wrapper pre code {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: #e5e7eb;
  background: transparent;
  padding: 0;
}

.copy-btn {
  position: absolute;
  top: var(--space-sm);
  right: var(--space-sm);
  background: rgba(0,0,0,0.5);
  color: var(--text-primary);
  border: 1px solid rgba(255,255,255,0.2);
  padding: var(--space-xs) var(--space-sm);
  font-size: var(--text-xs);
  border-radius: var(--glass-radius-xs);
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition: background var(--transition-normal), border-color var(--transition-normal);
}
.copy-btn:hover { background: rgba(0,0,0,0.7); }
.copy-btn.copied { background: rgba(16,185,129,0.85); border-color: rgba(16,185,129,0.95); }
```

Toggle switch:
```css
.toggle-switch {
  width: 40px;
  height: 20px;
  background: var(--text-dim);
  border-radius: 10px;
  position: relative;
  cursor: pointer;
  transition: background var(--transition-normal);
  flex-shrink: 0;
}

.toggle-switch.active {
  background: var(--color-accent);
  box-shadow: 0 0 10px var(--color-accent-glow);
}

.toggle-switch .toggle-dot {
  width: 16px;
  height: 16px;
  background: white;
  border-radius: 50%;
  position: absolute;
  top: 2px;
  left: 2px;
  transition: transform var(--transition-normal);
}

.toggle-switch.active .toggle-dot {
  transform: translateX(20px);
}
```

Input fields:
```css
.input-field {
  background: var(--surface-light);
  border: var(--glass-border);
  border-radius: var(--glass-radius-xs);
  padding: var(--space-sm) var(--space-md);
  color: var(--text-primary);
  font-family: var(--font-ui);
  font-size: var(--text-base);
  outline: none;
  transition: border-color var(--transition-normal), background var(--transition-normal);
}

.input-field:focus {
  background: var(--surface-hover);
  border-color: var(--color-accent);
}

.input-field::placeholder { color: var(--text-muted); }
```

Buttons:
```css
.btn {
  background: var(--surface-hover);
  border: none;
  border-radius: var(--glass-radius-xs);
  padding: var(--space-sm) var(--space-md);
  color: var(--text-primary);
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  transition: background var(--transition-normal);
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
}
.btn:hover { background: var(--surface-medium); }

.btn-danger { background: rgba(255,71,87,0.8); }
.btn-danger:hover { background: rgba(255,71,87,1); }
```

Status dot:
```css
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  transition: all var(--transition-slow);
}

.status-dot.interactive {
  background: var(--color-accent);
  box-shadow: 0 0 10px var(--color-accent-glow);
  animation: pulse-green 2s infinite;
}

.status-dot.non-interactive {
  background: var(--color-danger);
  box-shadow: 0 0 10px var(--color-danger-glow);
}
```

Animations — `@keyframes pulse-green`, `bounce`, `waveAnimation`, `fadeIn`, `fadeInSlide` — copy the exact keyframe definitions from the current `common.css` and `chat.html`, just ensure they use the design token colors where applicable.

Listening indicator:
```css
.listening-indicator {
  display: none;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-lg);
  background: rgba(0,0,0,0.02);
  backdrop-filter: var(--glass-blur-light);
  border: 1px solid rgba(203,203,203,0.3);
  border-radius: 20px;
}

.listening-indicator.active {
  display: flex;
  animation: fadeIn 0.3s ease-out;
}

.wave-bar {
  width: 2px;
  background: var(--color-accent);
  border-radius: 1px;
  animation: waveAnimation 1.2s infinite ease-in-out;
}
.wave-bar:nth-child(1) { height: 8px; animation-delay: 0s; }
.wave-bar:nth-child(2) { height: 12px; animation-delay: 0.15s; }
.wave-bar:nth-child(3) { height: 16px; animation-delay: 0.3s; }
.wave-bar:nth-child(4) { height: 12px; animation-delay: 0.45s; }
.wave-bar:nth-child(5) { height: 8px; animation-delay: 0.6s; }

.listening-text {
  color: var(--text-primary);
  font-size: var(--text-xs);
  font-weight: 500;
  letter-spacing: 0.5px;
}

.listening-duration {
  color: var(--color-accent);
  font-size: var(--text-2xs);
  font-family: var(--font-mono);
}
```

Scrollbar styles:
```css
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: var(--surface-subtle); border-radius: 3px; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); }

.hide-scrollbar::-webkit-scrollbar { width: 0; height: 0; display: none; }
.hide-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
```

Utilities:
```css
.hidden { display: none !important; }
.visible { display: block !important; }

body {
  background: transparent !important;
  margin: 0;
  padding: 0;
  overflow: hidden;
  font-family: var(--font-ui);
  color: var(--text-primary);
  cursor: default;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

PrismJS GitHub Dark overrides (keep existing token color definitions from current `llm-response.html` lines 250-312):
```css
.token.comment, .token.prolog, .token.doctype, .token.cdata { color: #6a737d; }
.token.punctuation { color: #e1e4e8; }
.token.property, .token.tag, .token.boolean, .token.number, .token.constant, .token.symbol, .token.deleted { color: #79b8ff; }
.token.selector, .token.attr-name, .token.string, .token.char, .token.builtin, .token.inserted { color: #85e89d; }
.token.operator, .token.entity, .token.url, .language-css .token.string, .style .token.string { color: #f97583; }
.token.atrule, .token.attr-value, .token.keyword { color: #f97583; }
.token.function, .token.class-name { color: #b392f0; }
.token.regex, .token.important, .token.variable { color: #ffab70; }
```

Markdown content styles (for assistant messages):
```css
.markdown-content { line-height: 1.6; font-size: var(--text-base); }
.markdown-content h1, .markdown-content h2, .markdown-content h3 { margin-top: 1.2rem; margin-bottom: 0.8rem; font-weight: 600; color: var(--text-primary); }
.markdown-content h1 { font-size: var(--text-lg); }
.markdown-content h2 { font-size: var(--text-md); }
.markdown-content h3 { font-size: var(--text-base); }
.markdown-content p { margin-bottom: 0.8rem; font-size: var(--text-base); }
.markdown-content ul, .markdown-content ol { margin-bottom: 0.8rem; padding-left: 1.2rem; }
.markdown-content li { margin-bottom: var(--space-xs); }
.markdown-content code { background: var(--surface-subtle); padding: 2px 4px; border-radius: 3px; font-family: var(--font-mono); font-size: var(--text-xs); color: #64ffda; }
.markdown-content pre { background: rgba(0,0,0,0.35); padding: var(--space-lg); border-radius: var(--glass-radius-sm); margin: var(--space-md) 0; overflow-x: auto; border: 1px solid rgba(255,255,255,0.1); position: relative; }
.markdown-content pre code { background: transparent; padding: 0; color: #e5e7eb; display: block; }
.markdown-content blockquote { border-left: 4px solid #6b7280; padding-left: var(--space-lg); margin: var(--space-md) 0; font-style: italic; color: var(--text-secondary); }
.markdown-content strong { font-weight: 600; color: var(--text-primary); }
.markdown-content em { font-style: italic; color: var(--text-secondary); }
```

Collapsible section (for settings):
```css
.collapsible-header {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  cursor: pointer;
  user-select: none;
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--text-primary);
  padding: var(--space-sm) 0;
}

.collapsible-header .arrow {
  font-size: var(--text-sm);
  transition: transform var(--transition-normal);
  color: var(--text-muted);
}

.collapsible-header.collapsed .arrow {
  transform: rotate(-90deg);
}

.collapsible-body {
  overflow: hidden;
  max-height: 2000px;
  transition: max-height var(--transition-slow);
}

.collapsible-body.collapsed {
  max-height: 0;
}
```

Kbd (keyboard shortcut badges):
```css
.kbd {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  background: var(--surface-light);
  border: 1px solid rgba(255,255,255,0.16);
  border-radius: var(--glass-radius-xs);
  padding: 3px var(--space-sm);
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  font-weight: 600;
  color: var(--text-primary);
  box-shadow: inset 0 -1px 0 rgba(0,0,0,0.25);
  white-space: nowrap;
}
```

FontAwesome import:
```css
@import url('../../node_modules/@fortawesome/fontawesome-free/css/all.min.css');
```

- [ ] **Step 3: Remove Tailwind files**

```bash
rm -f src/input.css tailwind.config.js
rm -rf dist/
```

- [ ] **Step 4: Commit**

```bash
git add assets/fonts/ src/styles/common.css
git rm -f src/input.css tailwind.config.js
git rm -rf dist/ 2>/dev/null || true
git commit -m "feat: add design system with Inter font and CSS custom properties

Drop Tailwind CSS. Bundle Inter variable font locally.
Establish design tokens for glassmorphism, colors, typography,
spacing, and shared component styles in common.css."
```

---

### Task 2: Command Bar Redesign (`index.html` + `main-window.js`)

**Files:**
- Rewrite: `index.html`
- Rewrite: `src/ui/main-window.js`

**Depends on:** Task 1 (common.css design tokens)

- [ ] **Step 1: Rewrite `index.html`**

Replace entirely. The new command bar has: status dot, separator, screenshot button with shortcut hint, mic button, skill popover trigger, language popover trigger. No info button. No native `<select>`. Two glass popovers for skill and language.

HTML structure:
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>OpenCluely</title>
  <link href="./src/styles/common.css" rel="stylesheet">
  <style>
    body { width: fit-content; height: fit-content; }

    .command-bar {
      height: 28px;
      background: var(--glass-bg);
      backdrop-filter: var(--glass-blur);
      border-radius: var(--glass-radius-sm);
      display: flex;
      align-items: center;
      gap: var(--space-md);
      padding: 0 var(--space-md);
      border: var(--glass-border);
      -webkit-app-region: drag;
      min-width: 200px;
      width: 100%;
      position: relative;
    }

    .command-separator {
      width: 1px;
      height: 16px;
      background: linear-gradient(to bottom, transparent, rgba(255,255,255,0.25), transparent);
      flex-shrink: 0;
    }

    .command-item {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
      padding: var(--space-xs) var(--space-sm);
      border-radius: var(--glass-radius-xs);
      color: var(--text-primary);
      font-size: var(--text-sm);
      cursor: pointer;
      transition: background var(--transition-normal);
      -webkit-app-region: no-drag;
      flex-shrink: 0;
      position: relative;
    }

    .command-item:hover { background: var(--surface-light); }
    .command-item i { font-size: var(--text-md); transition: all var(--transition-slow); }
    .command-item .shortcut-hint { color: var(--text-muted); font-size: var(--text-2xs); font-weight: 600; }

    .command-item.recording i {
      color: var(--color-danger);
      text-shadow: 0 0 10px var(--color-danger-glow);
      animation: pulse 2s infinite;
    }

    /* Skill/language popovers anchored to their trigger */
    .command-item .popover { top: 36px; left: 0; }
  </style>
</head>
<body>
  <div class="command-bar">
    <div class="status-dot non-interactive" id="statusDot"></div>
    <div class="command-separator"></div>

    <div class="command-item" id="screenshotBtn">
      <i class="fas fa-camera"></i>
      <span class="shortcut-hint">⌘⇧S</span>
    </div>

    <div class="command-item" id="micButton">
      <i class="fas fa-microphone"></i>
    </div>

    <div class="command-item" id="skillTrigger">
      <i class="fas fa-brain"></i>
      <span id="skillLabel">DSA</span>
      <div class="popover" id="skillPopover">
        <!-- populated by JS -->
      </div>
    </div>

    <div class="command-item" id="langTrigger">
      <i class="fas fa-code"></i>
      <span id="langLabel">C++</span>
      <div class="popover" id="langPopover">
        <!-- populated by JS -->
      </div>
    </div>
  </div>

  <script src="./src/ui/main-window.js"></script>
</body>
</html>
```

- [ ] **Step 2: Rewrite `src/ui/main-window.js`**

Replace entirely. The new JS handles:

1. **Popover management** — open/close skill and language popovers, click-outside dismiss, option selection with IPC broadcast.
2. **Status dot** — listens to `interaction-mode-changed` IPC to toggle `interactive`/`non-interactive` class.
3. **Mic button** — listens to `recording-started`/`recording-stopped`/`speech-availability` IPC. Hides when speech unavailable. Toggles `.recording` class.
4. **Screenshot button** — calls `electronAPI.takeScreenshot()` on click.
5. **Skill/language sync** — listens to `skill-changed`/`coding-language-changed` IPC to update labels.

Key functions:
- `openPopover(popoverId)` — adds `is-open` class, adds document click listener to dismiss
- `closeAllPopovers()` — removes `is-open` from all popovers
- `populateSkillPopover(skills, activeSkill)` — creates `.popover-option` elements with check marks
- `populateLanguagePopover(languages, activeLanguage)` — same pattern
- `selectSkill(skill)` — updates label, calls `electronAPI.updateActiveSkill(skill)`, closes popover
- `selectLanguage(lang)` — updates label, calls `electronAPI.saveSettings({codingLanguage: lang})`, closes popover

Languages list: `[{value:'cpp', label:'C++'}, {value:'c', label:'C'}, {value:'python', label:'Python'}, {value:'java', label:'Java'}, {value:'javascript', label:'JavaScript'}]`

Skills are loaded via `electronAPI.getSkillPrompt` or hardcoded initially as `['dsa', 'programming']` with display names.

Popover option HTML generated by JS:
```js
function createPopoverOption(value, label, isSelected) {
  const div = document.createElement('div');
  div.className = `popover-option${isSelected ? ' selected' : ''}`;
  div.innerHTML = `<span>${label}</span><span class="check">✓</span>`;
  div.addEventListener('click', (e) => { e.stopPropagation(); /* handle selection */ });
  return div;
}
```

- [ ] **Step 3: Test manually**

```bash
npm start
```

Verify:
- Command bar appears with status dot, screenshot, mic, skill, language
- Clicking skill/language opens glass popover below the icon
- Clicking an option updates the label and closes popover
- Clicking outside closes popover
- Mic hides if speech not configured
- Screenshot triggers capture flow

- [ ] **Step 4: Commit**

```bash
git add index.html src/ui/main-window.js
git commit -m "feat: redesign command bar with glass popovers

Replace native dropdowns with custom glassmorphism popovers.
Slim bar to: status dot, screenshot, mic, skill, language.
Remove info button and inter-item separators."
```

---

### Task 3: Unified Chat Window (`chat.html` + `chat-window.js`)

**Files:**
- Rewrite: `chat.html`
- Rewrite: `src/ui/chat-window.js`

**Depends on:** Task 1 (common.css design tokens)

This is the largest task — the unified chat absorbs all LLM response display, adds extended thinking UI, screenshot previews, and inline code blocks with copy buttons.

- [ ] **Step 1: Rewrite `chat.html`**

Replace entirely. Structure: glass container with header, messages area, input area. No split layout. References `common.css` + PrismJS theme.

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>OpenCluely Chat</title>
  <link href="./src/styles/common.css" rel="stylesheet">
  <link rel="stylesheet" href="./node_modules/prismjs/themes/prism-tomorrow.min.css">
  <style>
    .chat-container {
      width: 100%;
      height: 100vh;
      display: flex;
      flex-direction: column;
      -webkit-app-region: drag;
    }

    .chat-messages {
      flex: 1;
      padding: var(--space-xl);
      overflow-y: auto;
      overflow-x: hidden;
      -webkit-app-region: no-drag;
    }

    .chat-messages::-webkit-scrollbar { width: 4px; }
    .chat-messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }

    .message-time {
      color: var(--text-muted);
      font-size: var(--text-xs);
      margin-bottom: var(--space-xs);
      font-weight: 500;
    }

    .message-text {
      color: var(--text-primary);
      font-size: var(--text-base);
      line-height: 1.5;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }

    .message-text .markdown-content { font-size: var(--text-base); }

    .chat-input {
      padding: var(--space-lg) var(--space-xl);
      border-top: 1px solid rgba(255,255,255,0.08);
      -webkit-app-region: no-drag;
      background: rgba(0,0,0,0.2);
      backdrop-filter: var(--glass-blur-light);
      flex-shrink: 0;
    }

    .input-container {
      display: flex;
      align-items: center;
      gap: var(--space-md);
      background: var(--surface-light);
      border-radius: var(--glass-radius-sm);
      padding: var(--space-sm) var(--space-md);
      border: var(--glass-border);
      transition: border-color var(--transition-normal);
    }

    .input-container:focus-within {
      border-color: var(--color-accent);
    }

    .input-container textarea {
      flex: 1;
      background: transparent;
      border: none;
      color: var(--text-primary);
      font-family: var(--font-ui);
      font-size: var(--text-base);
      outline: none;
      resize: none;
      line-height: 1.4;
      min-height: 32px;
      max-height: 140px;
      overflow-y: auto;
    }

    .input-container textarea::placeholder { color: var(--text-muted); }

    .input-btn {
      background: var(--surface-hover);
      border: none;
      border-radius: var(--glass-radius-xs);
      padding: var(--space-sm);
      color: var(--text-primary);
      cursor: pointer;
      transition: all var(--transition-normal);
      -webkit-app-region: no-drag;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
    }

    .input-btn:hover { background: var(--surface-medium); }
    .input-btn.recording { background: rgba(255,71,87,0.8); box-shadow: 0 0 15px var(--color-danger-glow); }

    .header-actions {
      display: flex;
      gap: var(--space-sm);
      -webkit-app-region: no-drag;
    }

    .header-btn {
      background: var(--surface-medium);
      border: 1px solid rgba(255,255,255,0.18);
      color: var(--text-primary);
      border-radius: var(--glass-radius-xs);
      padding: var(--space-sm) var(--space-md);
      cursor: pointer;
      font-size: var(--text-sm);
      transition: all var(--transition-normal);
    }
    .header-btn:hover { background: var(--surface-hover); }
    .header-btn-close:hover { background: rgba(239,68,68,0.25); border-color: rgba(239,68,68,0.45); }

    /* Listening indicator positioned between messages and input */
    .listening-area {
      display: flex;
      justify-content: center;
      padding: var(--space-sm) 0;
      -webkit-app-region: no-drag;
    }

    /* Interim text overlay above input */
    .interim-overlay {
      padding: var(--space-md) var(--space-xl);
      color: var(--text-secondary);
      font-size: var(--text-sm);
      font-style: italic;
      display: none;
      border-top: 1px solid rgba(255,255,255,0.05);
      -webkit-app-region: no-drag;
    }
    .interim-overlay.active { display: block; animation: fadeIn 0.2s ease-out; }
  </style>
</head>
<body>
  <div class="chat-container glass-container">
    <div class="glass-header">
      <div style="color: var(--text-primary); font-size: var(--text-md); font-weight: 600; display: flex; align-items: center; gap: var(--space-sm); pointer-events: none;">
        <i class="fas fa-comments"></i> OpenCluely
      </div>
      <div class="header-actions">
        <button class="header-btn" id="clearHistoryBtn" title="Clear chat"><i class="fas fa-trash"></i></button>
        <button class="header-btn header-btn-close" id="closeBtn" title="Close"><i class="fas fa-times"></i></button>
      </div>
    </div>

    <div class="chat-messages" id="chatMessages"></div>

    <div class="listening-area hidden" id="listeningArea">
      <div class="listening-indicator" id="listeningIndicator">
        <div style="display: flex; align-items: center; gap: 2px;">
          <div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div>
        </div>
        <span class="listening-text">Listening</span>
        <span class="listening-duration" id="listeningDuration">0s</span>
      </div>
    </div>

    <div class="interim-overlay" id="interimOverlay"></div>

    <div class="chat-input">
      <div class="input-container">
        <textarea placeholder="Type a message... (Shift+Enter for newline)" id="messageInput" rows="1"></textarea>
        <button class="input-btn" id="micButton" title="Voice input"><i class="fas fa-microphone"></i></button>
        <button class="input-btn" id="sendButton" title="Send"><i class="fas fa-paper-plane"></i></button>
      </div>
    </div>
  </div>

  <script src="lib/markdown.js"></script>
  <script src="./node_modules/prismjs/prism.min.js"></script>
  <script src="./node_modules/prismjs/plugins/autoloader/prism-autoloader.min.js"></script>
  <script>
    try { if (window.Prism && Prism.plugins && Prism.plugins.autoloader) { Prism.plugins.autoloader.languages_path = './node_modules/prismjs/components/'; } } catch (_) {}
  </script>
  <script src="./src/ui/chat-window.js"></script>
</body>
</html>
```

- [ ] **Step 2: Rewrite `src/ui/chat-window.js`**

Replace entirely. This file now handles ALL chat functionality including what was previously in `llm-response-window.js`.

Key responsibilities:
1. **Message rendering** — `addMessage(text, type, options)` where options can include `{screenshotBase64, thinking, skipPersist}`
2. **Markdown rendering** — `renderMarkdown(text)` using `markdown.toHTML()` or `marked.parse()`, with sanitization
3. **Code block rendering** — extract code blocks, render with PrismJS, add copy buttons
4. **Extended thinking** — render collapsible thinking section inside assistant messages
5. **Screenshot previews** — render hover preview popover with base64 image, garbage collection at 20 items
6. **Chat persistence** — save/load from localStorage
7. **Listening animation** — wave bars, duration timer
8. **Input handling** — textarea auto-resize, Enter to send, Shift+Enter for newline
9. **IPC listeners** — all events from preload.js

Core architecture:
```js
// Global state
let chatHistory = [];
const screenshotStore = []; // {id, base64} — capped at 20
const SCREENSHOT_CAP = 20;
let isRecording = false;
let isInteractive = true;
let speechAvailable = false;
let listeningStartTime = null;
let listeningTimer = null;

// Hash for deduplication
const recentHashes = new Set();

// --- Message rendering ---

function addMessage(text, type = 'user', options = {}) {
  // Create message DOM: .message with .message-time and .message-text
  // If type === 'assistant' and options.thinking exists, prepend thinking section
  // If type === 'assistant', render text as markdown with inline code blocks
  // If options.screenshotBase64, render screenshot label with hover preview
  // Auto-scroll to bottom
  // Persist to chatHistory unless options.skipPersist
}

function renderAssistantMessage(text, thinkingText, messageTextDiv) {
  // If thinkingText, create collapsible thinking section
  // Render text as markdown
  // Extract code blocks, render with PrismJS + copy buttons
  // Add copy buttons to all <pre> elements
}

function createThinkingSection(thinkingText) {
  // Returns a DOM element: .thinking-section > .thinking-toggle + .thinking-content
  // Toggle click handler to expand/collapse
}

function createScreenshotLabel(screenshotId) {
  // Returns a DOM element: .screenshot-label with hover .screenshot-popover
  // If screenshot expired (not in screenshotStore), show "Preview expired"
}

function storeScreenshot(base64) {
  // Add to screenshotStore, return id
  // If over SCREENSHOT_CAP, remove oldest
}

// --- Markdown + code ---

function renderMarkdown(text) { /* markdown.toHTML or marked.parse, sanitize */ }
function extractCodeBlocks(text) { /* regex for ```lang\n...\n``` */ }
function attachCopyButton(preElement, codeText) { /* add .copy-btn with click handler */ }

// --- IPC listeners ---

// Listen for: display-llm-response, transcription-received, transcription-llm-response,
// llm-response, screenshot-data, interaction-mode-changed, recording-started,
// recording-stopped, speech-status, speech-error, speech-availability,
// session-cleared, interim-transcription, coding-language-changed, skill-changed

// display-llm-response handler:
//   hideThinkingIndicator()
//   addMessage(data.response || data.content, 'assistant', {thinking: data.thinking, screenshotBase64: data.screenshotBase64})

// screenshot-data handler:
//   storeScreenshot(data.base64)
//   addMessage('📷 Sent with screenshot', 'user', {screenshotBase64: data.base64})
//   showThinkingIndicator()

// transcription-received handler:
//   addMessage(text, 'transcription')
//   showThinkingIndicator()

// transcription-llm-response handler:
//   hideThinkingIndicator()
//   addMessage(data.response, 'assistant', {thinking: data.thinking})
```

- [ ] **Step 3: Test manually**

```bash
npm start
```

Verify:
- Chat window shows with glass header, messages area, input
- Typing a message and pressing Enter sends it, shows thinking dots, gets AI response
- AI responses render as markdown with inline code blocks and copy buttons
- Screenshot trigger shows "📷 Sent with screenshot" message, then AI response
- Listening animation works when recording
- Clear button clears chat

- [ ] **Step 4: Commit**

```bash
git add chat.html src/ui/chat-window.js
git commit -m "feat: unified chat window with extended thinking and screenshot previews

Merge LLM response display into chat. Single-column inline markdown
with PrismJS code blocks. Collapsible thinking sections for Claude
extended thinking. Screenshot hover previews with in-memory storage."
```

---

### Task 4: Settings Window Redesign (`settings.html` + `settings-window.js`)

**Files:**
- Rewrite: `settings.html`
- Rewrite: `src/ui/settings-window.js`

**Depends on:** Task 1 (common.css design tokens)

- [ ] **Step 1: Rewrite `settings.html`**

Three collapsible groups: Interview, AI & Speech, Appearance & Shortcuts. Custom toggle switch for extended thinking. Custom glass dropdowns replacing native `<select>`. Collapsible Advanced Whisper section. Shortcuts table. End Session button.

Follow the layout from spec section 4. The HTML structure uses `.glass-container`, `.glass-header`, `.collapsible-header`, `.collapsible-body`, `.toggle-switch`, `.popover` classes from `common.css`.

Key elements:
- Section headers with `▾`/`▸` click-to-collapse
- Extended thinking toggle using `.toggle-switch` + `.toggle-dot`
- Speech provider dropdown that dynamically shows/hides Azure vs Whisper fields
- Whisper "Advanced" subsection collapsed by default
- Shortcuts table using `.kbd` badges
- End Session button with `.btn-danger`
- Close and Quit buttons in header

- [ ] **Step 2: Rewrite `src/ui/settings-window.js`**

Handles:
1. **Collapsible sections** — toggle `collapsed` class on header click
2. **Extended thinking toggle** — toggle `active` class, save via IPC
3. **Custom dropdowns** — same popover pattern as command bar
4. **Dynamic field visibility** — show Azure fields when provider=azure, Whisper fields when provider=whisper
5. **Settings load/save** — `electronAPI.getSettings()` to populate, `electronAPI.saveSettings()` on change
6. **End Session** — calls `electronAPI.endSession()` (new IPC)
7. **Icon grid** — click to select, save icon preference
8. **Close/Quit** — existing behavior

- [ ] **Step 3: Test manually**

Verify: collapsible sections toggle, extended thinking switch toggles, provider dropdown shows/hides fields, shortcuts table displays, End Session button works.

- [ ] **Step 4: Commit**

```bash
git add settings.html src/ui/settings-window.js
git commit -m "feat: redesign settings with collapsible groups and thinking toggle

Three groups: Interview, AI & Speech, Appearance & Shortcuts.
Custom glass toggle for extended thinking. Dynamic field visibility
for speech provider. Collapsible advanced Whisper section.
Keyboard shortcuts reference table."
```

---

### Task 5: LLM Service — Extended Thinking Support

**Files:**
- Modify: `src/services/llm.service.js`

**No dependencies on other tasks.**

- [ ] **Step 1: Add thinking parameter to `_makeClaudeRequest()`**

In `_makeClaudeRequest()`, after building the `body` object (around line 362-373), add extended thinking support:

```js
// After the existing body construction:
if (requestBody.thinking) {
  body.thinking = {
    type: "enabled",
    budget_tokens: requestBody.thinking_budget || 10000
  };
  // Claude requires temperature=1 or omitted when thinking is enabled
  delete body.temperature;
}
```

- [ ] **Step 2: Update response parsing to extract thinking blocks**

In `_makeClaudeRequest()`, in the response parsing section (around line 416-428), replace the text extraction with:

```js
const response = JSON.parse(data);

// Extract thinking blocks (extended thinking)
const thinkingBlocks = (response.content || [])
  .filter(block => block.type === 'thinking')
  .map(block => block.thinking);

// Extract text blocks
const textBlocks = (response.content || [])
  .filter(block => block.type === 'text')
  .map(block => block.text);

if (!textBlocks.length) {
  reject(new Error('No text content in Claude response'));
  return;
}

const text = textBlocks.join('\n');
const thinking = thinkingBlocks.length ? thinkingBlocks.join('\n') : null;

// ... existing stop_reason and logging ...

resolve({ text, thinking });
```

- [ ] **Step 3: Update all callers to handle thinking in return value**

Since `_makeClaudeRequest` now returns `{ text, thinking }` instead of a plain string, update all three calling methods:

In `processImageWithSkill()` (around line 124):
```js
const result = await this._makeClaudeRequest({...});
const responseText = result.text || result; // backward compat
const thinkingText = result.thinking || null;
// ... existing processing ...
return { response: finalResponse, thinking: thinkingText, metadata: {...} };
```

Same pattern in `processTextWithSkill()` and `processTranscriptionWithIntelligentResponse()`.

- [ ] **Step 4: Add thinking config to request building**

In `_buildTextRequest()` and in `processImageWithSkill()` and `processTranscriptionWithIntelligentResponse()`, check config for extended thinking:

```js
const thinkingEnabled = config.get('llm.extendedThinking') || false;
// Add to the request object passed to _makeClaudeRequest:
if (thinkingEnabled) {
  request.thinking = true;
  request.thinking_budget = config.get('llm.thinkingBudget') || 10000;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/services/llm.service.js
git commit -m "feat: add Claude extended thinking support to LLM service

Enable thinking parameter in API requests when configured.
Parse thinking blocks from response alongside text blocks.
Return thinking content in all LLM response methods."
```

---

### Task 6: Preload + IPC Changes

**Files:**
- Modify: `preload.js`

**Depends on:** Task 5 (LLM service returns thinking)

- [ ] **Step 1: Add new IPC methods and channels**

Add to `electronAPI` in preload.js:

New invoke methods:
```js
// Session lifecycle
startSession: () => ipcRenderer.invoke('start-session'),
endSession: () => ipcRenderer.invoke('end-session'),
pauseSession: () => ipcRenderer.invoke('pause-session'),

// Extended thinking settings
setExtendedThinking: (enabled) => ipcRenderer.invoke('set-extended-thinking', enabled),
getExtendedThinking: () => ipcRenderer.invoke('get-extended-thinking'),
```

New event listeners:
```js
onScreenshotData: (callback) => ipcRenderer.on('screenshot-data', callback),
onThinkingEnabledChanged: (callback) => ipcRenderer.on('thinking-enabled-changed', callback),
onSessionStateChanged: (callback) => ipcRenderer.on('session-state-changed', callback),
```

- [ ] **Step 2: Remove obsolete IPC methods**

Remove from `electronAPI`:
```js
// Remove these:
expandLlmWindow: ...
resizeLlmWindowForContent: ...
```

Remove from `api.send` validChannels: no changes needed (none of the removed channels are in there).

- [ ] **Step 3: Add `end-session` to api.send validChannels**

```js
let validChannels = [
  'close-settings',
  'quit-app',
  'save-settings',
  'toggle-recording',
  'toggle-interaction-mode',
  'update-skill',
  'window-loaded',
  'end-session'  // NEW
];
```

- [ ] **Step 4: Commit**

```bash
git add preload.js
git commit -m "feat: update IPC channels for session lifecycle and extended thinking

Add session start/end/pause methods. Add screenshot-data and
thinking-enabled-changed listeners. Remove obsolete LLM window
resize methods."
```

---

### Task 7: Window Manager — 3 Windows + Session Lifecycle

**Files:**
- Modify: `src/managers/window.manager.js`

**Depends on:** Task 6 (preload IPC channels)

- [ ] **Step 1: Update windowConfigs — remove llmResponse, update dimensions**

Replace the `windowConfigs` object:

```js
this.windowConfigs = {
  main: {
    width: 400,
    height: 35,
    useContentSize: true,
    file: 'index.html',
    title: 'OpenCluely'
  },
  chat: {
    width: 700,
    height: 600,
    file: 'chat.html',
    title: 'Chat'
  },
  settings: {
    width: 400,
    height: 600,
    file: 'settings.html',
    title: 'Settings'
  }
};
```

- [ ] **Step 2: Add session state tracking**

Add to constructor:
```js
this.sessionState = 'idle'; // 'idle' | 'active' | 'paused'
```

- [ ] **Step 3: Remove llmResponse window creation and methods**

Remove `createLLMResponseWindow()` method.

Remove from `initializeWindows()`:
```js
// DELETE this line:
await this.createLLMResponseWindow();
```

Remove these methods entirely: `showLLMResponse()`, `showLLMLoading()`, `hideLLMResponse()`, `expandLLMWindow()`, `calculateOptimalWindowSize()`.

- [ ] **Step 4: Update window binding to use main + chat**

In `positionBoundWindows()`, replace all references to `llmResponse` with `chat`:

```js
positionBoundWindows() {
  const mainWindow = this.windows.get('main');
  const chatWindow = this.windows.get('chat');
  if (!mainWindow || !chatWindow) return;
  // ... same logic but with chatWindow instead of llmWindow
}
```

Same in `moveBoundWindows()`.

- [ ] **Step 5: Add session lifecycle methods**

```js
startSession() {
  if (this.sessionState === 'active') return;
  this.sessionState = 'active';
  this.showOnCurrentDesktop(this.windows.get('main'));
  this.showOnCurrentDesktop(this.windows.get('chat'));
  this.positionBoundWindows();
  this.isVisible = true;
  logger.info('Session started');
}

pauseSession() {
  if (this.sessionState !== 'active') return;
  this.sessionState = 'paused';
  this.hideAllWindows();
  logger.info('Session paused');
}

resumeSession() {
  if (this.sessionState !== 'paused') return;
  this.sessionState = 'active';
  this.showOnCurrentDesktop(this.windows.get('main'));
  this.showOnCurrentDesktop(this.windows.get('chat'));
  this.positionBoundWindows();
  this.isVisible = true;
  logger.info('Session resumed');
}

endSession() {
  this.sessionState = 'idle';
  this.hideAllWindows();
  this.isVisible = false;
  logger.info('Session ended');
}

toggleSession() {
  switch (this.sessionState) {
    case 'idle': this.startSession(); break;
    case 'active': this.pauseSession(); break;
    case 'paused': this.resumeSession(); break;
  }
  return this.sessionState;
}
```

- [ ] **Step 6: Update initializeWindows to NOT show windows on launch**

In `initializeWindows()`, remove the line that shows main window:
```js
// Remove: this.setInteractive(true); and any showOnCurrentDesktop calls
// Windows stay hidden until startSession() is called
```

Instead, just create windows without showing:
```js
async initializeWindows() {
  // ... existing guards ...
  try {
    await this.createMainWindow();
    await this.createChatWindow();
    await this.createSettingsWindow();
    this.setupWindowEventHandlers();
    this.setupScreenTracking();
    this.setupScreenSharingDetection();
    this.setInteractive(true);
    this.isInitialized = true;
    this.isInitializing = false;
    // Do NOT show windows — wait for startSession()
    logger.info('All windows initialized (hidden until session start)');
  } catch (error) { /* ... */ }
}
```

Update `createMainWindow()` to not show the window on creation:
```js
async createMainWindow() {
  if (this.windows.has('main')) return this.windows.get('main');
  const window = await this.createWindow('main', false);
  this.windows.set('main', window);
  // Remove: this.isVisible = true; and showOnCurrentDesktop calls
  // Apply always-on-top but don't show
  return window;
}
```

- [ ] **Step 7: Update min width for command bar**

In the `will-resize` handler for main window type, update min width from 60 to 200:
```js
const minW = 200;
```

Also in `setMinimumSize`:
```js
window.setMinimumSize(200, windowConfig.height);
```

- [ ] **Step 8: Commit**

```bash
git add src/managers/window.manager.js
git commit -m "feat: consolidate to 3 windows with session lifecycle

Remove llmResponse window. Bind main + chat as vertical pair.
Add session states: idle, active, paused. Windows hidden until
session start via Cmd+Shift+O. Update min width to 200px."
```

---

### Task 8: Main Process — Shortcuts, Screenshot Flow, Dock Hiding

**Files:**
- Modify: `main.js`

**Depends on:** Task 6 (preload IPC), Task 7 (window manager session lifecycle)

- [ ] **Step 1: Hide dock on launch**

In `onAppReady()`, after `app.setName("Terminal ")`, add:
```js
// Hide from dock immediately — pure background process
if (process.platform === 'darwin') {
  app.dock.hide();
}
```

- [ ] **Step 2: Update windowConfigs reference in constructor**

Remove `llmResponse` from `this.windowConfigs`:
```js
this.windowConfigs = {
  main: { title: "OpenCluely" },
  chat: { title: "Chat" },
  settings: { title: "Settings" },
};
```

- [ ] **Step 3: Update global shortcuts**

Replace `setupGlobalShortcuts()`:

```js
setupGlobalShortcuts() {
  const shortcuts = {
    "CommandOrControl+Shift+O": () => this.toggleSession(),
    "CommandOrControl+Shift+S": () => this.triggerScreenshotOCR(),
    "CommandOrControl+Shift+V": () => this.pauseSession(),
    "CommandOrControl+Shift+Q": () => this.endSession(),
    "CommandOrControl+Shift+I": () => windowManager.toggleInteraction(),
    "CommandOrControl+Shift+C": () => windowManager.switchToWindow("chat"),
    "CommandOrControl+,": () => windowManager.showSettings(),
    "Alt+A": () => windowManager.toggleInteraction(),
    "Alt+R": () => this.toggleSpeechRecognition(),
    // Arrow keys for window movement in non-interactive mode
    "CommandOrControl+Up": () => this.handleUpArrow(),
    "CommandOrControl+Down": () => this.handleDownArrow(),
    "CommandOrControl+Left": () => this.handleLeftArrow(),
    "CommandOrControl+Right": () => this.handleRightArrow(),
  };

  Object.entries(shortcuts).forEach(([accelerator, handler]) => {
    const success = globalShortcut.register(accelerator, handler);
    logger.debug("Global shortcut registered", { accelerator, success });
  });
}
```

- [ ] **Step 4: Add session lifecycle methods to ApplicationController**

```js
toggleSession() {
  const newState = windowManager.toggleSession();
  if (newState === 'idle') {
    sessionManager.clear();
    windowManager.broadcastToAllWindows("session-cleared");
  }
  logger.info('Session toggled', { newState });
}

pauseSession() {
  if (windowManager.sessionState === 'active') {
    windowManager.pauseSession();
    logger.info('Session paused via shortcut');
  }
}

endSession() {
  windowManager.endSession();
  sessionManager.clear();
  windowManager.broadcastToAllWindows("session-cleared");
  logger.info('Session ended, memory cleared');
}
```

- [ ] **Step 5: Update screenshot flow to send to chat window**

Replace `triggerScreenshotOCR()`:

```js
async triggerScreenshotOCR() {
  if (!this.isReady || windowManager.sessionState !== 'active') {
    logger.warn("Screenshot requested but session not active");
    return;
  }

  const startTime = Date.now();

  try {
    // Hide windows before capture
    windowManager.hideAllWindows();
    await new Promise((resolve) => setTimeout(resolve, 150));

    const capture = await captureService.captureAndProcess();

    // Restore windows
    windowManager.showAllWindows();

    if (!capture.imageBuffer || !capture.imageBuffer.length) {
      this.broadcastOCRError("Failed to capture screenshot image");
      return;
    }

    // Send screenshot data to chat for preview
    const base64 = capture.imageBuffer.toString('base64');
    const chatWindow = windowManager.getWindow('chat');
    if (chatWindow && !chatWindow.isDestroyed()) {
      chatWindow.webContents.send('screenshot-data', {
        base64: `data:${capture.mimeType || 'image/png'};base64,${base64}`
      });
    }

    // Process with LLM
    const sessionHistory = sessionManager.getOptimizedHistory();
    const skillsRequiringProgrammingLanguage = ['dsa'];
    const needsProgrammingLanguage = skillsRequiringProgrammingLanguage.includes(this.activeSkill);

    const llmResult = await llmService.processImageWithSkill(
      capture.imageBuffer,
      capture.mimeType || 'image/png',
      this.activeSkill,
      sessionHistory.recent,
      needsProgrammingLanguage ? this.codingLanguage : null
    );

    // Record in session
    sessionManager.addModelResponse(llmResult.response, {
      skill: this.activeSkill,
      processingTime: llmResult.metadata.processingTime,
      usedFallback: llmResult.metadata.usedFallback,
      isImageAnalysis: true
    });

    // Send response to chat window (not LLM window)
    if (chatWindow && !chatWindow.isDestroyed()) {
      chatWindow.webContents.send('display-llm-response', {
        content: llmResult.response,
        thinking: llmResult.thinking || null,
        metadata: llmResult.metadata,
        timestamp: new Date().toISOString()
      });
    }

    this.broadcastLLMSuccess(llmResult);
  } catch (error) {
    logger.error("Screenshot OCR failed", { error: error.message });
    windowManager.showAllWindows();
    this.broadcastOCRError(error.message);
  }
}
```

- [ ] **Step 6: Add IPC handlers for new channels**

In `setupIPCHandlers()`, add:

```js
ipcMain.handle("start-session", () => {
  windowManager.startSession();
  return { success: true, state: windowManager.sessionState };
});

ipcMain.handle("end-session", () => {
  this.endSession();
  return { success: true, state: windowManager.sessionState };
});

ipcMain.handle("pause-session", () => {
  this.pauseSession();
  return { success: true, state: windowManager.sessionState };
});

ipcMain.handle("set-extended-thinking", (event, enabled) => {
  config.set('llm.extendedThinking', !!enabled);
  windowManager.broadcastToAllWindows('thinking-enabled-changed', { enabled: !!enabled });
  return { success: true, enabled: !!enabled };
});

ipcMain.handle("get-extended-thinking", () => {
  return { enabled: config.get('llm.extendedThinking') || false };
});
```

Remove obsolete IPC handlers:
```js
// DELETE:
ipcMain.handle("expand-llm-window", ...);
ipcMain.handle("resize-llm-window-for-content", ...);
```

- [ ] **Step 7: Update `onAppReady` to not show windows**

In `onAppReady()`, after `windowManager.initializeWindows()`, do NOT show any windows. Remove or comment out any `windowManager.showAllWindows()` or `windowManager.showOnCurrentDesktop()` calls. The app starts hidden.

- [ ] **Step 8: Update `onActivate` for widget mode**

```js
onActivate() {
  if (!this.isReady) {
    this.onAppReady();
  }
  // Don't auto-show windows — user must use Cmd+Shift+O
}
```

- [ ] **Step 9: Update settings getter/saver for extended thinking**

In `getSettings()`, add:
```js
extendedThinking: config.get('llm.extendedThinking') || false,
```

In `saveSettings()`, add:
```js
if (settings.extendedThinking !== undefined) {
  config.set('llm.extendedThinking', !!settings.extendedThinking);
  windowManager.broadcastToAllWindows('thinking-enabled-changed', { enabled: !!settings.extendedThinking });
}
```

- [ ] **Step 10: Commit**

```bash
git add main.js
git commit -m "feat: widget mode, new shortcuts, screenshot-to-chat flow

Hide dock on launch. Add Cmd+Shift+O (toggle session),
Cmd+Shift+Q (end session). Screenshot results now display
in unified chat window. Extended thinking IPC handlers.
App starts as invisible background process."
```

---

### Task 9: Cleanup + Integration

**Files:**
- Remove: `llm-response.html`, `src/ui/llm-response-window.js`
- Verify: all windows work together

**Depends on:** ALL previous tasks

- [ ] **Step 1: Remove obsolete files**

```bash
git rm llm-response.html src/ui/llm-response-window.js
```

- [ ] **Step 2: Remove Tailwind references from package.json**

Check `package.json` for any Tailwind-related scripts or dependencies:
```bash
grep -n "tailwind\|postcss" package.json
```

If found, remove the `build:css` script and any Tailwind/PostCSS dev dependencies:
```bash
npm uninstall tailwindcss postcss autoprefixer 2>/dev/null || true
```

- [ ] **Step 3: Update package.json scripts**

Remove any `build:css` or Tailwind-related scripts from `package.json`.

- [ ] **Step 4: Full integration test**

```bash
npm start
```

Test the complete flow:
1. App launches — nothing visible, no dock icon, no tray
2. Press `Cmd+Shift+O` — command bar + chat appear
3. Click skill selector — glass popover appears, select option
4. Click language selector — glass popover appears, select option
5. Press `Cmd+Shift+S` — screenshot taken, "📷 Sent with screenshot" in chat, AI response appears
6. Hover over screenshot label — preview popover appears
7. Type a message, press Enter — thinking dots, then AI response with markdown + code
8. Press `Alt+R` — recording starts, wave animation, transcription appears, AI responds
9. Press `Cmd+,` — settings window opens
10. Toggle extended thinking in settings — verify it persists
11. Press `Cmd+Shift+V` — all windows hide (paused)
12. Press `Cmd+Shift+O` — windows reappear (resumed)
13. Press `Cmd+Shift+Q` — session ends, memory cleared

Stealth verification:
14. Open Zoom/Meet and share screen — verify OpenCluely windows are NOT visible in the share
15. Take a macOS screenshot (`Cmd+Shift+3`) — verify OpenCluely is NOT in the screenshot
16. Check Activity Monitor — process visible (expected and acceptable)
17. Check Dock — no OpenCluely icon
18. Check menu bar — no OpenCluely presence

- [ ] **Step 5: Commit**

```bash
git rm llm-response.html src/ui/llm-response-window.js
git add -A
git commit -m "chore: remove obsolete LLM response window and Tailwind

Remove llm-response.html and its JS (merged into chat).
Remove Tailwind CSS build artifacts and config.
All UI now uses CSS custom properties from common.css."
```

---

## Self-Review Checklist

- [x] **Spec coverage:** Every spec section has a corresponding task. Design tokens (spec 1) → Task 1. Command bar (spec 2) → Task 2. Chat (spec 3) → Task 3. Settings (spec 4) → Task 4. Window manager (spec 5) → Tasks 7+8. LLM thinking (spec 5.6) → Task 5. IPC (spec 5.7) → Task 6. Stealth (spec 6) → preserved across Tasks 7+8. File changes (spec 7) → Task 9.
- [x] **Placeholder scan:** No "TBD", "TODO", "implement later" found. All steps have concrete code or commands.
- [x] **Type consistency:** `sessionState` values ('idle'/'active'/'paused') used consistently in Tasks 7+8. `thinking` field name consistent across Tasks 5, 6, 3. `screenshotBase64` field consistent across Tasks 3, 8. Method names (`startSession`, `pauseSession`, `endSession`, `toggleSession`) match between window manager (Task 7) and main process (Task 8).
