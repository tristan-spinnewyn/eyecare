import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OverlayManager } from '../src/main/overlayManager.js';

describe('OverlayManager', () => {
  let onRequestHideMock;
  let i18nMock;
  let overlayManager;
  let strictModeValue;

  beforeEach(() => {
    strictModeValue = false;
    onRequestHideMock = vi.fn();
    i18nMock = {
      getLanguage: () => 'fr',
      getBundle: () => ({ overlay: { title: 'Test' } }),
    };
    overlayManager = new OverlayManager({
      getStrictMode: () => strictModeValue,
      getPenaltySeconds: () => 0,
      i18n: i18nMock,
      preloadPath: '/preload.js',
      htmlPath: '/overlay.html',
      onRequestHide: onRequestHideMock,
    });
  });

  it('shows overlay windows for all displays with always on top and correct event payload', () => {
    overlayManager.show(20);
    expect(overlayManager.isShowing()).toBe(true);
    expect(overlayManager.windows.length).toBe(2);

    // Call show again while already showing (noop branch)
    overlayManager.show(20);
    expect(overlayManager.windows.length).toBe(2);

    const primaryWin = overlayManager.windows[0];
    expect(primaryWin.visible).toBe(true);
    expect(primaryWin.loadedFile).toBe('/overlay.html');

    // Trigger did-finish-load handler
    primaryWin.webContents.handlers['did-finish-load']();
    expect(primaryWin.webContents.lastSent.channel).toBe('overlay:show');
    expect(primaryWin.webContents.lastSent.payload.durationSeconds).toBe(20);
  });

  it('broadcasts pause and resume to all overlay windows', () => {
    overlayManager.show(20);

    overlayManager.pause();
    expect(overlayManager.windows[0].webContents.lastSent.channel).toBe('overlay:pause');

    overlayManager.resume();
    expect(overlayManager.windows[0].webContents.lastSent.channel).toBe('overlay:resume');
  });

  it('hides and destroys all overlay windows', () => {
    overlayManager.show(20);
    expect(overlayManager.isShowing()).toBe(true);

    overlayManager.hide();
    expect(overlayManager.isShowing()).toBe(false);
    expect(overlayManager.windows.length).toBe(0);
  });

  it('respects strict mode when requestHide is called', () => {
    strictModeValue = false;
    overlayManager.requestHide();
    expect(onRequestHideMock).toHaveBeenCalledTimes(1);

    strictModeValue = true;
    overlayManager.requestHide();
    expect(onRequestHideMock).toHaveBeenCalledTimes(1); // not called again
  });
});
