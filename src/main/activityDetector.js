'use strict';

const { screen } = require('electron');

const POLL_INTERVAL_MS = 1000;

/**
 * Polls the cursor position and, once a break is over (TimerService is in
 * AWAITING_ACTIVITY), restarts the work cycle as soon as the user moves the
 * mouse. Mirrors ActivityDetectorService.java — intentionally limited to the
 * post-break restart; it does NOT auto-pause on idle or session lock.
 */
class ActivityDetector {
  constructor(timerService) {
    this.timerService = timerService;
    this._lastPos = null;
    this._timer = null;
  }

  start() {
    this._timer = setInterval(() => this._check(), POLL_INTERVAL_MS);
  }

  shutdown() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  _check() {
    let pos;
    try {
      pos = screen.getCursorScreenPoint();
    } catch {
      return;
    }
    const moved = this._lastPos != null && (pos.x !== this._lastPos.x || pos.y !== this._lastPos.y);
    this._lastPos = pos;

    if (moved && this.timerService.state === 'AWAITING_ACTIVITY') {
      this.timerService.notifyActivity();
    }
  }
}

module.exports = { ActivityDetector };
