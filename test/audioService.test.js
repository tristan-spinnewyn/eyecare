import { describe, it, expect, vi } from 'vitest';
import path from 'path';
import { AudioService } from '../src/main/audioService.js';

describe('AudioService', () => {
  const soundsDir = path.resolve(__dirname, '../assets/sounds');

  it('scans available sounds and includes default alert sound', () => {
    const audioService = new AudioService(soundsDir, () => null);
    const sounds = audioService.getAvailableSounds('Default Alert');

    expect(sounds.length).toBeGreaterThan(0);
    const soundKeys = sounds.map((s) => s.key);
    expect(soundKeys).toContain('alert');
    expect(soundKeys).toContain('Pause_at_Noon');
  });

  it('handles scan error gracefully if soundsDir is invalid', () => {
    const audioService = new AudioService('/non/existent/dir', () => null);
    const sounds = audioService.getAvailableSounds('Default Alert');
    expect(sounds).toEqual([{ key: 'alert', label: 'Default Alert' }]);
  });

  it('sets and clamps volume between 0 and 100', () => {
    const audioService = new AudioService(soundsDir, () => null);
    audioService.setVolume(50);
    expect(audioService.volume).toBe(0.5);

    audioService.setVolume(150);
    expect(audioService.volume).toBe(1.0);

    audioService.setVolume(-20);
    expect(audioService.volume).toBe(0.0);
  });

  it('sends audio:play IPC to webContents on play()', () => {
    const mockSend = vi.fn();
    const mockWebContents = {
      isDestroyed: () => false,
      send: mockSend,
    };
    const audioService = new AudioService(soundsDir, () => mockWebContents);
    audioService.setVolume(80);

    audioService.play('Pause_at_Noon');

    expect(mockSend).toHaveBeenCalledWith(
      'audio:play',
      expect.objectContaining({
        volume: 0.8,
        fileUrl: expect.stringContaining('Pause_at_Noon.mp3'),
      })
    );
  });

  it('handles sound not found by sending null fileUrl', () => {
    const mockSend = vi.fn();
    const mockWebContents = {
      isDestroyed: () => false,
      send: mockSend,
    };
    const audioService = new AudioService(soundsDir, () => mockWebContents);
    audioService.play('unknown_sound');
    expect(mockSend).toHaveBeenCalledWith('audio:play', {
      fileUrl: null,
      volume: 0.8,
    });
  });

  it('handles preview with specific volume percentage', () => {
    const mockSend = vi.fn();
    const mockWebContents = {
      isDestroyed: () => false,
      send: mockSend,
    };
    const audioService = new AudioService(soundsDir, () => mockWebContents);

    audioService.preview('The_Sunlit_Interval', 40);

    expect(mockSend).toHaveBeenCalledWith(
      'audio:play',
      expect.objectContaining({
        volume: 0.4,
        fileUrl: expect.stringContaining('The_Sunlit_Interval.mp3'),
      })
    );
  });

  it('does nothing when webContents is destroyed or missing', () => {
    const audioService1 = new AudioService(soundsDir, () => null);
    expect(() => audioService1.play('alert')).not.toThrow();

    const audioService2 = new AudioService(soundsDir, () => ({ isDestroyed: () => true }));
    expect(() => audioService2.play('alert')).not.toThrow();
  });
});
