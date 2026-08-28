(() => {
  'use strict';

  const WORK_SECONDS = 25 * 60;
  const BREAK_SECONDS = 5 * 60;
  const OVERLEARNING_THRESHOLD_SECONDS = 5 * 60; // "large amount of time still remaining"
  const MAX_TITLE_LENGTH = 80;

  const appEl = document.getElementById('app');
  const clockContainer = document.getElementById('clock-container');
  const minutesEl = document.getElementById('minutes');
  const secondsEl = document.getElementById('seconds');
  const colonEl = document.getElementById('colon');
  const timeDisplayEl = document.getElementById('time-display');
  const btnPlay = document.getElementById('btn-play');
  const btnPause = document.getElementById('btn-pause');
  const btnStop = document.getElementById('btn-stop');
  const btnClose = document.getElementById('btn-close');
  const alarmToastEl = document.getElementById('alarm-toast');
  const titleBarEl = document.getElementById('title-bar');
  const titleInput = document.getElementById('title-input');
  const taskEstimateInput = document.getElementById('task-estimate-input');
  const pomodoroCountEl = document.getElementById('pomodoro-count');
  const pomodoroCountTextEl = document.getElementById('pomodoro-count-text');

  const state = {
    sessionType: 'work', // 'work' | 'break'
    breakSeconds: BREAK_SECONDS, // length of the *current* break session (5, or a long break)
    remainingSeconds: WORK_SECONDS,
    running: false,
    endTimestamp: null,
    popupOpen: false, // true whenever a popup window (session-end/settings/about/history) is open
    alarmFired: false,
    // The title is deliberately NOT reset on Stop/completion — like a real title,
    // it persists until the user changes it, so several Pomodoros in a row on the
    // same task don't require retyping it each time. currentTaskLabel is only
    // ever written by commitTitle(); currentTaskEstimate is read fresh at start.
    currentTaskLabel: null,
    currentTaskEstimate: null,
  };

  // Cache of settings owned by the main process (persisted to disk there); the
  // Settings popup is a separate window/renderer and edits these via IPC, then
  // this window is notified so it can live-update the digit color and know
  // whether/when to fire the minute-mark alarm, enforce strict mode, etc.
  const settings = {
    color: '#bfefff',
    alarmEnabled: false,
    alarmMinutes: 5,
    strictMode: false,
    longBreakMinutes: 20,
    hideTitle: false,
    hidePomodoroCount: false,
  };

  let tickIntervalId = null;
  let blinkIntervalId = null;
  let colonVisible = true;

  function isFreshWork() {
    return state.sessionType === 'work' && state.remainingSeconds === WORK_SECONDS;
  }

  function sessionTotal() {
    return state.sessionType === 'work' ? WORK_SECONDS : state.breakSeconds;
  }

  function format(n) {
    return String(n).padStart(2, '0');
  }

  function render() {
    const m = Math.floor(state.remainingSeconds / 60);
    const s = state.remainingSeconds % 60;
    minutesEl.textContent = format(m);
    secondsEl.textContent = format(s);
    updateButtonVisibility();
    updateSessionUiState();
  }

  function updateButtonVisibility() {
    if (state.running) {
      btnPlay.classList.add('hidden');
      const suppressPause = settings.strictMode && state.sessionType === 'work';
      btnPause.classList.toggle('hidden', suppressPause);
      btnStop.classList.remove('hidden');
    } else {
      btnPlay.classList.remove('hidden');
      btnPause.classList.add('hidden');
      btnStop.classList.add('hidden');
    }
  }

  // The title is editable only before a fresh work session starts; once it's
  // underway — running OR paused mid-session — it becomes read-only (still
  // visible, showing whatever was committed) so pausing doesn't hide what
  // you're working on. It's hidden entirely on breaks or when Settings' "Hide
  // title" is on (see #app.title-hidden in style.css). The estimate field is
  // only shown/usable during that same pre-start window.
  function updateSessionUiState() {
    const editable = isFreshWork() && !state.running;
    titleInput.disabled = !editable;
    const hasValue = !!titleInput.value.trim();
    titleBarEl.classList.toggle('empty-and-locked', !editable && !hasValue);

    const workInProgress = state.sessionType === 'work' && !isFreshWork();
    appEl.classList.toggle('task-in-progress', workInProgress);
  }

  // Reads whatever's currently in the title field and locks it in as the
  // session's title (trimmed, capped, empty -> null). Fired on blur (covers
  // both an explicit Enter-triggered blur and simply clicking Play/elsewhere
  // without pressing Enter first) and defensively again at the top of
  // startCountdown(). No-ops outside the editable window.
  function commitTitle() {
    if (!isFreshWork() || state.running) return;
    if (settings.hideTitle) {
      state.currentTaskLabel = null;
      return;
    }
    const trimmed = titleInput.value.trim().slice(0, MAX_TITLE_LENGTH);
    titleInput.value = trimmed;
    state.currentTaskLabel = trimmed || null;
  }

  function tick() {
    const remaining = Math.max(0, Math.round((state.endTimestamp - Date.now()) / 1000));
    if (remaining !== state.remainingSeconds) {
      state.remainingSeconds = remaining;
      render();
      checkAlarm();
    }
    if (remaining <= 0) {
      stopTickTimer();
      state.running = false;
      updateButtonVisibility();
      onSessionComplete();
    }
  }

  function startTickTimer() {
    stopTickTimer();
    tickIntervalId = setInterval(tick, 200);
  }

  function stopTickTimer() {
    if (tickIntervalId !== null) {
      clearInterval(tickIntervalId);
      tickIntervalId = null;
    }
  }

  function startCountdown() {
    if (isFreshWork()) {
      commitTitle();
      const estimate = parseInt(taskEstimateInput.value, 10);
      state.currentTaskEstimate = Number.isFinite(estimate) && estimate > 0 ? estimate : null;
    }
    state.endTimestamp = Date.now() + state.remainingSeconds * 1000;
    state.running = true;
    startTickTimer();
    updateButtonVisibility();
    updateSessionUiState();
  }

  function pauseCountdown() {
    if (!state.running) return;
    if (settings.strictMode && state.sessionType === 'work') return; // Pause is hidden, but guard anyway
    state.endTimestamp && tick();
    stopTickTimer();
    state.running = false;
    updateButtonVisibility();
  }

  function stopCountdown() {
    const wasWorkInProgress = state.running && state.sessionType === 'work';
    const remainingBeforeStop = state.remainingSeconds;

    stopTickTimer();
    state.running = false;
    state.remainingSeconds = sessionTotal();
    state.alarmFired = false;
    render();

    if (wasWorkInProgress) {
      if (settings.strictMode) {
        showToast('Pomodoro voided — not counted.');
      } else if (remainingBeforeStop > OVERLEARNING_THRESHOLD_SECONDS) {
        showToast('Finished early? Use the rest of the Pomodoro to review or polish your work.');
      }
    }
  }

  async function onSessionComplete() {
    if (state.sessionType === 'work') {
      let result = { cycleCount: 0, completedToday: 0, longBreak: false };
      try {
        result = await window.neon.completeWorkSession({
          taskLabel: state.currentTaskLabel,
          estimatePomodoros: state.currentTaskEstimate,
        });
      } catch {
        // main process unreachable; still let the user proceed to the popup
      }
      updatePomodoroCount(result.cycleCount, result.completedToday);
      window.neon.openSessionEndPopup(result.longBreak);
    } else {
      // Break finished: auto-start the next 25-minute work session.
      state.sessionType = 'work';
      appEl.classList.remove('break');
      appEl.classList.add('work');
      state.remainingSeconds = WORK_SECONDS;
      state.alarmFired = false;
      render();
      startCountdown();
    }
  }

  window.neon.onSessionEndChoice(({ choice, breakMinutes }) => {
    if (choice === 'not-now') {
      state.sessionType = 'work';
      appEl.classList.remove('break');
      appEl.classList.add('work');
      state.remainingSeconds = WORK_SECONDS;
      state.alarmFired = false;
      render();
      startCountdown();
    } else if (choice === 'yes') {
      state.sessionType = 'break';
      state.breakSeconds = (Number.isFinite(breakMinutes) && breakMinutes > 0 ? breakMinutes : 5) * 60;
      appEl.classList.remove('work');
      appEl.classList.add('break');
      state.remainingSeconds = state.breakSeconds;
      state.alarmFired = false;
      render();
      startCountdown();
    }
  });

  // A popup window (session-end / settings / about / history) is open or closed.
  // While open, hide the hover controls/close button and ignore right-click/drag —
  // the popup being `modal: true` with `parent: mainWindow` already blocks OS
  // input to this window, this just keeps the UI visually consistent with that.
  window.neon.onOverlayState((open) => {
    state.popupOpen = open;
    appEl.classList.toggle('modal-open', open);
  });

  // --- controls ------------------------------------------------------------

  btnPlay.addEventListener('click', () => {
    if (state.remainingSeconds <= 0) return;
    startCountdown();
  });

  btnPause.addEventListener('click', () => {
    pauseCountdown();
  });

  btnStop.addEventListener('click', () => {
    stopCountdown();
  });

  btnClose.addEventListener('click', () => {
    window.neon.quitApp();
  });

  // --- title (above the digits) ---------------------------------------------------

  titleInput.addEventListener('blur', commitTitle);
  titleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      titleInput.blur();
    }
  });

  // --- colon blink (only while running) -------------------------------------

  blinkIntervalId = setInterval(() => {
    if (!state.running) {
      if (!colonVisible) {
        colonVisible = true;
        colonEl.classList.remove('dim');
      }
      return;
    }
    colonVisible = !colonVisible;
    colonEl.classList.toggle('dim', !colonVisible);
  }, 500);

  // --- right-click menu -------------------------------------------------

  clockContainer.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (state.popupOpen) return;
    window.neon.showContextMenu();
  });

  // --- settings (digit color, alarm, strict mode, long break, title) --------------
  // Source of truth lives in the main process (persisted to disk); the Settings
  // popup is a separate window that edits it via IPC and we're notified here.

  function lighten(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255;
    let g = (n >> 8) & 255;
    let b = n & 255;
    r = Math.round(r + (255 - r) * amount);
    g = Math.round(g + (255 - g) * amount);
    b = Math.round(b + (255 - b) * amount);
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  function applyColor(hex) {
    document.documentElement.style.setProperty('--accent-work', hex);
    document.documentElement.style.setProperty('--accent-work-glow', lighten(hex, 0.35));
  }

  function applySettings(s) {
    if (!s) return;
    settings.color = s.color;
    settings.alarmEnabled = s.alarmEnabled;
    settings.alarmMinutes = s.alarmMinutes;
    settings.strictMode = !!s.strictMode;
    settings.longBreakMinutes = s.longBreakMinutes;
    settings.hideTitle = !!s.hideTitle;
    settings.hidePomodoroCount = !!s.hidePomodoroCount;
    applyColor(settings.color);
    appEl.classList.toggle('title-hidden', settings.hideTitle);
    appEl.classList.toggle('count-hidden', settings.hidePomodoroCount);
    updateButtonVisibility(); // strict mode may have just toggled Pause's visibility live
  }

  window.neon.getSettings().then(applySettings);
  window.neon.onSettingsChanged(applySettings);

  // --- Pomodoro progress (today's tally + 4-cycle count) ----------------------------

  function updatePomodoroCount(cycleCount, completedToday) {
    pomodoroCountTextEl.textContent = `Pomodoro ${cycleCount}/4`;
    const label = completedToday === 1 ? '1 pomodoro completed today' : `${completedToday} pomodoros completed today`;
    pomodoroCountEl.title = label;
  }

  window.neon.getProgress().then((p) => {
    if (p) updatePomodoroCount(p.cycleCount, p.completedToday);
  });

  // --- minute-mark alarm (sound + visible cue) ------------------------------------

  const alarmAudio = new Audio('assets/beep.wav');
  let toastTimeoutId = null;

  function checkAlarm() {
    if (!settings.alarmEnabled || state.alarmFired) return;
    const markSeconds = settings.alarmMinutes * 60;
    if (markSeconds >= sessionTotal()) return;
    if (state.remainingSeconds === markSeconds) {
      state.alarmFired = true;
      triggerAlarm();
    }
  }

  function triggerAlarm() {
    try {
      alarmAudio.currentTime = 0;
      alarmAudio.play().catch(() => {});
    } catch {
      // ignore playback failures (e.g. no audio device)
    }
    const label = settings.alarmMinutes === 1 ? '1 minute remaining' : `${settings.alarmMinutes} minutes remaining`;
    showToast(label);
    pulseDigits();
  }

  function showToast(text) {
    alarmToastEl.textContent = text;
    alarmToastEl.classList.remove('hidden');
    requestAnimationFrame(() => alarmToastEl.classList.add('show'));
    clearTimeout(toastTimeoutId);
    toastTimeoutId = setTimeout(() => {
      alarmToastEl.classList.remove('show');
      setTimeout(() => alarmToastEl.classList.add('hidden'), 400);
    }, 3000);
  }

  function pulseDigits() {
    timeDisplayEl.classList.remove('pulse');
    void timeDisplayEl.offsetWidth; // restart animation
    timeDisplayEl.classList.add('pulse');
  }

  // --- custom window drag (whole clock body) --------------------------------------
  // Driven entirely in JS rather than -webkit-app-region: drag, so the OS never
  // treats the clock body as a title bar (which on Windows swallows right-clicks).

  let dragState = null;
  let dragRafPending = false;
  let pendingDragPos = null;

  clockContainer.addEventListener('mousedown', async (e) => {
    if (e.button !== 0) return;
    if (state.popupOpen) return;
    if (e.target.closest('.no-drag, .resize-handle')) return;

    const bounds = await window.neon.getWindowBounds();
    if (!bounds) return;

    dragState = {
      startMouseX: e.screenX,
      startMouseY: e.screenY,
      startX: bounds.x,
      startY: bounds.y,
    };
    clockContainer.classList.add('dragging');
    document.addEventListener('mousemove', onDragMouseMove);
    document.addEventListener('mouseup', onDragMouseUp);
  });

  function onDragMouseMove(e) {
    if (!dragState) return;
    const dx = e.screenX - dragState.startMouseX;
    const dy = e.screenY - dragState.startMouseY;
    pendingDragPos = { x: dragState.startX + dx, y: dragState.startY + dy };
    if (!dragRafPending) {
      dragRafPending = true;
      requestAnimationFrame(() => {
        dragRafPending = false;
        if (pendingDragPos) window.neon.moveWindow(pendingDragPos);
      });
    }
  }

  function onDragMouseUp() {
    dragState = null;
    pendingDragPos = null;
    clockContainer.classList.remove('dragging');
    document.removeEventListener('mousemove', onDragMouseMove);
    document.removeEventListener('mouseup', onDragMouseUp);
  }

  // --- custom corner resize ---------------------------------------------------

  let constraints = { aspectRatio: 2.75, minWidth: 90, minHeight: 33, maxWidth: 1600, maxHeight: 582 };
  window.neon.getResizeConstraints().then((c) => {
    if (c) constraints = c;
  });

  let resizeState = null; // { corner, startMouseX, startMouseY, startBounds }
  let rafPending = false;
  let pendingBounds = null;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function computeNewBounds(clientX, clientY) {
    const { corner, startMouseX, startMouseY, startBounds } = resizeState;
    const { aspectRatio, minWidth, minHeight, maxWidth, maxHeight } = constraints;

    const deltaX = clientX - startMouseX;
    const deltaY = clientY - startMouseY;

    const widthDeltaFromX = corner.includes('r') ? deltaX : -deltaX;
    const heightDeltaFromY = corner.includes('b') ? deltaY : -deltaY;

    const effectiveDelta =
      Math.abs(widthDeltaFromX) >= Math.abs(heightDeltaFromY * aspectRatio)
        ? widthDeltaFromX
        : heightDeltaFromY * aspectRatio;

    let newWidth = clamp(Math.round(startBounds.width + effectiveDelta), minWidth, maxWidth);
    let newHeight = Math.round(newWidth / aspectRatio);
    if (newHeight < minHeight) {
      newHeight = minHeight;
      newWidth = Math.round(newHeight * aspectRatio);
    }
    if (newHeight > maxHeight) {
      newHeight = maxHeight;
      newWidth = Math.round(newHeight * aspectRatio);
    }

    let newX = startBounds.x;
    let newY = startBounds.y;

    if (corner === 'tl') {
      newX = startBounds.x + startBounds.width - newWidth;
      newY = startBounds.y + startBounds.height - newHeight;
    } else if (corner === 'tr') {
      newX = startBounds.x;
      newY = startBounds.y + startBounds.height - newHeight;
    } else if (corner === 'bl') {
      newX = startBounds.x + startBounds.width - newWidth;
      newY = startBounds.y;
    } else if (corner === 'br') {
      newX = startBounds.x;
      newY = startBounds.y;
    }

    return { x: newX, y: newY, width: newWidth, height: newHeight };
  }

  function onResizeMouseMove(e) {
    if (!resizeState) return;
    pendingBounds = computeNewBounds(e.screenX, e.screenY);
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        if (pendingBounds) window.neon.resizeWindow(pendingBounds);
      });
    }
  }

  function onResizeMouseUp() {
    resizeState = null;
    pendingBounds = null;
    document.removeEventListener('mousemove', onResizeMouseMove);
    document.removeEventListener('mouseup', onResizeMouseUp);
  }

  document.querySelectorAll('.resize-handle').forEach((handle) => {
    handle.addEventListener('mousedown', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const corner = handle.dataset.corner;
      const startBounds = await window.neon.getWindowBounds();
      if (!startBounds) return;
      resizeState = {
        corner,
        startMouseX: e.screenX,
        startMouseY: e.screenY,
        startBounds,
      };
      document.addEventListener('mousemove', onResizeMouseMove);
      document.addEventListener('mouseup', onResizeMouseUp);
    });
  });

  // --- init --------------------------------------------------------------

  render();
})();
