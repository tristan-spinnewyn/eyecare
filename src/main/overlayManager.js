'use strict';

const path = require('path');
const { BrowserWindow, screen } = require('electron');

/**
 * Break overlay — covers ALL connected displays with a frameless, transparent,
 * always-on-top window each. Mirrors OverlayWindow.java (one Stage per Screen,
 * StageStyle.TRANSPARENT, Escape disabled in strict mode).
 */
class OverlayManager {
  constructor({ getStrictMode, getPenaltySeconds, i18n, preloadPath, htmlPath, onRequestHide }) {
    this.getStrictMode = getStrictMode;
    this.getPenaltySeconds = getPenaltySeconds;
    this.i18n = i18n;
    this.preloadPath = preloadPath;
    this.htmlPath = htmlPath;
    this.onRequestHide = onRequestHide;
    this.windows = [];
  }

  show(durationSeconds) {
    if (this.windows.length > 0) return;

    const strictMode = this.getStrictMode();
    const penaltySeconds = this.getPenaltySeconds();
    const primary = screen.getPrimaryDisplay();

    for (const display of screen.getAllDisplays()) {
      const isPrimary = display.id === primary.id;
      const win = new BrowserWindow({
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height,
        frame: false,
        transparent: true,
        resizable: false,
        movable: false,
        skipTaskbar: true,
        fullscreenable: false,
        hasShadow: false,
        show: false,
        webPreferences: {
          preload: this.preloadPath,
          contextIsolation: true,
        },
      });
      win.setAlwaysOnTop(true, 'screen-saver');
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

      win.webContents.on('did-finish-load', () => {
        win.webContents.send('overlay:show', {
          durationSeconds,
          strictMode,
          penaltySeconds,
          isPrimary,
          language: this.i18n.getLanguage(),
          bundle: this.i18n.getBundle(),
        });
      });
      win.once('ready-to-show', () => win.show());
      win.loadFile(this.htmlPath);

      this.windows.push(win);
    }
  }

  hide() {
    for (const win of this.windows) {
      if (!win.isDestroyed()) win.close();
    }
    this.windows = [];
  }

  pause() {
    this._broadcast('overlay:pause');
  }

  resume() {
    this._broadcast('overlay:resume');
  }

  isShowing() {
    return this.windows.length > 0 && !this.windows[0].isDestroyed();
  }

  /** Called by the renderer (Escape key) — only effective outside strict mode. */
  requestHide() {
    if (!this.getStrictMode()) {
      this.onRequestHide();
    }
  }

  _broadcast(channel, payload) {
    for (const win of this.windows) {
      if (!win.isDestroyed()) win.webContents.send(channel, payload);
    }
  }
}

module.exports = { OverlayManager };
