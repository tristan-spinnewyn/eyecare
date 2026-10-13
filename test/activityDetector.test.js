import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ActivityDetector } from '../src/main/activityDetector.js';
import { screen } from 'electron';

describe('ActivityDetector', () => {
  let timerServiceMock;
  let detector;

  beforeEach(() => {
    vi.useFakeTimers();
    timerServiceMock = {
      state: 'AWAITING_ACTIVITY',
      notifyActivity: vi.fn(),
    };
    detector = new ActivityDetector(timerServiceMock);
  });

  afterEach(() => {
    detector.shutdown();
    vi.useRealTimers();
  });

  it('notifies timer service when mouse moves while in AWAITING_ACTIVITY', () => {
    detector.start();

    // First check records initial position
    screen._setCursor({ x: 100, y: 100 });
    vi.advanceTimersByTime(1000);
    expect(timerServiceMock.notifyActivity).not.toHaveBeenCalled();

    // Second check detects movement
    screen._setCursor({ x: 150, y: 200 });
    vi.advanceTimersByTime(1000);
    expect(timerServiceMock.notifyActivity).toHaveBeenCalledTimes(1);
  });

  it('does not notify if state is not AWAITING_ACTIVITY', () => {
    timerServiceMock.state = 'WORK_COUNTDOWN';
    detector.start();

    screen._setCursor({ x: 100, y: 100 });
    vi.advanceTimersByTime(1000);

    screen._setCursor({ x: 200, y: 300 });
    vi.advanceTimersByTime(1000);

    expect(timerServiceMock.notifyActivity).not.toHaveBeenCalled();
  });

  it('shuts down cleanly', () => {
    detector.start();
    detector.shutdown();

    screen._setCursor({ x: 500, y: 500 });
    vi.advanceTimersByTime(2000);

    expect(timerServiceMock.notifyActivity).not.toHaveBeenCalled();
  });
});
