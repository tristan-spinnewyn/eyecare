import { describe, it, expect } from 'vitest';
import { buildCircleIcon } from '../src/main/trayIcon.js';

describe('TrayIcon', () => {
  it('builds a circular bitmap image with valid dimensions and RGBA buffer', () => {
    const size = 16;
    const image = buildCircleIcon(size, '#3B82F6');

    expect(image).toBeDefined();
    expect(image.type).toBe('bitmap');
    expect(image.size).toEqual({ width: size, height: size });
    expect(image.buffer.length).toBe(size * size * 4);

    // Center pixel should be blue (#3B82F6 = r:59, g:130, b:246, alpha:255)
    const centerIdx = (8 * 16 + 8) * 4;
    expect(image.buffer[centerIdx]).toBe(0x3B);
    expect(image.buffer[centerIdx + 1]).toBe(0x82);
    expect(image.buffer[centerIdx + 2]).toBe(0xF6);
    expect(image.buffer[centerIdx + 3]).toBe(255);
  });
});
