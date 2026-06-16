# Single Widget Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge OpenCluely's two visible windows (400×35 command bar + 700×600 chat) into a single Cluely-style widget that toggles between collapsed (~500×100) and expanded (~500×700) states.

**Architecture:** One Electron BrowserWindow replaces the current main+chat pair. The widget HTML has three sections — input area (top, lighter glass), messages area (middle, scrollable, hidden when collapsed), and toolbar (bottom, darker glass). Collapse/expand is CSS-driven with IPC-based window resizing. All IPC events that previously targeted the chat window now target this single widget window.

**Tech Stack:** Electron 29.x, vanilla JS (no framework), CSS custom properties design system in `common.css`, IPC via `preload.js` bridge, PrismJS for syntax highlighting, `lib/markdown.js` for markdown rendering.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `index.html` | **Rewrite** | Single widget HTML: input area + messages + toolbar |
| `src/ui/main-window.js` | **Rewrite** | Unified renderer: input handling, chat message rendering, toolbar controls, collapse/expand, all IPC listeners |
| `src/managers/window.manager.js` | **Modify** | Remove chat window; add collapse/expand resize logic; simplify bound-window positioning |
| `src/styles/common.css` | **Modify** | Add widget-specific styles: two-tone glass, chat bubbles, toolbar, collapse/expand transitions |
| `main.js` | **Modify** | Retarget screenshot-data + display-llm-response from chat→main window; remove chat window references |
| `preload.js` | **Modify** | Add `resizeWidget` IPC call for collapse/expand |
| `chat.html` | **Delete** | No longer needed — absorbed into `index.html` |
| `src/ui/chat-window.js` | **Delete** | No longer needed — absorbed into `src/ui/main-window.js` |

---

## Task 1: Add Widget CSS Styles to `common.css`

**Files:**
- Modify: `src/styles/common.css` (append new styles at end of file)

This task adds all the CSS needed for the widget layout before any HTML/JS changes. The existing `.message`, `.thinking-section`, `.copy-btn`, etc. styles remain — we add new widget-specific classes and override message styles for the bubble layout.

- [ ] **Step 1: Add widget container and layout styles**

Append to the end of `src/styles/common.css` (after the utilities section):

```css
/* ============================================================
   Widget Layout
   ============================================================ */

/* --- Widget Container -------------------------------------- */
.widget-container {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  border-radius: var(--glass-radius);
  overflow: hidden;
  transition: height 0.25s ease;
}

/* --- Widget Input Area (top, lighter glass) ---------------- */
.widget-input-area {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md) var(--space-lg);
  background: linear-gradient(135deg, rgba(30, 30, 30, 0.6) 0%, rgba(40, 40, 40, 0.7) 100%);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
  -webkit-app-region: drag;
}

.widget-back-btn {
  display: none; /* hidden in collapsed mode */
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: var(--text-lg);
  cursor: pointer;
  padding: var(--space-xs);
  border-radius: var(--glass-radius-xs);
  transition: color var(--transition-fast), background var(--transition-fast);
  -webkit-app-region: no-drag;
  flex-shrink: 0;
}

.widget-back-btn:hover {
  color: var(--text-primary);
  background: var(--surface-light);
}

.widget-input-field {
  flex: 1;
  background: var(--surface-light);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--glass-radius-sm);
  padding: var(--space-sm) var(--space-md);
  color: var(--text-primary);
  font-family: var(--font-ui);
  font-size: var(--text-base);
  outline: none;
  resize: none;
  min-height: 32px;
  max-height: 32px;
  line-height: 1.4;
  transition: border-color var(--transition-normal);
  -webkit-app-region: no-drag;
}

.widget-input-field::placeholder {
  color: var(--text-muted);
}

.widget-input-field:focus {
  border-color: rgba(255, 255, 255, 0.25);
}

.widget-submit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: var(--surface-light);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--glass-radius-xs);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.widget-submit-btn:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}

/* --- Widget Messages Area (middle, hidden when collapsed) -- */
.widget-messages {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: var(--space-lg);
  display: none; /* hidden in collapsed state */
  -webkit-app-region: no-drag;
}

.widget-messages::-webkit-scrollbar {
  width: 4px;
}

.widget-messages::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 2px;
}

/* --- Widget Toolbar (bottom, darker glass) ----------------- */
.widget-toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-lg);
  background: linear-gradient(135deg, rgba(10, 10, 10, 0.7) 0%, rgba(15, 15, 15, 0.8) 100%);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  background: none;
  border: none;
  border-radius: var(--glass-radius-xs);
  color: var(--text-muted);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  position: relative;
}

.toolbar-btn:hover {
  color: var(--text-primary);
  background: var(--surface-light);
}

.toolbar-btn.active {
  color: var(--color-accent);
}

.toolbar-btn.recording {
  color: var(--color-danger);
  animation: pulse 2s infinite;
}

.toolbar-separator {
  width: 1px;
  height: 16px;
  background: rgba(255, 255, 255, 0.12);
  flex-shrink: 0;
}

.toolbar-spacer {
  flex: 1;
}

.toolbar-text-btn {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  background: none;
  border: none;
  border-radius: var(--glass-radius-xs);
  color: var(--text-secondary);
  font-size: var(--text-sm);
  font-family: var(--font-ui);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.toolbar-text-btn:hover {
  color: var(--text-primary);
  background: var(--surface-light);
}

.toolbar-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-light);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  color: var(--text-secondary);
  padding: 2px 5px;
  line-height: 1;
}

/* --- Expanded State --------------------------------------- */
.widget-container.expanded .widget-messages {
  display: block;
}

.widget-container.expanded .widget-back-btn {
  display: flex;
}

/* --- Chat Bubble Styles (replaces left-border messages) ---- */
.widget-messages .message {
  border-left: none;
  background: none;
  padding: var(--space-xs) 0;
  margin-bottom: var(--space-sm);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.widget-messages .message.user,
.widget-messages .message.transcription {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.widget-messages .message.user .message-text,
.widget-messages .message.transcription .message-text {
  background: rgba(255, 255, 255, 0.12);
  border-radius: var(--glass-radius-sm) var(--glass-radius-sm) var(--glass-radius-xs) var(--glass-radius-sm);
  padding: var(--space-sm) var(--space-md);
  max-width: 80%;
  display: inline-block;
}

.widget-messages .message.user .message-time,
.widget-messages .message.transcription .message-time {
  text-align: right;
}

.widget-messages .message.assistant {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.widget-messages .message.assistant .message-text {
  max-width: 90%;
}

.widget-messages .message.assistant .message-label {
  color: var(--text-muted);
  font-size: var(--text-xs);
  margin-bottom: var(--space-xs);
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.widget-messages .message.assistant .message-actions {
  display: flex;
  gap: var(--space-xs);
  margin-top: var(--space-xs);
}

.widget-messages .message.assistant .copy-response-btn {
  background: none;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  font-size: var(--text-xs);
  padding: var(--space-xs);
  border-radius: var(--glass-radius-xs);
  transition: all var(--transition-fast);
}

.widget-messages .message.assistant .copy-response-btn:hover {
  color: var(--text-primary);
  background: var(--surface-light);
}

.widget-messages .message.error {
  align-items: flex-start;
}

.widget-messages .message.error .message-text {
  color: var(--color-danger);
  font-size: var(--text-sm);
}

/* --- Listening Overlay (in widget) ------------------------- */
.widget-listening {
  display: none;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: var(--space-sm);
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.widget-listening.active {
  display: flex;
}

.widget-interim-overlay {
  padding: var(--space-sm) var(--space-lg);
  color: var(--text-secondary);
  font-size: var(--text-sm);
  font-style: italic;
  display: none;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.widget-interim-overlay.active {
  display: block;
}

/* --- Skill Popover (toolbar version) ----------------------- */
.toolbar-btn .popover {
  bottom: calc(100% + var(--space-sm));
  top: auto;
  left: 0;
  min-width: 120px;
}
```

