'use strict';

const { app } = require('electron');

/**
 * Cross-platform autostart via Electron's login-item API — replaces the
 * Windows-only VBScript approach in AutostartService.java (Electron handles
 * Windows registry, macOS Login Items, and Linux .desktop autostart entries).
 */
class AutostartService {
  isEnabled() {
    return app.getLoginItemSettings().openAtLogin;
  }

  setEnabled(enabled) {
    app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true });
  }
}

module.exports = { AutostartService };
