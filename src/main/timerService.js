'use strict';

const { EventEmitter } = require('events');

const REMINDER_INTERVAL_MS = 10 * 60 * 1000;

/** @enum {string} */
const State = Object.freeze({
  IDLE: 'IDLE',
  WORK_COUNTDOWN: 'WORK_COUNTDOWN',
  AWAITING_BREAK: 'AWAITING_BREAK',
  BREAK_COUNTDOWN: 'BREAK_COUNTDOWN',
  PAUSED: 'PAUSED',
  // Break is over; waiting for mouse/keyboard activity before restarting the work cycle.
  AWAITING_ACTIVITY: 'AWAITING_ACTIVITY',
});

/**
 * Drives the 20-20-20 work/break cycle. Mirrors the Java TimerService state
 * machine; runs on the main-process event loop (single-threaded, so no
 * scheduler/locking needed — setInterval stands in for the scheduled executor).
 *
 * Emits:
 *   'state'   (State)
 *   'tick'    ({ remainingSeconds, totalSeconds })
 *   'penalty' ({ appliedPenaltySeconds, pendingPenaltySeconds })
 *   'notify'  ({ type: 'workDone' | 'breakDone' | 'reminder' })
 */
class TimerService extends EventEmitter {
  constructor(settingsService) {
    super();
    this.settingsService = settingsService;

    this.state = State.IDLE;
    this.stateBeforePause = State.IDLE;
    this.remainingSeconds = 0;
    this.totalSeconds = 0;
    this.appliedPenaltySeconds = 0;
    this.pendingPenaltySeconds = 0;

    /** Timestamp (ms) when AWAITING_BREAK started; 0 outside that state. */
    this.awaitingBreakStartMs = 0;
    /** Timestamp (ms) when BREAK_COUNTDOWN was paused; 0 when not paused during break. */
    this.breakPauseStartMs = 0;
    /** Base break duration set at break start, used to recompute totalSeconds on penalty. */
    this.breakBaseDurationSec = 0;

    this._tickTimer = null;
    this._reminderTimer = null;
    this._penaltyTimer = null;
  }

  get _settings() {
    return this.settingsService.getSettings();
  }

  // --- Public API ---

  start() {
    this._startWorkCycle();
  }

  startBreak() {
    // Works from WORK_COUNTDOWN (early break) or AWAITING_BREAK
    if (this.state === State.BREAK_COUNTDOWN || this.state === State.IDLE || this.state === State.PAUSED) return;
    this._cancelTick();
    this._cancelReminders();
    this._cancelPenaltyTick();

    // Penalty: 1 extra second per minute of delay (floored)
    const penaltySec = this.awaitingBreakStartMs > 0
      ? Math.floor((Date.now() - this.awaitingBreakStartMs) / 60_000)
      : 0;
    this.awaitingBreakStartMs = 0;

    const breakSecs = this._settings.breakDurationSeconds + penaltySec;
    this.breakBaseDurationSec = this._settings.breakDurationSeconds;
    this.breakPauseStartMs = 0;
    this.appliedPenaltySeconds = penaltySec;
    this._emitPenalty();
    this._setState(State.BREAK_COUNTDOWN);
    this._startTick(breakSecs);
  }

  skipCycle() {
    if (this.state !== State.AWAITING_BREAK) return;
    this._cancelReminders();
    this._cancelPenaltyTick();
    this.awaitingBreakStartMs = 0;
    this._startWorkCycle();
  }

  /** Suspends the countdown. Works from WORK_COUNTDOWN, AWAITING_BREAK, or BREAK_COUNTDOWN. */
  pause() {
    if (this.state !== State.WORK_COUNTDOWN && this.state !== State.AWAITING_BREAK
        && this.state !== State.BREAK_COUNTDOWN) return;
    this._cancelTick();
    this._cancelReminders();
    this.stateBeforePause = this.state;
    // Record when the break countdown was paused, to add penalty on resume.
    if (this.state === State.BREAK_COUNTDOWN) {
      this.breakPauseStartMs = Date.now();
    }
    this._setState(State.PAUSED);
  }

  /** Resumes the countdown from where it was paused. */
  resume() {
    if (this.state !== State.PAUSED) return;
    // Add 1 second per minute the break was paused.
    if (this.stateBeforePause === State.BREAK_COUNTDOWN && this.breakPauseStartMs > 0) {
      const extraSec = Math.floor((Date.now() - this.breakPauseStartMs) / 60_000);
      this.breakPauseStartMs = 0;
      if (extraSec > 0) {
        this.remainingSeconds += extraSec;
        this.appliedPenaltySeconds += extraSec;
        this.totalSeconds = this.breakBaseDurationSec + this.appliedPenaltySeconds;
        this._emitPenalty();
        this._emitTick();
      }
    }
    const previous = this.stateBeforePause;
    this._setState(previous);
    if (previous === State.WORK_COUNTDOWN || previous === State.BREAK_COUNTDOWN) {
      this._resumeTick();
    } else if (previous === State.AWAITING_BREAK) {
      this._scheduleReminders();
    }
  }

