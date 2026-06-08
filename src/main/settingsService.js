'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_SETTINGS = Object.freeze({
  workDurationMinutes: 20,
  breakDurationSeconds: 20,
  alertSound: 'The_Sunlit_Interval',
  breakDoneSound: 'alert',
  strictMode: false,
  darkTheme: false,
  autostartEnabled: false,
  language: 'system',
  volume: 80,
  systemTheme: true,
});

/** Reads/writes settings.json (atomic write via temp file + rename) in the app's userData dir. */
class SettingsService {
  constructor(userDataDir) {
    this._file = path.join(userDataDir, 'settings.json');
    this._current = null;
  }

  load() {
    if (fs.existsSync(this._file)) {
      try {
        const raw = JSON.parse(fs.readFileSync(this._file, 'utf-8'));
        this._current = { ...DEFAULT_SETTINGS, ...raw };
        return this._current;
      } catch (e) {
        console.warn('[SettingsService] Could not read settings.json, falling back to defaults', e);
      }
    }
    this._current = { ...DEFAULT_SETTINGS };
    this.save(this._current);
    return this._current;
  }

  /** Atomic write: write to a temporary file then rename — survives a kill mid-write. */
  save(settings) {
    try {
      fs.mkdirSync(path.dirname(this._file), { recursive: true });
      const tmp = `${this._file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf-8');
      fs.renameSync(tmp, this._file);
      this._current = settings;
    } catch (e) {
      console.error('[SettingsService] Could not save settings', e);
    }
  }

  getSettings() {
    return this._current || this.load();
  }
}

module.exports = { SettingsService, DEFAULT_SETTINGS };
