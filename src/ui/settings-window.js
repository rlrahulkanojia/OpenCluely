document.addEventListener('DOMContentLoaded', () => {
    const log = (...args) => console.log('[SettingsUI]', ...args);

    // --- Guard: require window.api ---
    if (!window.api) {
        console.error('window.api not available');
        return;
    }

    // ===============================================================
    //  Dropdown value → display label maps
    // ===============================================================
    const LABELS = {
        codingLanguage: { cpp: 'C++', c: 'C', python: 'Python', java: 'Java', javascript: 'JavaScript' },
        activeSkill:    { dsa: 'DSA', programming: 'Programming' }
    };

    // ===============================================================
    //  1. Collapsible sections
    // ===============================================================
    document.querySelectorAll('.collapsible-header').forEach(header => {
        header.addEventListener('click', () => {
            const section = header.dataset.section;
            const body = document.querySelector(`.collapsible-body[data-section="${section}"]`);
            if (!body) return;

            const arrow = header.querySelector('.arrow');
            const isCollapsed = body.classList.toggle('collapsed');
            header.classList.toggle('collapsed', isCollapsed);
            if (arrow) arrow.textContent = isCollapsed ? '▸' : '▾';
        });
    });

    // ===============================================================
    //  2. Custom dropdown (popover) system
    // ===============================================================
    let activePopover = null;

    const openPopover = (trigger, popover) => {
        closeAllPopovers();
        // Position the popover below the trigger
        const rect = trigger.getBoundingClientRect();
        popover.style.position = 'fixed';
        popover.style.top = `${rect.bottom + 4}px`;
        popover.style.left = `${rect.left}px`;
        popover.style.minWidth = `${rect.width}px`;
        popover.classList.add('is-open');
        trigger.classList.add('open');
        activePopover = { trigger, popover };
    };

    const closeAllPopovers = () => {
        if (activePopover) {
            activePopover.popover.classList.remove('is-open');
            activePopover.trigger.classList.remove('open');
            activePopover = null;
        }
    };

    // Close popovers on outside click
    document.addEventListener('click', (e) => {
        if (activePopover &&
            !activePopover.trigger.contains(e.target) &&
            !activePopover.popover.contains(e.target)) {
            closeAllPopovers();
        }
    });

    const setupDropdown = (triggerId, popoverId, key, onChange) => {
        const trigger = document.getElementById(triggerId);
        const popover = document.getElementById(popoverId);
        if (!trigger || !popover) return;

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            if (activePopover && activePopover.trigger === trigger) {
                closeAllPopovers();
            } else {
                openPopover(trigger, popover);
            }
        });

        popover.querySelectorAll('.popover-option').forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                const value = opt.dataset.value;
                // Update label
                const label = trigger.querySelector('.dropdown-label');
                if (label) label.textContent = (LABELS[key] && LABELS[key][value]) || value;
                // Update selected state
                popover.querySelectorAll('.popover-option').forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
                closeAllPopovers();
                if (onChange) onChange(value);
            });
        });
    };

    const setDropdownValue = (triggerId, popoverId, key, value) => {
        const trigger = document.getElementById(triggerId);
        const popover = document.getElementById(popoverId);
        if (!trigger || !popover) return;

        const label = trigger.querySelector('.dropdown-label');
        if (label) label.textContent = (LABELS[key] && LABELS[key][value]) || value;
        popover.querySelectorAll('.popover-option').forEach(o => {
            o.classList.toggle('selected', o.dataset.value === value);
        });
    };

    // Wire up dropdowns
    setupDropdown('codingLanguageTrigger', 'codingLanguagePopover', 'codingLanguage', (val) => {
        if (window.electronAPI && window.electronAPI.saveSettings) {
            window.electronAPI.saveSettings({ codingLanguage: val });
        } else {
            saveAllSettings();
        }
    });

    setupDropdown('activeSkillTrigger', 'activeSkillPopover', 'activeSkill', (val) => {
        window.api.send('update-skill', val);
        saveAllSettings();
    });

    // ===============================================================
    //  3. Extended thinking toggle
    // ===============================================================
    const thinkingToggle = document.getElementById('thinkingToggle');
    if (thinkingToggle) {
        thinkingToggle.addEventListener('click', () => {
            const isActive = thinkingToggle.classList.toggle('active');
            if (window.electronAPI && window.electronAPI.saveSettings) {
                window.electronAPI.saveSettings({ extendedThinking: isActive });
            } else {
                saveAllSettings();
            }
        });
    }

    // ===============================================================
    //  4. Settings load
    // ===============================================================
    const loadSettingsIntoUI = (settings) => {
        if (!settings) return;
        log('Loading settings', Object.keys(settings));

        // Dropdowns
        setDropdownValue('codingLanguageTrigger', 'codingLanguagePopover', 'codingLanguage', settings.codingLanguage || 'cpp');
        setDropdownValue('activeSkillTrigger', 'activeSkillPopover', 'activeSkill', settings.activeSkill || 'dsa');

        // Extended thinking toggle
        if (thinkingToggle) {
            thinkingToggle.classList.toggle('active', !!settings.extendedThinking);
        }

        // Text inputs
        const fields = {
            windowGap: settings.windowGap
        };

        Object.entries(fields).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el && val != null) el.value = val;
        });

        // Icon selection
        const selectedIcon = settings.selectedIcon || settings.appIcon;
        if (selectedIcon) {
            document.querySelectorAll('#iconGrid .icon-option').forEach(opt => {
                opt.classList.toggle('selected', opt.dataset.icon === selectedIcon);
            });
        }
    };

    const requestCurrentSettings = () => {
        if (window.electronAPI && window.electronAPI.getSettings) {
            window.electronAPI.getSettings()
                .then(loadSettingsIntoUI)
                .catch(err => console.error('Failed to get settings:', err));
        }
    };

    // Listen for load-settings IPC
    window.api.receive('load-settings', (settings) => {
        loadSettingsIntoUI(settings);
    });

    // Listen for settings-window-shown via electronAPI
    if (window.electronAPI && window.electronAPI.receive) {
        window.electronAPI.receive('settings-window-shown', () => {
            requestCurrentSettings();
        });

        // Sync coding language changes from other windows
        window.electronAPI.onCodingLanguageChanged((event, data) => {
            if (data && data.language) {
                setDropdownValue('codingLanguageTrigger', 'codingLanguagePopover', 'codingLanguage', data.language);
            }
        });
    }

    // ===============================================================
    //  6. Settings save (collect all fields)
    // ===============================================================
    const saveAllSettings = () => {
        const settings = {};

        // Dropdowns - read from selected option
        const readDropdown = (popoverId) => {
            const popover = document.getElementById(popoverId);
            if (!popover) return undefined;
            const sel = popover.querySelector('.popover-option.selected');
            return sel ? sel.dataset.value : undefined;
        };

        const codingLang = readDropdown('codingLanguagePopover');
        if (codingLang) settings.codingLanguage = codingLang;

        const skill = readDropdown('activeSkillPopover');
        if (skill) settings.activeSkill = skill;

        // Extended thinking
        if (thinkingToggle) settings.extendedThinking = thinkingToggle.classList.contains('active');

        // Text/number inputs
        const inputIds = ['windowGap'];
        inputIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) settings[id] = el.value;
        });

        window.api.send('save-settings', settings);
    };

    // Auto-save on input change/blur
    const inputIds = ['windowGap'];
    inputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', saveAllSettings);
            el.addEventListener('blur', saveAllSettings);
        }
    });

    // ===============================================================
    //  7. Icon grid
    // ===============================================================
    const iconGrid = document.getElementById('iconGrid');
    if (iconGrid) {
        iconGrid.addEventListener('click', (e) => {
            const option = e.target.closest('.icon-option');
            if (!option) return;

            iconGrid.querySelectorAll('.icon-option').forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');

            const iconKey = option.dataset.icon;
            if (window.electronAPI && window.electronAPI.updateAppIcon) {
                window.electronAPI.updateAppIcon(iconKey);
            }
            window.api.send('save-settings', { selectedIcon: iconKey });

            // Visual feedback
            option.style.transform = 'scale(0.95)';
            setTimeout(() => { option.style.transform = ''; }, 100);
        });
    }

    // ===============================================================
    //  8. End Session button
    // ===============================================================
    const endSessionBtn = document.getElementById('endSessionBtn');
    if (endSessionBtn) {
        endSessionBtn.addEventListener('click', () => {
            if (window.electronAPI && window.electronAPI.endSession) {
                window.electronAPI.endSession();
            } else if (window.electronAPI && window.electronAPI.clearSessionMemory) {
                window.electronAPI.clearSessionMemory();
            }
        });
    }

    // ===============================================================
    //  9. Close button
    // ===============================================================
    const closeButton = document.getElementById('closeButton');
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            if (window.electronAPI && window.electronAPI.hideSettings) {
                window.electronAPI.hideSettings();
            } else {
                window.api.send('close-settings');
            }
        });
    }

    // ===============================================================
    // 10. Quit button
    // ===============================================================
    const quitButton = document.getElementById('quitButton');
    if (quitButton) {
        quitButton.addEventListener('click', () => {
            if (window.electronAPI && window.electronAPI.quit) {
                window.electronAPI.quit();
            }
            window.api.send('quit-app');
        });
    }

    // ===============================================================
    // 11. ESC to close
    // ===============================================================
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAllPopovers();
            if (window.electronAPI && window.electronAPI.hideSettings) {
                window.electronAPI.hideSettings();
            } else {
                window.api.send('close-settings');
            }
        }
    });

    // ===============================================================
    // Init: request current settings after short delay
    // ===============================================================
    setTimeout(requestCurrentSettings, 200);
});
