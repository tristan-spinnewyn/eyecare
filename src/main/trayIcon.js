'use strict';

const { nativeImage } = require('electron');

/**
 * Builds a small filled-circle tray icon tinted by state, entirely from raw
 * RGBA pixels — no native canvas dependency. This stands in for
 * TrayIconBuilder.java; the live countdown is conveyed via the tray tooltip
 * (updated every second) rather than burned into the icon's pixels.
 */
function buildCircleIcon(size, hexColor) {
  const { r, g, b } = hexToRgb(hexColor);
  const radius = size / 2;
  const cx = radius;
  const cy = radius;
  const buffer = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const alpha = clamp01(radius - dist + 0.5); // ~1px anti-aliased edge
      const idx = (y * size + x) * 4;
      buffer[idx] = r;
      buffer[idx + 1] = g;
      buffer[idx + 2] = b;
      buffer[idx + 3] = Math.round(alpha * 255);
    }
  }

  return nativeImage.createFromBitmap(buffer, { width: size, height: size });
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

module.exports = { buildCircleIcon };
