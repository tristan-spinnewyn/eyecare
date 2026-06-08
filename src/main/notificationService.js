'use strict';

const { Notification } = require('electron');

/** Sends OS-native notifications, mirroring NotificationService.java. */
class NotificationService {
  constructor(settingsService, i18n) {
    this.settingsService = settingsService;
    this.i18n = i18n;
  }

  sendWorkDoneNotification() {
    const sec = this.settingsService.getSettings().breakDurationSeconds;
    this._send(this.i18n.t('notif.app_name'), this.i18n.t('notif.work_done', sec));
  }

  sendBreakDoneNotification() {
    const min = this.settingsService.getSettings().workDurationMinutes;
    this._send(this.i18n.t('notif.app_name'), this.i18n.t('notif.break_done', min));
  }

  sendReminderNotification() {
    this._send(this.i18n.t('notif.app_name'), this.i18n.t('notif.reminder'));
  }

  sendStreakNotification(streak) {
    this._send(this.i18n.t('notif.app_name'), this.i18n.t('notif.streak_record', streak));
  }

  _send(title, body) {
    if (!Notification.isSupported()) return;
    try {
      new Notification({ title, body }).show();
    } catch (e) {
      console.warn('[NotificationService] notification failed', e);
    }
  }
}

module.exports = { NotificationService };