- [ ] **Step 2: Verify CSS is syntactically valid**

Run: `node -e "const fs=require('fs'); const css=fs.readFileSync('src/styles/common.css','utf8'); console.log('CSS length:', css.length, 'bytes'); console.log('Last 50 chars:', JSON.stringify(css.slice(-50)));"`

Expected: Prints CSS length (should be larger than before) and last 50 characters showing the new styles.

- [ ] **Step 3: Commit**

```bash
git add src/styles/common.css
git commit -m "feat: add widget CSS styles for single-window Cluely layout

Adds .widget-container, .widget-input-area, .widget-messages, .widget-toolbar
classes with two-tone glass background, chat bubble message styles, and
collapse/expand state transitions."
```

---

## Task 2: Add `resizeWidget` IPC Channel to `preload.js`

**Files:**
- Modify: `preload.js`

The widget renderer needs to tell the main process to resize the window for collapse/expand transitions. We add one new IPC call.

- [ ] **Step 1: Add `resizeWidget` to `electronAPI` in `preload.js`**

In `preload.js`, inside the `contextBridge.exposeInMainWorld('electronAPI', { ... })` block, find the existing `resizeWindow` entry (line 21) and add a new entry right after it:

```javascript
  resizeWidget: (expanded) => ipcRenderer.invoke('resize-widget', { expanded }),
```

This is a dedicated high-level call (expanded = true/false) rather than raw pixel dimensions, so the main process owns the sizing constants.

- [ ] **Step 2: Verify preload.js parses**

Run: `node -e "try { require('./preload.js'); } catch(e) { if (e.message.includes('contextBridge')) { console.log('OK - fails as expected outside Electron'); } else { console.error('PARSE ERROR:', e.message); process.exit(1); } }"`

Expected: "OK - fails as expected outside Electron" (contextBridge is only available in Electron preload context).

- [ ] **Step 3: Commit**

```bash
git add preload.js
git commit -m "feat: add resizeWidget IPC channel to preload bridge

Adds electronAPI.resizeWidget(expanded) for collapse/expand transitions."
```

---

## Task 3: Simplify `window.manager.js` — Remove Chat Window

**Files:**
- Modify: `src/managers/window.manager.js`

This is the most structurally significant change. We remove the chat window entirely, update the main window config to widget dimensions, remove all bound-window logic, and add the resize-widget handler.

- [ ] **Step 1: Update `windowConfigs` — replace main config, remove chat**

In `src/managers/window.manager.js`, replace the `windowConfigs` object (currently at lines 33–64) with:

```javascript
    this.windowConfigs = {
      main: {
        width: 500,
        height: 100,
        expandedHeight: 700,
        useContentSize: true,
        file: 'index.html',
        title: 'OpenCluely'
      },
      settings: {
        width: 400,
        height: 600,
        file: 'settings.html',
        title: 'Settings',
        frame: false,
        titleBarStyle: 'hidden',
        transparent: true,
        skipTaskbar: true,
        resizable: false,
        minimizable: false,
        maximizable: false,
        closable: false,
        alwaysOnTop: true,
        visibleOnAllWorkspaces: true,
        fullscreenable: false
      }
    };
```

Also remove these properties from the constructor (they were only for binding main+chat):

```javascript
    // DELETE these lines:
    // this.bindWindows = true;
    // this.windowGap = 10;
    // this.boundWindowsPosition = { x: 0, y: 0 };
```

Replace them with:

```javascript
    this.isWidgetExpanded = false;
```

- [ ] **Step 2: Remove `createChatWindow` and simplify `initializeWindows`**

Replace the `initializeWindows` method with:

```javascript
  async initializeWindows() {
    if (this.isInitialized || this.isInitializing) {
      logger.warn('Windows already initialized or initializing');
      return;
    }

    this.isInitializing = true;
    logger.info('Initializing application windows');
    
    try {
      await this.createMainWindow();
      await this.createSettingsWindow();

      this.setupWindowEventHandlers();
      this.setupScreenTracking();
      this.setupScreenSharingDetection();
      this.setInteractive(true);

      this.isInitialized = true;
      this.isInitializing = false;
      logger.info('All windows initialized (hidden until session start)');
    } catch (error) {
      this.isInitializing = false;
      logger.error('Failed to initialize windows', { error: error.message });
      throw error;
    }
  }
```

Delete the entire `createChatWindow()` method (lines 126–134).

- [ ] **Step 3: Update `createWindow` — remove chat branch, update main config**

In the `createWindow` method, find the `} else if (type === 'chat') {` branch (lines 229–251) and **delete it entirely**.

Update the main window branch to use the new widget dimensions. Replace the main branch with:

```javascript
    } else if (type === 'main') {
      browserWindowOptions = {
        ...baseOptions,
        frame: false,
        titleBarStyle: 'hidden',
        titleBarOverlay: false,
        transparent: true,
        backgroundColor: '#00000000',
        resizable: false, // No user resizing — only programmatic
        minWidth: 500,
        maxWidth: 500,
        minimizable: false,
        maximizable: false,
        closable: false,
        hasShadow: true, // Visible shadow for widget
        useContentSize: windowConfig.useContentSize || false,
        thickFrame: false,
        focusable: true,
        ...(process.platform === 'darwin' && {
          titleBarStyle: 'hiddenInset',
          trafficLightPosition: { x: -100, y: -100 },
          acceptFirstMouse: true,
          disableAutoHideCursor: true,
          type: 'panel'
        }),
        level: process.platform === 'darwin' ? 'floating' : undefined,
      };
```

Also in the same `createWindow` method, find the `if (type === 'main')` block that sets up the `will-resize` and `resize` event handlers (lines 305–344) and **delete it entirely** — we no longer allow user-initiated resizing.

- [ ] **Step 4: Add `resizeWidget` method**

Add this new method to the `WindowManager` class, after the `createSettingsWindow` method:

```javascript
  /**
   * Resize the main widget window between collapsed and expanded states.
   * @param {boolean} expanded - true for expanded (500x700), false for collapsed (500x100)
   */
  resizeWidget(expanded) {
    const mainWindow = this.windows.get('main');
    if (!mainWindow || mainWindow.isDestroyed()) return;

    this.isWidgetExpanded = expanded;
    const width = this.windowConfigs.main.width;
    const height = expanded
      ? this.windowConfigs.main.expandedHeight
      : this.windowConfigs.main.height;

    try {
      mainWindow.setContentSize(width, height);
    } catch (e) {
      mainWindow.setSize(width, height);
    }

    logger.info('Widget resized', { expanded, width, height });
  }
```

- [ ] **Step 5: Remove all bound-window methods**

Delete these methods entirely from the class:

