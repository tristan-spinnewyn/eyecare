'use strict';

const RING_SIZE = 300;
const STROKE_WIDTH = 14;
const MARGIN = STROKE_WIDTH / 2 + 2;

const canvas = document.getElementById('ring');
const countdownEl = document.getElementById('countdown');
const penaltyEl = document.getElementById('penalty');
const escHintEl = document.getElementById('escHint');
const ctx = canvas.getContext('2d');

let bundle = {};
let strictMode = false;
let totalSeconds = 0;
let startMs = 0;
let pausedElapsedMs = -1;
let rafId = null;

window.eyecare.overlay.onShow((payload) => {
  bundle = payload.bundle || {};
  strictMode = payload.strictMode;
  totalSeconds = payload.durationSeconds;

  applyTranslations();
  countdownEl.textContent = formatSeconds(totalSeconds);

  if (payload.isPrimary) {
    if (payload.penaltySeconds > 0) {
      penaltyEl.textContent = t('overlay.penalty', payload.penaltySeconds);
      penaltyEl.hidden = false;
    }
    if (!strictMode) escHintEl.hidden = false;
  }

  startMs = Date.now();
  pausedElapsedMs = -1;
  drawRing(1.0);
  startAnimation();
});

window.eyecare.overlay.onPause(() => {
  if (rafId === null || pausedElapsedMs >= 0) return;
  pausedElapsedMs = Date.now() - startMs;
  cancelAnimationFrame(rafId);
  rafId = null;
});

window.eyecare.overlay.onResume(() => {
  if (pausedElapsedMs < 0) return;
  startMs = Date.now() - pausedElapsedMs;
  pausedElapsedMs = -1;
  startAnimation();
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !strictMode) {
    window.eyecare.overlay.requestHide();
  }
});

function startAnimation() {
  let lastRemaining = totalSeconds;
  const tick = () => {
    const elapsedMs = Date.now() - startMs;
    const progress = 1.0 - Math.min(1, elapsedMs / (totalSeconds * 1000));
    drawRing(progress);

    const remaining = totalSeconds - Math.floor(elapsedMs / 1000);
    if (remaining !== lastRemaining) {
      lastRemaining = remaining;
      countdownEl.textContent = formatSeconds(Math.max(0, remaining));
      if (remaining <= 0) {
        cancelAnimationFrame(rafId);
        rafId = null;
        return;
      }
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

function drawRing(progress) {
  const size = canvas.width;
  const arcSize = size - MARGIN * 2;
  const radius = arcSize / 2;
  const cx = size / 2;
  const cy = size / 2;

  ctx.clearRect(0, 0, size, size);

  ctx.lineWidth = STROKE_WIDTH;
  ctx.lineCap = 'round';

  ctx.strokeStyle = '#1E2030';
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  if (progress > 0) {
    ctx.strokeStyle = '#60A5FA';
    const start = -Math.PI / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, start, start + Math.PI * 2 * progress);
    ctx.stroke();
  }
}

function formatSeconds(totalSecs) {
  const min = Math.floor(totalSecs / 60);
  const sec = totalSecs % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

function applyTranslations() {
  for (const el of document.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
}

function t(key, ...args) {
  const value = key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), bundle);
  const template = value !== undefined ? value : key;
  if (!args.length) return template;
  let i = 0;
  return String(template).replace(/%(\.\d+)?[dsf]|%%/g, (m) => {
    if (m === '%%') return '%';
    const v = args[i++];
    if (m.startsWith('%.')) return Number(v).toFixed(Number(m.slice(2, -1)));
    if (m === '%d') return String(Math.trunc(Number(v)));
    return String(v);
  });
}
