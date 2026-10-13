import os from 'os';
import path from 'path';

let _loginItemSettings = { openAtLogin: false, openAsHidden: true };

export const app = {
  getPath: (name) => path.join(os.tmpdir(), 'eyecare-test', name || ''),
  getLocale: () => 'fr-FR',
  getLoginItemSettings: () => ({ ..._loginItemSettings }),
  setLoginItemSettings: (opts) => { _loginItemSettings = { ..._loginItemSettings, ...opts }; },
  quit: () => {},
  requestSingleInstanceLock: () => true,
  whenReady: async () => {},
  on: () => {},
};

export class Notification {
  static supported = true;
  static instances = [];

  constructor(options) {
    this.options = options;
    Notification.instances.push(this);
  }

  static isSupported() {
    return Notification.supported;
  }

  show() {
    this.shown = true;
  }
}

export class BrowserWindow {
  constructor(options = {}) {
    this.options = options;
    this._destroyed = false;
    this._alwaysOnTop = false;
    this._visibleWorkspaces = false;
    this.webContents = {
      send: (channel, payload) => {
        this.webContents.lastSent = { channel, payload };
      },
      on: (event, handler) => {
        this.webContents.handlers = this.webContents.handlers || {};
        this.webContents.handlers[event] = handler;
      },
      printToPDF: async () => Buffer.from('%PDF-1.4 test'),
    };
  }

  loadFile(file) { this.loadedFile = file; }
  async loadURL(url) { this.loadedUrl = url; }
  show() { this.visible = true; }
  hide() { this.visible = false; }
  close() { this._destroyed = true; }
  destroy() { this._destroyed = true; }
  isDestroyed() { return this._destroyed; }
  setAlwaysOnTop(flag, level) { this._alwaysOnTop = { flag, level }; }
  setVisibleOnAllWorkspaces(flag, opts) { this._visibleWorkspaces = { flag, opts }; }
  once(event, fn) { if (event === 'ready-to-show') fn(); }
  on() {}
}

let _cursor = { x: 100, y: 100 };
export const screen = {
  getPrimaryDisplay: () => ({ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }),
  getAllDisplays: () => [
    { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
    { id: 2, bounds: { x: 1920, y: 0, width: 1920, height: 1080 } },
  ],
  getCursorScreenPoint: () => ({ ..._cursor }),
  _setCursor: (pos) => { _cursor = { ...pos }; },
};

export class Tray {
  constructor(image) {
    this.image = image;
    this.tooltip = '';
    this.menu = null;
    this.listeners = {};
    this.destroyed = false;
  }

  setToolTip(tip) { this.tooltip = tip; }
  setImage(img) { this.image = img; }
  setContextMenu(menu) { this.menu = menu; }
  displayBalloon(opts) { this.lastBalloon = opts; }
  destroy() { this.destroyed = true; }
  on(event, fn) {
    this.listeners[event] = this.listeners[event] || [];
    this.listeners[event].push(fn);
  }
}

export const Menu = {
  buildFromTemplate: (template) => ({ template }),
};

export const nativeImage = {
  createFromBitmap: (buffer, size) => ({ buffer, size, type: 'bitmap' }),
  createFromBuffer: (buffer) => ({ buffer, type: 'buffer' }),
};

export const nativeTheme = {
  shouldUseDarkColors: true,
  themeSource: 'system',
  on: () => {},
};

export const ipcMain = {
  handlers: {},
  listeners: {},
  handle: (channel, fn) => { ipcMain.handlers[channel] = fn; },
  on: (channel, fn) => { ipcMain.listeners[channel] = fn; },
};

let _dialogResult = { canceled: false, filePath: '/fake/path/test.pdf' };
export const dialog = {
  showSaveDialog: async () => _dialogResult,
  _setResult: (res) => { _dialogResult = res; },
};

export default {
  app,
  Notification,
  BrowserWindow,
  screen,
  Tray,
  Menu,
  nativeImage,
  nativeTheme,
  ipcMain,
  dialog,
};