- `positionBoundWindows()` (~lines 546–592)
- `moveBoundWindows(deltaX, deltaY)` (~lines 595–641)
- `setWindowBinding(enabled)` (~lines 1385–1400)
- `toggleWindowBinding()` (~lines 1405–1407)
- `getWindowBindingStatus()` (~lines 1409–1415)
- `setWindowGap(gap)` (~lines 1417–1427)
- `showChatWindow()` (~lines 1429–1434)
- `hideChatWindow()` (~lines 1436–1443)
- `handleRecordingStarted()` (~lines 1445–1451)
- `handleRecordingStopped()` (~lines 1453–1459)

- [ ] **Step 6: Simplify `positionWindow` — no more bound windows**

Replace the `positionWindow` method with:

```javascript
  positionWindow(window, type) {
    const display = this.currentDisplay || screen.getPrimaryDisplay();
    const { x: displayX, y: displayY, width: screenWidth } = display.workArea;
    
    const topMargin = 20;
    const [windowWidth] = window.getSize();

    const positions = {
      main: {
        x: displayX + Math.round((screenWidth - windowWidth) / 2),
        y: displayY + topMargin
      },
      settings: {
        x: displayX + Math.round((screenWidth - windowWidth) / 2),
        y: displayY + topMargin
      }
    };

    const position = positions[type] || { x: displayX + 100, y: displayY + topMargin };
    window.setPosition(position.x, position.y);
    
    logger.debug('Positioned window', {
      type,
      position: `${position.x},${position.y}`,
      display: display.id || 'primary'
    });
  }
```

- [ ] **Step 7: Simplify session lifecycle — only show main window**

Replace `startSession()`:

```javascript
  startSession() {
    if (this.sessionState === 'active') return;
    this.sessionState = 'active';
    const mainWin = this.windows.get('main');
    if (mainWin) this.showOnCurrentDesktop(mainWin);
    this.isVisible = true;
    this.broadcastToAllWindows('session-state-changed', { state: 'active' });
    logger.info('Session started');
  }
```

Replace `resumeSession()`:

```javascript
  resumeSession() {
    if (this.sessionState !== 'paused') return;
    this.sessionState = 'active';
    const mainWin = this.windows.get('main');
    if (mainWin) this.showOnCurrentDesktop(mainWin);
    this.isVisible = true;
    this.broadcastToAllWindows('session-state-changed', { state: 'active' });
    logger.info('Session resumed');
  }
```

- [ ] **Step 8: Simplify `moveWindowsToActiveScreen` — remove bound window logic**

Replace the method with:

```javascript
  moveWindowsToActiveScreen() {
    if (!this.currentDisplay || this.isScreenBeingShared) return;

    const { x: displayX, y: displayY, width: displayWidth } = this.currentDisplay.workArea;
    const topMargin = 20;

    this.windows.forEach((window, type) => {
      if (window && !window.isDestroyed()) {
        const [windowWidth] = window.getSize();
        
        const newX = displayX + Math.round((displayWidth - windowWidth) / 2);
        const newY = displayY + topMargin;
        
        window.setPosition(Math.round(newX), Math.round(newY));
        
        if (process.platform === 'darwin') {
          window.setAlwaysOnTop(true, 'screen-saver', 1);
        } else {
          window.setAlwaysOnTop(true);
        }
        
        if (window.isVisible()) {
          this.showOnCurrentDesktop(window);
        }
      }
    });
  }
```

- [ ] **Step 9: Simplify `showAllWindows` — only main, never chat**

Replace `showAllWindows()`:

```javascript
  showAllWindows() {
    if (this.isScreenBeingShared) return;
    if (this.sessionState === 'idle') return;

    const mainWindow = this.windows.get('main');
    if (mainWindow) {
      this.showOnCurrentDesktop(mainWindow);
    }

    // Restore settings if it was previously visible
    if (this._wasVisibleBeforeHide && this._wasVisibleBeforeHide.has('settings')) {
      const settingsWindow = this.windows.get('settings');
      if (settingsWindow) this.showOnCurrentDesktop(settingsWindow);
    }

    this.isVisible = true;
    this._wasVisibleBeforeHide = null;

    if (mainWindow) mainWindow.focus();
    
    logger.info('Windows shown', { windowCount: this.windows.size });
  }
```

- [ ] **Step 10: Verify file parses**

Run: `node -e "try { require('./src/managers/window.manager.js'); } catch(e) { if (e.message.includes('BrowserWindow') || e.message.includes('electron')) { console.log('OK - fails as expected outside Electron'); } else { console.error('PARSE ERROR:', e.message); process.exit(1); } }"`

Expected: "OK - fails as expected outside Electron"

- [ ] **Step 11: Commit**

```bash
git add src/managers/window.manager.js
git commit -m "refactor: remove chat window, add single-widget architecture

- Remove chat windowConfig and createChatWindow
- Add resizeWidget(expanded) for collapse/expand transitions
- Remove all bound-window methods (positionBoundWindows, moveBoundWindows, etc.)
- Simplify positioning to center widget on screen
- Update session lifecycle to only manage main widget window"
```

---

## Task 4: Update `main.js` — Retarget IPC Events to Main Window

**Files:**
- Modify: `main.js`

All IPC events that previously targeted `windowManager.getWindow('chat')` must now target `windowManager.getWindow('main')`. We also add the `resize-widget` IPC handler and remove chat-specific handlers.

- [ ] **Step 1: Add `resize-widget` IPC handler**

In `main.js`, inside `setupIPCHandlers()`, add this handler (after the existing `resize-window` handler around line 365):

```javascript
    ipcMain.handle("resize-widget", (event, { expanded }) => {
      windowManager.resizeWidget(!!expanded);
      return { success: true, expanded: !!expanded };
    });
```

- [ ] **Step 2: Retarget screenshot-data and display-llm-response in `triggerScreenshotOCR`**

In `triggerScreenshotOCR()` (around line 805), replace all occurrences of:

```javascript
      const chatWindow = windowManager.getWindow('chat');
      if (chatWindow && !chatWindow.isDestroyed()) {
        chatWindow.webContents.send(
```

With:

```javascript
      const mainWindow = windowManager.getWindow('main');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(
```

There are two such blocks in `triggerScreenshotOCR()`:
1. Sending `screenshot-data` (~line 808)
2. Sending `display-llm-response` (~line 835)

Both need `chatWindow` → `mainWindow`.

- [ ] **Step 3: Retarget display-llm-response in `processWithLLM`**

In `processWithLLM()` (around line 883), replace:

```javascript
      const chatWindow = windowManager.getWindow('chat');
      if (chatWindow && !chatWindow.isDestroyed()) {
        chatWindow.webContents.send('display-llm-response', {
```

With:

```javascript
      const mainWindow = windowManager.getWindow('main');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('display-llm-response', {
```

- [ ] **Step 4: Remove chat-window-specific IPC handlers**

Delete these handler blocks from `setupIPCHandlers()`:

```javascript
    // DELETE: chat-window-ready handler (~line 303)
    ipcMain.on("chat-window-ready", () => { ... });

    // DELETE: test-chat-window handler (~line 312)
    ipcMain.on("test-chat-window", () => { ... });

    // DELETE: switch-to-chat handler (~line 338)
    ipcMain.handle("switch-to-chat", () => { ... });
```

- [ ] **Step 5: Remove bound-window IPC handlers**

Delete these handlers from `setupIPCHandlers()`:

