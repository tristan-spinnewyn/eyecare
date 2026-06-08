'use strict';

const fs = require('fs');
const path = require('path');

const SUPPORTED = ['fr', 'en'];

/**
 * Loads locales/<lang>.json and exposes t(key, ...args) with Java
 * String.format-style placeholders (%d, %s, %.0f, %%). "system" resolves to
 * fr if the OS locale is French, en otherwise — same rule as I18nService.java.
 */
class I18n {
  constructor(localesDir) {
    this._localesDir = localesDir;
    this._language = 'en';
    this._bundle = {};
  }

  setLanguage(languageCode, systemLocale) {
    this._language = resolveLocale(languageCode, systemLocale);
    this._bundle = this._loadBundle(this._language);
  }

  getLanguage() {
    return this._language;
  }

  t(key, ...args) {
    const value = lookup(this._bundle, key);
    const template = value !== undefined ? value : key;
    return args.length ? formatTemplate(template, args) : template;
  }

  /** Returns the full bundle (e.g. for sending to the renderer). */
  getBundle() {
    return this._bundle;
  }

  _loadBundle(lang) {
    for (const candidate of [lang, 'fr']) {
      const file = path.join(this._localesDir, `${candidate}.json`);
      if (fs.existsSync(file)) {
        try {
          return JSON.parse(fs.readFileSync(file, 'utf-8'));
        } catch (e) {
          console.warn(`[I18n] Cannot parse ${file}`, e);
        }
      }
    }
    throw new Error(`[I18n] No message bundle found for locale: ${lang}`);
  }
}

function resolveLocale(code, systemLocale) {
  if (code === 'fr' || code === 'en') return code;
  // "system" — auto-detect: French if system locale is French, otherwise English
  return (systemLocale || '').toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

function lookup(bundle, dottedKey) {
  return dottedKey.split('.').reduce((node, part) => {
    if (node === undefined || node === null) return undefined;
    if (Array.isArray(node)) {
      const idx = Number(part);
      return Number.isInteger(idx) ? node[idx] : undefined;
    }
    return node[part];
  }, bundle);
}

/** Minimal printf-style formatter covering the placeholders used in the bundles: %d %s %.0f %%. */
function formatTemplate(template, args) {
  if (typeof template !== 'string') return template;
  let i = 0;
  return template.replace(/%(\.\d+)?[dsf]|%%/g, (match) => {
    if (match === '%%') return '%';
    const value = args[i++];
    if (match.startsWith('%.')) return Number(value).toFixed(Number(match.slice(2, -1)));
    if (match === '%d') return String(Math.trunc(Number(value)));
    return String(value);
  });
}

module.exports = { I18n, SUPPORTED };
