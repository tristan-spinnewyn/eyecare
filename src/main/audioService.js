'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const SUPPORTED_EXTS = ['.mp3', '.wav', '.aac', '.m4a'];

/**
 * Triggers sound playback. The main process has no audio output API, so this
 * mirrors AudioService.java's *selection* logic (find file / list sounds) and
 * delegates actual playback to the renderer's <audio> element via IPC
 * ('audio:play'); the renderer also owns the synthesised-beep fallback
 * (Web Audio oscillator, replacing playTone()).
 */
class AudioService {
  constructor(soundsDir, getWebContents) {
    this.soundsDir = soundsDir;
    this.getWebContents = getWebContents; // () => WebContents | null
    this.volume = 0.8; // 0.0–1.0, default 80%
  }

  setVolume(percent) {
    this.volume = Math.max(0, Math.min(100, percent)) / 100;
  }

  play(soundName) {
    this._send(soundName, this.volume);
  }

  /** Previews a sound, optionally at a not-yet-saved volume (settings form live preview). */
  preview(soundName, volumePercent) {
    const volume = typeof volumePercent === 'number'
      ? Math.max(0, Math.min(100, volumePercent)) / 100
      : this.volume;
    this._send(soundName, volume);
  }

  _send(soundName, volume) {
    const wc = this.getWebContents();
    if (!wc || wc.isDestroyed()) return;
    const file = this._findSound(soundName);
    wc.send('audio:play', {
      fileUrl: file ? pathToFileURL(file).toString() : null,
      volume,
    });
  }

  /** Returns [{ key, label }]: synthesised beep (always present) + audio files found in soundsDir. */
  getAvailableSounds(defaultLabel) {
    const sounds = [];
    const seen = new Set();
    try {
      for (const entry of fs.readdirSync(this.soundsDir).sort()) {
        if (!isSupportedAudio(entry)) continue;
        const key = stripExtension(entry);
        if (seen.has(key)) continue;
        seen.add(key);
        sounds.push({ key, label: titleCase(key) });
      }
    } catch (e) {
      console.warn('[AudioService] Sound scan failed', e);
    }
    if (!seen.has('alert')) sounds.push({ key: 'alert', label: defaultLabel });
    return sounds;
  }

  _findSound(name) {
    for (const ext of SUPPORTED_EXTS) {
      const file = path.join(this.soundsDir, name + ext);
      if (fs.existsSync(file)) return file;
    }
    return null;
  }
}

function isSupportedAudio(fileName) {
  const lower = fileName.toLowerCase();
  return SUPPORTED_EXTS.some((ext) => lower.endsWith(ext));
}

function stripExtension(fileName) {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

function titleCase(key) {
  return key.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

module.exports = { AudioService };