```javascript
    // DELETE all of these:
    ipcMain.handle("set-window-binding", ...);
    ipcMain.handle("toggle-window-binding", ...);
    ipcMain.handle("get-window-binding-status", ...);
    ipcMain.handle("set-window-gap", ...);
    ipcMain.handle("move-bound-windows", ...);
```

- [ ] **Step 6: Update `toggleSpeechRecognition` — remove chat window show/hide**

In `toggleSpeechRecognition()` (~line 637), remove the `windowManager.hideChatWindow()` and `windowManager.showChatWindow()` calls. The method should just start/stop recording without showing/hiding any window:

```javascript
  toggleSpeechRecognition() {
    const isAvailable = typeof speechService.isAvailable === 'function' ? speechService.isAvailable() : !!speechService.getStatus?.().isInitialized;
    if (!isAvailable) {
      logger.warn("Speech recognition unavailable; toggle ignored");
      try {
        windowManager.broadcastToAllWindows("speech-status", { status: 'Speech recognition unavailable', available: false });
        windowManager.broadcastToAllWindows("speech-availability", { available: false });
      } catch (e) {}
      return;
    }
    const currentStatus = speechService.getStatus();
    if (currentStatus.isRecording) {
      try {
        speechService.stopRecording();
        logger.info("Speech recognition stopped via global shortcut");
      } catch (error) {
        logger.error("Error stopping speech recognition:", error);
      }
    } else {
      try {
        speechService.startRecording();
        logger.info("Speech recognition started via global shortcut");
      } catch (error) {
        logger.error("Error starting speech recognition:", error);
      }
    }
  }
```

- [ ] **Step 7: Remove `Cmd+Shift+C` shortcut and simplify arrow handlers**

In `setupGlobalShortcuts()`, delete this line:

```javascript
      "CommandOrControl+Shift+C": () => windowManager.switchToWindow("chat"),
```

Replace arrow handlers:

```javascript
  handleUpArrow() {
    const isInteractive = windowManager.getWindowStats().isInteractive;
    if (isInteractive) {
      this.navigateSkill(-1);
    }
  }

  handleDownArrow() {
    const isInteractive = windowManager.getWindowStats().isInteractive;
    if (isInteractive) {
      this.navigateSkill(1);
    }
  }

  handleLeftArrow() {
    // No-op in single-widget mode
  }

  handleRightArrow() {
    // No-op in single-widget mode
  }
```

- [ ] **Step 8: Verify `main.js` parses**

Run: `node -e "try { require('./main.js'); } catch(e) { if (e.message.includes('electron') || e.message.includes('app') || e.message.includes('Cannot find module')) { console.log('OK - fails as expected outside Electron'); } else { console.error('PARSE ERROR:', e.message); process.exit(1); } }"`

Expected: "OK - fails as expected outside Electron"

- [ ] **Step 9: Commit**

```bash
git add main.js
git commit -m "refactor: retarget all IPC events from chat window to main widget

- Add resize-widget IPC handler
- Retarget screenshot-data and display-llm-response to main window
- Remove chat-window-ready, test-chat-window, switch-to-chat handlers
- Remove bound-window IPC handlers
- Remove chat window show/hide from speech toggle
- Remove Cmd+Shift+C shortcut"
```

---

## Task 5: Rewrite `index.html` — Single Widget Layout

**Files:**
- Rewrite: `index.html`

This replaces the 400×35 command bar HTML with the full widget layout containing all three sections: input area, messages area, and toolbar.

- [ ] **Step 1: Write the complete new `index.html`**

Replace the entire contents of `index.html` with:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>OpenCluely</title>
  <link href="./src/styles/common.css" rel="stylesheet">
  <link rel="stylesheet" href="./node_modules/prismjs/themes/prism-tomorrow.min.css">
  <style>
    body {
      width: 100%;
      height: 100vh;
      margin: 0;
      padding: 0;
      overflow: hidden;
    }
  </style>
</head>
<body>
  <div class="widget-container glass-container" id="widgetContainer">

    <!-- Input Area (top, lighter glass) -->
    <div class="widget-input-area">
      <button class="widget-back-btn" id="backBtn" title="Collapse">
        <i class="fas fa-arrow-left"></i>
      </button>
      <input
        type="text"
        class="widget-input-field"
        id="messageInput"
        placeholder="Ask anything about your screen"
        autocomplete="off"
      />
      <button class="widget-submit-btn" id="submitBtn" title="Send (Enter)">
        <i class="fas fa-level-down-alt fa-rotate-90"></i>
      </button>
    </div>

    <!-- Messages Area (middle, hidden when collapsed) -->
    <div class="widget-messages" id="chatMessages"></div>

    <!-- Listening Indicator -->
    <div class="widget-listening" id="listeningArea">
      <div class="listening-indicator" id="listeningIndicator">
        <div style="display:flex;align-items:center;gap:2px;">
          <div class="wave-bar"></div>
          <div class="wave-bar"></div>
          <div class="wave-bar"></div>
          <div class="wave-bar"></div>
          <div class="wave-bar"></div>
        </div>
        <span class="listening-text">Listening</span>
        <span class="listening-duration" id="listeningDuration">0s</span>
      </div>
    </div>

    <!-- Interim Transcription Overlay -->
    <div class="widget-interim-overlay" id="interimOverlay"></div>

    <!-- Toolbar (bottom, darker glass) -->
    <div class="widget-toolbar">
      <!-- Stealth toggle -->
      <button class="toolbar-btn" id="stealthBtn" title="Toggle click-through">
        <i class="fas fa-ban"></i>
      </button>

      <div class="toolbar-separator"></div>

      <!-- Screenshot -->
      <button class="toolbar-btn" id="screenshotBtn" title="Screenshot (⌘⇧S)">
        <i class="fas fa-camera"></i>
      </button>

      <!-- Visibility -->
      <button class="toolbar-btn" id="visibilityBtn" title="Toggle visibility (⌘⇧V)">
        <i class="fas fa-eye"></i>
      </button>

      <!-- Skill selector (grid icon) -->
      <button class="toolbar-btn" id="skillBtn" title="Skill">
        <i class="fas fa-th"></i>
        <span id="skillLabel">DSA</span>
        <div class="popover" id="skillPopover"></div>
      </button>

      <div class="toolbar-separator"></div>

      <!-- Audio / Mic -->
      <button class="toolbar-btn" id="micBtn" title="Voice input (Alt+R)">
        <i class="fas fa-microphone"></i>
      </button>

      <div class="toolbar-spacer"></div>

      <!-- New Chat (only visible in expanded state via JS) -->
      <button class="toolbar-text-btn" id="newChatBtn" title="New chat" style="display:none;">
        <i class="fas fa-plus"></i>
        New Chat
      </button>

      <!-- History / expand toggle -->
      <button class="toolbar-text-btn" id="expandToggleBtn" title="Expand">
        History
        <i class="fas fa-chevron-down" id="expandIcon"></i>
      </button>
    </div>
  </div>

  <script src="lib/markdown.js"></script>
  <script src="./node_modules/prismjs/prism.min.js"></script>
  <script src="./node_modules/prismjs/plugins/autoloader/prism-autoloader.min.js"></script>
  <script>
    try {
      if (window.Prism && Prism.plugins && Prism.plugins.autoloader) {
        Prism.plugins.autoloader.languages_path = './node_modules/prismjs/components/';
      }
    } catch (_) {}
  </script>
  <script src="./src/ui/main-window.js"></script>
