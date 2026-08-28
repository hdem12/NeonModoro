# NeonModoro

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A frameless, transparent, always-on-top neon Pomodoro timer for Windows, macOS, and Linux, built with Electron. Free and open source (MIT — see [LICENSE](LICENSE)).

Just the glowing `MM:SS` seven-segment digits float on your desktop — no window chrome, no background box. Drag it anywhere, resize it from a corner, hover for playback controls, right-click to quit.

## Features

- Frameless, transparent, always-on-top window — draggable from anywhere on the digit area.
- Custom corner resize handles, scaling from ~90px wide up to ~92% of your screen, aspect ratio locked.
- Upright seven-segment LCD digits (bundled [DSEG7 Classic](https://github.com/keshikan/DSEG) font, OFL-1.1 license), ice-blue during work sessions, neon green during breaks.
- Blinking colon while the timer runs.
- Hover-to-reveal Play / Pause / Stop controls and a hover-fade × close button (top-right).
- 25-minute work sessions, 5-minute breaks, with an end-of-session modal offering "Not now" / "Yes" to start the break — and a longer break (15–30 min, configurable) automatically offered every 4th completed work session, matching the official Pomodoro Technique's rhythm.
- An optional **title**, right above the digits, transparent background like everything else in the app: click it, type, press Enter or Play to set it. It persists across Pomodoros (doesn't clear itself on Stop or completion) until you change it, and is editable again whenever the clock is idle at a fresh 25:00. A small Pomodoro-estimate field sits nearby, hover-fade, for the same pre-start window.
- A small glowing icon + **"Pomodoro N/4"** counts up **beneath the digits** as you complete work sessions, toward your next long break — always visible (the one part of the UI that isn't hover-gated), with the exact daily total in its tooltip.
- Right-click anywhere on the clock for a menu: **Settings**, **History**, **About the Pomodoro Technique** (with a link to Wikipedia), **About NeonModoro**, and **Quit**. Each opens as its own small, fixed-size window — independent of the clock's current size, always closable, with long body text scrolling internally rather than ever overflowing the window.
- **History**: a scrollable log of every completed Pomodoro (title, time, long-break marker — untitled sessions show as "Untitled dd/mm/yyyy"), plus a same-day "estimated vs. actual" summary per distinct title.
- Settings: pick a custom digit color for work sessions, set an optional sound + visual alert when the countdown hits a chosen number of minutes remaining, configure the long-break length, toggle **Strict mode** (disables Pause during work sessions and treats Stop as voiding the Pomodoro, per Cirillo's original "indivisible" rule), and toggle **Hide title** / **Hide Pomodoro count** independently for anyone who'd rather not see either. Settings persist across restarts.
- Ships as a self-contained package on every platform that bundles the Electron runtime; the end user needs nothing pre-installed — an NSIS installer on Windows, a `.dmg`/`.zip` on macOS, and an `AppImage`/`.deb` on Linux.

## Development

```bash
npm install
npm start
```

This opens the transparent overlay window directly from source — no build step needed while developing.

## Building an installer

```bash
npm run dist        # builds for whatever OS you're running this on (electron-builder's default)
npm run dist:win     # NSIS installer — can only produce a working Windows binary when run on Windows
npm run dist:mac     # .dmg + .zip, x64 and arm64 — must be run on macOS
npm run dist:linux   # AppImage + .deb
```

electron-builder can't reliably cross-compile a macOS build from Windows or Linux (code-signing/notarization tooling and some native bits are macOS-only), so `dist:mac` needs to actually run on a Mac — see [Continuous integration](#continuous-integration) below for how this repo produces a macOS build without the maintainer owning one.

Each script produces its platform's package(s) under `dist/`:

```
dist/NeonModoro Setup <version>.exe        (Windows)
dist/NeonModoro-<version>.dmg              (macOS)
dist/NeonModoro-<version>-mac.zip          (macOS)
dist/NeonModoro-<version>.AppImage         (Linux)
dist/neonmodoro_<version>_amd64.deb        (Linux)
```

To produce an unpacked build for your current OS (for quick local testing without building an installer):

```bash
npm run pack
```

## Installing

### Windows

Download and run `NeonModoro Setup <version>.exe`. The app isn't signed with a paid code-signing certificate (see [Code signing](#code-signing-and-unsigned-binary-warnings) below), so Windows SmartScreen will show an "unrecognized app" warning the first time — click **More info**, then **Run anyway**.

### macOS

Download and open `NeonModoro-<version>.dmg`, then drag NeonModoro into Applications — or unzip `NeonModoro-<version>-mac.zip` and move the `.app` yourself. The app isn't signed with an Apple Developer Program certificate or notarized (see below), so **Gatekeeper will block it on first launch** ("NeonModoro can't be opened because Apple cannot check it for malicious software"). To open it anyway:

1. Right-click (or Control-click) `NeonModoro.app` in Finder and choose **Open**, then confirm **Open** in the dialog that appears — this only needs to be done once.
2. If that still doesn't work, open Terminal and run `xattr -cr /Applications/NeonModoro.app` to clear the quarantine attribute, then launch it normally.

### Linux

Download `NeonModoro-<version>.AppImage`, mark it executable, and run it — no installation step:

```bash
chmod +x NeonModoro-*.AppImage
./NeonModoro-*.AppImage
```

Or, on Debian/Ubuntu-based distros, install the `.deb` with your package manager (e.g. `sudo apt install ./neonmodoro_<version>_amd64.deb`). Neither format triggers an unsigned-binary warning the way Windows/macOS do, so no extra bypass steps are needed.

**A note on transparency**: the frameless, transparent window this app relies on only renders correctly under a *compositing* window manager — true of most modern desktop environments (GNOME, KDE, XFCE, Cinnamon, etc.) out of the box, but not universal. On a minimal X11 setup with no compositor running, the "transparent" background will instead render as solid black. This isn't a NeonModoro bug — there's no window content behind the solid color, the window manager just isn't compositing it as transparent. If you hit this, check whether a compositor is available/enabled for your window manager (e.g. `picom` on many tiling WMs). The app makes a best-effort check for a likely-missing compositor at launch and logs a warning to the terminal it was started from, but Electron has no reliable API to detect this directly, so the check can't catch every case.

### Code signing and unsigned-binary warnings

NeonModoro is free, open source, and has no paid tier — so it doesn't carry a purchased code-signing certificate (Windows) or an Apple Developer Program membership (macOS notarization), both of which cost money on an ongoing/per-release basis. That's a deliberate tradeoff: the warnings above are real but one-time and well understood by most users; paying to suppress them isn't a good use of a volunteer project's resources. If that ever changes (e.g. a sponsor covers it), this section will be updated.

## Continuous integration

`.github/workflows/build.yml` builds all three platforms (Windows, macOS, Linux) on GitHub's own hosted runners — including the macOS build, so releases don't require the maintainer to personally own a Mac. It runs:

- On every push of a `v*` tag (e.g. `v1.1.0`) — produces and uploads all three platform packages as workflow artifacts, ready to attach to a GitHub Release.
- On every pull request against `main` — as a build-health check, so a change that breaks packaging on a platform the maintainer isn't actively developing on fails visibly in CI rather than silently until the next tag.

## Notes on implementation choices

- **Break-end behavior**: at the end of the 5-minute break, the app auto-starts the next 25-minute work session (no modal), for symmetry with the "Not now" flow from the work-session modal. This was the simpler and more consistent of the two options allowed by the spec.
- **Right-click while the modal is open**: right-click is ignored while the end-of-session modal is showing, so the app can't be quit before that choice is resolved. Since the modal overlay sits on top of and captures input over the whole clock area, this falls out naturally — no separate blocking logic was needed beyond checking `modalOpen` before asking the main process to show the Quit menu.
- **Resize implementation**: because transparent, frameless Electron windows have unreliable native resize hit-testing on Windows, resizing is done entirely via small (16px) invisible corner hit-zones in the renderer. Mouse deltas (via `MouseEvent.screenX/screenY`) are converted to a new width/height (aspect-ratio-locked, `ASPECT_RATIO` in `main.js` — 2.4:1 as of the title+count redesign, was 2.75:1 digits-only in v1) and position (keeping the opposite corner anchored), then sent to the main process via IPC, which applies `win.setBounds()` after re-clamping to the min/max constraints.
- **The clock's aspect ratio isn't just a cosmetic constant** — it has to be tall enough to fit whatever's actually stacked in the clock face (title / digits / Pomodoro count) at *every* window size, since the whole layout scales in `vw` proportionally. When the count row was still 4 dots, it was visibly clipped in half even at the default window size, because digits + the (recently enlarged) title already consumed nearly all the height `2.75:1` provided. Fixed by widening the ratio to `2.4`, not by shrinking new elements to fit an increasingly cramped budget — see journal.md v10 for the actual `vw` math. `scripts/dev-screenshot.js` (dev-only) exists specifically to visually catch this class of bug going forward: it renders `index.html` standalone at a given width and saves a PNG, rather than trusting CSS arithmetic alone.
- **Timer accuracy**: the countdown is driven by a target end-timestamp (`Date.now() + remainingSeconds * 1000`) recomputed on every start/resume, and polled every 200ms — so it can't drift over a 25-minute session the way a naive "subtract 1 every setInterval tick" implementation could.
- **Icon**: `assets/icon.ico` (Windows), `assets/icon.icns` (macOS), and `assets/icon.png` + `assets/icons/*.png` (Linux) are all generated from scratch by `scripts/generate-icon.js` (pure Node, using only the built-in `zlib` module for PNG encoding — no image libraries or network access), from the exact same procedural artwork (a glowing cyan colon on a dark LCD-bezel background) at each platform's native container format and size set. Re-run `node scripts/generate-icon.js` if you want to tweak the colors/geometry — it regenerates all four platform outputs together, so they can't drift out of sync with each other.
- **macOS build: separate x64/arm64 artifacts, not a universal binary**: electron-builder can merge x64 and arm64 builds into a single universal `.dmg` via `@electron/universal`, which would mean one download instead of two — but that merge step is its own extra layer with its own historical rough edges (asar validation, native-module conflicts), and this app has zero native/prebuilt dependencies to justify taking on that risk. Separate architecture-specific artifacts are the more conventional, easier-to-debug-from-CI-logs choice here, at the cost of a user needing to pick the right one for their Mac.
- **macOS always-on-top uses the `'floating'` level, not the plain default**: `alwaysOnTop: true` alone can still be covered by other apps running in a macOS fullscreen Space. `mainWindow.setAlwaysOnTop(true, 'floating')` (set explicitly for both the clock and popup windows, macOS-only) keeps the clock genuinely on top the way the Windows build already behaves by default.
- **Quit behavior is deliberately identical across all three platforms**: macOS apps conventionally keep running (visible only in the dock) after their last window closes, but NeonModoro has no dock/taskbar presence beyond the floating clock itself and no other window to bring back, so `window-all-closed` calls `app.quit()` unconditionally rather than special-casing `darwin` the way most Electron app templates do.
- **Linux transparency isn't guaranteed — see the Installing → Linux section above.** The app makes a best-effort, non-blocking check for a likely-missing compositor at launch (`warnIfLikelyNoCompositor()` in `main.js`) and logs to the console it was started from; Electron has no direct API for this, so it's a heuristic (Wayland display present, or a known compositing desktop environment name in `XDG_CURRENT_DESKTOP`), not a guarantee either way.
- **Whole-body dragging is custom JS, not native `-webkit-app-region: drag`**: on Windows, a native drag region is hit-tested as a title bar (`HTCAPTION`), which makes the OS swallow right-clicks there instead of passing them to the page — so only the (drag-exempt) buttons were ever right-clickable. Dragging is now driven the same way as corner-resize: `mousedown`/`mousemove` deltas via `MouseEvent.screenX/Y` sent over IPC to `mainWindow.setPosition()`. This keeps the whole clock body on normal `HTCLIENT` hit-testing, so right-click works everywhere.
- **Popups are independent windows, not overlays inside the clock window**: Settings, the two About panels, and the end-of-session prompt each open as their own small `BrowserWindow` (`popup.html`, sized per-type in `main.js`'s `POPUP_SIZES`), rather than an absolutely-positioned `div` inside the clock window. That div-based approach meant a popup's visible size was capped by however big the clock currently was — shrink the clock to its minimum and a popup had nowhere to render. As a real fixed-size window, a popup is always fully legible and always has a working close control, regardless of the clock's size.
- **Settings persist, timer state doesn't**: the digit color and minute-mark alarm settings are saved to `<userData>/settings.json` by the main process (not `localStorage` — the Settings popup and the clock are separate renderer processes/windows, so state needs a home outside either one) and restored on launch. This is intentionally different from the countdown itself, which always starts fresh (25:00, work session, paused) per the original spec — that rule was about session state, not user preferences.
- **Alarm sound**: `assets/beep.wav` is generated from scratch by `scripts/generate-beep.js` (pure Node, hand-rolled WAV/PCM16 encoder, sine-wave synthesis — no audio libraries or network access).
- **Pomodoro progress vs. history are different kinds of state**: today's Pomodoro count/4-cycle position (`<userData>/progress.json`) and the full completed-session log (`<userData>/history.json`) both persist across restarts — unlike the live 25:00 countdown itself, which always starts fresh on launch. Progress resets automatically at the start of a new calendar day; history is kept indefinitely (soft-capped at 5,000 entries as a sanity backstop, not a real retention policy).
- **The title persists across sessions**: unlike a typical "task for this Pomodoro" prompt, the title is never cleared automatically (not on Stop, not when a Pomodoro completes) — it behaves like an actual title, staying until you type a new one. It becomes editable again only once the clock is back at a fresh, unstarted 25:00. This matches a common real pattern (several Pomodoros in a row on the same task) better than re-prompting every time.
- **Untitled sessions log as "Untitled dd/mm/yyyy" in History, not a generic placeholder** — but only as a display choice in `popup.js`; `history.json` still stores `taskLabel: null` for those entries, so the formatted string is never itself treated as a real, storable task name.

## Project structure

```
main.js           Electron main process: clock window creation, resize/drag IPC,
                  right-click menu, popup window creation (fixed size, independent of
                  the clock), persistence for settings/progress/history
preload.js        contextBridge for the clock window — its minimal IPC surface
popup-preload.js  contextBridge for popup windows — a separate, smaller IPC surface
index.html        Clock window markup: digits, the title bar above them, hover
                  controls, resize handles, and the Pomodoro-count row
popup.html        Shared shell for all five popups (session-end/settings/history/
                  about x2)
style.css         All visual styling — seven-segment @font-face, neon glow, popups
renderer.js       Clock window logic: timer state machine, drag/resize math, colon
                  blink, alarm check/cue, title commit/persistence, strict mode,
                  applying settings live
popup.js          Popup window logic: picks its panel from a ?type= query param,
                  renders the History list/summary
fonts/            Bundled DSEG7 Classic font (OFL-1.1) — see fonts/LICENSE-DSEG7.txt
assets/           icon.ico/.icns/.png + icons/*.png (per-platform app/installer
                  icons, all generated from the same artwork), beep.wav (alarm sound)
scripts/          Icon/sound generators + a screenshot helper (dev-only, not packaged)
.github/workflows/build.yml   CI: builds Windows/macOS/Linux packages on tagged
                                releases and PRs (see Continuous integration above)
LICENSE           MIT license
journal.md        Dev-facing build log: tech stack, decisions, version history
POMODORO_ALIGNMENT_REPORT.md   Gap analysis vs. the official Pomodoro Technique
                                that this pass (v6) was built against
```
