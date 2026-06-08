'use strict';

let bundle = {};
let language = 'en';
let activeView = 'dashboard';

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

function applyTranslations(root) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
}

function applyTheme({ dark }) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  Dashboard.onThemeChanged();
}

function formatSeconds(totalSecs) {
  const min = Math.floor(totalSecs / 60);
  const sec = totalSecs % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

/** Formats an ISO date (YYYY-MM-DD) using a Java-style `dd/MM`/`MM/dd` pattern. */
function formatDate(dateStr, pattern) {
  const [y, m, d] = dateStr.split('-');
  return pattern.replace('yyyy', y).replace('MM', m).replace('dd', d);
}

function addDaysToDateStr(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

// =====================================================================
// Navigation
// =====================================================================

const navButtons = Array.from(document.querySelectorAll('.nav-item'));
const viewSections = {
  dashboard: document.getElementById('view-dashboard'),
  stats: document.getElementById('view-stats'),
  settings: document.getElementById('view-settings'),
};

function showView(name) {
  activeView = name;
  for (const btn of navButtons) btn.classList.toggle('active', btn.dataset.view === name);
  for (const [key, section] of Object.entries(viewSections)) section.classList.toggle('active', key === name);
  if (name === 'dashboard') Dashboard.onShow();
  if (name === 'stats') Stats.onShow();
  if (name === 'settings') Settings.onShow();
}

for (const btn of navButtons) btn.addEventListener('click', () => showView(btn.dataset.view));

// =====================================================================
// Dashboard — circular timer ring, status badge, quick stats
// =====================================================================

const Dashboard = {
  ring: { track: '#E5E7EB', progress: '#3B82F6' },
  snapshot: {
    state: 'IDLE',
    remainingSeconds: 0,
    totalSeconds: 0,
    breakDurationSeconds: 20,
    appliedPenaltySeconds: 0,
    pendingPenaltySeconds: 0,
  },

  init() {
    this.canvas = document.getElementById('timerRing');
    this.ctx = this.canvas.getContext('2d');
    this.countdownEl = document.getElementById('timerCountdown');
    this.subtitleEl = document.getElementById('timerSubtitle');
    this.badgeEl = document.getElementById('statusBadge');
    this.pausesEl = document.getElementById('pausesTodayValue');
    this.focusEl = document.getElementById('focusScoreValue');
    this.btnStartBreak = document.getElementById('btnStartBreak');
    this.btnSkip = document.getElementById('btnSkipCycle');
    this.btnPause = document.getElementById('btnPauseResume');
    this.btnReset = document.getElementById('btnReset');

    this.btnStartBreak.addEventListener('click', () => window.eyecare.timer.startBreak());
    this.btnSkip.addEventListener('click', () => window.eyecare.timer.skipCycle());
    this.btnPause.addEventListener('click', () => {
      if (this.snapshot.state === 'PAUSED') window.eyecare.timer.resume();
      else window.eyecare.timer.pause();
    });
    this.btnReset.addEventListener('click', () => window.eyecare.timer.reset());

    this.readRingColors();
  },

  readRingColors() {
    const style = getComputedStyle(document.documentElement);
    this.ring.track = style.getPropertyValue('--eye-timer-track').trim();
    this.ring.progress = style.getPropertyValue('--eye-accent').trim();
  },

  onShow() {
    this.refreshStats();
    this.render();
  },

  onThemeChanged() {
    this.readRingColors();
    this.drawRing();
  },

  onState(state) {
    const changed = this.snapshot.state !== state;
    this.snapshot.state = state;
    if (changed) this.refreshStats();
    this.render();
  },

  onTick({ remainingSeconds, totalSeconds }) {
    this.snapshot.remainingSeconds = remainingSeconds;
    this.snapshot.totalSeconds = totalSeconds;
    this.render();
  },

  onPenalty({ appliedPenaltySeconds, pendingPenaltySeconds }) {
    this.snapshot.appliedPenaltySeconds = appliedPenaltySeconds;
    this.snapshot.pendingPenaltySeconds = pendingPenaltySeconds;
    this.render();
  },

  async refreshStats() {
    const day = await window.eyecare.stats.today();
    this.pausesEl.textContent = `${day.completedBreaks} / ${day.targetBreaks}`;
    this.focusEl.textContent = `${Math.round(day.focusScore * 100)}%`;
  },

  render() {
    const s = this.snapshot;

    let centerSeconds = s.remainingSeconds;
    let subtitle;
    if (s.state === 'BREAK_COUNTDOWN') {
      const planned = s.totalSeconds - s.appliedPenaltySeconds;
      subtitle = s.appliedPenaltySeconds > 0
        ? `${t('timer.eyes_resting')}  (${planned}s + ${s.appliedPenaltySeconds}s)`
        : t('timer.eyes_resting');
    } else if (s.state === 'AWAITING_BREAK') {
      centerSeconds = s.breakDurationSeconds + s.pendingPenaltySeconds;
      subtitle = s.pendingPenaltySeconds > 0
        ? `${t('timer.start_break')}  (${s.breakDurationSeconds}s + ${s.pendingPenaltySeconds}s)`
        : `${t('timer.start_break')}  (${s.breakDurationSeconds}s)`;
    } else {
      const key = { WORK_COUNTDOWN: 'timer.until_break', PAUSED: 'timer.paused', AWAITING_ACTIVITY: 'timer.awaiting_activity' }[s.state];
      subtitle = t(key || 'timer.ready');
    }

    this.countdownEl.textContent = formatSeconds(centerSeconds);
    this.subtitleEl.textContent = subtitle;

    const statusKey = {
      WORK_COUNTDOWN: 'status.active',
      AWAITING_BREAK: 'status.break_time',
      BREAK_COUNTDOWN: 'status.on_break',
      PAUSED: 'status.paused',
      AWAITING_ACTIVITY: 'status.awaiting_activity',
    }[s.state];
    this.badgeEl.textContent = t(statusKey || 'status.ready');

    this.btnStartBreak.disabled = ['IDLE', 'BREAK_COUNTDOWN', 'PAUSED', 'AWAITING_ACTIVITY'].includes(s.state);
    this.btnSkip.disabled = s.state !== 'AWAITING_BREAK';
    this.btnPause.disabled = ['IDLE', 'AWAITING_ACTIVITY'].includes(s.state);
    this.btnPause.textContent = s.state === 'PAUSED' ? t('tray.resume') : t('tray.pause');
    this.btnReset.disabled = s.state !== 'PAUSED';

    this.drawRing(s.totalSeconds === 0 ? 1 : s.remainingSeconds / s.totalSeconds);
  },

  drawRing(progress) {
    if (progress === undefined) {
      const s = this.snapshot;
      progress = s.totalSeconds === 0 ? 1 : s.remainingSeconds / s.totalSeconds;
    }
    const ctx = this.ctx;
    const size = this.canvas.width;
    const stroke = Math.max(8, size * 0.062);
    const radius = (size - stroke * 2) / 2;
    const cx = size / 2;
    const cy = size / 2;

    ctx.clearRect(0, 0, size, size);
    ctx.lineWidth = stroke;
    ctx.lineCap = 'round';

    ctx.strokeStyle = this.ring.track;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    const clamped = Math.max(0, Math.min(1, progress));
    if (clamped > 0) {
      ctx.strokeStyle = this.ring.progress;
      const start = -Math.PI / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, start, start + Math.PI * 2 * clamped);
      ctx.stroke();
    }
  },
};

// =====================================================================
// Stats — bar chart (week / 4-week), today/streak/vitality/analysis cards
// =====================================================================

const Stats = {
  weekOffset: 0,
  monthView: false,

  init() {
    this.chartEl = document.getElementById('barChart');
    this.weekRangeEl = document.getElementById('weekRangeLabel');
    this.weekBtn = document.getElementById('weekViewBtn');
    this.monthBtn = document.getElementById('monthViewBtn');
    this.prevBtn = document.getElementById('prevWeekBtn');
    this.nextBtn = document.getElementById('nextWeekBtn');
    this.todayBreaksEl = document.getElementById('todayBreaksValue');
    this.todayFocusEl = document.getElementById('todayFocusValue');
    this.weekTotalEl = document.getElementById('weekTotalValue');
    this.streakValueEl = document.getElementById('streakValue');
    this.streakSubEl = document.getElementById('streakSubLabel');
    this.bestStreakEl = document.getElementById('bestStreakLabel');
    this.vitalityEl = document.getElementById('vitalityValue');
    this.analysisEl = document.getElementById('analysisText');
    this.exportSpinner = document.getElementById('exportSpinner');
    this.exportCsvBtn = document.getElementById('exportCsvBtn');
    this.exportPdfBtn = document.getElementById('exportPdfBtn');

    this.weekBtn.addEventListener('click', () => this.setMonthView(false));
    this.monthBtn.addEventListener('click', () => this.setMonthView(true));
    this.prevBtn.addEventListener('click', () => { this.weekOffset -= 1; this.loadWeek(); });
    this.nextBtn.addEventListener('click', () => {
      if (this.weekOffset < 0) { this.weekOffset += 1; this.loadWeek(); }
    });
    this.exportCsvBtn.addEventListener('click', () => this.runExport('csv'));
    this.exportPdfBtn.addEventListener('click', () => this.runExport('pdf'));
  },

  onShow() {
    this.weekOffset = 0;
    this.monthView = false;
    this.weekBtn.classList.add('active');
    this.monthBtn.classList.remove('active');
    this.prevBtn.disabled = false;
    this.loadWeek();
  },

  reload() {
    if (this.monthView) this.loadMonth();
    else this.loadWeek();
  },

  setMonthView(active) {
    if (this.monthView === active) return;
    this.monthView = active;
    this.weekBtn.classList.toggle('active', !active);
    this.monthBtn.classList.toggle('active', active);
    if (active) {
      this.prevBtn.disabled = true;
      this.nextBtn.disabled = true;
      this.loadMonth();
    } else {
      this.prevBtn.disabled = false;
      this.loadWeek();
    }
  },

  async loadWeek() {
    this.nextBtn.disabled = this.weekOffset >= 0;

    const [report, today, bestStreak] = await Promise.all([
      window.eyecare.stats.weekly(this.weekOffset),
      window.eyecare.stats.today(),
      window.eyecare.stats.bestStreak(),
    ]);

    const fmt = t('stats.date_format');
    this.weekRangeEl.textContent = `${formatDate(report.weekStart, fmt)} – ${formatDate(addDaysToDateStr(report.weekStart, 6), fmt)}`;

    const dayAbbr = [0, 1, 2, 3, 4, 5, 6].map((i) => t(`stats.day_abbr.${i}`));
    const ratios = report.days.map((d) => (d.targetBreaks > 0 ? Math.min(1, d.completedBreaks / d.targetBreaks) : 0));
    const values = report.days.map((d) => (d.targetBreaks > 0 ? String(d.completedBreaks) : '—'));
    const todayIndex = report.days.findIndex((d) => d.date === today.date);
    this.renderBars(dayAbbr, ratios, values, (i) => {
      if (i === todayIndex) return 'today';
      if (todayIndex >= 0 && i < todayIndex && ratios[i] > 0) return 'active';
      return '';
    });

    this.renderSummary(report, today, bestStreak);
  },

  async loadMonth() {
    const weeks = await window.eyecare.stats.lastFourWeeks();
    const labels = weeks.map((w) => formatDate(w.weekStart, 'dd/MM'));
    const ratios = weeks.map((w) => (w.totalTarget > 0 ? Math.min(1, w.totalCompleted / w.totalTarget) : 0));
    const values = weeks.map((w) => (w.totalCompleted > 0 ? String(w.totalCompleted) : '—'));
    this.renderBars(labels, ratios, values, (i) => (ratios[i] > 0 ? 'active' : ''));
    this.weekRangeEl.textContent = t('stats.view.month');
  },

  renderBars(labels, ratios, values, classify) {
    this.chartEl.innerHTML = '';
    ratios.forEach((ratio, i) => {
      const col = document.createElement('div');
      col.className = 'bar-col';

      const valueEl = document.createElement('span');
      valueEl.className = 'bar-value';
      valueEl.textContent = values[i];

      const track = document.createElement('div');
      track.className = 'bar-track';
      const fill = document.createElement('div');
      fill.className = 'bar-fill';
      const extra = classify(i);
      if (extra) fill.classList.add(extra);
      fill.style.height = '0%';
      track.appendChild(fill);

      const dayLabel = document.createElement('span');
      dayLabel.className = 'bar-day-label';
      dayLabel.textContent = labels[i] || '';

      col.append(valueEl, track, dayLabel);
      this.chartEl.appendChild(col);

      requestAnimationFrame(() => {
        fill.style.height = `${ratio > 0 ? Math.max(ratio * 100, 4) : 0}%`;
      });
    });
  },

  renderSummary(report, today, bestStreak) {
    this.todayBreaksEl.textContent = `${today.completedBreaks} / ${today.targetBreaks}`;
    this.todayFocusEl.textContent = `${Math.round(today.focusScore * 100)}%`;
    this.weekTotalEl.textContent = String(report.totalCompleted);

    const streak = report.currentStreak;
    this.streakValueEl.textContent = streak > 1 ? t('stats.streak_days', streak) : t('stats.streak_day', streak);
    this.streakSubEl.textContent = streak > 1 ? t('stats.streak_sub_plural') : t('stats.streak_sub');
    this.bestStreakEl.textContent = bestStreak > streak ? t('stats.best_streak', bestStreak) : '';

    this.vitalityEl.textContent = `${Math.round(report.vitalityScore)}%`;
    this.analysisEl.textContent = t(report.analysisKey);
  },

  async runExport(format) {
    const btn = format === 'pdf' ? this.exportPdfBtn : this.exportCsvBtn;
    btn.disabled = true;
    this.exportSpinner.hidden = false;
    try {
      if (format === 'pdf') await window.eyecare.stats.exportPdf(this.weekOffset);
      else await window.eyecare.stats.exportCsv(this.weekOffset);
    } finally {
      btn.disabled = false;
      this.exportSpinner.hidden = true;
    }
  },
};

// =====================================================================
// Settings — working-copy form (persisted only on Save)
// =====================================================================

const Settings = {
  formState: null,
  soundOptions: [],
  langOptions: [
    { key: 'system', labelKey: 'settings.lang.system' },
    { key: 'fr', labelKey: 'settings.lang.fr' },
    { key: 'en', labelKey: 'settings.lang.en' },
  ],

  init() {
    this.workSlider = document.getElementById('workSlider');
    this.workValueEl = document.getElementById('workValueLabel');
    this.breakSlider = document.getElementById('breakSlider');
    this.breakValueEl = document.getElementById('breakValueLabel');
    this.soundSelect = document.getElementById('soundSelect');
    this.breakSoundSelect = document.getElementById('breakSoundSelect');
    this.previewSoundBtn = document.getElementById('previewSoundBtn');
    this.previewBreakSoundBtn = document.getElementById('previewBreakSoundBtn');
    this.volumeSlider = document.getElementById('volumeSlider');
    this.volumeValueEl = document.getElementById('volumeValueLabel');
    this.strictToggle = document.getElementById('strictToggle');
    this.systemThemeToggle = document.getElementById('systemThemeToggle');
    this.darkThemeRow = document.getElementById('darkThemeRow');
    this.darkThemeToggle = document.getElementById('darkThemeToggle');
    this.autostartToggle = document.getElementById('autostartToggle');
    this.languageSelect = document.getElementById('languageSelect');
    this.feedbackEl = document.getElementById('feedbackLabel');
    this.resetBtn = document.getElementById('resetSettingsBtn');
    this.cancelBtn = document.getElementById('cancelSettingsBtn');
    this.saveBtn = document.getElementById('saveSettingsBtn');

    this.workSlider.addEventListener('input', () => {
      this.formState.workDurationMinutes = Number(this.workSlider.value);
      this.workValueEl.textContent = t('settings.unit.min', this.formState.workDurationMinutes);
    });
    this.breakSlider.addEventListener('input', () => {
      this.formState.breakDurationSeconds = Number(this.breakSlider.value);
      this.breakValueEl.textContent = t('settings.unit.sec', this.formState.breakDurationSeconds);
    });
    this.volumeSlider.addEventListener('input', () => {
      this.formState.volume = Number(this.volumeSlider.value);
      this.volumeValueEl.textContent = t('settings.unit.percent', this.formState.volume);
    });
    this.soundSelect.addEventListener('change', () => { this.formState.alertSound = this.soundSelect.value; });
    this.breakSoundSelect.addEventListener('change', () => { this.formState.breakDoneSound = this.breakSoundSelect.value; });
    this.previewSoundBtn.addEventListener('click', () => window.eyecare.sounds.preview(this.soundSelect.value, this.formState.volume));
    this.previewBreakSoundBtn.addEventListener('click', () => window.eyecare.sounds.preview(this.breakSoundSelect.value, this.formState.volume));

    this.strictToggle.addEventListener('change', () => { this.formState.strictMode = this.strictToggle.checked; });
    this.systemThemeToggle.addEventListener('change', () => {
      this.formState.systemTheme = this.systemThemeToggle.checked;
      this.darkThemeRow.hidden = this.formState.systemTheme;
    });
    this.darkThemeToggle.addEventListener('change', () => { this.formState.darkTheme = this.darkThemeToggle.checked; });
    this.autostartToggle.addEventListener('change', () => { this.formState.autostartEnabled = this.autostartToggle.checked; });
    this.languageSelect.addEventListener('change', () => { this.formState.language = this.languageSelect.value; });

    this.resetBtn.addEventListener('click', () => this.onReset());
    this.cancelBtn.addEventListener('click', () => showView('dashboard'));
    this.saveBtn.addEventListener('click', () => this.onSave());
  },

  async onShow() {
    this.feedbackEl.textContent = '';
    const [settings, sounds, autostartEnabled] = await Promise.all([
      window.eyecare.settings.get(),
      window.eyecare.sounds.list(),
      window.eyecare.autostart.isEnabled(),
    ]);
    this.soundOptions = sounds;
    this.formState = { ...settings, autostartEnabled };
    this.populateForm();
  },

  populateForm() {
    const s = this.formState;

    this.workSlider.value = String(s.workDurationMinutes);
    this.workValueEl.textContent = t('settings.unit.min', s.workDurationMinutes);
    this.breakSlider.value = String(s.breakDurationSeconds);
    this.breakValueEl.textContent = t('settings.unit.sec', s.breakDurationSeconds);
    this.volumeSlider.value = String(s.volume);
    this.volumeValueEl.textContent = t('settings.unit.percent', s.volume);

    this.fillSoundSelect(this.soundSelect, s.alertSound);
    this.fillSoundSelect(this.breakSoundSelect, s.breakDoneSound);

    this.strictToggle.checked = s.strictMode;
    this.systemThemeToggle.checked = s.systemTheme;
    this.darkThemeRow.hidden = s.systemTheme;
    this.darkThemeToggle.checked = s.darkTheme;
    this.autostartToggle.checked = s.autostartEnabled;

    this.languageSelect.innerHTML = '';
    for (const opt of this.langOptions) {
      const o = document.createElement('option');
      o.value = opt.key;
      o.textContent = t(opt.labelKey);
      this.languageSelect.appendChild(o);
    }
    this.languageSelect.value = s.language;

    this.feedbackEl.textContent = '';
  },

  fillSoundSelect(select, selectedKey) {
    select.innerHTML = '';
    for (const sound of this.soundOptions) {
      const opt = document.createElement('option');
      opt.value = sound.key;
      opt.textContent = sound.label;
      select.appendChild(opt);
    }
    select.value = this.soundOptions.some((sound) => sound.key === selectedKey)
      ? selectedKey
      : (this.soundOptions[0]?.key ?? 'alert');
  },

  async onReset() {
    this.formState = await window.eyecare.settings.getDefaults();
    this.populateForm();
    this.feedbackEl.textContent = t('settings.feedback.reset');
  },

  async onSave() {
    const saved = await window.eyecare.settings.save(this.formState);
    this.formState = { ...saved };
    showView('dashboard');
  },
};

// =====================================================================
// Bootstrap & cross-cutting subscriptions
// =====================================================================

async function bootstrap() {
  const [{ language: lang, bundle: initialBundle }, theme, snapshot] = await Promise.all([
    window.eyecare.i18n.getBundle(),
    window.eyecare.theme.get(),
    window.eyecare.timer.getSnapshot(),
  ]);

  bundle = initialBundle;
  language = lang;
  document.documentElement.lang = language;

  Dashboard.init();
  Stats.init();
  Settings.init();

  applyTranslations(document);
  applyTheme(theme);

  // Subscribe only once the views are wired up — the main process starts
  // ticking the timer immediately on launch, before this async setup resolves.
  window.eyecare.i18n.onChanged(({ language: nextLang, bundle: nextBundle }) => {
    bundle = nextBundle;
    language = nextLang;
    document.documentElement.lang = language;
    applyTranslations(document);
    Dashboard.render();
    if (activeView === 'stats') Stats.reload();
    if (activeView === 'settings') Settings.populateForm();
  });
  window.eyecare.theme.onChanged(applyTheme);
  window.eyecare.timer.onState((state) => Dashboard.onState(state));
  window.eyecare.timer.onTick((payload) => Dashboard.onTick(payload));
  window.eyecare.timer.onPenalty((payload) => Dashboard.onPenalty(payload));

  Dashboard.snapshot = { ...Dashboard.snapshot, ...snapshot };
  Dashboard.render();
  await Dashboard.refreshStats();

  showView('dashboard');
}

bootstrap();
