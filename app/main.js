const { app, BrowserWindow, ipcMain, Menu, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const ALLOWED_EXTERNAL_HOSTS = ['en.wikipedia.org'];
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const MAX_LABEL_LENGTH = 80;
const MAX_HISTORY_ENTRIES = 5000; // generous soft cap, not a real retention policy

function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function todayString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function sanitizeTaskLabel(label) {
  if (typeof label !== 'string') return null;
  const trimmed = label.trim().slice(0, MAX_LABEL_LENGTH);
  return trimmed.length ? trimmed : null;
}

function sanitizeEstimate(n) {
  if (!isFiniteNumber(n)) return null;
  return Math.min(99, Math.max(1, Math.round(n)));
}

// Every IPC channel below is only ever driven by our own local, non-remote pages —
// there's no network content and no nodeIntegration — but inputs are still validated
// here rather than trusted blindly. Defense in depth: if a future change ever let
// unexpected content run in a renderer, a malformed/hostile IPC payload still
// can't corrupt window state, get persisted to disk, or get replayed to another window.
function sanitizeSettingsPartial(partial) {
  if (!partial || typeof partial !== 'object') return {};
  const out = {};
  if (typeof partial.color === 'string' && HEX_COLOR_RE.test(partial.color)) {
    out.color = partial.color;
  }
  if (typeof partial.alarmEnabled === 'boolean') {
    out.alarmEnabled = partial.alarmEnabled;
  }
  if (isFiniteNumber(partial.alarmMinutes)) {
    out.alarmMinutes = Math.min(24, Math.max(1, Math.round(partial.alarmMinutes)));
  }
  if (typeof partial.strictMode === 'boolean') {
    out.strictMode = partial.strictMode;
  }
  if (isFiniteNumber(partial.longBreakMinutes)) {
    out.longBreakMinutes = Math.min(30, Math.max(15, Math.round(partial.longBreakMinutes)));
  }
  if (typeof partial.hideTitle === 'boolean') {
    out.hideTitle = partial.hideTitle;
  }
  if (typeof partial.hidePomodoroCount === 'boolean') {
    out.hidePomodoroCount = partial.hidePomodoroCount;
  }
  return out;
}

function sanitizeSessionPayload(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  return {
    taskLabel: sanitizeTaskLabel(p.taskLabel),
    estimatePomodoros: sanitizeEstimate(p.estimatePomodoros),
  };
}

// Blocks window.open()-style new windows and any navigation away from the app's
// own bundled pages, on every BrowserWindow we create. Nothing in this app ever
// needs either (external links go through the whitelisted open-external channel
// instead), so both are simply denied outright.
function hardenWindow(win) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
}

// Clock face aspect ratio (width / height) that the digit layout is designed around.
// Was 2.75 (digits alone) at v1; the clock face now also stacks a title above the
// digits and a Pomodoro-count row below them, which the original ratio was too
// short to fit — at the default size those were rendering clipped in half. 2.4
// gives that extra row room without needing to shrink the digits themselves.
const ASPECT_RATIO = 2.4;
const MIN_WIDTH = 90;
const MIN_HEIGHT = Math.round(MIN_WIDTH / ASPECT_RATIO);

const DEFAULT_SETTINGS = {
  color: '#bfefff',
  alarmEnabled: false,
  alarmMinutes: 5,
  strictMode: false,
  longBreakMinutes: 20,
  hideTitle: false,
  hidePomodoroCount: false,
};

// Popups are independent fixed-size windows (not overlays inside the clock window),
// so their size/legibility never depends on how small/large the clock currently is.
// About-pomodoro/about-app are intentionally NOT sized to guarantee their text fits —
// their body text now scrolls internally (see .info-body in style.css) rather than
// relying on the window being tall enough for whatever the content happens to be.
const POPUP_SIZES = {
  'session-end': { width: 340, height: 230 },
  'about-pomodoro': { width: 380, height: 420 },
  'about-app': { width: 380, height: 420 },
  settings: { width: 340, height: 430 },
  history: { width: 380, height: 440 },
};

let mainWindow = null;
let activePopup = null; // { type, window }
let maxWidth = 1600;
let maxHeight = Math.round(maxWidth / ASPECT_RATIO);
let appSettings = { ...DEFAULT_SETTINGS };

// progress = today's Pomodoro tally: completedToday (grows all day, shown as a
// tooltip) and cycleCount (0-3, position within the current run of 4 — drives the
// long-break offer). Both are scoped to a calendar day, separate from history.
let progress = { date: todayString(), completedToday: 0, cycleCount: 0 };
let history = []; // append-only log of completed work sessions — see history.json

