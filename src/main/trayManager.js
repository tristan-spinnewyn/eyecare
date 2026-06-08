'use strict';

const { Tray, Menu } = require('electron');
const { buildCircleIcon } = require('./trayIcon');
const { State } = require('./timerService');

const ICON_COLORS = {
  [State.WORK_COUNTDOWN]: '#3B82F6',
  [State.AWAITING_BREAK]: '#F59E0B',
  [State.BREAK_COUNTDOWN]: '#10B981',
  [State.PAUSED]: '#9CA3AF',
  [State.AWAITING_ACTIVITY]: '#9CA3AF',
  [State.IDLE]: '#3B82F6',
};

/**
 * System tray icon + context menu, mirroring TrayManager.java: color-coded by
 * timer state, tooltip shows the live countdown, menu actions mirror the
 * dashboard controls.
 */
class TrayManager {
  constructor(timerService, i18n, onOpen, onQuit) {
    this.timerService = timerService;
    this.i18n = i18n;
    this.onOpen = onOpen;
    this.onQuit = onQuit;
    this.tray = null;

    this._onState = (state) => this._refresh(state);
    this._onTick = () => this._refresh(this.timerService.state);
  }

  initialize() {
    this.tray = new Tray(buildCircleIcon(16, ICON_COLORS[State.IDLE]));
    this.tray.setToolTip(this.i18n.t('tray.tooltip.default'));
    this.tray.on('click', () => this.onOpen());

    this.timerService.on('state', this._onState);
    this.timerService.on('tick', this._onTick);

    this._rebuildMenu();
    this._refresh(this.timerService.state);
  }

  /** Reloads menu labels and tooltip after a language change. */
  applyLocale() {
    if (!this.tray) return;
    this._rebuildMenu();
    this._refresh(this.timerService.state);
  }

  displayMessage(title, body) {
    // Notifications are sent through Electron's Notification API (see notificationService);
    // kept here only so callers mirror the Java NotificationService -> TrayManager path.
    if (!this.tray) return;
    this.tray.displayBalloon?.({ title, content: body });
  }

  destroy() {
    this.timerService.off('state', this._onState);
    this.timerService.off('tick', this._onTick);
    this.tray?.destroy();
    this.tray = null;
  }

  // --- Private ---

  _rebuildMenu() {
    const t = (k) => this.i18n.t(k);
    const state = this.timerService.state;
    const awaitingBreak = state === State.AWAITING_BREAK;
    const canPause = state === State.WORK_COUNTDOWN || state === State.AWAITING_BREAK || state === State.PAUSED;

    const menu = Menu.buildFromTemplate([
      { label: t('tray.open'), click: () => this.onOpen() },
      { type: 'separator' },
      {
        label: t('tray.start_break'),
        enabled: awaitingBreak,
        click: () => this.timerService.startBreak(),
      },
      {
        label: t('tray.skip_cycle'),
        enabled: awaitingBreak,
        click: () => this.timerService.skipCycle(),
      },
      {
        label: state === State.PAUSED ? t('tray.resume') : t('tray.pause'),
        enabled: canPause,
        click: () => (state === State.PAUSED ? this.timerService.resume() : this.timerService.pause()),
      },
      { type: 'separator' },
      { label: t('tray.quit'), click: () => this.onQuit() },
    ]);
    this.tray.setContextMenu(menu);
  }

  _refresh(state) {
    if (!this.tray) return;
    this.tray.setImage(buildCircleIcon(16, ICON_COLORS[state] || ICON_COLORS[State.IDLE]));
    this.tray.setToolTip(this._tooltipFor(state));
    // Menu item enabled-state / labels depend on the current state — rebuild on each change.
    this._rebuildMenu();
  }

  _tooltipFor(state) {
    const remaining = formatSeconds(this.timerService.remainingSeconds);
    switch (state) {
      case State.WORK_COUNTDOWN: return this.i18n.t('tray.tooltip.work', remaining);
      case State.AWAITING_BREAK: return this.i18n.t('tray.tooltip.awaiting');
      case State.BREAK_COUNTDOWN: return this.i18n.t('tray.tooltip.break');
      case State.AWAITING_ACTIVITY: return this.i18n.t('tray.tooltip.awaiting_activity');
      default: return this.i18n.t('tray.tooltip.default');
    }
  }
}

function formatSeconds(totalSeconds) {
  const min = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

module.exports = { TrayManager };