</body>
</html>
```

- [ ] **Step 2: Verify HTML structure**

Run: `node -e "const fs=require('fs'); const html=fs.readFileSync('index.html','utf8'); console.log('Has widget-container:', html.includes('widget-container')); console.log('Has widget-messages:', html.includes('widget-messages')); console.log('Has widget-toolbar:', html.includes('widget-toolbar')); console.log('Has prism:', html.includes('prism.min.js')); console.log('Has markdown:', html.includes('markdown.js'));"`

Expected: All `true`.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: rewrite index.html as single Cluely-style widget

Replaces the 400x35 command bar with a full widget layout:
- Input area (top) with back button, text input, submit button
- Messages area (middle, hidden when collapsed)
- Toolbar (bottom) with stealth, screenshot, visibility, skill, mic,
  new chat, and expand/collapse controls"
```

---

## Task 6: Rewrite `src/ui/main-window.js` — Unified Widget Renderer

**Files:**
- Rewrite: `src/ui/main-window.js`

This is the largest task. The new `main-window.js` absorbs all rendering logic from `chat-window.js` (message rendering, markdown, code blocks, copy buttons, thinking sections, screenshot previews) and adds collapse/expand toggle logic.

- [ ] **Step 1: Write the complete new `src/ui/main-window.js`**

Replace the entire contents of `src/ui/main-window.js` with:

