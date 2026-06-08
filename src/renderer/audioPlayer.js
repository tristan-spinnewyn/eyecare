'use strict';

// Plays sounds requested by the main process via 'audio:play'. The main
// process has no native audio output API, so it only resolves *which* sound
// to play and delegates actual playback here — through an <audio> element for
// real files, or a synthesised beep (Web Audio oscillator, 520Hz/600ms) when
// no file is available. Mirrors AudioService.java's playTone() fallback.

(function () {
  let audioEl = null;
  let audioCtx = null;

  function element() {
    if (!audioEl) {
      audioEl = new Audio();
      audioEl.preload = 'auto';
    }
    return audioEl;
  }

  function context() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx();
    }
    return audioCtx;
  }

  function playBeep(volume) {
    const ctx = context();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 520;
    gain.gain.value = Math.max(0, Math.min(1, volume));
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.6);
  }

  window.eyecare.audio.onPlay(({ fileUrl, volume }) => {
    if (!fileUrl) {
      playBeep(volume);
      return;
    }
    const el = element();
    el.pause();
    el.src = fileUrl;
    el.volume = Math.max(0, Math.min(1, volume));
    el.currentTime = 0;
    el.play().catch(() => playBeep(volume));
  });
})();
