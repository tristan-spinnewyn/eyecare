'use strict';

const path = require('path');
const { app, BrowserWindow, ipcMain, dialog, nativeTheme } = require('electron');

const { TimerService, State } = require('./timerService');
const { SettingsService, DEFAULT_SETTINGS } = require('./settingsService');
const { StatsService, completedBreaks, focusScore, analysisKeyFor } = require('./statsService');
const { I18n } = require('./i18n');
const { TrayManager } = require('./trayManager');
const { NotificationService } = require('./notificationService');
const { AudioService } = require('./audioService');
const { ActivityDetector } = require('./activityDetector');
const { AutostartService } = require('./autostartService');
const { OverlayManager } = require('./overlayManager');

const ROOT_DIR = path.join(__dirname, '..', '..');
const LOCALES_DIR = path.join(ROOT_DIR, 'locales');
const SOUNDS_DIR = path.join(ROOT_DIR, 'assets', 'sounds');
const PRELOAD_PATH = path.join(__dirname, '..', 'preload', 'preload.js');
const MAIN_HTML = path.join(__dirname, '..', 'renderer', 'views', 'index.html');
const OVERLAY_HTML = path.join(__dirname, '..', 'renderer', 'views', 'overlay.html');

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let trayManager = null;
let isQuitting = false;

const settingsService = new SettingsService(app.getPath('userData'));
const settings = settingsService.load();

const i18n = new I18n(LOCALES_DIR);
i18n.setLanguage(settings.language, app.getLocale());

const audioService = new AudioService(SOUNDS_DIR, () => (mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : null));
audioService.setVolume(settings.volume);

const timerService = new TimerService(settingsService);
const notificationService = new NotificationService(settingsService, i18n);
const statsService = new StatsService(settingsService, path.join(app.getPath('userData'), 'stats'));
const autostartService = new AutostartService();
const activityDetector = new ActivityDetector(timerService);

const overlayManager = new OverlayManager({
  getStrictMode: () => settingsService.getSettings().strictMode,
  getPenaltySeconds: () => timerService.appliedPenaltySeconds,
  i18n,
  preloadPath: PRELOAD_PATH,
  htmlPath: OVERLAY_HTML,
  onRequestHide: () => overlayManager.hide(),
});

