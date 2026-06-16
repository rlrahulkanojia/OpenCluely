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
  const settingsBtn      = document.getElementById('settingsBtn');
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

  settingsBtn.addEventListener('click', function () {
    if (electronAPI.showSettings) electronAPI.showSettings();
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