// Set right before opening a session-end popup, read when its choice comes back,
// so the popup and the "how long is the break" decision stay in sync without
// threading extra state through every IPC call in between.
let pendingSessionEnd = { longBreak: false, breakMinutes: 5 };

function userDataFile(name) {
  return path.join(app.getPath('userData'), name);
}

// BrowserWindow's `icon` option only actually does something on Windows/Linux
// (taskbar icon); macOS ignores it and takes the dock icon from the app
// bundle's Info.plist instead (wired via build.mac.icon in package.json).
// Picking the right container per platform here is still worth doing so a
// dev run (`npm start`, unpackaged) shows a correct icon everywhere it can.
function windowIconPath() {
  if (process.platform === 'darwin') return path.join(__dirname, 'assets', 'icon.icns');
  if (process.platform === 'linux') return path.join(__dirname, 'assets', 'icon.png');
  return path.join(__dirname, 'assets', 'icon.ico');
}

// Best-effort only — Electron has no API to query whether a compositor is
// actually running. Presence of a Wayland display or a known compositing
// desktop environment is a reasonably strong positive signal; its absence
// doesn't *prove* the window will render broken (plenty of window managers
// composite without setting these), so this only ever warns, never blocks.
// See the Linux section of README.md for what actually goes wrong without a
// compositor: transparent()`true` renders the "transparent" area solid black.
function warnIfLikelyNoCompositor() {
  if (process.platform !== 'linux') return;
  const hasWaylandCompositor = !!process.env.WAYLAND_DISPLAY;
  const knownCompositingDE = ['GNOME', 'KDE', 'XFCE', 'Cinnamon', 'MATE', 'Unity', 'Budgie', 'Pantheon']
    .some((name) => (process.env.XDG_CURRENT_DESKTOP || '').includes(name));
  if (!hasWaylandCompositor && !knownCompositingDE) {
    console.warn(
      '[NeonModoro] Could not confirm a compositing window manager is running. ' +
      "If the clock renders with a solid black background instead of a transparent one, " +
      'your desktop environment likely isn\'t compositing — see the Linux section of README.md.'
    );
  }
}

function loadSettings() {
  try {
    const raw = fs.readFileSync(userDataFile('settings.json'), 'utf8');
    appSettings = { ...DEFAULT_SETTINGS, ...sanitizeSettingsPartial(JSON.parse(raw)) };
  } catch {
    appSettings = { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(userDataFile('settings.json')), { recursive: true });
    fs.writeFileSync(userDataFile('settings.json'), JSON.stringify(appSettings));
  } catch {
    // non-fatal: settings just won't persist this run
  }
}

function broadcastSettings() {
  if (mainWindow) mainWindow.webContents.send('settings-changed', appSettings);
}

// Progress (today's Pomodoro count / cycle position) persists across restarts —
// unlike the live countdown, which always starts fresh — but only for the current
// calendar day, matching Cirillo's day-scoped "Records" rhythm.
function loadProgress() {
  try {
    const raw = fs.readFileSync(userDataFile('progress.json'), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.date === todayString()) {
      progress = {
        date: todayString(),
        completedToday: isFiniteNumber(parsed.completedToday) ? Math.max(0, Math.round(parsed.completedToday)) : 0,
        cycleCount: isFiniteNumber(parsed.cycleCount) ? Math.min(3, Math.max(0, Math.round(parsed.cycleCount))) : 0,
      };
      return;
    }
  } catch {
    // fall through to a fresh day below
  }
  progress = { date: todayString(), completedToday: 0, cycleCount: 0 };
}

function saveProgress() {
  try {
    fs.mkdirSync(path.dirname(userDataFile('progress.json')), { recursive: true });
    fs.writeFileSync(userDataFile('progress.json'), JSON.stringify(progress));
  } catch {
    // non-fatal
  }
}

// Rolls progress over to a fresh day if the date has changed since it was loaded
// (covers both "app relaunched on a new day" and "left running across midnight").
function ensureTodayProgress() {
  const today = todayString();
  if (progress.date !== today) {
    progress = { date: today, completedToday: 0, cycleCount: 0 };
    saveProgress();
  }
}

function loadHistory() {
  try {
    const raw = fs.readFileSync(userDataFile('history.json'), 'utf8');
    const parsed = JSON.parse(raw);
    history = Array.isArray(parsed) ? parsed : [];
  } catch {
    history = [];
  }
}

function saveHistory() {
  try {
    fs.mkdirSync(path.dirname(userDataFile('history.json')), { recursive: true });
    fs.writeFileSync(userDataFile('history.json'), JSON.stringify(history));
  } catch {
    // non-fatal: this run's history just won't be saved
  }
}

