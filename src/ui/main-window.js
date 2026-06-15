(function() {
  'use strict';

  // State
  let isRecording = false;
  let speechAvailable = false;
  let activeSkill = 'dsa';
  let activeLang = 'cpp';

  // Elements
  const statusDot = document.getElementById('statusDot');
  const screenshotBtn = document.getElementById('screenshotBtn');
  const micButton = document.getElementById('micButton');
  const skillTrigger = document.getElementById('skillTrigger');
  const langTrigger = document.getElementById('langTrigger');
  const skillLabel = document.getElementById('skillLabel');
  const langLabel = document.getElementById('langLabel');
  const skillPopover = document.getElementById('skillPopover');
  const langPopover = document.getElementById('langPopover');

  // Data
  const skills = [{value:'dsa', label:'DSA'}, {value:'programming', label:'Programming'}];
  const languages = [
    {value:'cpp', label:'C++'}, {value:'c', label:'C'},
    {value:'python', label:'Python'}, {value:'java', label:'Java'},
    {value:'javascript', label:'JavaScript'}
  ];

  // --- Popover management ---
  function closeAllPopovers() {
    document.querySelectorAll('.popover.is-open').forEach(p => p.classList.remove('is-open'));
  }

  function togglePopover(popoverEl, e) {
    e.stopPropagation();
    const wasOpen = popoverEl.classList.contains('is-open');
    closeAllPopovers();
    if (!wasOpen) {
      popoverEl.classList.add('is-open');
      setTimeout(() => {
        document.addEventListener('click', onDocumentClick, { once: true });
      }, 0);
    }
  }

  function onDocumentClick() { closeAllPopovers(); }

  // --- Option creation ---
  function createOption(value, label, isSelected, onSelect) {
    const div = document.createElement('div');
    div.className = 'popover-option' + (isSelected ? ' selected' : '');
    div.innerHTML = '<span>' + label + '</span><span class="check">✓</span>';
    div.addEventListener('click', (e) => {
      e.stopPropagation();
      onSelect(value, label);
      closeAllPopovers();
    });
    return div;
  }

  function populateSkillPopover() {
    skillPopover.innerHTML = '';
    skills.forEach(s => {
      skillPopover.appendChild(createOption(s.value, s.label, s.value === activeSkill, (val, lbl) => {
        activeSkill = val;
        skillLabel.textContent = lbl;
        populateSkillPopover();
        if (window.electronAPI) electronAPI.updateActiveSkill(val);
      }));
    });
  }

  function populateLanguagePopover() {
    langPopover.innerHTML = '';
    languages.forEach(l => {
      langPopover.appendChild(createOption(l.value, l.label, l.value === activeLang, (val, lbl) => {
        activeLang = val;
        langLabel.textContent = lbl;
        populateLanguagePopover();
        if (window.electronAPI) electronAPI.saveSettings({ codingLanguage: val });
      }));
    });
  }

  // --- Event handlers ---
  screenshotBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (window.electronAPI) electronAPI.takeScreenshot();
  });

  micButton.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!window.electronAPI || !speechAvailable) return;
    if (isRecording) {
      electronAPI.stopSpeechRecognition();
    } else {
      electronAPI.startSpeechRecognition();
    }
  });

  skillTrigger.addEventListener('click', (e) => togglePopover(skillPopover, e));
  langTrigger.addEventListener('click', (e) => togglePopover(langPopover, e));

  // --- IPC listeners ---
  if (window.electronAPI) {
    electronAPI.onInteractionModeChanged((event, interactive) => {
      const mode = typeof interactive === 'boolean' ? interactive : interactive;
      statusDot.className = 'status-dot ' + (mode ? 'interactive' : 'non-interactive');
    });

    electronAPI.onRecordingStarted(() => {
      isRecording = true;
      micButton.classList.add('recording');
    });

    electronAPI.onRecordingStopped(() => {
      isRecording = false;
      micButton.classList.remove('recording');
    });

    electronAPI.onSpeechAvailability((event, data) => {
      speechAvailable = !!(data && data.available);
      micButton.style.display = speechAvailable ? '' : 'none';
    });

    electronAPI.onSkillChanged((event, data) => {
      if (data && data.skill) {
        activeSkill = data.skill;
        const found = skills.find(s => s.value === data.skill);
        skillLabel.textContent = found ? found.label : data.skill.toUpperCase();
        populateSkillPopover();
      }
    });

    electronAPI.onCodingLanguageChanged((event, data) => {
      if (data && data.language) {
        activeLang = data.language;
        const found = languages.find(l => l.value === data.language);
        langLabel.textContent = found ? found.label : data.language;
        populateLanguagePopover();
      }
    });

    // Init speech availability
    electronAPI.getSpeechAvailability().then(avail => {
      speechAvailable = !!avail;
      micButton.style.display = speechAvailable ? '' : 'none';
    }).catch(() => {
      micButton.style.display = 'none';
    });
  }

  // --- Init ---
  populateSkillPopover();
  populateLanguagePopover();
})();