  /** Resets the timer to a fresh work cycle. Only works from PAUSED. */
  reset() {
    if (this.state !== State.PAUSED) return;
    this._cancelTick();
    this._cancelReminders();
    this._startWorkCycle();
  }

  /** Called by the activity detector when PC activity is detected after a break. */
  notifyActivity() {
    if (this.state === State.AWAITING_ACTIVITY) {
      this._startWorkCycle();
    }
  }

  /** Restarts the work cycle immediately so a new work/break duration takes effect. */
  applySettings() {
    if (this.state === State.WORK_COUNTDOWN || this.state === State.AWAITING_BREAK) {
      this._cancelTick();
      this._cancelReminders();
      this._startWorkCycle();
    }
  }

  shutdown() {
    this._cancelTick();
    this._cancelReminders();
    this._cancelPenaltyTick();
  }

  /** Penalty seconds accumulated since entering AWAITING_BREAK (0 when outside that state). */
  getPenaltySeconds() {
    return this.awaitingBreakStartMs > 0
      ? Math.floor((Date.now() - this.awaitingBreakStartMs) / 60_000)
      : 0;
  }

  getBreakDurationSeconds() {
    return this._settings.breakDurationSeconds;
  }

  getSnapshot() {
    return {
      state: this.state,
      remainingSeconds: this.remainingSeconds,
      totalSeconds: this.totalSeconds,
      appliedPenaltySeconds: this.appliedPenaltySeconds,
      pendingPenaltySeconds: this.pendingPenaltySeconds,
      breakDurationSeconds: this.getBreakDurationSeconds(),
    };
  }

  // --- Internal logic ---

  _startWorkCycle() {
    this.awaitingBreakStartMs = 0;
    this.breakPauseStartMs = 0;
    this.breakBaseDurationSec = 0;
    this._cancelPenaltyTick();
    this.appliedPenaltySeconds = 0;
    this.pendingPenaltySeconds = 0;
    this._emitPenalty();
    this._setState(State.WORK_COUNTDOWN);
    const totalSecs = this._settings.workDurationMinutes * 60;
    this._startTick(totalSecs);
  }

  _startTick(totalSecs) {
    this._cancelTick();
    this.remainingSeconds = totalSecs;
    this.totalSeconds = totalSecs;
    this._emitTick();
    this._scheduleTickTimer();
  }

  /** Restarts the tick without resetting remainingSeconds (used after resume). */
  _resumeTick() {
    this._cancelTick();
    this._scheduleTickTimer();
  }

  _scheduleTickTimer() {
    this._tickTimer = setInterval(() => {
      this.remainingSeconds -= 1;
      this._emitTick();
      if (this.remainingSeconds <= 0) {
        this._cancelTick();
        this._onCountdownDone();
      }
    }, 1000);
  }

  _onCountdownDone() {
    if (this.state === State.WORK_COUNTDOWN) {
      this.awaitingBreakStartMs = Date.now();
      this._setState(State.AWAITING_BREAK);
      this._startPenaltyTick();
      // Fire the alert as early as possible; isolate from scheduleReminders so a
      // failure in one can't prevent the other from running.
      this.emit('notify', { type: 'workDone' });
      this._scheduleReminders();
    } else if (this.state === State.BREAK_COUNTDOWN) {
      this.emit('notify', { type: 'breakDone' });
      // Wait for PC activity before restarting the work cycle.
      this._setState(State.AWAITING_ACTIVITY);
    }
  }

  _scheduleReminders() {
    this._reminderTimer = setInterval(() => {
      if (this.state === State.AWAITING_BREAK) {
        this.emit('notify', { type: 'reminder' });
      }
    }, REMINDER_INTERVAL_MS);
  }

  _startPenaltyTick() {
    this._cancelPenaltyTick();
    this.pendingPenaltySeconds = 0;
    this._emitPenalty();
    this._penaltyTimer = setInterval(() => {
      this.pendingPenaltySeconds = this.getPenaltySeconds();
      this._emitPenalty();
    }, 1000);
  }

  _cancelTick() {
    if (this._tickTimer) { clearInterval(this._tickTimer); this._tickTimer = null; }
  }

  _cancelReminders() {
    if (this._reminderTimer) { clearInterval(this._reminderTimer); this._reminderTimer = null; }
  }

  _cancelPenaltyTick() {
    if (this._penaltyTimer) { clearInterval(this._penaltyTimer); this._penaltyTimer = null; }
  }

  _setState(state) {
    this.state = state;
    this.emit('state', state);
  }

  _emitTick() {
    this.emit('tick', { remainingSeconds: this.remainingSeconds, totalSeconds: this.totalSeconds });
  }

  _emitPenalty() {
    this.emit('penalty', {
      appliedPenaltySeconds: this.appliedPenaltySeconds,
      pendingPenaltySeconds: this.pendingPenaltySeconds,
    });
  }
}

module.exports = { TimerService, State };
