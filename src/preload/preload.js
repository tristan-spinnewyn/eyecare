'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('eyecare', {
  timer: {
    start: () => ipcRenderer.invoke('timer:start'),
    startBreak: () => ipcRenderer.invoke('timer:startBreak'),
    skipCycle: () => ipcRenderer.invoke('timer:skipCycle'),
    pause: () => ipcRenderer.invoke('timer:pause'),
    resume: () => ipcRenderer.invoke('timer:resume'),
    reset: () => ipcRenderer.invoke('timer:reset'),
    getSnapshot: () => ipcRenderer.invoke('timer:getSnapshot'),
    onState: (cb) => subscribe('timer:state', cb),
    onTick: (cb) => subscribe('timer:tick', cb),
    onPenalty: (cb) => subscribe('timer:penalty', cb),
  },

  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (settings) => ipcRenderer.invoke('settings:save', settings),
    getDefaults: () => ipcRenderer.invoke('settings:defaults'),
  },

  sounds: {
    list: () => ipcRenderer.invoke('sounds:list'),
    preview: (name, volume) => ipcRenderer.invoke('sounds:preview', name, volume),
  },

  stats: {
    today: () => ipcRenderer.invoke('stats:today'),
    weekly: (weekOffset) => ipcRenderer.invoke('stats:weekly', weekOffset),
    lastFourWeeks: () => ipcRenderer.invoke('stats:lastFourWeeks'),
    bestStreak: () => ipcRenderer.invoke('stats:bestStreak'),
    exportPdf: (weekOffset) => ipcRenderer.invoke('stats:exportPdf', weekOffset),
    exportCsv: (weekOffset) => ipcRenderer.invoke('stats:exportCsv', weekOffset),
  },

  i18n: {
    getBundle: () => ipcRenderer.invoke('i18n:getBundle'),
    onChanged: (cb) => subscribe('i18n:changed', cb),
  },

  theme: {
    get: () => ipcRenderer.invoke('theme:get'),
    onChanged: (cb) => subscribe('theme:changed', cb),
  },

  autostart: {
    isEnabled: () => ipcRenderer.invoke('autostart:isEnabled'),
  },

  audio: {
    onPlay: (cb) => subscribe('audio:play', cb),
  },

  overlay: {
    onShow: (cb) => subscribe('overlay:show', cb),
    onHide: (cb) => subscribe('overlay:hide', cb),
    onPause: (cb) => subscribe('overlay:pause', cb),
    onResume: (cb) => subscribe('overlay:resume', cb),
    requestHide: () => ipcRenderer.send('overlay:requestHide'),
  },

  window: {
    show: () => ipcRenderer.send('window:show'),
  },
});
