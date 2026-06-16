const { BrowserWindow, screen, desktopCapturer } = require('electron');
const path = require('path');
const logger = require('../core/logger').createServiceLogger('WINDOW');
const config = require('../core/config');

class WindowManager {
  constructor() {
    this.windows = new Map();
    this.activeWindow = 'main';
    this.isInteractive = true; // default to interactive so windows are clickable/drag-able
    this.isVisible = false;
    this.currentDisplay = null;
    this.screenWatcher = null;
    this.desktopWatcher = null;
    this.lastActiveSpace = null;
    this.screenSharingWatcher = null;
    this.isScreenBeingShared = false;
    this.wasVisibleBeforeSharing = false;
    this.isInitialized = false;
    this.isInitializing = false;
    this.isRecording = false;
    
    // Add debouncing to prevent excessive operations
    this.lastEnforceTime = 0;
    this.enforceDebounceMs = 1000; // Only enforce once per second
    this.focusLocked = false; // Prevent focus loops
    
    this.isWidgetExpanded = false;
    
    this.windowConfigs = {
      main: {
        width: 500,
        height: 110,
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

    this.sessionState = 'idle'; // 'idle' | 'active' | 'paused'

    this.init();
  }

  init() {
    // ... existing initialization code ...
  }

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
      // Do NOT show windows — wait for startSession()
      logger.info('All windows initialized (hidden until session start)');
    } catch (error) {
      this.isInitializing = false;
      logger.error('Failed to initialize windows', { error: error.message });
      throw error;
    }
  }

  async createMainWindow() {
    if (this.windows.has('main')) {
      return this.windows.get('main');
    }
    const window = await this.createWindow('main', false); // Don't show during creation
    this.windows.set('main', window);

    // Immediate always-on-top enforcement for main window
    if (process.platform === 'darwin') {
      try {
        window.setAlwaysOnTop(true, 'screen-saver', 2);
      } catch (error) {
        window.setAlwaysOnTop(true, 'floating', 2);
      }
    } else {
      window.setAlwaysOnTop(true);
    }

    return window;
  }

  async createSettingsWindow() {
    if (this.windows.has('settings')) {
      return this.windows.get('settings');
    }
    const window = await this.createWindow('settings');
    this.windows.set('settings', window);
    window.hide();
    return window;
  }

  resizeWidget(expanded) {
    const mainWindow = this.windows.get('main');
    if (!mainWindow || mainWindow.isDestroyed()) return;
    this.isWidgetExpanded = expanded;
    const width = this.windowConfigs.main.width;
    const height = expanded ? this.windowConfigs.main.expandedHeight : this.windowConfigs.main.height;
    try { mainWindow.setContentSize(width, height); } catch (e) { mainWindow.setSize(width, height); }
    logger.info('Widget resized', { expanded, width, height });
  }

