import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { SettingsService, DEFAULT_SETTINGS } from '../src/main/settingsService.js';

describe('SettingsService', () => {
  let tmpDir;
  let service;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eyecare-settings-test-'));
    service = new SettingsService(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads default settings when file does not exist', () => {
    const settings = service.load();
    expect(settings).toEqual(DEFAULT_SETTINGS);
    expect(fs.existsSync(path.join(tmpDir, 'settings.json'))).toBe(true);
  });

  it('merges custom settings with defaults', () => {
    const custom = { workDurationMinutes: 30, strictMode: true };
    fs.writeFileSync(path.join(tmpDir, 'settings.json'), JSON.stringify(custom));

    const loaded = service.load();
    expect(loaded.workDurationMinutes).toBe(30);
    expect(loaded.strictMode).toBe(true);
    expect(loaded.breakDurationSeconds).toBe(DEFAULT_SETTINGS.breakDurationSeconds);
  });

  it('falls back to defaults if settings file is corrupted JSON', () => {
    fs.writeFileSync(path.join(tmpDir, 'settings.json'), '{ invalid json ');
    const loaded = service.load();
    expect(loaded).toEqual(DEFAULT_SETTINGS);
  });

  it('saves settings atomically and persists changes', () => {
    const toSave = { ...DEFAULT_SETTINGS, volume: 50 };
    service.save(toSave);

    const reloadedService = new SettingsService(tmpDir);
    expect(reloadedService.load().volume).toBe(50);
  });

  it('caches current settings in getSettings()', () => {
    const s1 = service.getSettings();
    expect(s1).toEqual(DEFAULT_SETTINGS);

    service.save({ ...DEFAULT_SETTINGS, volume: 10 });
    const s2 = service.getSettings();
    expect(s2.volume).toBe(10);
  });
});
