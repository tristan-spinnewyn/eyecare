import { describe, it, expect, beforeEach } from 'vitest';
import { NotificationService } from '../src/main/notificationService.js';
import { Notification } from 'electron';

describe('NotificationService', () => {
  let settingsServiceMock;
  let i18nMock;
  let service;

  beforeEach(() => {
    Notification.instances = [];
    Notification.supported = true;
    settingsServiceMock = {
      getSettings: () => ({
        breakDurationSeconds: 20,
        workDurationMinutes: 20,
      }),
    };
    i18nMock = {
      t: (key, ...args) => `${key}:${args.join(',')}`,
    };
    service = new NotificationService(settingsServiceMock, i18nMock);
  });

  it('sends work done notification', () => {
    service.sendWorkDoneNotification();
    expect(Notification.instances.length).toBe(1);
    expect(Notification.instances[0].shown).toBe(true);
    expect(Notification.instances[0].options.title).toContain('notif.app_name');
    expect(Notification.instances[0].options.body).toContain('notif.work_done:20');
  });

  it('sends break done notification', () => {
    service.sendBreakDoneNotification();
    expect(Notification.instances.length).toBe(1);
    expect(Notification.instances[0].shown).toBe(true);
    expect(Notification.instances[0].options.body).toContain('notif.break_done:20');
  });

  it('sends reminder and streak notifications', () => {
    service.sendReminderNotification();
    service.sendStreakNotification(5);
    expect(Notification.instances.length).toBe(2);
    expect(Notification.instances[1].options.body).toContain('notif.streak_record:5');
  });

  it('handles Notification.isSupported() returning false', () => {
    Notification.supported = false;
    service.sendWorkDoneNotification();
    expect(Notification.instances.length).toBe(0);
  });
});
