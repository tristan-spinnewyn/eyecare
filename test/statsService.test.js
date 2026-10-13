import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { StatsService, completedBreaks, focusScore, analysisKeyFor } from '../src/main/statsService.js';

describe('StatsService', () => {
  let tmpDir;
  let settingsServiceMock;
  let statsService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eyecare-stats-test-'));
    settingsServiceMock = {
      getSettings: () => ({ workDurationMinutes: 20 }),
    };
    statsService = new StatsService(settingsServiceMock, tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('initializes today stats with target breaks computed from settings', () => {
    const today = statsService.getTodayStats();
    expect(today.date).toBeDefined();
    expect(today.sessions).toEqual([]);
    expect(today.targetBreaks).toBe(24); // (8 * 60) / 20 = 24
  });

  it('records break start, completion and updates streak', () => {
    statsService.onBreakStarted();
    const result = statsService.onBreakCompleted();
    expect(result.streak).toBe(1);
    expect(result.isNewRecord).toBe(true);
    expect(statsService.getBestStreak()).toBe(1);

    const today = statsService.getTodayStats();
    expect(today.sessions.length).toBe(1);
    expect(today.sessions[0].completed).toBe(true);
    expect(completedBreaks(today)).toBe(1);
    expect(focusScore(today)).toBe(1.0);

    // Second break completion when bestStreak is already higher
    statsService.bestStreak = 10;
    const secondResult = statsService.onBreakCompleted();
    expect(secondResult.isNewRecord).toBe(false);
  });

  it('records skipped breaks and updates focus score', () => {
    statsService.onBreakStarted();
    statsService.onBreakCompleted();
    statsService.onBreakSkipped();

    const today = statsService.getTodayStats();
    expect(today.sessions.length).toBe(2);
    expect(completedBreaks(today)).toBe(1);
    expect(focusScore(today)).toBe(0.5);
  });

  it('handles corrupted best-streak file gracefully', () => {
    fs.writeFileSync(path.join(tmpDir, 'best-streak.txt'), 'not-a-number');
    const newService = new StatsService(settingsServiceMock, tmpDir);
    expect(newService.getBestStreak()).toBe(0);
  });

  it('handles corrupted daily stats file gracefully', () => {
    const corruptedFile = path.join(tmpDir, 'stats-2026-10-01.json');
    fs.writeFileSync(corruptedFile, '{ invalid json');
    const day = statsService._loadOrEmpty('2026-10-01');
    expect(day.sessions).toEqual([]);
  });

  it('computes vitality score and generates weekly reports', () => {
    statsService.onBreakStarted();
    statsService.onBreakCompleted();

    const report = statsService.getWeeklyReport();
    expect(report.days.length).toBe(7);
    expect(report.currentStreak).toBe(1);
    expect(report.vitalityScore).toBeGreaterThan(0);
  });

  it('provides weekStartForOffset and last four weekly reports', () => {
    const start0 = statsService.weekStartForOffset(0);
    const startPrev = statsService.weekStartForOffset(-1);
    expect(start0).toBeDefined();
    expect(startPrev).toBeDefined();

    const reports = statsService.getLastFourWeeklyReports();
    expect(reports.length).toBe(4);
  });

  it('categorizes vitality score with analysisKeyFor', () => {
    expect(analysisKeyFor(90)).toBe('analysis.excellent');
    expect(analysisKeyFor(70)).toBe('analysis.good');
    expect(analysisKeyFor(50)).toBe('analysis.average');
    expect(analysisKeyFor(20)).toBe('analysis.poor');
    expect(analysisKeyFor(0)).toBe('analysis.none');
  });

  it('exports weekly report to CSV', () => {
    statsService.onBreakStarted();
    statsService.onBreakCompleted();

    const csvFile = path.join(tmpDir, 'report.csv');
    const mockT = (key, ...args) => (args.length ? `${key}:${args.join(',')}` : key);
    statsService.exportToCsv(csvFile, '2026-10-12', mockT);

    expect(fs.existsSync(csvFile)).toBe(true);
    const content = fs.readFileSync(csvFile, 'utf-8');
    expect(content).toContain('pdf.header.day');
    expect(content.split('\n').length).toBeGreaterThan(7);
  });

  it('exports weekly report to PDF via BrowserWindow printToPDF', async () => {
    const pdfFile = path.join(tmpDir, 'report.pdf');
    const mockT = (key, ...args) => (args.length ? `${key}:${args.join(',')}` : key);

    await statsService.exportToPdf(pdfFile, '2026-10-12', mockT);
    expect(fs.existsSync(pdfFile)).toBe(true);
  });
});