function appendHistoryEntry(entry) {
  history.push(entry);
  if (history.length > MAX_HISTORY_ENTRIES) {
    history = history.slice(history.length - MAX_HISTORY_ENTRIES);
  }
  saveHistory();
}

function computeMaxSize() {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  let mw = Math.round(sw * 0.92);
  let mh = Math.round(mw / ASPECT_RATIO);
  if (mh > sh * 0.92) {
    mh = Math.round(sh * 0.92);
    mw = Math.round(mh * ASPECT_RATIO);
  }
  maxWidth = mw;
  maxHeight = mh;
}

function clampBounds(bounds) {
  let { x, y, width, height } = bounds;

  width = Math.max(MIN_WIDTH, Math.min(maxWidth, Math.round(width)));
  height = Math.round(width / ASPECT_RATIO);
  if (height < MIN_HEIGHT) {
    height = MIN_HEIGHT;
    width = Math.round(height * ASPECT_RATIO);
  }
  if (height > maxHeight) {
    height = maxHeight;
    width = Math.round(height * ASPECT_RATIO);
  }

  return { x: Math.round(x), y: Math.round(y), width, height };
}

function createWindow() {
  computeMaxSize();

  const startWidth = 360;
  const startHeight = Math.round(startWidth / ASPECT_RATIO);

  mainWindow = new BrowserWindow({
    width: startWidth,
    height: startHeight,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    maxWidth,
    maxHeight,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    resizable: true,
    hasShadow: false,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    icon: windowIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.setAspectRatio(ASPECT_RATIO);
  mainWindow.setMenuBarVisibility(false);
  if (process.platform === 'darwin') {
    // Plain alwaysOnTop:true can still be covered by other apps' fullscreen
    // spaces on macOS. 'floating' keeps the clock above those too, matching
    // the "always visible" behavior the Windows build already gets by default.
    mainWindow.setAlwaysOnTop(true, 'floating');
  }
  hardenWindow(mainWindow);
  mainWindow.loadFile('index.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// --- popup windows (About / Settings / History / session-end) -------------------
// Fixed-size, independent top-level windows — deliberately NOT sized off the clock
// window, so they stay fully legible even when the clock is shrunk to its minimum.

function openPopup(type, extraQuery) {
  if (activePopup) {
    if (activePopup.type === type) activePopup.window.focus();
    return;
  }
  const size = POPUP_SIZES[type];
  if (!size || !mainWindow) return;

  const win = new BrowserWindow({
    width: size.width,
    height: size.height,
    resizable: false,
    minimizable: false,
    maximizable: false,
    frame: false,
    transparent: true,
    hasShadow: true,
    alwaysOnTop: true,
    parent: mainWindow,
    modal: true,
    show: false,
    icon: windowIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'popup-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.setMenuBarVisibility(false);
  if (process.platform === 'darwin') {
    win.setAlwaysOnTop(true, 'floating');
  }
  hardenWindow(win);
  win.loadFile('popup.html', { query: { type, ...(extraQuery || {}) } });

  win.once('ready-to-show', () => {
    win.center();
    win.show();
  });

  activePopup = { type, window: win };
  mainWindow.webContents.send('overlay-state', true);

  win.on('closed', () => {
    activePopup = null;
    if (mainWindow) mainWindow.webContents.send('overlay-state', false);
  });
}

app.whenReady().then(() => {
  loadSettings();
  loadProgress();
  loadHistory();
  warnIfLikelyNoCompositor();
  if (process.platform === 'darwin' && app.dock) {
    // Only matters for an unpackaged dev run (`npm start`) — a packaged .app
    // already gets its dock icon from the bundle's Info.plist (assets/icon.icns
    // via build.mac.icon in package.json).
    try {
      app.dock.setIcon(path.join(__dirname, 'assets', 'icon.png'));
    } catch {
      // non-fatal: dock icon just falls back to Electron's default
    }
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Deliberately quits on every platform, including macOS, even though the
// conventional Mac behavior is to keep running (in the dock) after the last
// window closes. This app has no dock/menu-bar presence beyond the floating
// clock itself and no other window to bring back via the dock icon or
// `activate`, so keeping a windowless background process alive on Mac would
// just be a phantom process with no way for the user to get the clock back
// short of relaunching anyway — quit is already the only way out today
// (right-click -> Quit), this just makes window-close consistent with that.
app.on('window-all-closed', () => {
  app.quit();
});

// --- IPC: custom corner resize -------------------------------------------------

ipcMain.handle('get-window-bounds', () => {
  if (!mainWindow) return null;
  return mainWindow.getBounds();
});

ipcMain.handle('get-resize-constraints', () => {
  return {
    aspectRatio: ASPECT_RATIO,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    maxWidth,
    maxHeight,
  };
});

ipcMain.on('resize-window', (event, bounds) => {
  if (!mainWindow || !bounds) return;
  const { x, y, width, height } = bounds;
  if (![x, y, width, height].every(isFiniteNumber)) return;
  mainWindow.setBounds(clampBounds({ x, y, width, height }));
});

// --- IPC: custom window drag ---------------------------------------------------
// The clock body is dragged entirely in JS (mousedown/mousemove -> setPosition)
// rather than via native -webkit-app-region: drag. On Windows, a native drag
// region is hit-tested as HTCAPTION, which makes the OS swallow right-clicks
// there (routing them to a system menu instead of the page), so right-click
// only ever worked over the buttons (marked no-drag, i.e. normal HTCLIENT).
// Driving the drag ourselves keeps the whole body on HTCLIENT and right-click
// works everywhere.
ipcMain.on('move-window', (event, pos) => {
  if (!mainWindow || !pos) return;
  if (!isFiniteNumber(pos.x) || !isFiniteNumber(pos.y)) return;
  mainWindow.setPosition(Math.round(pos.x), Math.round(pos.y));
});

// --- IPC: right-click menu -------------------------------------------------

ipcMain.on('show-context-menu', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const template = [
    {
      label: 'Settings',
      click: () => openPopup('settings'),
    },
    {
      label: 'History',
      click: () => openPopup('history'),
    },
    { type: 'separator' },
    {
      label: 'About the Pomodoro Technique',
      click: () => openPopup('about-pomodoro'),
    },
    {
      label: 'About NeonModoro',
      click: () => openPopup('about-app'),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit(),
    },
  ];
  const menu = Menu.buildFromTemplate(template);
  menu.popup({ window: win });
});

ipcMain.on('quit-app', () => {
  app.quit();
});

// --- IPC: Pomodoro progress (today's tally + 4-cycle position) ------------------

ipcMain.handle('get-progress', () => {
  ensureTodayProgress();
  return progress;
});

// Called once, at the moment a work session completes naturally (reaches 00:00).
// Owns the entire "did this complete a Pomodoro" side effect: bumps the day's
// tally, advances/wraps the 4-cycle, appends the sanitized history entry, and
// tells the caller whether this was the 4th (i.e. a long break is now due).
// Sessions ended early via Stop never reach this handler at all — see renderer.js.
ipcMain.handle('complete-work-session', (event, payload) => {
  ensureTodayProgress();
  const { taskLabel, estimatePomodoros } = sanitizeSessionPayload(payload);

  const longBreak = progress.cycleCount === 3;
  progress.cycleCount = (progress.cycleCount + 1) % 4;
  progress.completedToday += 1;
  saveProgress();

  appendHistoryEntry({
    timestamp: new Date().toISOString(),
    taskLabel,
    estimatePomodoros,
    longBreak,
  });

  return { completedToday: progress.completedToday, cycleCount: progress.cycleCount, longBreak };
});

// --- IPC: history -----------------------------------------------------------------

ipcMain.handle('get-history', () => history);

// --- IPC: session-end popup ------------------------------------------------------

ipcMain.on('open-session-end-popup', (event, opts) => {
  const longBreak = !!(opts && opts.longBreak);
  const breakMinutes = longBreak ? appSettings.longBreakMinutes : 5;
  pendingSessionEnd = { longBreak, breakMinutes };
  openPopup('session-end', { longBreak: longBreak ? '1' : '0', minutes: String(breakMinutes) });
});

ipcMain.on('session-end-choice', (event, choice) => {
  if (choice !== 'not-now' && choice !== 'yes') return;
  if (activePopup) activePopup.window.close();
  if (mainWindow) {
    mainWindow.webContents.send('session-end-choice', {
      choice,
      breakMinutes: pendingSessionEnd.breakMinutes,
    });
  }
});

// --- IPC: popup close / settings -------------------------------------------------

ipcMain.on('close-popup', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});

ipcMain.handle('get-settings', () => appSettings);

ipcMain.on('update-settings', (event, partial) => {
  appSettings = { ...appSettings, ...sanitizeSettingsPartial(partial) };
  saveSettings();
  broadcastSettings();
});

ipcMain.on('reset-settings', () => {
  appSettings = { ...DEFAULT_SETTINGS };
  saveSettings();
  broadcastSettings();
});

// --- IPC: open an external link in the default browser --------------------------

ipcMain.on('open-external', (event, url) => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' && ALLOWED_EXTERNAL_HOSTS.includes(parsed.hostname)) {
      shell.openExternal(parsed.toString());
    }
  } catch {
    // ignore malformed URLs
  }
});
