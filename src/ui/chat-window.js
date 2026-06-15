(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Global state
  // ---------------------------------------------------------------------------
  let chatHistory = [];
  const screenshotStore = []; // [{id, base64}] capped at SCREENSHOT_CAP
  const SCREENSHOT_CAP = 20;
  const CHAT_HISTORY_KEY = 'opencluely_chat_history_v1';
  let isRecording = false;
  let speechAvailable = false;
  let listeningStartTime = null;
  let listeningTimer = null;
  const recentHashes = new Set();
  const HASH_LIMIT = 50;
  let screenshotIdCounter = 0;

  // ---------------------------------------------------------------------------
  // DOM references
  // ---------------------------------------------------------------------------
  const chatMessages      = document.getElementById('chatMessages');
  const clearHistoryBtn   = document.getElementById('clearHistoryBtn');
  const closeBtn          = document.getElementById('closeBtn');
  const messageInput      = document.getElementById('messageInput');
  const micButton         = document.getElementById('micButton');
  const sendButton        = document.getElementById('sendButton');
  const listeningArea     = document.getElementById('listeningArea');
  const listeningIndicator = document.getElementById('listeningIndicator');
  const listeningDuration = document.getElementById('listeningDuration');
  const interimOverlay    = document.getElementById('interimOverlay');

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
  // Utilities
  // ---------------------------------------------------------------------------

  /**
   * FNV-1a hash — returns hex string.
   */
  function hashString(str) {
    var hash = 0x811c9dc5 | 0;
    for (var i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16);
  }

  /**
   * Render markdown text to safe HTML.
   */
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
      // Basic fallback: escape HTML, convert newlines
      html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/\n/g, '<br>');
    }

    // Sanitize: strip dangerous tags and on* attributes
    html = html
      .replace(/<\s*\/?\s*(script|iframe|object|embed)[^>]*>/gi, '')
      .replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');

    return html;
  }

  /**
   * Create a collapsible thinking section element.
   */
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

  /**
   * Store a screenshot and return its id.
   */
  function storeScreenshot(base64) {
    var id = screenshotIdCounter++;
    screenshotStore.push({ id: id, base64: base64 });
    if (screenshotStore.length > SCREENSHOT_CAP) {
      screenshotStore.shift();
    }
    return id;
  }

  /**
   * Create a screenshot label element with hover popover.
   */
  function createScreenshotLabel(screenshotId) {
    var label = document.createElement('div');
    label.className = 'screenshot-label';

    var text = document.createTextNode('📷 Sent with screenshot');
    label.appendChild(text);

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

  /**
   * Attach a copy button to a <pre> element.
   */
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

      // Try electronAPI first
      if (electronAPI.copyToClipboard) {
        try {
          electronAPI.copyToClipboard(codeText);
          onSuccess();
          return;
        } catch (_) { /* fall through */ }
      }

      // Clipboard API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(codeText).then(onSuccess).catch(function () {
          // execCommand fallback
          try {
            var ta = document.createElement('textarea');
            ta.value = codeText;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            onSuccess();
          } catch (_) { /* ignore */ }
        });
        return;
      }

      // execCommand fallback
      try {
        var ta = document.createElement('textarea');
        ta.value = codeText;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        onSuccess();
      } catch (_) { /* ignore */ }
    });

    preElement.style.position = 'relative';
    preElement.appendChild(btn);
  }

  // ---------------------------------------------------------------------------
  // Messages
  // ---------------------------------------------------------------------------

  /**
   * Add a message to the chat.
   *
   * @param {string}  text
   * @param {string}  type     - 'user' | 'assistant' | 'transcription' | 'error' | 'system'
   * @param {object}  options  - { thinking, screenshotBase64, skipPersist }
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

    // Screenshot-triggered message — show label instead of text
    if (options.screenshotBase64) {
      var ssId = storeScreenshot(options.screenshotBase64);
      var label = createScreenshotLabel(ssId);
      textDiv.appendChild(label);
      messageDiv.appendChild(textDiv);
      appendAndScroll(messageDiv);

      if (!options.skipPersist) {
        chatHistory.push({ text: text, type: type, time: Date.now(), screenshot: true });
        saveHistory();
      }
      return;
    }

    // Assistant messages: optional thinking section + markdown
    if (type === 'assistant') {
      if (options.thinking) {
        var thinkingSection = createThinkingSection(options.thinking);
        messageDiv.appendChild(thinkingSection);
      }
      textDiv.innerHTML = renderMarkdown(text);

      // Attach copy buttons to all <pre> elements
      var pres = textDiv.querySelectorAll('pre');
      pres.forEach(function (pre) {
        var code = pre.querySelector('code');
        var codeText = code ? code.textContent : pre.textContent;
        attachCopyButton(pre, codeText);
      });

      messageDiv.appendChild(textDiv);

      // Syntax highlighting
      try {
        if (typeof Prism !== 'undefined') Prism.highlightAllUnder(messageDiv);
      } catch (_) { /* ignore */ }
    } else {
      textDiv.textContent = text;
      messageDiv.appendChild(textDiv);
    }

    appendAndScroll(messageDiv);

    // Persist
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
    chatMessages.scrollTop = chatMessages.scrollHeight;
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
      var toSave = chatHistory.slice(-500);
      localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(toSave));
    } catch (_) { /* storage full — degrade gracefully */ }
  }

  function loadHistory() {
    try {
      var raw = localStorage.getItem(CHAT_HISTORY_KEY);
      if (!raw) return;
      var items = JSON.parse(raw);
      if (!Array.isArray(items)) return;
      chatHistory = items;
      items.forEach(function (entry) {
        if (entry.screenshot) {
          // Cannot restore base64 for old screenshots; show placeholder
          addMessage(entry.text || '', entry.type || 'user', {
            skipPersist: true,
            screenshotBase64: null,
          });
        } else {
          addMessage(entry.text || '', entry.type || 'user', {
            skipPersist: true,
            thinking: entry.thinking || null,
          });
        }
      });
    } catch (_) { /* ignore corrupt data */ }
  }

  function clearChatHistory() {
    try { localStorage.removeItem(CHAT_HISTORY_KEY); } catch (_) { /* ignore */ }
    chatHistory = [];
    chatMessages.innerHTML = '';
  }

  // ---------------------------------------------------------------------------
  // Listening / interim text
  // ---------------------------------------------------------------------------

  function showListeningAnimation() {
    if (listeningArea) listeningArea.classList.remove('hidden');
    if (listeningIndicator) listeningIndicator.classList.add('active');

    listeningStartTime = Date.now();
    listeningTimer = setInterval(function () {
      if (!listeningStartTime || !listeningDuration) return;
      var elapsed = Math.floor((Date.now() - listeningStartTime) / 1000);
      listeningDuration.textContent = elapsed + 's';
    }, 1000);
  }

  function hideListeningAnimation() {
    if (listeningArea) listeningArea.classList.add('hidden');
    if (listeningIndicator) listeningIndicator.classList.remove('active');

    if (listeningTimer) {
      clearInterval(listeningTimer);
      listeningTimer = null;
    }
    listeningStartTime = null;

    if (interimOverlay) {
      interimOverlay.textContent = '';
      interimOverlay.classList.remove('active');
    }
  }

  function showInterimText(text) {
    if (!interimOverlay) return;
    interimOverlay.textContent = text;
    interimOverlay.classList.add('active');
  }

  // ---------------------------------------------------------------------------
  // Input helpers
  // ---------------------------------------------------------------------------

  function autoGrow(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
  }

  function sendMessage() {
    var text = messageInput.value.trim();
    if (!text) return;
    addMessage(text, 'user');
    messageInput.value = '';
    autoGrow(messageInput);
    showThinkingIndicator();
    if (electronAPI.sendChatMessage) {
      electronAPI.sendChatMessage(text);
    }
  }

  // ---------------------------------------------------------------------------
  // IPC listeners
  // ---------------------------------------------------------------------------

  // Screenshot data from main process
  if (electronAPI.onScreenshotData) {
    electronAPI.onScreenshotData(function (_event, data) {
      if (data && data.base64) {
        addMessage('', 'user', { screenshotBase64: data.base64 });
        showThinkingIndicator();
      }
    });
  }

  // LLM response for screenshot-triggered queries
  if (electronAPI.onDisplayLlmResponse) {
    electronAPI.onDisplayLlmResponse(function (_event, data) {
      hideThinkingIndicator();
      var response = data.content || data.response;
      if (response) {
        addMessage(response, 'assistant', { thinking: data.thinking || null });
      }
    });
  }

  // Voice transcription received
  if (electronAPI.onTranscriptionReceived) {
    electronAPI.onTranscriptionReceived(function (_event, data) {
      if (data && data.text && data.text.trim()) {
        addMessage(data.text.trim(), 'transcription');
        showThinkingIndicator();
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

  // Generic LLM response (from text chat)
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
      micButton.classList.add('recording');
      showListeningAnimation();
    });
  }

  if (electronAPI.onRecordingStopped) {
    electronAPI.onRecordingStopped(function () {
      isRecording = false;
      micButton.classList.remove('recording');
      hideListeningAnimation();
    });
  }

  // Speech availability
  if (electronAPI.onSpeechAvailability) {
    electronAPI.onSpeechAvailability(function (_event, data) {
      speechAvailable = !!(data && data.available);
      micButton.style.display = speechAvailable ? '' : 'none';
    });
  }

  if (electronAPI.onSpeechStatus) {
    electronAPI.onSpeechStatus(function (_event, data) {
      if (data && typeof data.available === 'boolean') {
        speechAvailable = data.available;
        micButton.style.display = speechAvailable ? '' : 'none';
      }
    });
  }

  if (electronAPI.onSpeechError) {
    electronAPI.onSpeechError(function (_event, data) {
      if (data && data.error) {
        addMessage('Speech error: ' + data.error, 'error');
      }
    });
  }

  // Interim transcription
  if (electronAPI.onInterimTranscription) {
    electronAPI.onInterimTranscription(function (_event, data) {
      if (data && data.text) showInterimText(data.text);
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
    electronAPI.onInteractionModeChanged(function (_event, _interactive) {
      // Could disable/enable input here
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
  // UI event handlers
  // ---------------------------------------------------------------------------

  sendButton.addEventListener('click', sendMessage);

  messageInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  messageInput.addEventListener('input', function () {
    autoGrow(messageInput);
  });

  micButton.addEventListener('click', function () {
    if (!speechAvailable) return;
    if (isRecording) {
      electronAPI.stopSpeechRecognition();
    } else {
      electronAPI.startSpeechRecognition();
    }
  });

  closeBtn.addEventListener('click', function () {
    electronAPI.closeWindow();
  });

  clearHistoryBtn.addEventListener('click', function () {
    if (confirm('Clear chat history?')) clearChatHistory();
  });

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------

  loadHistory();

  if (electronAPI.getSpeechAvailability) {
    electronAPI.getSpeechAvailability()
      .then(function (avail) {
        speechAvailable = !!avail;
        micButton.style.display = speechAvailable ? '' : 'none';
      })
      .catch(function () {
        micButton.style.display = 'none';
      });
  } else {
    micButton.style.display = 'none';
  }

  autoGrow(messageInput);
})();
