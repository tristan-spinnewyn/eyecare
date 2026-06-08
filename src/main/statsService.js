'use strict';

const fs = require('fs');
const path = require('path');

const WORK_HOURS_PER_DAY = 8;

// --- Date helpers (date-only values are kept as 'YYYY-MM-DD' strings, like LocalDate) ---

function todayStr() {
  return toDateStr(new Date());
}

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateStr(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(dateStr, n) {
  const d = parseDateStr(dateStr);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

function isBefore(a, b) {
  return a < b;
}

/** Monday (ISO weekday 1) of the week containing dateStr. */
function mondayOf(dateStr) {
  const d = parseDateStr(dateStr);
  const dow = d.getDay(); // 0 = Sunday .. 6 = Saturday
  const deltaToMonday = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + deltaToMonday);
  return toDateStr(d);
}

// --- Daily stats helpers (plain objects: { date, sessions: [{startTime,endTime,completed}], targetBreaks }) ---

function emptyDay(date, targetBreaks) {
  return { date, sessions: [], targetBreaks };
}

function completedBreaks(day) {
  return day.sessions.filter((s) => s.completed).length;
}

function focusScore(day) {
  const total = day.sessions.length;
  return total === 0 ? 1.0 : completedBreaks(day) / total;
}

/**
 * Tracks daily/weekly break statistics, streaks, and report export.
 * Mirrors Java StatsService — JSON files (one per day) + a best-streak.txt
 * marker, all stored under <userData>/stats.
 */
class StatsService {
  constructor(settingsService, statsDir) {
    this.settingsService = settingsService;
    this.statsDir = statsDir;

    this.todayStats = null;
    this.currentDate = null;
    this.lastBreakStart = null;

    this._resetForToday();
    this.bestStreak = this._loadBestStreak();
  }

  // --- Timer events ---

  onBreakStarted() {
    this._ensureTodayStats();
    this.lastBreakStart = new Date();
  }

  /** Returns { streak, isNewRecord } so the caller can fire a streak notification. */
  onBreakCompleted() {
    this._ensureTodayStats();
    const start = this.lastBreakStart || new Date();
    this.todayStats.sessions.push({
      startTime: start.toISOString(),
      endTime: new Date().toISOString(),
      completed: true,
    });
    this._saveToday();
    return this._checkStreakRecord();
  }

  onBreakSkipped() {
    this._ensureTodayStats();
    const now = new Date().toISOString();
    this.todayStats.sessions.push({ startTime: now, endTime: now, completed: false });
    this._saveToday();
  }

  // --- Data access ---

  getTodayStats() {
    this._ensureTodayStats();
    return this.todayStats;
  }

  getWeeklyReport(monday = mondayOf(todayStr())) {
    const today = todayStr();
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(monday, i);
      if (date === today) days.push(this.getTodayStats());
      else if (isBefore(date, today)) days.push(this._loadOrEmpty(date));
      else days.push(emptyDay(date, this._computeTarget()));
    }
    return {
      weekStart: monday,
      days,
      currentStreak: this._computeStreak(today),
      vitalityScore: this._computeVitality(days),
    };
  }

  getBestStreak() {
    return this.bestStreak;
  }

  /** Monday (YYYY-MM-DD) of the week `weekOffset` weeks from the current one (0 = this week). */
  weekStartForOffset(weekOffset) {
    return addDays(mondayOf(todayStr()), weekOffset * 7);
  }

  /** Returns the last 4 complete weeks (most recent last). */
  getLastFourWeeklyReports() {
    const monday = mondayOf(todayStr());
    const weeks = [];
    for (let i = 3; i >= 0; i--) {
      weeks.push(this.getWeeklyReport(addDays(monday, -7 * i)));
    }
    return weeks;
  }

  // --- CSV export ---

  exportToCsv(outputPath, monday, t) {
    const report = this.getWeeklyReport(monday);
    const lines = [];
    lines.push([t('pdf.header.day'), t('pdf.header.breaks'), t('pdf.header.target'), t('pdf.header.focus')].join(','));
    for (let i = 0; i < 7; i++) {
      const day = report.days[i];
      lines.push([
        `${t(`pdf.day.${i}`)} ${day.date}`,
        completedBreaks(day),
        day.targetBreaks,
        `${Math.round(focusScore(day) * 100)}%`,
      ].join(','));
    }
    fs.writeFileSync(outputPath, lines.join('\n') + '\n', 'utf-8');
  }

  // --- PDF export (renders an HTML report and prints it via a hidden window) ---

  async exportToPdf(outputPath, monday, t) {
    const { BrowserWindow } = require('electron');
    const report = this.getWeeklyReport(monday);
    const html = this._renderReportHtml(report, t);

    const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
    try {
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      const pdfBuffer = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true });
      fs.writeFileSync(outputPath, pdfBuffer);
    } finally {
      win.destroy();
    }
  }

  _renderReportHtml(report, t) {
    const analysisKey = analysisKeyFor(report.vitalityScore);
    const rows = report.days.map((day, i) => `
      <tr>
        <td>${escapeHtml(`${t(`pdf.day.${i}`)} ${day.date}`)}</td>
        <td>${completedBreaks(day)}</td>
        <td>${day.targetBreaks}</td>
        <td>${Math.round(focusScore(day) * 100)}%</td>
      </tr>`).join('');

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body { font-family: Helvetica, Arial, sans-serif; color: #1A1A2E; padding: 40px; }
      h1 { font-size: 20px; margin-bottom: 4px; }
      h2 { font-size: 15px; margin: 22px 0 6px; }
      p { font-size: 12px; margin: 4px 0; }
      table { border-collapse: collapse; width: 100%; font-size: 11px; }
      th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #E5E7EB; }
      th { font-weight: bold; }
    </style></head><body>
      <h1>${escapeHtml(t('pdf.title'))}</h1>
      <p>${escapeHtml(formatRange(t, report))}</p>
      <h2>${escapeHtml(t('pdf.section.summary'))}</h2>
      <p>${escapeHtml(t('pdf.breaks_completed', totalCompleted(report), totalTarget(report)))}</p>
      <p>${escapeHtml(t('pdf.vitality', report.vitalityScore))}</p>
      <p>${escapeHtml(t('pdf.streak', report.currentStreak))}</p>
      <h2>${escapeHtml(t('pdf.section.daily'))}</h2>
      <table>
        <thead><tr>
          <th>${escapeHtml(t('pdf.header.day'))}</th>
          <th>${escapeHtml(t('pdf.header.breaks'))}</th>
          <th>${escapeHtml(t('pdf.header.target'))}</th>
          <th>${escapeHtml(t('pdf.header.focus'))}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <h2>${escapeHtml(t('pdf.section.analysis'))}</h2>
      <p>${escapeHtml(t(analysisKey))}</p>
    </body></html>`;
  }

  // --- Private ---

  _checkStreakRecord() {
    const current = this._computeStreak(todayStr());
    if (current > this.bestStreak) {
      this.bestStreak = current;
      this._saveBestStreak(this.bestStreak);
      return { streak: this.bestStreak, isNewRecord: true };
    }
    return { streak: current, isNewRecord: false };
  }

  _loadBestStreak() {
    const file = path.join(this.statsDir, 'best-streak.txt');
    if (fs.existsSync(file)) {
      const n = parseInt(fs.readFileSync(file, 'utf-8').trim(), 10);
      if (Number.isFinite(n)) return n;
    }
    return 0;
  }

  _saveBestStreak(streak) {
    try {
      fs.mkdirSync(this.statsDir, { recursive: true });
      fs.writeFileSync(path.join(this.statsDir, 'best-streak.txt'), String(streak), 'utf-8');
    } catch { /* best-effort */ }
  }

  _ensureTodayStats() {
    const today = todayStr();
    if (today !== this.currentDate) this._resetForToday();
  }

  _resetForToday() {
    this.currentDate = todayStr();
    this.todayStats = this._loadOrEmpty(this.currentDate);
  }

  _computeTarget() {
    return Math.floor((WORK_HOURS_PER_DAY * 60) / this.settingsService.getSettings().workDurationMinutes);
  }

  _saveToday() {
    try {
      fs.mkdirSync(this.statsDir, { recursive: true });
      const file = path.join(this.statsDir, `stats-${this.currentDate}.json`);
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.todayStats, null, 2), 'utf-8');
      fs.renameSync(tmp, file);
    } catch (e) {
      console.error('[StatsService] Could not save', e);
    }
  }

  _loadOrEmpty(date) {
    const file = path.join(this.statsDir, `stats-${date}.json`);
    if (fs.existsSync(file)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
        return { date, sessions: parsed.sessions || [], targetBreaks: parsed.targetBreaks ?? this._computeTarget() };
      } catch (e) {
        console.warn(`[StatsService] Could not read ${file}`, e);
      }
    }
    return emptyDay(date, this._computeTarget());
  }

  _computeStreak(today) {
    let streak = 0;
    let date = today;
    for (let i = 0; i < 365; i++) {
      const day = date === today ? this.getTodayStats() : this._loadOrEmpty(date);
      if (completedBreaks(day) > 0) {
        streak++;
        date = addDays(date, -1);
      } else {
        break;
      }
    }
    return streak;
  }

  _computeVitality(days) {
    const totalCompletedN = days.reduce((sum, d) => sum + completedBreaks(d), 0);
    const totalTargetN = days.reduce((sum, d) => sum + d.targetBreaks, 0);
    if (totalTargetN === 0) return 0;
    return Math.min(100, (totalCompletedN * 100) / totalTargetN);
  }
}

function totalCompleted(report) {
  return report.days.reduce((sum, d) => sum + completedBreaks(d), 0);
}

function totalTarget(report) {
  return report.days.reduce((sum, d) => sum + d.targetBreaks, 0);
}

function analysisKeyFor(vitalityScore) {
  if (vitalityScore >= 80) return 'analysis.excellent';
  if (vitalityScore >= 60) return 'analysis.good';
  if (vitalityScore >= 40) return 'analysis.average';
  if (vitalityScore > 0) return 'analysis.poor';
  return 'analysis.none';
}

function formatRange(t, report) {
  return t('pdf.week_range', report.weekStart, addDays(report.weekStart, 6));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = { StatsService, completedBreaks, focusScore, analysisKeyFor };