```javascript
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  let isExpanded = false;
  let isRecording = false;
  let speechAvailable = false;
  let activeSkill = 'dsa';
  let activeLang = 'cpp';
  let chatHistory = [];
  const screenshotStore = [];
  const SCREENSHOT_CAP = 20;
  const CHAT_HISTORY_KEY = 'opencluely_chat_history_v1';
  let listeningStartTime = null;
  let listeningTimer = null;
  const recentHashes = new Set();
  const HASH_LIMIT = 50;
  let screenshotIdCounter = 0;

  // ---------------------------------------------------------------------------
  // DOM references
  // ---------------------------------------------------------------------------
  const widgetContainer  = document.getElementById('widgetContainer');
  const backBtn          = document.getElementById('backBtn');
  const messageInput     = document.getElementById('messageInput');
  const submitBtn        = document.getElementById('submitBtn');
  const chatMessages     = document.getElementById('chatMessages');
  const listeningArea    = document.getElementById('listeningArea');
  const listeningIndicator = document.getElementById('listeningIndicator');
  const listeningDuration = document.getElementById('listeningDuration');
  const interimOverlay   = document.getElementById('interimOverlay');
  const stealthBtn       = document.getElementById('stealthBtn');
  const screenshotBtn    = document.getElementById('screenshotBtn');
  const visibilityBtn    = document.getElementById('visibilityBtn');
  const skillBtn         = document.getElementById('skillBtn');
  const skillLabel       = document.getElementById('skillLabel');
  const skillPopover     = document.getElementById('skillPopover');
  const micBtn           = document.getElementById('micBtn');
  const newChatBtn       = document.getElementById('newChatBtn');
  const expandToggleBtn  = document.getElementById('expandToggleBtn');
  const expandIcon       = document.getElementById('expandIcon');

  const electronAPI = window.electronAPI || {};

  // ---------------------------------------------------------------------------
  // Inject thinking-dot animation styles
  // ---------------------------------------------------------------------------
  (function injectStyles() {
    const style = document.createElement('style');
    style.textContent = [
      '.thinking-dots { display: flex; align-items: center; gap: 2px; }',
      '.dot { opacity: 0.4; animation: thinking 1.4s infinite ease-in-out; }',
      '.dot:nth-child(2) { animation-delay: 0.2s; }',
      '.dot:nth-child(3) { animation-delay: 0.4s; }',
      '@keyframes thinking { 0%, 80%, 100% { opacity: 0.4; } 40% { opacity: 1; } }',
    ].join('\n');
    document.head.appendChild(style);
  })();

  // ---------------------------------------------------------------------------
  // Skill data
  // ---------------------------------------------------------------------------
  const skills = [
    { value: 'dsa', label: 'DSA' },
    { value: 'programming', label: 'Programming' }
  ];

  // ---------------------------------------------------------------------------
  // Collapse / Expand
  // ---------------------------------------------------------------------------
  function expandWidget() {
    if (isExpanded) return;
    isExpanded = true;
    widgetContainer.classList.add('expanded');
    messageInput.placeholder = 'Ask follow-up';
    expandIcon.classList.remove('fa-chevron-down');
    expandIcon.classList.add('fa-chevron-up');
    newChatBtn.style.display = '';
    if (electronAPI.resizeWidget) electronAPI.resizeWidget(true);
    scrollToBottom();
  }

  function collapseWidget() {
    if (!isExpanded) return;
    isExpanded = false;
    widgetContainer.classList.remove('expanded');
    messageInput.placeholder = 'Ask anything about your screen';
    expandIcon.classList.remove('fa-chevron-up');
    expandIcon.classList.add('fa-chevron-down');
    newChatBtn.style.display = 'none';
    if (electronAPI.resizeWidget) electronAPI.resizeWidget(false);
  }

  function toggleExpand() {
    if (isExpanded) {
      collapseWidget();
    } else {
      expandWidget();
    }
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------
  function hashString(str) {
    var hash = 0x811c9dc5 | 0;
    for (var i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16);
  }

  function renderMarkdown(text) {
    if (!text) return '';
    var html;
    try {
      if (typeof markdown !== 'undefined' && markdown.toHTML) {
        html = markdown.toHTML(text);
      } else if (typeof window !== 'undefined' && window.markdown && window.markdown.toHTML) {
        html = window.markdown.toHTML(text);
      }
    } catch (_) {
      html = null;
    }

    if (!html) {
      html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/\n/g, '<br>');
    }

    html = html
      .replace(/<\s*\/?\s*(script|iframe|object|embed)[^>]*>/gi, '')
      .replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');

    return html;
  }

  function scrollToBottom() {
    if (chatMessages) {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }

  // ---------------------------------------------------------------------------
  // Thinking section
  // ---------------------------------------------------------------------------
  function createThinkingSection(thinkingText) {
    var section = document.createElement('div');
    section.className = 'thinking-section';

    var toggle = document.createElement('div');
    toggle.className = 'thinking-toggle';
    toggle.textContent = '▸ Thinking (click to expand)';
    toggle.style.cursor = 'pointer';

    var content = document.createElement('div');
    content.className = 'thinking-content';
    content.textContent = thinkingText;

    toggle.addEventListener('click', function () {
      var expanded = content.classList.toggle('expanded');
      toggle.textContent = expanded
        ? '▾ Thinking (click to collapse)'
        : '▸ Thinking (click to expand)';
    });

    section.appendChild(toggle);
    section.appendChild(content);
    return section;
  }

  // ---------------------------------------------------------------------------
  // Screenshot store
  // ---------------------------------------------------------------------------
  function storeScreenshot(base64) {
    var id = screenshotIdCounter++;
    screenshotStore.push({ id: id, base64: base64 });
    if (screenshotStore.length > SCREENSHOT_CAP) {
      screenshotStore.shift();
    }
    return id;
  }

  function createScreenshotLabel(screenshotId) {
    var label = document.createElement('div');
    label.className = 'screenshot-label';
    label.appendChild(document.createTextNode('📷 Sent with screenshot'));

    var popover = document.createElement('div');
    popover.className = 'screenshot-popover';

    var entry = screenshotStore.find(function (s) { return s.id === screenshotId; });
    if (entry) {
      var img = document.createElement('img');
      img.src = entry.base64;
      popover.appendChild(img);
    } else {
      var expired = document.createElement('div');
      expired.className = 'expired';
      expired.textContent = 'Preview expired';
      popover.appendChild(expired);
    }

    label.appendChild(popover);
    return label;
  }

  // ---------------------------------------------------------------------------
  // Copy button for code blocks
  // ---------------------------------------------------------------------------
  function attachCopyButton(preElement, codeText) {
    var btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.textContent = 'Copy';

    btn.addEventListener('click', function () {
      var copied = false;
      function onSuccess() {
        if (copied) return;
        copied = true;
        btn.classList.add('copied');
        btn.textContent = 'Copied';
        setTimeout(function () {
          btn.classList.remove('copied');
          btn.textContent = 'Copy';
        }, 1200);
      }

      if (electronAPI.copyToClipboard) {
        try { electronAPI.copyToClipboard(codeText); onSuccess(); return; } catch (_) {}
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(codeText).then(onSuccess).catch(function () {
          fallbackCopy(codeText, onSuccess);
        });
        return;
      }
      fallbackCopy(codeText, onSuccess);
    });

    preElement.style.position = 'relative';
    preElement.appendChild(btn);
  }

  function fallbackCopy(text, onSuccess) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      onSuccess();
    } catch (_) {}
  }

  // ---------------------------------------------------------------------------
  // Messages
  // ---------------------------------------------------------------------------

  /**
   * Add a message to the chat.
   * @param {string} text
   * @param {string} type - 'user' | 'assistant' | 'transcription' | 'error' | 'system'
   * @param {object} options - { thinking, screenshotBase64, skipPersist }
   */
  function addMessage(text, type, options) {
    type = type || 'user';
    options = options || {};

    var messageDiv = document.createElement('div');
    messageDiv.className = 'message ' + type;

    var timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    timeDiv.textContent = new Date().toLocaleTimeString();

    var textDiv = document.createElement('div');
    textDiv.className = 'message-text';

    messageDiv.appendChild(timeDiv);

    // Screenshot-triggered message
    if (options.screenshotBase64) {
      var ssId = storeScreenshot(options.screenshotBase64);
      textDiv.appendChild(createScreenshotLabel(ssId));
      messageDiv.appendChild(textDiv);
      appendAndScroll(messageDiv);
      if (!options.skipPersist) {
        chatHistory.push({ text: text, type: type, time: Date.now(), screenshot: true });
        saveHistory();
      }
      return;
    }

    // Assistant messages: label + optional thinking + markdown + copy button
    if (type === 'assistant') {
      // "Viewed screen" label for assistant messages
      var labelDiv = document.createElement('div');
      labelDiv.className = 'message-label';
      labelDiv.innerHTML = '<i class="fas fa-eye" style="font-size:10px;"></i> Viewed screen';
      messageDiv.appendChild(labelDiv);

      if (options.thinking) {
        messageDiv.appendChild(createThinkingSection(options.thinking));
      }

      textDiv.innerHTML = renderMarkdown(text);

      // Attach copy buttons to <pre> elements
      var pres = textDiv.querySelectorAll('pre');
      pres.forEach(function (pre) {
        var code = pre.querySelector('code');
        attachCopyButton(pre, code ? code.textContent : pre.textContent);
      });

      messageDiv.appendChild(textDiv);

      // Copy-response button
      var actionsDiv = document.createElement('div');
      actionsDiv.className = 'message-actions';
      var copyRespBtn = document.createElement('button');
      copyRespBtn.className = 'copy-response-btn';
      copyRespBtn.innerHTML = '<i class="fas fa-clipboard"></i>';
      copyRespBtn.title = 'Copy response';
      copyRespBtn.addEventListener('click', function () {
        if (electronAPI.copyToClipboard) {
          electronAPI.copyToClipboard(text);
        } else if (navigator.clipboard) {
          navigator.clipboard.writeText(text);
        }
      });
      actionsDiv.appendChild(copyRespBtn);
      messageDiv.appendChild(actionsDiv);

      // Syntax highlighting
      try {
        if (typeof Prism !== 'undefined') Prism.highlightAllUnder(messageDiv);
      } catch (_) {}
    } else {
      textDiv.textContent = text;
      messageDiv.appendChild(textDiv);
    }

    appendAndScroll(messageDiv);

    if (!options.skipPersist) {
      chatHistory.push({
        text: text,
        type: type,
        time: Date.now(),
        thinking: options.thinking || null,
      });
      saveHistory();
    }
  }

  function appendAndScroll(el) {
    chatMessages.appendChild(el);
    scrollToBottom();
  }

  // ---------------------------------------------------------------------------
  // Thinking indicator
  // ---------------------------------------------------------------------------
  function showThinkingIndicator() {
    if (document.getElementById('thinking-indicator')) return;
    var div = document.createElement('div');
    div.className = 'message assistant thinking';
    div.id = 'thinking-indicator';

    var timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    timeDiv.textContent = new Date().toLocaleTimeString();

    var textDiv = document.createElement('div');
    textDiv.className = 'message-text thinking-dots';
    textDiv.innerHTML =
      '<span class="dot">•</span>' +
      '<span class="dot">•</span>' +
      '<span class="dot">•</span>';

    div.appendChild(timeDiv);
    div.appendChild(textDiv);
    appendAndScroll(div);
  }

  function hideThinkingIndicator() {
    var el = document.getElementById('thinking-indicator');
    if (el) el.remove();
  }

  // ---------------------------------------------------------------------------
  // History persistence
  // ---------------------------------------------------------------------------
  function saveHistory() {
    try {
      localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(chatHistory.slice(-500)));
    } catch (_) {}
  }

  function loadHistory() {
    try {
      var raw = localStorage.getItem(CHAT_HISTORY_KEY);
      if (!raw) return;
      var items = JSON.parse(raw);
      if (!Array.isArray(items)) return;
      chatHistory = items;
      items.forEach(function (entry) {
        addMessage(entry.text || '', entry.type || 'user', {
          skipPersist: true,
          thinking: entry.thinking || null,
          screenshotBase64: entry.screenshot ? null : undefined,
        });
      });
      // If there's history, auto-expand
      if (items.length > 0) {
        expandWidget();
      }
    } catch (_) {}
  }

  function clearChatHistory() {
    try { localStorage.removeItem(CHAT_HISTORY_KEY); } catch (_) {}
    chatHistory = [];
    chatMessages.innerHTML = '';
  }

  // ---------------------------------------------------------------------------
  // Listening / interim
  // ---------------------------------------------------------------------------
  function showListeningAnimation() {
    if (listeningArea) listeningArea.classList.add('active');
    if (listeningIndicator) listeningIndicator.classList.add('active');
    listeningStartTime = Date.now();
    listeningTimer = setInterval(function () {
      if (!listeningStartTime || !listeningDuration) return;
      listeningDuration.textContent = Math.floor((Date.now() - listeningStartTime) / 1000) + 's';
    }, 1000);
  }

  function hideListeningAnimation() {
    if (listeningArea) listeningArea.classList.remove('active');
    if (listeningIndicator) listeningIndicator.classList.remove('active');
    if (listeningTimer) { clearInterval(listeningTimer); listeningTimer = null; }
    listeningStartTime = null;
    if (interimOverlay) {
      interimOverlay.textContent = '';
      interimOverlay.classList.remove('active');
    }
  }

  // ---------------------------------------------------------------------------
  // Popover management
  // ---------------------------------------------------------------------------
  function closeAllPopovers() {
    document.querySelectorAll('.popover.is-open').forEach(function (p) {
      p.classList.remove('is-open');
    });
  }

  function togglePopover(popoverEl, e) {
    e.stopPropagation();
    var wasOpen = popoverEl.classList.contains('is-open');
    closeAllPopovers();
    if (!wasOpen) {
      popoverEl.classList.add('is-open');
      setTimeout(function () {
        document.addEventListener('click', function handler() {
          closeAllPopovers();
          document.removeEventListener('click', handler);
        }, { once: true });
      }, 0);
    }
  }

  function populateSkillPopover() {
    skillPopover.innerHTML = '';
    skills.forEach(function (s) {
      var div = document.createElement('div');
      div.className = 'popover-option' + (s.value === activeSkill ? ' selected' : '');
      div.innerHTML = '<span>' + s.label + '</span><span class="check">✓</span>';
      div.addEventListener('click', function (e) {
        e.stopPropagation();
        activeSkill = s.value;
        skillLabel.textContent = s.label;
        populateSkillPopover();
        closeAllPopovers();
        if (electronAPI.updateActiveSkill) electronAPI.updateActiveSkill(s.value);
      });
      skillPopover.appendChild(div);
    });
  }

  // ---------------------------------------------------------------------------
  // Input / send
  // ---------------------------------------------------------------------------
  function sendMessage() {
    var text = messageInput.value.trim();
    if (!text) return;
    addMessage(text, 'user');
    messageInput.value = '';
    showThinkingIndicator();
    expandWidget(); // auto-expand on first message
    if (electronAPI.sendChatMessage) {
      electronAPI.sendChatMessage(text);
    }
  }

  // ---------------------------------------------------------------------------
  // Toolbar handlers
  // ---------------------------------------------------------------------------
  stealthBtn.addEventListener('click', function () {
    if (electronAPI.getWindowStats) {
      electronAPI.getWindowStats().then(function (stats) {
        if (stats.isInteractive) {
          if (electronAPI.disableWindowInteraction) electronAPI.disableWindowInteraction();
        } else {
          if (electronAPI.enableWindowInteraction) electronAPI.enableWindowInteraction();
        }
      });
    }
  });

  screenshotBtn.addEventListener('click', function () {
    if (electronAPI.takeScreenshot) electronAPI.takeScreenshot();
  });

  visibilityBtn.addEventListener('click', function () {
    if (electronAPI.hideAllWindows) electronAPI.hideAllWindows();
  });

  skillBtn.addEventListener('click', function (e) {
    togglePopover(skillPopover, e);
  });

  micBtn.addEventListener('click', function () {
    if (!speechAvailable) return;
    if (isRecording) {
      if (electronAPI.stopSpeechRecognition) electronAPI.stopSpeechRecognition();
    } else {
      if (electronAPI.startSpeechRecognition) electronAPI.startSpeechRecognition();
    }
  });

  newChatBtn.addEventListener('click', function () {
    clearChatHistory();
    if (electronAPI.clearSessionMemory) electronAPI.clearSessionMemory();
    collapseWidget();
  });

  expandToggleBtn.addEventListener('click', function () {
    toggleExpand();
  });

  backBtn.addEventListener('click', function () {
    collapseWidget();
  });

  submitBtn.addEventListener('click', function () {
    sendMessage();
  });

  messageInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // ---------------------------------------------------------------------------
  // IPC Listeners
  // ---------------------------------------------------------------------------

  // Screenshot data
  if (electronAPI.onScreenshotData) {
    electronAPI.onScreenshotData(function (_event, data) {
      if (data && data.base64) {
        addMessage('', 'user', { screenshotBase64: data.base64 });
        showThinkingIndicator();
        expandWidget();
      }
    });
  }

  // LLM response for screenshot queries
  if (electronAPI.onDisplayLlmResponse) {
    electronAPI.onDisplayLlmResponse(function (_event, data) {
      hideThinkingIndicator();
      var response = data.content || data.response;
      if (response) {
        addMessage(response, 'assistant', { thinking: data.thinking || null });
      }
    });
  }

  // Voice transcription
  if (electronAPI.onTranscriptionReceived) {
    electronAPI.onTranscriptionReceived(function (_event, data) {
      if (data && data.text && data.text.trim()) {
        addMessage(data.text.trim(), 'transcription');
        showThinkingIndicator();
        expandWidget();
      }
    });
  }

  // LLM response to transcription
  if (electronAPI.onTranscriptionLlmResponse) {
    electronAPI.onTranscriptionLlmResponse(function (_event, data) {
      if (data && data.response) {
        hideThinkingIndicator();
        addMessage(data.response, 'assistant', { thinking: data.thinking || null });
      }
    });
  }

  // Generic LLM response
  if (electronAPI.onLlmResponse) {
    electronAPI.onLlmResponse(function (_event, data) {
      if (data && data.response) {
        var h = hashString(data.response.trim());
        if (recentHashes.has(h)) return;
        recentHashes.add(h);
        if (recentHashes.size > HASH_LIMIT) {
          recentHashes.delete(recentHashes.values().next().value);
        }
        hideThinkingIndicator();
        addMessage(data.response, 'assistant', { thinking: data.thinking || null });
      }
    });
  }

  // Recording state
  if (electronAPI.onRecordingStarted) {
    electronAPI.onRecordingStarted(function () {
      isRecording = true;
      micBtn.classList.add('recording');
      showListeningAnimation();
    });
  }

  if (electronAPI.onRecordingStopped) {
    electronAPI.onRecordingStopped(function () {
      isRecording = false;
      micBtn.classList.remove('recording');
      hideListeningAnimation();
    });
  }

  // Speech availability
  if (electronAPI.onSpeechAvailability) {
    electronAPI.onSpeechAvailability(function (_event, data) {
      speechAvailable = !!(data && data.available);
      micBtn.style.display = speechAvailable ? '' : 'none';
    });
  }

  if (electronAPI.onSpeechStatus) {
    electronAPI.onSpeechStatus(function (_event, data) {
      if (data && typeof data.available === 'boolean') {
        speechAvailable = data.available;
        micBtn.style.display = speechAvailable ? '' : 'none';
      }
    });
  }

  if (electronAPI.onSpeechError) {
    electronAPI.onSpeechError(function (_event, data) {
      if (data && data.error) addMessage('Speech error: ' + data.error, 'error');
    });
  }

  // Interim transcription
  if (electronAPI.onInterimTranscription) {
    electronAPI.onInterimTranscription(function (_event, data) {
      if (data && data.text && interimOverlay) {
        interimOverlay.textContent = data.text;
        interimOverlay.classList.add('active');
      }
    });
  }

  // Session cleared
  if (electronAPI.onSessionCleared) {
    electronAPI.onSessionCleared(function () {
      clearChatHistory();
    });
  }

  // Interaction mode
  if (electronAPI.onInteractionModeChanged) {
    electronAPI.onInteractionModeChanged(function (_event, interactive) {
      var mode = typeof interactive === 'boolean' ? interactive : true;
      stealthBtn.classList.toggle('active', !mode);
    });
  }

  // Skill changed (from global shortcut)
  if (electronAPI.onSkillChanged) {
    electronAPI.onSkillChanged(function (_event, data) {
      if (data && data.skill) {
        activeSkill = data.skill;
        var found = skills.find(function (s) { return s.value === data.skill; });
        skillLabel.textContent = found ? found.label : data.skill.toUpperCase();
        populateSkillPopover();
      }
    });
  }

  // Error handlers
  if (electronAPI.onOcrError) {
    electronAPI.onOcrError(function (_event, data) {
      hideThinkingIndicator();
      if (data && data.error) addMessage(data.error, 'error');
    });
  }

  if (electronAPI.onLlmError) {
    electronAPI.onLlmError(function (_event, data) {
      hideThinkingIndicator();
      if (data && data.error) addMessage(data.error, 'error');
    });
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  populateSkillPopover();
  loadHistory();

  if (electronAPI.getSpeechAvailability) {
    electronAPI.getSpeechAvailability().then(function (avail) {
      speechAvailable = !!avail;
      micBtn.style.display = speechAvailable ? '' : 'none';
    }).catch(function () {
      micBtn.style.display = 'none';
    });
  } else {
    micBtn.style.display = 'none';
  }
})();
```