// --- Window management (mirrors Platform.setImplicitExit(false): closing the
// window hides it, the app keeps running from the tray until Quit is chosen) ---

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 860,
    minHeight: 600,
    show: false,
    backgroundColor: effectiveDarkTheme() ? '#0F1117' : '#F0F2F7',
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.loadFile(MAIN_HTML);
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function broadcast(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function effectiveDarkTheme() {
  const s = settingsService.getSettings();
  return s.systemTheme ? nativeTheme.shouldUseDarkColors : s.darkTheme;
}

function broadcastTheme() {
  broadcast('theme:changed', { dark: effectiveDarkTheme() });
}

// --- Timer wiring — mirrors App.java's timer state-change listener: drives
// stats recording and the strict-mode overlay off transitions between states ---

let previousTimerState = timerService.state;

timerService.on('state', (newState) => {
  const oldState = previousTimerState;
  previousTimerState = newState;

  if (newState === State.BREAK_COUNTDOWN) {
    statsService.onBreakStarted();
    if (settingsService.getSettings().strictMode) {
      overlayManager.show(timerService.getBreakDurationSeconds());
    }
  }
  if (newState === State.PAUSED && overlayManager.isShowing()) {
    overlayManager.pause();
  }
  if (oldState === State.PAUSED && newState === State.BREAK_COUNTDOWN && overlayManager.isShowing()) {
    overlayManager.resume();
  }
  if (oldState === State.BREAK_COUNTDOWN && newState === State.AWAITING_ACTIVITY) {
    const { streak, isNewRecord } = statsService.onBreakCompleted();
    if (isNewRecord) notificationService.sendStreakNotification(streak);
    overlayManager.hide();
  }
  if (oldState === State.AWAITING_BREAK && newState === State.WORK_COUNTDOWN) {
    statsService.onBreakSkipped();
  }

  broadcast('timer:state', newState);
});

timerService.on('tick', (payload) => broadcast('timer:tick', payload));
timerService.on('penalty', (payload) => broadcast('timer:penalty', payload));

timerService.on('notify', ({ type }) => {
  switch (type) {
    case 'workDone':
      notificationService.sendWorkDoneNotification();
      audioService.play(settingsService.getSettings().alertSound);
      break;
    case 'breakDone':
      notificationService.sendBreakDoneNotification();
      audioService.play(settingsService.getSettings().breakDoneSound);
      break;
    case 'reminder':
      notificationService.sendReminderNotification();
      break;
  }
});

// --- Settings side effects — applies the parts of a saved settings change
// that other services need to react to immediately ---

function applySettingsSideEffects(previous, next) {
  audioService.setVolume(next.volume);
  autostartService.setEnabled(next.autostartEnabled);

  if (previous.language !== next.language) {
    i18n.setLanguage(next.language, app.getLocale());
    broadcast('i18n:changed', { language: i18n.getLanguage(), bundle: i18n.getBundle() });
    trayManager?.applyLocale();
  }
  if (previous.systemTheme !== next.systemTheme || previous.darkTheme !== next.darkTheme) {
    broadcastTheme();
  }
  if (previous.workDurationMinutes !== next.workDurationMinutes
      || previous.breakDurationSeconds !== next.breakDurationSeconds) {
    timerService.applySettings();
  }
}

// --- Stats summarisation for IPC responses (plain, JSON-serialisable shapes) ---

function summarizeDay(day) {
  return {
    date: day.date,
    completedBreaks: completedBreaks(day),
    targetBreaks: day.targetBreaks,
    focusScore: focusScore(day),
  };
}

function summarizeWeek(report) {
  const days = report.days.map(summarizeDay);
  const totalCompleted = days.reduce((sum, d) => sum + d.completedBreaks, 0);
  const totalTarget = days.reduce((sum, d) => sum + d.targetBreaks, 0);
  return {
    weekStart: report.weekStart,
    days,
    currentStreak: report.currentStreak,
    vitalityScore: report.vitalityScore,
    totalCompleted,
    totalTarget,
    analysisKey: analysisKeyFor(report.vitalityScore),
  };
}

async function exportReport(format, weekOffset) {
  const monday = statsService.weekStartForOffset(weekOffset);
  const isPdf = format === 'pdf';
  const titleKey = isPdf ? 'stats.export_dialog_title' : 'stats.export_csv_dialog';
  const filenameKey = isPdf ? 'stats.export_filename' : 'stats.export_csv_filename';
  const filterKey = isPdf ? 'stats.export_filter' : 'stats.export_csv_filter';
  const ext = isPdf ? 'pdf' : 'csv';

  const result = await dialog.showSaveDialog(mainWindow, {
    title: i18n.t(titleKey),
    defaultPath: i18n.t(filenameKey, monday),
    filters: [{ name: i18n.t(filterKey), extensions: [ext] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };

  const t = (key, ...args) => i18n.t(key, ...args);
  if (isPdf) await statsService.exportToPdf(result.filePath, monday, t);
  else statsService.exportToCsv(result.filePath, monday, t);
  return { canceled: false, filePath: result.filePath };
}

// --- IPC handlers — must match the contract exposed by preload.js ---

function registerIpcHandlers() {
  ipcMain.handle('timer:start', () => { timerService.start(); return timerService.getSnapshot(); });
  ipcMain.handle('timer:startBreak', () => { timerService.startBreak(); return timerService.getSnapshot(); });
  ipcMain.handle('timer:skipCycle', () => { timerService.skipCycle(); return timerService.getSnapshot(); });
  ipcMain.handle('timer:pause', () => { timerService.pause(); return timerService.getSnapshot(); });
  ipcMain.handle('timer:resume', () => { timerService.resume(); return timerService.getSnapshot(); });
  ipcMain.handle('timer:reset', () => { timerService.reset(); return timerService.getSnapshot(); });
  ipcMain.handle('timer:getSnapshot', () => timerService.getSnapshot());

  ipcMain.handle('settings:get', () => settingsService.getSettings());
  ipcMain.handle('settings:defaults', () => DEFAULT_SETTINGS);
  ipcMain.handle('settings:save', (event, partialSettings) => {
    const previous = settingsService.getSettings();
    const next = { ...previous, ...partialSettings };
    settingsService.save(next);
    applySettingsSideEffects(previous, next);
    return next;
  });

  ipcMain.handle('sounds:list', () => audioService.getAvailableSounds(i18n.t('audio.default_sound')));
  ipcMain.handle('sounds:preview', (event, name, volume) => audioService.preview(name, volume));

  ipcMain.handle('stats:today', () => summarizeDay(statsService.getTodayStats()));
  ipcMain.handle('stats:weekly', (event, weekOffset = 0) => summarizeWeek(statsService.getWeeklyReport(statsService.weekStartForOffset(weekOffset))));
  ipcMain.handle('stats:lastFourWeeks', () => statsService.getLastFourWeeklyReports().map(summarizeWeek));
  ipcMain.handle('stats:bestStreak', () => statsService.getBestStreak());
  ipcMain.handle('stats:exportPdf', (event, weekOffset = 0) => exportReport('pdf', weekOffset));
  ipcMain.handle('stats:exportCsv', (event, weekOffset = 0) => exportReport('csv', weekOffset));

  ipcMain.handle('i18n:getBundle', () => ({ language: i18n.getLanguage(), bundle: i18n.getBundle() }));
  ipcMain.handle('theme:get', () => ({ dark: effectiveDarkTheme() }));
  ipcMain.handle('autostart:isEnabled', () => autostartService.isEnabled());

  ipcMain.on('window:show', () => showMainWindow());
  ipcMain.on('overlay:requestHide', () => overlayManager.requestHide());
}

// --- App lifecycle ---

app.on('second-instance', () => showMainWindow());

app.whenReady().then(() => {
  registerIpcHandlers();

  createMainWindow();

  trayManager = new TrayManager(timerService, i18n, () => showMainWindow(), () => app.quit());
  trayManager.initialize();

  nativeTheme.on('updated', () => {
    if (settingsService.getSettings().systemTheme) broadcastTheme();
  });

  activityDetector.start();
  timerService.start();

  app.on('activate', () => showMainWindow());
});

app.on('window-all-closed', () => {
  // Eyecare keeps running from the tray — only `Quit` from the tray menu exits.
});

app.on('before-quit', () => {
  isQuitting = true;
  activityDetector.shutdown();
  timerService.shutdown();
  overlayManager.hide();
  trayManager?.destroy();
});