  async createWindow(type, showOnCreate = false) {
    const windowConfig = this.windowConfigs[type];
    if (!windowConfig) {
      throw new Error(`Unknown window type: ${type}`);
    }

    // Base options
    const baseOptions = {
      width: windowConfig.width,
      height: windowConfig.height,
      webPreferences: {
        ...config.get('window.webPreferences'),
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: false,
        devTools: true, // Enable DevTools for debugging
      },
      show: false, // Never show during creation, use showOnCurrentDesktop instead
      title: windowConfig.title,
      skipTaskbar: true,
      alwaysOnTop: true,
      visibleOnAllWorkspaces: true,
      fullscreenable: false,
      // Platform-specific always-on-top settings
      ...(process.platform === 'darwin' && {
        level: 'floating' // Start with floating level for macOS
      })
    };

    // Type-specific window configurations
    let browserWindowOptions;
    
    if (type === 'settings') {
      // Completely minimal settings window - no decorations at all
      browserWindowOptions = {
        ...baseOptions,
        frame: false,
        titleBarStyle: 'hidden',
        transparent: true,
        resizable: false,
        minimizable: false,
        maximizable: false,
        closable: false,
        hasShadow: false,
        backgroundColor: '#00000000',
        level: process.platform === 'darwin' ? 'floating' : undefined,
        // Additional macOS flags for better always-on-top behavior
        ...(process.platform === 'darwin' && {
          type: 'panel',
          acceptFirstMouse: true,
          disableAutoHideCursor: true
        })
      };
  } else if (type === 'main') {
      // Main window configuration - fit to content, completely frameless
      browserWindowOptions = {
        ...baseOptions,
        frame: false,
        titleBarStyle: 'hidden',
        titleBarOverlay: false,
        transparent: true,
        backgroundColor: '#00000000',
        resizable: false,
        minWidth: 500,
        maxWidth: 500,
        minimizable: false,
        maximizable: false,
        closable: false,
        hasShadow: true,
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
    } else {
      // Other windows (skills)
      browserWindowOptions = {
        ...baseOptions,
        minWidth: config.get('window.minWidth'),
        minHeight: config.get('window.minHeight'),
        maxWidth: config.get('window.maxWidth'),
        maxHeight: config.get('window.maxHeight'),
        frame: true,
        titleBarStyle: 'default',
        transparent: false,
        resizable: true,
        minimizable: false,
        maximizable: true,
        closable: true,
        hasShadow: true,
        level: process.platform === 'darwin' ? 'floating' : undefined,
      };
    }

    // Windows-specific settings
    if (process.platform === 'win32') {
      browserWindowOptions = {
        ...browserWindowOptions,
        parent: null,
        modal: false,
        thickFrame: false,
      };
    }

    browserWindowOptions.kiosk = false;
    browserWindowOptions.simpleFullscreen = false;

  const window = new BrowserWindow(browserWindowOptions);
    
  // Load the HTML file
    await window.loadFile(windowConfig.file);
    
  // Position the window
    this.positionWindow(window, type);
    
  // Apply simplified stealth measures
    this.applyStealthMeasures(window, type);
    
  // Initialize interaction mode based on current state for ALL windows
    if (this.isInteractive) {
      window.setIgnoreMouseEvents(false);
    } else {
      window.setIgnoreMouseEvents(true, { forward: true });
    }

    // Show window on current desktop if requested
    if (showOnCreate) {
      this.showOnCurrentDesktop(window);
    }

    logger.debug('Window created successfully', {
      type,
      title: windowConfig.title,
      dimensions: `${windowConfig.width}x${windowConfig.height}`,
      showOnCreate: showOnCreate
    });

    return window;
  }

  applyStealthMeasures(window, type) {
    // Enhanced always-on-top enforcement for all platforms
    if (process.platform === 'darwin') {
      // macOS: Use native window level constants for maximum effectiveness
      try {
        // Try the most aggressive levels first
        const levels = [
          'screen-saver',    // Highest level
          'pop-up-menu',     // Menu level
          'modal-panel',     // Modal panel level
          'floating',        // Floating level
          'normal'           // Fallback to normal with alwaysOnTop
        ];
        
        let levelSet = false;
        for (const level of levels) {
          try {
            window.setAlwaysOnTop(true, level, 1);
            levelSet = true;
            logger.debug(`Successfully set always-on-top with level: ${level}`, { type });
            break;
          } catch (levelError) {
            logger.debug(`Failed to set level: ${level}`, { error: levelError.message });
          }
        }
        
        if (!levelSet) {
          // Final fallback
          window.setAlwaysOnTop(true);
        }
        
        // Additional macOS-specific enforcement
        setTimeout(() => {
          if (!window.isDestroyed()) {
            try {
              // Force re-application of always-on-top
              window.setAlwaysOnTop(false);
              setTimeout(() => {
                if (!window.isDestroyed()) {
                  window.setAlwaysOnTop(true, 'floating', 1);
                }
              }, 50);
            } catch (error) {
              logger.warn('Error in macOS re-enforcement', { error: error.message });
            }
          }
        }, 200);
        
      } catch (error) {
        logger.warn('Error setting always-on-top for macOS', { error: error.message });
        // Absolute fallback
        window.setAlwaysOnTop(true);
      }
    } else if (process.platform === 'win32') {
      // Windows: Multiple enforcement attempts
      window.setAlwaysOnTop(true);
      
      setTimeout(() => {
        if (!window.isDestroyed()) {
          window.setAlwaysOnTop(true);
        }
      }, 100);
      
      setTimeout(() => {
        if (!window.isDestroyed()) {
          window.setAlwaysOnTop(true);
        }
      }, 500);
      
    } else {
      // Linux and other platforms
      window.setAlwaysOnTop(true);
      
      setTimeout(() => {
        if (!window.isDestroyed()) {
          window.setAlwaysOnTop(true);
        }
      }, 100);
    }

    // Ensure window appears on all workspaces/desktops initially
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    
    // Hide from taskbar to maintain stealth
    window.setSkipTaskbar(true);
    
    // Make window undetectable by screen capture (if supported)
    try {
      window.setContentProtection(true);
    } catch (error) {
      logger.debug('Content protection not supported on this platform');
    }
    
    // More aggressive event listeners to maintain always-on-top behavior
    const enforceAlwaysOnTop = () => {
      if (!window.isDestroyed()) {
        try {
          if (process.platform === 'darwin') {
            // Try multiple levels on macOS
            window.setAlwaysOnTop(true, 'floating', 1);
            setTimeout(() => {
              if (!window.isDestroyed()) {
                window.setAlwaysOnTop(true, 'screen-saver', 1);
              }
            }, 50);
          } else {
            window.setAlwaysOnTop(true);
          }
        } catch (error) {
          logger.debug('Error in enforceAlwaysOnTop', { error: error.message });
        }
      }
    };
    
    // Event-based enforcement
    window.on('blur', () => {
      setTimeout(enforceAlwaysOnTop, 50);
      setTimeout(enforceAlwaysOnTop, 200);
      setTimeout(enforceAlwaysOnTop, 500);
    });
    
    window.on('show', () => {
      setTimeout(enforceAlwaysOnTop, 50);
      setTimeout(enforceAlwaysOnTop, 200);
    });
    
    window.on('focus', () => {
      setTimeout(enforceAlwaysOnTop, 50);
    });
    
    window.on('restore', () => {
      setTimeout(enforceAlwaysOnTop, 50);
    });
    
    // Periodic enforcement every 3 seconds (more frequent)
    const periodicEnforcement = setInterval(() => {
      if (window.isDestroyed()) {
        clearInterval(periodicEnforcement);
        return;
      }
      enforceAlwaysOnTop();
    }, 3000);
    
    logger.debug('Applied enhanced stealth measures with aggressive always-on-top', {
      type,
      platform: process.platform,
      alwaysOnTop: true,
      visibleOnAllWorkspaces: true,
      skipTaskbar: true
    });
  }

  positionWindow(window, type) {
    const display = this.currentDisplay || screen.getPrimaryDisplay();
    const { x: displayX, y: displayY, width: screenWidth } = display.workArea;
    const topMargin = 20;
    const [windowWidth] = window.getSize();
    const positions = {
      main: { x: displayX + Math.round((screenWidth - windowWidth) / 2), y: displayY + topMargin },
      settings: { x: displayX + Math.round((screenWidth - windowWidth) / 2), y: displayY + topMargin }
    };
    const position = positions[type] || { x: displayX + 100, y: displayY + topMargin };
    window.setPosition(position.x, position.y);
    logger.debug('Positioned window', { type, position: `${position.x},${position.y}` });
  }

  showOnCurrentDesktop(win) {
    if (!win || win.isDestroyed()) return;

    if (process.platform === 'darwin') {
      // macOS: prevent space switching and keep visibility stable
      win.hide();
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

      const setMacOSAlwaysOnTop = () => {
        if (win.isDestroyed()) return;
        try {
          win.setAlwaysOnTop(true, 'screen-saver', 2);
        } catch {
          try { win.setAlwaysOnTop(true, 'pop-up-menu', 2); }
          catch { try { win.setAlwaysOnTop(true, 'floating', 2); }
          catch { win.setAlwaysOnTop(true); }}
        }
      };

      setMacOSAlwaysOnTop();

      setTimeout(() => {
        if (win.isDestroyed()) return;
        win.show();
        win.focus();
        setMacOSAlwaysOnTop();
        setTimeout(() => { if (!win.isDestroyed()) setMacOSAlwaysOnTop(); }, 100);
        setTimeout(() => {
          if (win.isDestroyed()) return;
          win.setVisibleOnAllWorkspaces(false);
          setMacOSAlwaysOnTop();
        }, 300);
      }, 50);
    } else {
      // Linux/Windows
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      win.setAlwaysOnTop(true);
      win.show();
      win.focus();
      setTimeout(() => {
        if (win.isDestroyed()) return;
        win.setVisibleOnAllWorkspaces(false);
        win.setAlwaysOnTop(true);
      }, 500);
    }

    logger.debug('Showing window on current desktop with enhanced always-on-top', {
      platform: process.platform,
      windowId: win.id,
      isDestroyed: win.isDestroyed()
    });
  }
  
  setupWindowEventHandlers() {
    this.windows.forEach((window, type) => {
      window.on('closed', () => {
        logger.debug('Window closed', { type });
        this.windows.delete(type);
      });

      window.on('focus', () => {
        this.activeWindow = type;
        logger.debug('Window focused', { type });
      });

      // SIMPLIFIED blur handler - no aggressive re-focusing
      window.on('blur', () => {
        // Only log, don't force focus back
        logger.debug('Window blurred', { type });
      });

      window.on('show', () => {
        logger.debug('Window shown', { type });
      });

      window.on('hide', () => {
        logger.debug('Window hidden', { type });
      });

      // Handle window minimize attempts
      window.on('minimize', (event) => {
        event.preventDefault();
        logger.debug('Prevented window minimize', { type });
      });

      window.on('restore', () => {
        // Simplified restore handling
        logger.debug('Window restored', { type });
      });
    });
  }

  setupScreenSharingDetection() {
    // Avoid screencast portal errors on Linux/Wayland by disabling periodic detection
    if (process.platform === 'linux') {
      logger.info('Skipping screen sharing detection on Linux to avoid portal screencast errors');
      return;
    }

    // Reduced frequency to prevent performance issues
    this.screenSharingWatcher = setInterval(async () => {
      await this.checkScreenSharingStatus();
    }, 5000); // Check every 5 seconds instead of 1

    logger.info('Screen sharing detection initialized');
  }

  async checkScreenSharingStatus() {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 1, height: 1 }
      });

      const wasSharing = this.isScreenBeingShared;

      // Detect screen sharing by checking for window sources that indicate
      // a screen sharing session is active (e.g., "Entire Screen" type sources
      // with names suggesting sharing applications)
      const sharingIndicators = sources.filter(source =>
        source.name.toLowerCase().includes('zoom') ||
        source.name.toLowerCase().includes('teams') ||
        source.name.toLowerCase().includes('meet') ||
        source.name.toLowerCase().includes('screen sharing') ||
        source.name.toLowerCase().includes('discord')
      );
      this.isScreenBeingShared = sharingIndicators.length > 0;

      if (wasSharing !== this.isScreenBeingShared) {
        if (this.isScreenBeingShared) {
          this.handleScreenSharingStarted();
        } else {
          this.handleScreenSharingStopped();
        }
      }
    } catch (error) {
      logger.debug('Screen sharing detection error', { error: error.message });
    }
  }

  startScreenSharingMode() {
    if (!this.isScreenBeingShared) {
      this.isScreenBeingShared = true;
      this.wasVisibleBeforeSharing = this.isVisible;
      this.handleScreenSharingStarted();
    }
  }

  stopScreenSharingMode() {
    if (this.isScreenBeingShared) {
      this.isScreenBeingShared = false;
      this.handleScreenSharingStopped();
    }
  }

  handleScreenSharingStarted() {
    logger.info('Screen sharing detected - hiding windows');

    // Snapshot visible windows before hiding so we restore only those
    this._wasVisibleBeforeHide = new Set();
    this.windows.forEach((window, type) => {
      if (!window.isDestroyed() && window.isVisible()) {
        this._wasVisibleBeforeHide.add(type);
      }
      if (!window.isDestroyed()) {
        window.hide();
        window.setPosition(-10000, -10000);
      }
    });
  }

  handleScreenSharingStopped() {
    logger.info('Screen sharing ended - restoring windows');
    
    if (this.wasVisibleBeforeSharing) {
      this.moveWindowsToActiveScreen();
      this.showAllWindows();
    }
  }

  switchToWindow(windowType) {
    if (!this.windowConfigs[windowType]) {
      logger.warn('Attempted to switch to unknown window type', { windowType });
      return;
    }

    if (this.isScreenBeingShared) {
      return;
    }

    const targetWindow = this.windows.get(windowType);
    if (targetWindow) {
      this.showOnCurrentDesktop(targetWindow);

      this.activeWindow = windowType;
      
      logger.info('Switched to window', {
        windowType,
        isVisible: this.isVisible
      });
    }
  }

  showAllWindows() {
    if (this.isScreenBeingShared) return;
    if (this.sessionState === 'idle') return;
    const mainWindow = this.windows.get('main');
    if (mainWindow) this.showOnCurrentDesktop(mainWindow);
    if (this._wasVisibleBeforeHide && this._wasVisibleBeforeHide.has('settings')) {
      const settingsWindow = this.windows.get('settings');
      if (settingsWindow) this.showOnCurrentDesktop(settingsWindow);
    }
    this.isVisible = true;
    this._wasVisibleBeforeHide = null;
    if (mainWindow) mainWindow.focus();
    logger.info('Windows shown', { windowCount: this.windows.size });
  }

  hideAllWindows() {
    // Snapshot which windows are currently visible so we can restore only those
    this._wasVisibleBeforeHide = new Set();
    this.windows.forEach((window, type) => {
      if (!window.isDestroyed() && window.isVisible()) {
        this._wasVisibleBeforeHide.add(type);
      }
      if (!window.isDestroyed()) {
        window.hide();
      }
    });

    this.isVisible = false;
    logger.info('All windows hidden', {
      previouslyVisible: [...this._wasVisibleBeforeHide]
    });
  }

  toggleVisibility() {
    if (this.isScreenBeingShared) {
      return this.isVisible;
    }

    if (this.isVisible) {
      this.hideAllWindows();
    } else {
      this.showAllWindows();
    }
    
    return this.isVisible;
  }

  setInteractive(interactive) {
    this.isInteractive = interactive;
    
    this.windows.forEach((window, type) => {
      if (!window.isDestroyed()) {
        if (interactive) {
          // Interactive mode: allow mouse events for all windows
          window.setIgnoreMouseEvents(false);
        } else {
          // Non-interactive mode: enable click-through with forwarding for all windows
          window.setIgnoreMouseEvents(true, { forward: true });
        }
        window.webContents.send('interaction-mode-changed', interactive);
      }
    });
    
    logger.info('Window interaction mode changed', { 
      interactive,
      clickThrough: !interactive,
      affectedWindows: Array.from(this.windows.keys())
    });
  }

  toggleInteraction() {
    this.setInteractive(!this.isInteractive);
    
    // Ensure all windows remain always-on-top after interaction mode change
    this.enforceAlwaysOnTopForAllWindows();
    
    return this.isInteractive;
  }

  // New method to enforce always-on-top for all windows
  enforceAlwaysOnTopForAllWindows() {
    this.windows.forEach((window, type) => {
      if (!window.isDestroyed()) {
        try {
          if (process.platform === 'darwin') {
            // Try multiple levels for macOS
            window.setAlwaysOnTop(true, 'pop-up-menu', 1);
            
            setTimeout(() => {
              if (!window.isDestroyed()) {
                window.setAlwaysOnTop(true, 'floating', 1);
              }
            }, 100);
            
            setTimeout(() => {
              if (!window.isDestroyed()) {
                window.setAlwaysOnTop(true, 'screen-saver', 1);
              }
            }, 200);
          } else {
            // Windows and Linux
            window.setAlwaysOnTop(true);
            
            // Additional enforcement after a short delay
            setTimeout(() => {
              if (!window.isDestroyed()) {
                window.setAlwaysOnTop(true);
              }
            }, 100);
          }
        } catch (error) {
          logger.warn('Error enforcing always-on-top', { 
            type, 
            error: error.message 
          });
          // Fallback to basic always-on-top
          try {
            window.setAlwaysOnTop(true);
          } catch (fallbackError) {
            logger.error('Fallback always-on-top failed', { 
              type, 
              error: fallbackError.message 
            });
          }
        }
      }
    });
    
    logger.debug('Enforced always-on-top for all windows with aggressive strategy', {
      platform: process.platform,
      windowCount: this.windows.size
    });
  }

  // Public method to manually enforce always-on-top for all windows
  forceAlwaysOnTopForAllWindows() {
    this.enforceAlwaysOnTopForAllWindows();
    logger.info('Manually enforced always-on-top for all windows');
  }

  // Debug method to test and verify always-on-top functionality
  testAlwaysOnTopForAllWindows() {
    const results = {};
    
    this.windows.forEach((window, type) => {
      if (!window.isDestroyed()) {
        try {
          const isAlwaysOnTop = window.isAlwaysOnTop();
          
          if (process.platform === 'darwin') {
            // Test different levels on macOS
            window.setAlwaysOnTop(true, 'screen-saver', 2);
            setTimeout(() => {
              if (!window.isDestroyed()) {
                window.setAlwaysOnTop(true, 'pop-up-menu', 2);
                setTimeout(() => {
                  if (!window.isDestroyed()) {
                    window.setAlwaysOnTop(true, 'floating', 2);
                  }
                }, 50);
              }
            }, 50);
          } else {
            // For other platforms
            window.setAlwaysOnTop(true);
            setTimeout(() => {
              if (!window.isDestroyed()) {
                window.setAlwaysOnTop(true);
              }
            }, 50);
          }
          
          results[type] = {
            success: true,
            isAlwaysOnTop: isAlwaysOnTop,
            isVisible: window.isVisible(),
            isDestroyed: window.isDestroyed()
          };
          
        } catch (error) {
          results[type] = {
            success: false,
            error: error.message,
            isDestroyed: window.isDestroyed()
          };
        }
      } else {
        results[type] = {
          success: false,
          error: 'Window is destroyed'
        };
      }
    });
    
    logger.info('Always-on-top test results', { 
      platform: process.platform,
      results 
    });
    
    return results;
  }

  showSettings() {
    if (this.isScreenBeingShared) return;

    const settingsWindow = this.windows.get('settings');
    if (settingsWindow) {
      this.showOnCurrentDesktop(settingsWindow);
      this.centerWindow(settingsWindow); // This now positions at top-center
      
      // Notify that settings window is shown
      setTimeout(() => {
        settingsWindow.webContents.send('settings-window-shown');
      }, 50);
      
      logger.info('Settings window displayed at top');
    }
  }

  hideSettings() {
    const settingsWindow = this.windows.get('settings');
    if (settingsWindow) {
      settingsWindow.hide();
    }
  }

  centerWindow(window) {
    const display = this.currentDisplay || screen.getPrimaryDisplay();
    const { x: displayX, y: displayY, width: screenWidth, height: screenHeight } = display.workArea || display.workAreaSize;
    const [windowWidth, windowHeight] = window.getSize();
    
    // Center horizontally but position at top
    const topMargin = 20;
    const x = displayX + Math.round((screenWidth - windowWidth) / 2);
    const y = displayY + topMargin;
    
    window.setPosition(x, y);
    
    logger.debug('Positioned window at top-center', {
      position: `${x},${y}`,
      topMargin,
      display: display.id || 'primary'
    });
  }

  broadcastToAllWindows(channel, data) {
    const windowStates = {};
    
    this.windows.forEach((window, type) => {
      if (!window.isDestroyed()) {
        window.webContents.send(channel, data);
        windowStates[type] = {
          isVisible: window.isVisible(),
          isDestroyed: window.isDestroyed(),
          hasWebContents: !!window.webContents
        };
      } else {
        windowStates[type] = { isDestroyed: true };
      }
    });
    
    logger.info('Broadcast sent to all windows', { 
      channel, 
      windowCount: this.windows.size,
      windowStates,
      dataKeys: data ? Object.keys(data) : [],
      // Fixed: Check for 'content' instead of 'response' to match actual data structure
      dataPreview: data && data.content ? data.content.substring(0, 50) + '...' : 
                   data && data.response ? data.response.substring(0, 50) + '...' : 'No response'
    });
  }

  getWindow(type) {
    return this.windows.get(type);
  }

  getActiveWindow() {
    return this.windows.get(this.activeWindow);
  }

  getWindowStats() {
    const stats = {};
    
    this.windows.forEach((window, type) => {
      stats[type] = {
        isVisible: window.isVisible(),
        isFocused: window.isFocused(),
        position: window.getPosition(),
        size: window.getSize()
      };
    });
    
    return {
      windows: stats,
      activeWindow: this.activeWindow,
      isInteractive: this.isInteractive,
      isVisible: this.isVisible,
      isScreenBeingShared: this.isScreenBeingShared
    };
  }

  destroyAllWindows() {
    this.windows.forEach((window, type) => {
      logger.debug('Destroying window', { type });
      if (!window.isDestroyed()) {
        window.destroy();
      }
    });
    
    this.windows.clear();
    
    // Clean up all watchers
    if (this.screenWatcher) {
      clearInterval(this.screenWatcher);
      this.screenWatcher = null;
    }
    
    if (this.desktopWatcher) {
      clearInterval(this.desktopWatcher);
      this.desktopWatcher = null;
    }

    if (this.screenSharingWatcher) {
      clearInterval(this.screenSharingWatcher);
      this.screenSharingWatcher = null;
    }
    
    logger.info('All windows destroyed');
  }

  setupScreenTracking() {
    // Initialize with current cursor position to get the active display
    const cursorPoint = screen.getCursorScreenPoint();
    this.currentDisplay = screen.getDisplayNearestPoint(cursorPoint);
    
    screen.on('display-added', () => {
      logger.debug('Display added');
      this.handleDisplayChange();
    });

    screen.on('display-removed', () => {
      logger.debug('Display removed');
      this.handleDisplayChange();
    });

    screen.on('display-metrics-changed', () => {
      logger.debug('Display metrics changed');
      this.handleDisplayChange();
    });

    // More frequent tracking during initialization
    this.screenWatcher = setInterval(() => {
      this.trackActiveScreen();
    }, 2000);

    // SIMPLIFIED desktop tracking
    this.setupDesktopTracking();

    logger.info('Screen and desktop tracking initialized', {
      currentDisplay: this.currentDisplay.id,
      cursorPosition: cursorPoint
    });
  }

  handleDisplayChange() {
    setTimeout(() => {
      this.moveWindowsToActiveScreen();
    }, 500);
  }

  trackActiveScreen() {
    if (this.isScreenBeingShared) return;

    const cursorPoint = screen.getCursorScreenPoint();
    const activeDisplay = screen.getDisplayNearestPoint(cursorPoint);
    
    if (!this.currentDisplay || activeDisplay.id !== this.currentDisplay.id) {
      this.currentDisplay = activeDisplay;
      this.moveWindowsToActiveScreen();
      
      logger.debug('Active screen changed', {
        displayId: activeDisplay.id,
        bounds: activeDisplay.bounds
      });
    }
  }

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
        if (process.platform === 'darwin') { window.setAlwaysOnTop(true, 'screen-saver', 1); }
        else { window.setAlwaysOnTop(true); }
        if (window.isVisible()) this.showOnCurrentDesktop(window);
      }
    });
  }

  setupDesktopTracking() {
    // MUCH less aggressive desktop tracking
    this.desktopWatcher = setInterval(() => {
      this.trackDesktopChanges();
    }, 10000); // Changed from 1500ms to 10000ms (10 seconds)

    logger.info('Desktop tracking initialized');
  }

  trackDesktopChanges() {
    if (this.isScreenBeingShared) return;

    // Simplified tracking - just log changes
    if (process.platform === 'darwin') {
      const cursorPoint = screen.getCursorScreenPoint();
      const currentSpaceSignature = `${cursorPoint.x}_${cursorPoint.y}`;
      
      if (this.lastActiveSpace && this.lastActiveSpace !== currentSpaceSignature) {
        logger.debug('Desktop space might have changed');
      }
      
      this.lastActiveSpace = currentSpaceSignature;
    }
  }

  // REMOVED all the aggressive enforcement methods that were causing flickering:
  // - handlePossibleSpaceChange()
  // - handleSpaceChange() 
  // - ensureWindowVisibility()
  // - enforceWindowProperties()
  // - enforceAllWindowProperties()
  // - enforceAlwaysOnTop()

  // Public methods for manual screen sharing control
  enableScreenSharingMode() {
    this.startScreenSharingMode();
  }

  disableScreenSharingMode() {
    this.stopScreenSharingMode();
  }

  isInScreenSharingMode() {
    return this.isScreenBeingShared;
  }

  broadcastSkillChange(skill) {
    this.windows.forEach((window, type) => {
      if (!window.isDestroyed()) {
        window.webContents.send('skill-changed', { skill });
      }
    });

    logger.info('Skill change broadcasted to all windows', {
      skill,
      windowCount: this.windows.size
    });
  }

  // Session lifecycle methods

  startSession() {
    if (this.sessionState === 'active') return;
    this.sessionState = 'active';
    const mainWin = this.windows.get('main');
    if (mainWin) this.showOnCurrentDesktop(mainWin);
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
    const mainWin = this.windows.get('main');
    if (mainWin) this.showOnCurrentDesktop(mainWin);
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
}

module.exports = new WindowManager();