- [ ] **Step 2: Verify JS parses**

Run: `node -e "try { const fs = require('fs'); const code = fs.readFileSync('src/ui/main-window.js','utf8'); new Function(code); console.log('OK - JS parses'); } catch(e) { console.error('PARSE ERROR:', e.message); process.exit(1); }"`

Expected: "OK - JS parses"

- [ ] **Step 3: Commit**

```bash
git add src/ui/main-window.js
git commit -m "feat: rewrite main-window.js as unified widget renderer

Absorbs all chat-window.js logic:
- Message rendering with markdown, code blocks, thinking sections
- Screenshot preview with hover popover
- Copy buttons (code blocks + full response)
- Listening animation and interim transcription
- Chat history persistence (localStorage)
- Collapse/expand toggle with IPC resize calls
- Toolbar controls: stealth, screenshot, visibility, skill, mic
- Cluely-style chat bubbles (user right, assistant left)"
```

---

## Task 7: Delete Old Chat Files

**Files:**
- Delete: `chat.html`
- Delete: `src/ui/chat-window.js`

- [ ] **Step 1: Delete `chat.html`**

```bash
rm chat.html
```

- [ ] **Step 2: Delete `src/ui/chat-window.js`**

```bash
rm src/ui/chat-window.js
```

- [ ] **Step 3: Verify no remaining references to deleted files**

