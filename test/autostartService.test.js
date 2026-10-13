import { describe, it, expect } from 'vitest';
import { AutostartService } from '../src/main/autostartService.js';
import { app } from 'electron';

describe('AutostartService', () => {
  it('reads and updates login item settings', () => {
    const service = new AutostartService();

    service.setEnabled(true);
    expect(service.isEnabled()).toBe(true);

    service.setEnabled(false);
    expect(service.isEnabled()).toBe(false);
  });
});
