(() => {
  'use strict';

  const WIKI_URL = 'https://en.wikipedia.org/wiki/Pomodoro_Technique';
  const DEFAULT_COLOR = '#bfefff';
  const DEFAULT_ALARM_MINUTES = 5;
  const DEFAULT_LONG_BREAK_MINUTES = 20;

  const params = new URLSearchParams(location.search);
  const type = params.get('type');

  const popupCloseX = document.getElementById('popup-close-x');
  const panels = {
    'session-end': document.getElementById('panel-session-end'),
    'about-pomodoro': document.getElementById('panel-info'),
    'about-app': document.getElementById('panel-info'),
    settings: document.getElementById('panel-settings'),
    history: document.getElementById('panel-history'),
  };

  const INFO_CONTENT = {
    'about-pomodoro': {
      title: 'The Pomodoro Technique',
      html: `
        <p>The Pomodoro Technique is a time-management method created by Francesco Cirillo in the
        late 1980s. It breaks work into focused intervals ("pomodoros"), separated by short
        breaks, to keep concentration high and mental fatigue low.</p>
        <ol>
          <li>Pick one task to focus on.</li>
          <li>Work on it for 25 focused minutes, without interruption.</li>
          <li>When the timer ends, take a short 5-minute break.</li>
          <li>Every 4 pomodoros, take a longer break (15&ndash;30 minutes).</li>
        </ol>
        <p>Learn more: <a href="#" id="wiki-link">Pomodoro Technique &mdash; Wikipedia</a></p>
      `,
    },
    'about-app': {
      title: 'About NeonModoro',
      html: `
        <p>NeonModoro is a minimal, transparent, always-on-top Pomodoro timer that floats
        directly on your desktop as glowing seven-segment digits &mdash; no window frame, no
        background.</p>
        <ul>
          <li><strong>Move it:</strong> click and drag anywhere on the digits.</li>
          <li><strong>Resize it:</strong> drag from any corner.</li>
          <li><strong>Title:</strong> click above the digits to name what you're working on
          (optional) &mdash; press Enter or Play to set it.</li>
          <li><strong>Pomodoro count:</strong> beneath the digits, counts up as you complete
          work sessions, toward your next long break (out of 4).</li>
          <li><strong>Controls:</strong> hover over the clock to reveal Play / Pause / Stop.</li>
          <li><strong>Menu:</strong> right-click anywhere on the clock for Settings, History,
          About, and Quit.</li>
          <li><strong>Quit:</strong> the &times; button (top-right, on hover) or right-click
          &rarr; Quit.</li>
        </ul>
        <p>25-minute work sessions, 5-minute breaks, a longer break every 4th Pomodoro &mdash;
        ice-blue while you work, neon green on break.</p>
      `,
    },
  };

  function showPanel(t) {
    Object.values(panels).forEach((el) => el.classList.add('hidden'));
    const panel = panels[t];
    if (panel) panel.classList.remove('hidden');
  }

  function initSessionEnd() {
    popupCloseX.style.display = 'none'; // must resolve via Not now / Yes, no free dismissal

    const longBreak = params.get('longBreak') === '1';
    const minutes = parseInt(params.get('minutes'), 10) || 5;

    const msgEl = document.getElementById('session-end-message');
    const qEl = document.getElementById('session-end-question');
    if (longBreak) {
      msgEl.textContent = "4 pomodoros done! Time for a longer break.";
      qEl.textContent = `Start the ${minutes} minute break now?`;
    } else {
      msgEl.textContent = 'Pomodoro finished! Time for a 5 minute break.';
      qEl.textContent = 'Start the 5 minute break now?';
    }

    document.getElementById('btn-not-now').addEventListener('click', () => {
      window.neonPopup.sessionEndChoice('not-now');
    });
    document.getElementById('btn-yes').addEventListener('click', () => {
      window.neonPopup.sessionEndChoice('yes');
    });
  }

  function initInfo(t) {
    const content = INFO_CONTENT[t];
    if (!content) return;
    document.getElementById('info-title').textContent = content.title;
    const bodyEl = document.getElementById('info-body');
    bodyEl.innerHTML = content.html;
    const link = bodyEl.querySelector('#wiki-link');
    if (link) {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        window.neonPopup.openExternal(WIKI_URL);
      });
    }
    document.getElementById('btn-info-close').addEventListener('click', () => {
      window.neonPopup.closePopup();
    });
    popupCloseX.addEventListener('click', () => window.neonPopup.closePopup());
  }

  function initSettings() {
    const colorInput = document.getElementById('setting-color');
    const alarmEnabledInput = document.getElementById('setting-alarm-enabled');
    const alarmMinutesInput = document.getElementById('setting-alarm-minutes');
    const longBreakInput = document.getElementById('setting-long-break-minutes');
    const strictModeInput = document.getElementById('setting-strict-mode');
    const hideTitleInput = document.getElementById('setting-hide-title');
    const hideCountInput = document.getElementById('setting-hide-count');
    const btnReset = document.getElementById('btn-settings-reset');
    const btnClose = document.getElementById('btn-settings-close');

    function applyToForm(settings) {
      colorInput.value = settings.color;
      alarmEnabledInput.checked = settings.alarmEnabled;
      alarmMinutesInput.value = settings.alarmMinutes;
      alarmMinutesInput.disabled = !settings.alarmEnabled;
      longBreakInput.value = settings.longBreakMinutes;
      strictModeInput.checked = settings.strictMode;
      hideTitleInput.checked = settings.hideTitle;
      hideCountInput.checked = settings.hidePomodoroCount;
    }

    window.neonPopup.getSettings().then(applyToForm);

    colorInput.addEventListener('input', () => {
      window.neonPopup.updateSettings({ color: colorInput.value });
    });

    alarmEnabledInput.addEventListener('change', () => {
      alarmMinutesInput.disabled = !alarmEnabledInput.checked;
      window.neonPopup.updateSettings({ alarmEnabled: alarmEnabledInput.checked });
    });

    alarmMinutesInput.addEventListener('change', () => {
      let v = parseInt(alarmMinutesInput.value, 10);
      if (!Number.isFinite(v) || v < 1) v = 1;
      if (v > 24) v = 24;
      alarmMinutesInput.value = v;
      window.neonPopup.updateSettings({ alarmMinutes: v });
    });

    longBreakInput.addEventListener('change', () => {
      let v = parseInt(longBreakInput.value, 10);
      if (!Number.isFinite(v) || v < 15) v = 15;
      if (v > 30) v = 30;
      longBreakInput.value = v;
      window.neonPopup.updateSettings({ longBreakMinutes: v });
    });

    strictModeInput.addEventListener('change', () => {
      window.neonPopup.updateSettings({ strictMode: strictModeInput.checked });
    });

    hideTitleInput.addEventListener('change', () => {
      window.neonPopup.updateSettings({ hideTitle: hideTitleInput.checked });
    });

    hideCountInput.addEventListener('change', () => {
      window.neonPopup.updateSettings({ hidePomodoroCount: hideCountInput.checked });
    });

    btnReset.addEventListener('click', () => {
      const defaults = {
        color: DEFAULT_COLOR,
        alarmEnabled: false,
        alarmMinutes: DEFAULT_ALARM_MINUTES,
        strictMode: false,
        longBreakMinutes: DEFAULT_LONG_BREAK_MINUTES,
        hideTitle: false,
        hidePomodoroCount: false,
      };
      applyToForm(defaults);
      window.neonPopup.resetSettings();
    });

    btnClose.addEventListener('click', () => {
      window.neonPopup.closePopup();
    });

    popupCloseX.addEventListener('click', () => window.neonPopup.closePopup());
  }

  function formatTimestamp(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const datePart = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const timePart = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return `${datePart} ${timePart}`;
  }

  // dd/mm/yyyy, used only for the "Untitled ..." fallback label — not the primary
  // (locale-formatted) timestamp shown alongside every row.
  function formatDateDMY(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'Untitled';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `Untitled ${dd}/${mm}/${yyyy}`;
  }

  function entryLabel(entry) {
    return entry.taskLabel || formatDateDMY(entry.timestamp);
  }

  function renderHistoryList(entries) {
    const listEl = document.getElementById('history-list');
    listEl.textContent = '';

    if (!entries.length) {
      const empty = document.createElement('p');
      empty.className = 'history-empty';
      empty.textContent = 'No completed pomodoros yet.';
      listEl.appendChild(empty);
      return;
    }

    const sorted = [...entries].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    for (const entry of sorted) {
      const row = document.createElement('div');
      row.className = 'history-row';

      const time = document.createElement('span');
      time.className = 'history-time';
      time.textContent = formatTimestamp(entry.timestamp);
      row.appendChild(time);

      const label = document.createElement('span');
      label.className = 'history-label';
      label.textContent = entryLabel(entry);
      row.appendChild(label);

      if (entry.longBreak) {
        const badge = document.createElement('span');
        badge.className = 'history-badge';
        badge.textContent = 'long break';
        row.appendChild(badge);
      }

      listEl.appendChild(row);
    }
  }

  // "Today's tasks" summary: actual completed vs. the most recently entered
  // estimate, grouped by exact label text (no fuzzy matching, per the report).
  // Untitled entries group together too, under today's "Untitled dd/mm/yyyy" —
  // they all share the same fallback label since the summary is same-day only.
  function renderHistorySummary(entries) {
    const summaryEl = document.getElementById('history-summary');
    summaryEl.textContent = '';

    const todayStr = new Date().toDateString();
    const byLabel = new Map();
    for (const entry of entries) {
      if (new Date(entry.timestamp).toDateString() !== todayStr) continue;
      const key = entryLabel(entry);
      const cur = byLabel.get(key) || { actual: 0, estimate: null };
      cur.actual += 1;
      if (entry.estimatePomodoros) cur.estimate = entry.estimatePomodoros;
      byLabel.set(key, cur);
    }
    if (byLabel.size === 0) return;

    const heading = document.createElement('h3');
    heading.className = 'history-summary-title';
    heading.textContent = "Today's tasks";
    summaryEl.appendChild(heading);

    for (const [label, v] of byLabel) {
      const row = document.createElement('div');
      row.className = 'history-summary-row';
      row.textContent = v.estimate ? `${label}: ${v.actual} / ${v.estimate} estimated` : `${label}: ${v.actual} completed`;
      summaryEl.appendChild(row);
    }
  }

  function initHistory() {
    window.neonPopup.getHistory().then((entries) => {
      const list = Array.isArray(entries) ? entries : [];
      renderHistorySummary(list);
      renderHistoryList(list);
    });
    document.getElementById('btn-history-close').addEventListener('click', () => {
      window.neonPopup.closePopup();
    });
    popupCloseX.addEventListener('click', () => window.neonPopup.closePopup());
  }

  showPanel(type);

  if (type === 'session-end') initSessionEnd();
  else if (type === 'about-pomodoro' || type === 'about-app') initInfo(type);
  else if (type === 'settings') initSettings();
  else if (type === 'history') initHistory();
})();