Run: `grep -rn "chat\.html\|chat-window\.js\|createChatWindow\|chatWindow\|chat-window-ready" --include="*.js" --include="*.html" . | grep -v node_modules | grep -v ".git/"`

Expected: No output. If any matches appear, they indicate missed references that need updating in an earlier task.

- [ ] **Step 4: Commit**

```bash
git add -A chat.html src/ui/chat-window.js
git commit -m "chore: remove chat.html and chat-window.js

These files are superseded by the unified widget in index.html
and src/ui/main-window.js."
```

---

## Task 8: Smoke Test and Final Verification

**Files:**
- No file changes — verification only

- [ ] **Step 1: Check all files parse**

Run:

```bash
node -e "
const fs = require('fs');

// Check HTML files exist
['index.html', 'settings.html'].forEach(f => {
  if (!fs.existsSync(f)) { console.error('MISSING:', f); process.exit(1); }
  console.log('EXISTS:', f);
});

// Check deleted files are gone
['chat.html', 'src/ui/chat-window.js'].forEach(f => {
  if (fs.existsSync(f)) { console.error('SHOULD BE DELETED:', f); process.exit(1); }
  console.log('DELETED:', f);
});

// Check JS files parse
['src/ui/main-window.js'].forEach(f => {
  const code = fs.readFileSync(f, 'utf8');
  try { new Function(code); console.log('PARSES:', f); }
  catch(e) { console.error('PARSE ERROR in', f, ':', e.message); process.exit(1); }
});

console.log('All checks passed');
"
```

Expected: All "EXISTS", "DELETED", "PARSES" lines, ending with "All checks passed".

- [ ] **Step 2: Check for stale references**

Run: `grep -rn "chatWindow\|chat_window\|createChatWindow\|chat\.html\|hideChatWindow\|showChatWindow\|bindWindows\|windowGap\|boundWindows\|moveBoundWindows\|positionBoundWindows" --include="*.js" --include="*.html" . | grep -v node_modules | grep -v ".git/"`

Expected: No output. If anything appears, it's a stale reference that needs cleanup.

- [ ] **Step 3: Launch the app**

Run: `npm start`

Verify:
1. App starts without errors in terminal
2. Press `Cmd+Shift+O` to start session
3. Widget appears centered at top of screen, ~500×100 collapsed
4. Input field shows "Ask anything about your screen"
5. Toolbar icons visible at bottom
6. Click expand toggle (↓ arrow) — widget expands to ~500×700
7. Type a message and press Enter — message appears as right-aligned user bubble
8. Wait for LLM response — appears as left-aligned assistant text with "Viewed screen" label and copy button
9. Click back arrow (←) — widget collapses
10. Press `Cmd+Shift+S` — screenshot fires, widget auto-expands with screenshot label and LLM response
11. Click "New Chat" — clears history, collapses widget
12. Press `Cmd+Shift+O` again — toggles session off, widget hides

- [ ] **Step 4: Commit any fixes found during smoke test**

If any fixes were needed, commit them:

```bash
git add -A
git commit -m "fix: address issues found during smoke test"
```

---

## Summary of Changes

| Before | After |
|--------|-------|
| 3 windows: main (400×35), chat (700×600), settings (400×600) | 2 windows: widget (500×100 collapsed / 500×700 expanded), settings (400×600) |
| Command bar with toolbar icons only | Widget with input field + toolbar icons |
| Chat in separate window with left-border messages | Chat integrated in widget with Cluely-style bubbles |
| Windows vertically bound with gap | Single window, no binding needed |
| `Cmd+Shift+C` to switch to chat | Expand toggle / auto-expand on interaction |
| Messages: colored left-border style | Messages: user bubbles right-aligned, AI text left-aligned |

### IPC Event Routing Changes

| Event | Before: sent to | After: sent to |
|-------|-----------------|----------------|
| `screenshot-data` | chat window | main window |
| `display-llm-response` | chat window | main window |
| `transcription-received` | broadcast (all) | broadcast (all) — no change |
| `transcription-llm-response` | broadcast (all) | broadcast (all) — no change |
| `llm-response` | broadcast (all) | broadcast (all) — no change |
| `resize-widget` | N/A (new) | main window via IPC invoke |

### Deleted Code

- `chat.html` — ~78 lines
- `src/ui/chat-window.js` — ~652 lines
- `WindowManager.createChatWindow()` — ~10 lines
- `WindowManager.positionBoundWindows()` — ~50 lines
- `WindowManager.moveBoundWindows()` — ~50 lines
- `WindowManager` bound-window methods — ~60 lines
- Chat-specific IPC handlers in `main.js` — ~30 lines
- `Cmd+Shift+C` global shortcut — 1 line
