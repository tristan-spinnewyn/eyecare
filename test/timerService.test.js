import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TimerService, State } from '../src/main/timerService.js';

describe('TimerService', () => {
  let settingsServiceMock;
  let timerService;

  beforeEach(() => {
    vi.useFakeTimers();
    settingsServiceMock = {
      getSettings: () => ({
        workDurationMinutes: 20,
        breakDurationSeconds: 20,
      }),
    };
    timerService = new TimerService(settingsServiceMock);
  });

  afterEach(() => {
    timerService.shutdown();
    vi.useRealTimers();
  });

  it('initializes with IDLE state and accurate snapshot', () => {
    const snap = timerService.getSnapshot();
    expect(snap.state).toBe(State.IDLE);
    expect(snap.breakDurationSeconds).toBe(20);
    expect(snap.remainingSeconds).toBe(0);
    expect(timerService.getPenaltySeconds()).toBe(0);
  });

  it('starts work countdown correctly and ticks every second', () => {
    const states = [];
    const ticks = [];
    timerService.on('state', (s) => states.push(s));
    timerService.on('tick', (t) => ticks.push(t));

    timerService.start();
    expect(timerService.state).toBe(State.WORK_COUNTDOWN);
    expect(states).toContain(State.WORK_COUNTDOWN);
    expect(timerService.remainingSeconds).toBe(20 * 60);

    vi.advanceTimersByTime(2000);
    expect(timerService.remainingSeconds).toBe(20 * 60 - 2);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
  });

  it('pauses and resumes work countdown without losing time', () => {
    timerService.start();
    vi.advanceTimersByTime(5000);
    const beforePause = timerService.remainingSeconds;

    timerService.pause();
    expect(timerService.state).toBe(State.PAUSED);

    vi.advanceTimersByTime(10000);
    expect(timerService.remainingSeconds).toBe(beforePause);

    timerService.resume();
    expect(timerService.state).toBe(State.WORK_COUNTDOWN);

    vi.advanceTimersByTime(1000);
    expect(timerService.remainingSeconds).toBe(beforePause - 1);
  });

  it('transitions to AWAITING_BREAK when work timer reaches zero and emits notify', () => {
    const notifications = [];
    timerService.on('notify', (n) => notifications.push(n));

    timerService.start();
    // Advance to end of work cycle
    vi.advanceTimersByTime(20 * 60 * 1000);

    expect(timerService.state).toBe(State.AWAITING_BREAK);
    expect(notifications).toEqual([{ type: 'workDone' }]);
  });

  it('fires reminders and accumulates penalties while in AWAITING_BREAK', () => {
    const notifications = [];
    timerService.on('notify', (n) => notifications.push(n));

    timerService.start();
    vi.advanceTimersByTime(20 * 60 * 1000); // Enter AWAITING_BREAK

    // 10 minutes delay
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(notifications).toContainEqual({ type: 'reminder' });
    expect(timerService.getPenaltySeconds()).toBeGreaterThanOrEqual(10);
  });

  it('starts break with delay penalty and transitions to AWAITING_ACTIVITY when done', () => {
    const notifications = [];
    timerService.on('notify', (n) => notifications.push(n));

    timerService.start();
    vi.advanceTimersByTime(20 * 60 * 1000); // Enter AWAITING_BREAK

    // Wait 2 minutes (2s penalty)
    vi.advanceTimersByTime(2 * 60 * 1000);

    timerService.startBreak();
    expect(timerService.state).toBe(State.BREAK_COUNTDOWN);
    expect(timerService.totalSeconds).toBe(22); // 20s + 2s penalty
    expect(timerService.appliedPenaltySeconds).toBe(2);

    // Complete break
    vi.advanceTimersByTime(22 * 1000);
    expect(timerService.state).toBe(State.AWAITING_ACTIVITY);
    expect(notifications).toContainEqual({ type: 'breakDone' });

    // Activity restarts work cycle
    timerService.notifyActivity();
    expect(timerService.state).toBe(State.WORK_COUNTDOWN);
  });

  it('allows early break during WORK_COUNTDOWN', () => {
    timerService.start();
    vi.advanceTimersByTime(5000);

    timerService.startBreak();
    expect(timerService.state).toBe(State.BREAK_COUNTDOWN);
    expect(timerService.appliedPenaltySeconds).toBe(0);
  });

  it('handles pause and resume during break countdown with pause penalty', () => {
    timerService.start();
    timerService.startBreak();
    expect(timerService.state).toBe(State.BREAK_COUNTDOWN);

    vi.advanceTimersByTime(5000);
    timerService.pause();
    expect(timerService.state).toBe(State.PAUSED);

    // Paused for 2 minutes (adds 2s penalty)
    vi.advanceTimersByTime(2 * 60 * 1000);
    timerService.resume();
    expect(timerService.state).toBe(State.BREAK_COUNTDOWN);
    expect(timerService.appliedPenaltySeconds).toBe(2);
  });

  it('resumes from pause when pause was short (no extra penalty)', () => {
    timerService.start();
    timerService.startBreak();
    timerService.pause();

    // Paused for 10 seconds (no full minute)
    vi.advanceTimersByTime(10 * 1000);
    timerService.resume();
    expect(timerService.state).toBe(State.BREAK_COUNTDOWN);
    expect(timerService.appliedPenaltySeconds).toBe(0);
  });

  it('pauses and resumes from AWAITING_BREAK', () => {
    timerService.start();
    vi.advanceTimersByTime(20 * 60 * 1000);
    expect(timerService.state).toBe(State.AWAITING_BREAK);

    timerService.pause();
    expect(timerService.state).toBe(State.PAUSED);

    timerService.resume();
    expect(timerService.state).toBe(State.AWAITING_BREAK);
  });

  it('guards startBreak against invalid states', () => {
    // IDLE
    timerService.startBreak();
    expect(timerService.state).toBe(State.IDLE);

    // PAUSED
    timerService.start();
    timerService.pause();
    timerService.startBreak();
    expect(timerService.state).toBe(State.PAUSED);

    // BREAK_COUNTDOWN
    timerService.resume();
    timerService.startBreak(); // breaks now
    expect(timerService.state).toBe(State.BREAK_COUNTDOWN);
    timerService.startBreak(); // second call does nothing
    expect(timerService.state).toBe(State.BREAK_COUNTDOWN);
  });

  it('guards skipCycle against invalid states', () => {
    timerService.skipCycle();
    expect(timerService.state).toBe(State.IDLE);

    timerService.start();
    timerService.skipCycle();
    expect(timerService.state).toBe(State.WORK_COUNTDOWN);
  });

  it('skips cycle from AWAITING_BREAK', () => {
    timerService.start();
    vi.advanceTimersByTime(20 * 60 * 1000);
    expect(timerService.state).toBe(State.AWAITING_BREAK);

    timerService.skipCycle();
    expect(timerService.state).toBe(State.WORK_COUNTDOWN);
  });

  it('guards pause and resume against invalid states', () => {
    // Pause from IDLE
    timerService.pause();
    expect(timerService.state).toBe(State.IDLE);

    // Resume from IDLE
    timerService.resume();
    expect(timerService.state).toBe(State.IDLE);
  });

  it('guards reset and notifyActivity against invalid states', () => {
    // Reset from IDLE
    timerService.reset();
    expect(timerService.state).toBe(State.IDLE);

    // notifyActivity outside AWAITING_ACTIVITY
    timerService.notifyActivity();
    expect(timerService.state).toBe(State.IDLE);
  });

  it('resets timer from PAUSED', () => {
    timerService.start();
    timerService.pause();
    timerService.reset();
    expect(timerService.state).toBe(State.WORK_COUNTDOWN);
  });

  it('applies new settings to restart cycle if active, or ignores if inactive', () => {
    // Inactive (IDLE)
    timerService.applySettings();
    expect(timerService.state).toBe(State.IDLE);

    // Active (WORK_COUNTDOWN)
    timerService.start();
    settingsServiceMock.getSettings = () => ({
      workDurationMinutes: 15,
      breakDurationSeconds: 30,
    });
    timerService.applySettings();
    expect(timerService.remainingSeconds).toBe(15 * 60);

    // In AWAITING_BREAK
    vi.advanceTimersByTime(15 * 60 * 1000);
    expect(timerService.state).toBe(State.AWAITING_BREAK);
    timerService.applySettings();
    expect(timerService.state).toBe(State.WORK_COUNTDOWN);
  });
});
