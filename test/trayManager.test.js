import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { TrayManager } from '../src/main/trayManager.js';
import { State } from '../src/main/timerService.js';

describe('TrayManager', () => {
  let timerServiceMock;
  let i18nMock;
  let onOpenMock;
  let onQuitMock;
  let trayManager;

  beforeEach(() => {
    timerServiceMock = new EventEmitter();
    timerServiceMock.state = State.IDLE;
    timerServiceMock.remainingSeconds = 1200;
    timerServiceMock.startBreak = vi.fn();
    timerServiceMock.skipCycle = vi.fn();
    timerServiceMock.pause = vi.fn();
    timerServiceMock.resume = vi.fn();

    i18nMock = {
      t: (key, ...args) => (args.length ? `${key}:${args.join(',')}` : key),
    };
    onOpenMock = vi.fn();
    onQuitMock = vi.fn();

    trayManager = new TrayManager(timerServiceMock, i18nMock, onOpenMock, onQuitMock);
  });

  it('initializes tray with tooltip and context menu', () => {
    trayManager.initialize();
    expect(trayManager.tray).toBeDefined();
    expect(trayManager.tray.tooltip).toBe('tray.tooltip.default');
    expect(trayManager.tray.menu).toBeDefined();

    // Test click on tray calls onOpen
    trayManager.tray.listeners['click'][0]();
    expect(onOpenMock).toHaveBeenCalled();
  });

  it('handles all context menu clicks across different states', () => {
    trayManager.initialize();

    // Open item
    const openItem = trayManager.tray.menu.template.find((i) => i.label === 'tray.open');
    openItem.click();
    expect(onOpenMock).toHaveBeenCalled();

    // Quit item
    const quitItem = trayManager.tray.menu.template.find((i) => i.label === 'tray.quit');
    quitItem.click();
    expect(onQuitMock).toHaveBeenCalled();

    // Switch to AWAITING_BREAK
    timerServiceMock.state = State.AWAITING_BREAK;
    timerServiceMock.emit('state', State.AWAITING_BREAK);

    const startBreakItem = trayManager.tray.menu.template.find((i) => i.label === 'tray.start_break');
    startBreakItem.click();
    expect(timerServiceMock.startBreak).toHaveBeenCalled();

    const skipCycleItem = trayManager.tray.menu.template.find((i) => i.label === 'tray.skip_cycle');
    skipCycleItem.click();
    expect(timerServiceMock.skipCycle).toHaveBeenCalled();

    const pauseItem = trayManager.tray.menu.template.find((i) => i.label === 'tray.pause');
    pauseItem.click();
    expect(timerServiceMock.pause).toHaveBeenCalled();

    // Switch to PAUSED
    timerServiceMock.state = State.PAUSED;
    timerServiceMock.emit('state', State.PAUSED);

    const resumeItem = trayManager.tray.menu.template.find((i) => i.label === 'tray.resume');
    resumeItem.click();
    expect(timerServiceMock.resume).toHaveBeenCalled();
  });

  it('updates tooltip and menu when state changes', () => {
    trayManager.initialize();

    timerServiceMock.state = State.WORK_COUNTDOWN;
    timerServiceMock.remainingSeconds = 1195;
    timerServiceMock.emit('state', State.WORK_COUNTDOWN);
    expect(trayManager.tray.tooltip).toContain('tray.tooltip.work:19:55');

    timerServiceMock.emit('tick');
    expect(trayManager.tray.tooltip).toContain('tray.tooltip.work:19:55');

    timerServiceMock.state = State.AWAITING_BREAK;
    timerServiceMock.emit('state', State.AWAITING_BREAK);
    expect(trayManager.tray.tooltip).toBe('tray.tooltip.awaiting');

    timerServiceMock.state = State.BREAK_COUNTDOWN;
    timerServiceMock.emit('state', State.BREAK_COUNTDOWN);
    expect(trayManager.tray.tooltip).toBe('tray.tooltip.break');

    timerServiceMock.state = State.AWAITING_ACTIVITY;
    timerServiceMock.emit('state', State.AWAITING_ACTIVITY);
    expect(trayManager.tray.tooltip).toBe('tray.tooltip.awaiting_activity');
  });

  it('supports applyLocale and displayMessage', () => {
    trayManager.initialize();
    trayManager.applyLocale();
    expect(trayManager.tray.menu).toBeDefined();

    trayManager.displayMessage('Title', 'Message');
    expect(trayManager.tray.lastBalloon).toEqual({ title: 'Title', content: 'Message' });
  });

  it('destroys tray and removes event listeners', () => {
    trayManager.initialize();
    trayManager.destroy();
    expect(trayManager.tray).toBeNull();
  });
});
