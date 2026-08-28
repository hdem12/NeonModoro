# NeonModoro — dev journal

Internal build log for this app. Not shipped to end users (not in the electron-builder
`files` list). Keep this updated as the app evolves — newest entries at the bottom.

## Tech stack

- **Shell**: Electron (installed at build time: `^31.3.1`, resolved `31.7.7`).
- **Renderer**: plain HTML/CSS/JS, no framework. `contextIsolation: true`, `nodeIntegration: false`,
  `sandbox: true` — renderer only talks to the main process through the `window.neon` bridge
  defined in `preload.js` (`contextBridge`).
- **Packaging**: `electron-builder` (`^24.13.3`), Windows `nsis` target, one-click installer.
  NSIS bundles the full Electron runtime by default — the built `.exe` needs nothing
  pre-installed on the target machine (no Node, no Electron).
- **Font**: DSEG7 Classic (OFL-1.1), upright bold weight, pulled once from the
  `@fontsource/dseg7-classic` npm package and vendored as static files under `fonts/` —
  no runtime dependency on that package or any CDN. License copy: `fonts/LICENSE-DSEG7.txt`.
- **Icon** (`assets/icon.ico`): generated from scratch by `scripts/generate-icon.js` — pure
  Node, only the built-in `zlib` module (for PNG deflate), no image libraries, no network.
  Multi-resolution (16–256px), a glowing cyan colon on a dark rounded bezel.
- **Alarm sound** (`assets/beep.wav`): generated from scratch by `scripts/generate-beep.js` —
  pure Node, hand-rolled WAV/PCM16 encoder, two sine-wave tones with a fade envelope. No
  audio libraries, no network.
- **Settings persistence**: `localStorage` in the renderer (`neonmodoro.settings` key) — not
  Electron `Store`/file-based, since the settings are small and renderer-local storage was
  simplest. Note this is *separate* from the timer's own state, which intentionally does NOT
  persist across restarts (every launch starts fresh at 25:00, work session, paused) — that
  was an explicit original requirement and still holds; only user *preferences* (color, alarm)
  persist.

## Project layout

```
main.js         Electron main process — window creation, resize/move IPC, right-click
                menu (Settings / About Pomodoro / About App / Quit), external-link
                whitelist + shell.openExternal, quit handler.
preload.js      contextBridge surface exposed to the renderer as window.neon — the only
                IPC surface the renderer can reach.
index.html      All markup: clock digits, resize handles, top-right close (X) button,
                hover Play/Pause/Stop, alarm toast, session-end modal, info popup
                (About Pomodoro / About App — shared markup, swapped content), settings
                popup.
style.css       All visual styling — @font-face, neon glow, hover-fade groups, overlay/
                modal styling, settings form styling.
renderer.js     Timer state machine (drift-corrected countdown), custom drag, custom
                corner-resize, colon blink, overlay management, settings load/save/apply,
                minute-mark alarm (sound + toast + digit pulse).
fonts/          Bundled DSEG7 Classic font files + license.
assets/         icon.ico, beep.wav.
scripts/        generate-icon.js, generate-beep.js — dev-only asset generators, not
                packaged into the app. Re-run these if you want to tweak icon/sound.
```

## Build history

### v1 — initial build (2026-08-27)

Built the full spec from scratch: frameless/transparent/always-on-top window, seven-segment
DSEG7 clock face (ice-blue work / neon-green break), custom corner-resize (native resize is
unreliable on transparent frameless Windows windows, so it's hand-rolled via small 16px
corner hit-zones + `win.setBounds`), hover-fade Play/Pause/Stop, drift-corrected countdown
(end-timestamp based, not naive per-tick decrement), end-of-session modal ("Not now" / "Yes"),
right-click → native `Menu.popup()` with a single "Quit" item, NSIS installer via
electron-builder.

Two implementation choices flagged at the time (still true):
- **Break-end behavior**: auto-starts the next 25:00 work session with no modal — the
  simpler of two options the original spec explicitly allowed.
- **Right-click during the end-of-session modal**: falls out naturally rather than needing
  explicit blocking logic, because the modal overlay is a sibling `div` with `inset:0` and a
  higher `z-index` than the clock — while it's visible it captures all mouse events over the
  clock area, so hover/drag/contextmenu on the clock underneath never fire. (This pattern is
  now reused for the settings/info overlays added in v3 — see below.)

Verified: `node --check` on all JS, a real `electron .` launch (no JS errors, only sandbox
GPU/network noise from the constrained build environment), and a full `npm run dist` producing
`dist/NeonModoro Setup 1.0.0.exe`, with `asar list` confirming all source/font/icon files
were actually bundled.

### v2 — visual feedback pass (2026-08-27)

User feedback after installing v1:
- Playback buttons had too little contrast to see against arbitrary desktop backgrounds
  (previous style: translucent *white* circle, ~0.16 alpha, on a translucent white icon —
  nearly invisible over light wallpaper). Fixed by inverting to a **dark** translucent circle
  (`rgba(15,17,20,0.65)`) with a bright white border + solid white icon — dark-behind/
  light-edge reads against both light and dark backgrounds, whereas a single light-on-light
  or dark-on-dark scheme only works against one.
- Digit glow read as a "neon sign" rather than a real LCD/LED clock. The original
  `text-shadow` stacked four layers out to `0.7em` blur. Cut to two tight layers
  (`0.02em` / `0.06em`) for a much more restrained, plausible LED-clock glow.

Rebuilt and reinstalled after this pass.

### v3 — right-click fix + menu features + settings + alarm (2026-08-27)

**Root-cause bug**: right-click only worked over the Play/Pause/Stop buttons, not the rest
of the clock body. Cause: the clock body was a native `-webkit-app-region: drag` region for
window dragging. On Windows, Chromium hit-tests a drag region as `HTCAPTION` (i.e. "this is
a title bar" as far as the OS is concerned), and Windows intercepts right-clicks over
`HTCAPTION` for its own system menu instead of ever dispatching a DOM `contextmenu` event to
the page. Only the buttons (explicitly marked `no-drag`, i.e. normal `HTCLIENT`) were
unaffected — which is exactly the symptom reported.

**Fix**: dropped `-webkit-app-region: drag` entirely and replaced it with a hand-rolled JS
drag, mirroring the approach already used for corner-resize: `mousedown` on the clock body
(guarded against buttons/resize-handles/overlays via `e.target.closest('.no-drag,
.resize-handle')`) records the starting mouse position (`event.screenX/Y`) and window
position (`window.neon.getWindowBounds()`), `mousemove` computes the delta and calls a new
`move-window` IPC channel → `mainWindow.setPosition()`, throttled to one call per animation
frame. Since the whole body is now normal `HTCLIENT`, right-click reaches the page's
`contextmenu` listener everywhere, not just over the buttons.

**New features added in this pass**:
- Top-right **× close button**, hover-fade like the playback controls, calls the existing
  `quit-app` IPC channel.
- Right-click menu expanded from a single "Quit" item to: **Settings**, separator, **About
  the Pomodoro Technique**, **About NeonModoro**, separator, **Quit**. The three new items
  are built in `main.js`'s `Menu.buildFromTemplate` and each just sends a `menu-action` IPC
  message to the renderer (`'settings' | 'about-pomodoro' | 'about-app'`) — the actual popups
  are custom-styled HTML overlays in the renderer (reusing the same `.modal-overlay` /
  `.modal-box` pattern as the original end-of-session modal), not native OS dialogs, because
  a native `dialog.showMessageBox` can't render a clickable hyperlink and wouldn't match the
  app's look.
- **About the Pomodoro Technique** popup: original (non-copied) summary of the technique +
  the 4-step method, ending in a link that opens
  `https://en.wikipedia.org/wiki/Pomodoro_Technique` in the user's default browser via
  `shell.openExternal` — routed through a `open-external` IPC channel in `main.js` that
  whitelists `en.wikipedia.org` over `https:` before calling `shell.openExternal`, since the
  renderer can't call Node/Electron APIs directly (`contextIsolation` + `sandbox`).
- **About NeonModoro** popup: quick usage rundown (drag/resize/hover controls/right-click
  menu/close button).
- **Settings** popup:
  - **Digit color** (`<input type="color">`): overrides the CSS custom properties
    `--accent-work` / `--accent-work-glow` at `:root` via
    `document.documentElement.style.setProperty(...)` — live-updates as the user picks a
    color. Deliberately only overrides the **work**-session color; break sessions keep the
    fixed neon green, since that color is a meaningful state signal from the original spec
    (worth reconsidering if the user wants break color customizable too).
  - **Minute-mark alarm**: checkbox + a 1–24 minute number input. When enabled, the first
    tick where `remainingSeconds` exactly equals `alarmMinutes * 60` (and that mark is
    actually less than the current session's total, so it can't fire at t=0) triggers: a
    short two-tone chime (`assets/beep.wav`, bundled, generated offline — see Tech stack),
    a toast message ("N minutes remaining") that fades in/out near the top of the clock, and
    a brief brightness-pulse animation on the digits. Fires once per session — the "fired"
    flag resets whenever the countdown is stopped/reset or a new session starts (work↔break
    transition), so it can fire again next session.
  - Settings (color + alarm config) persist across restarts via `localStorage`
    (`neonmodoro.settings`) — this is a deliberate exception to the "nothing persists"
    rule from the original spec, which was specifically about the *countdown/session state*,
    not user preferences. The countdown itself still always starts fresh at 25:00/paused.
  - "Reset" button restores color + alarm to defaults; "Done" closes the popup.

Rebuilt after this pass; `asar list` re-verified all files (including the new `beep.wav`)
are bundled in the packaged app.

### v4 — popups became independent windows; close buttons (2026-08-27)

Two follow-up bugs from v3's in-window overlay approach:
1. The About Pomodoro / About NeonModoro popups had no way to close (only the
   session-end and Settings popups had a "Close"/"Done" button — the info popups were
   missing one entirely).
2. Bigger problem: popups were `position:absolute; inset:0` `div`s *inside* the same
   transparent clock window, so their effective on-screen size was capped by however big
   the clock window currently happened to be. Shrink the clock to its ~90px minimum and a
   popup meant to be ~340px wide had nowhere to render — content (including any close
   button) could end up clipped or invisible.

**Fix — popups are now separate, fixed-size, independent `BrowserWindow`s**, not overlay
`div`s:
- New `popup.html` / `popup.js` / `popup-preload.js`: a small shared shell with three
  panels (session-end, info, settings), toggled by a `?type=` query param. Each panel has
  its own close affordance now — a small **×** in the corner for About Pomodoro / About
  NeonModoro / Settings (click anywhere outside isn't a dismiss gesture for a
  `frame:false` window, so an explicit control is required), plus their existing
  Close/Done buttons. The session-end panel deliberately has **no** × — it still must be
  resolved via "Not now"/"Yes", same reasoning as before (so a running session can't be
  silently abandoned in a half-finished state with no way back).
- `main.js` gained `openPopup(type)`: creates a `BrowserWindow` sized per type from a fixed
  `POPUP_SIZES` table (e.g. settings 340×270, about-pomodoro 380×400) — **not** derived
  from the clock window's current bounds — with `parent: mainWindow, modal: true`
  (blocks interacting with the clock while a popup is open, and keeps it on top of/tied
  to the clock window) and `win.center()`s it on screen once ready. Only one popup open at
  a time (`activePopup`); reopening the same type just focuses it.
- Right-click menu items now call `openPopup(type)` directly in the main process, instead
  of the old v3 approach of sending a `menu-action` IPC message to the clock window's
  renderer to show an in-page overlay (removed entirely — the clock renderer no longer
  manages any popup UI itself).
- **Settings became genuinely cross-window state.** Since the Settings *popup* and the
  *clock* are now two separate `BrowserWindow`s (two separate renderer processes, two
  separate `localStorage` origins for `file://` pages — not reliably shared), settings
  moved from renderer `localStorage` (v3) to being **owned by the main process**: loaded
  from / saved to `<userData>/settings.json` (plain `fs`, hand-rolled — no dependency).
  Flow: popup edits a field → `update-settings` IPC → main merges + persists to disk +
  broadcasts `settings-changed` to the clock window → clock window updates its live digit
  color and its local `alarmEnabled`/`alarmMinutes` cache (used by its own per-tick alarm
  check, which still lives in the clock renderer since that's where the countdown runs).
- The clock window is told a popup is open/closed via a new `overlay-state` IPC broadcast
  (sent from `openPopup`/the popup's `closed` event) so it can hide its hover controls and
  ignore right-click/drag while a popup is up — belt-and-suspenders on top of the OS-level
  `modal: true` blocking, not a replacement for it.

Rebuilt and re-verified via `asar list` that `popup.html`, `popup.js`, and
`popup-preload.js` are bundled alongside everything else.

### v5 — security review + alignment fix (2026-08-27)

Full pass over the app's attack surface, plus a leftover CSS bug from the v4 refactor.

**CSS bug**: the About Pomodoro / About NeonModoro popup text (bullet lists especially)
was rendering centered instead of left-aligned. Cause: v4 moved the info panel out of
`index.html` into `popup.html` and, in the process, dropped the `.info-box` wrapper class
that used to carry `text-align: left`. `#info-body` was left with no explicit alignment of
its own, so it inherited `text-align: center` from `.modal-box`/`.popup-box` further up the
tree. Fixed by putting `text-align: left` directly on `.info-body` (and removed the two now
dead/unreferenced rules, `.info-box` and `.settings-box`, left behind by the same refactor).

**Security review** — what was checked, and what changed:

1. **Electron itself was badly out of date and out of support.** The app started on
   `31.7.7` (pinned by `^31.3.1`), which was the *last* patch ever published on the 31.x
   line — 13 majors behind current. `npm audit` listed ~30 electron advisories via that one
   package (use-after-free bugs, an ASAR integrity bypass, a context-isolation-bypass via
   `Function.prototype.bind` hijacking, a `contextBridge` object-copy prototype-setter issue,
   IPC-reply spoofing, etc.). Electron only backports security fixes to its last few stable
   lines, so 31 was past the point where any of these would ever get patched in place —
   upgrading the major version was the only real fix. **Upgraded to `44.0.0`** (current
   `latest`), which is what `npm audit`'s `fixAvailable` pointed at and clears every
   electron-specific advisory. The app's Electron API surface (`BrowserWindow`, `ipcMain`/
   `ipcRenderer`, `contextBridge`, `Menu`, `screen`, `shell`) is small and long-stable, so
   the 13-major jump was low-risk in practice — confirmed with a real `electron .` launch
   (clean, only the usual sandboxed-environment GPU/network noise) and a full `npm run dist`
   rebuild (succeeded, electron-builder re-downloaded the v44 binary and packaged normally).
2. **`electron-builder`'s vulnerable transitive deps were deliberately left alone.** The
   remaining `npm audit` findings (`tar`, `extract-zip`, `builder-util-runtime`, etc., mostly
   via `electron-updater`'s auto-update machinery, which this app doesn't use) are entirely
   inside the *build tool*, never inside the shipped app — confirmed by `asar list` on both
   the pre- and post-upgrade builds, which only ever shows this project's own source files,
   never `node_modules`. Upgrading `electron-builder` is a semver-major bump with its own
   compatibility risk to the NSIS config, for a fix with zero runtime exposure to end users.
   Not worth it here; revisit if a future `electron-builder` bump is needed for other reasons.
3. **IPC handlers now validate their input** (`main.js`) instead of trusting renderer-sent
   payloads structurally. This app has no remote content and no `nodeIntegration`, so the
   realistic attack surface is already small — but every `ipcMain` handler is still a
   privileged boundary in principle, so:
   - `update-settings` (and the on-disk settings file read at startup) now goes through
     `sanitizeSettingsPartial()` — a strict whitelist (`color` must match `^#[0-9a-fA-F]{6}$`,
     `alarmEnabled` must be boolean, `alarmMinutes` is clamped to 1–24) instead of a blind
     object spread. Previously any shape of object sent on that channel would have been
     merged straight into `appSettings`, written to disk, and broadcast to the trusted clock
     window — including arbitrary extra keys or a non-color string landing in a
     `style.setProperty()` call.
   - `resize-window` / `move-window` now require every coordinate to be a finite number
     before touching `setBounds`/`setPosition` (previously `Math.round(NaN)` or similar could
     have reached the native window APIs unguarded).
   - `session-end-choice` now only accepts the literal `'not-now'` / `'yes'` values it's
     supposed to.
4. **Every `BrowserWindow` (clock + all popups) now denies new-window creation and blocks
   in-place navigation** (`hardenWindow()`, using `setWindowOpenHandler` + `will-navigate`).
   Electron already defaults to denying `window.open()` with no handler set, so this is
   belt-and-suspenders rather than a fix for an active gap — but it makes the "this app never
   navigates anywhere or opens child windows outside `openPopup()`" property explicit and
   enforced, rather than resting on a default that could change.
5. **CSP tightened** on both `index.html` and `popup.html`: added `object-src 'none'`,
   `base-uri 'none'`, `form-action 'none'` alongside the existing `default-src 'self'`.
   None of these were open holes (no plugins/objects are embedded, no `<base>` tag exists,
   no `<form>` exists), but they cost nothing and remove entire categories of injection
   primitive if that ever changes.
6. **Reviewed and left as-is (already sound, or not worth the tradeoff):**
   - `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` on every window —
     already correct everywhere, unchanged.
   - `open-external`'s host whitelist (`en.wikipedia.org` only, `https:` only, checked via
     exact `URL.hostname` equality — so `en.wikipedia.org.evil.com` is correctly rejected,
     since its hostname is the full string, not a suffix match) — already correct.
   - `popup.js` sets `info-body`'s content via `innerHTML`, but that content is always one of
     two hardcoded template strings in `popup.js` itself (`INFO_CONTENT`) — never built from
     any external, IPC-delivered, or user-editable input — so there's no injection vector
     today. Flagged for future readers: if that content ever becomes dynamic (e.g. editable
     app-usage tips, fetched text), it must switch to building DOM nodes/`textContent`
     instead of `innerHTML`.
   - No code signing on the NSIS installer. This means Windows SmartScreen will likely warn
     first-time installers ("Windows protected your PC") since the publisher is unrecognized.
     This is a trust/distribution concern, not a vulnerability in the app — and isn't
     something fixable here, since it requires purchasing and configuring a code-signing
     certificate. Worth doing before any wider distribution.
   - DevTools are not explicitly disabled (no `before-input-event` blocking of
     Ctrl+Shift+I/F12). Not fixed: this app holds no secrets, tokens, or remote sessions
     worth protecting from someone who already has local access to the machine it's running
     on, so blocking DevTools would add complexity for no real reduction in risk here.

Rebuilt (`npm run dist`) and reinstalled after this pass; `asar list` re-verified the
package still contains only this project's own files (now on Electron 44).

### v6 — Pomodoro Technique alignment pass (2026-08-27)

Implemented the gaps identified in `POMODORO_ALIGNMENT_REPORT.md`, in the priority order the
report itself laid out. Extended the existing architecture rather than restructuring it — new
popups still go through `openPopup(type)` / `POPUP_SIZES`, new persisted data still follows the
main-process-owned-JSON-file pattern `settings.json` established, and every new IPC channel got
the same input-sanitization treatment the v5 security pass applied to the existing ones. No v5
security control (contextIsolation, sandbox, CSP, IPC validation, the external-link whitelist)
was touched or weakened.

**1. Pomodoro counter + long break every 4th session.** New `progress.json` (`<userData>`,
main-process-owned): `{ date, completedToday, cycleCount }`. `cycleCount` is 0–3 and wraps on
each completed work session; wrapping (going from 3 back to 0) means "that completion was the
4th," which is exactly when a long break is offered instead of the usual 5-minute one. Verified
the wraparound math in isolation (completions 4 and 8 in a row of 9 correctly flag `longBreak`,
cycle sequence `1,2,3,0,1,2,3,0,1`) before wiring it in, since an off-by-one here would have been
easy to get wrong and hard to notice from the UI alone.

- **Decision (open question in the report's §5): progress persists through a calendar day, not
  just the current app launch.** `ensureTodayProgress()` compares the stored date to today and
  resets both counters to 0 on a day change (checked both at load and at the moment a session
  completes, so it's also correct for a session that happens to span midnight). This is
  deliberately different from the live countdown, which still always starts fresh on every
  launch — that rule (from the very first spec) was about the *in-progress 25:00 timer*, not
  about "how many pomodoros have I done today," and the daily count needs to survive a restart
  to mean anything (an app relaunch shouldn't cost you your progress toward a long break, or
  reset today's tally to zero).
- **Cycle reset timing**: the wrap happens immediately when the 4th session completes, not
  deferred until the long-break popup is resolved. The spec's own wording ("after the long
  break, or after 'Not now' is chosen, reset the count") is satisfied either way in practice —
  nothing else can complete a session while that popup is up, so there's no observable
  difference — and doing it immediately avoided adding a second piece of "pending" state.
- **UI**: a row of 4 dots, top-left (mirroring the close button's hover-fade top-right), filled
  left-to-right as the current cycle progresses, reusing the existing `.top-bar` hover-fade
  pattern. Chosen over the report's "or a number" alternative because "how close to a long
  break" is more directly actionable than a raw daily total — the daily total (`completedToday`)
  is still there, just as the dots' hover tooltip, for anyone who wants it.

**2. Task binding.** Went with the **inline hover-fade input** option from the two the report
offered, not a popup window. Reasoning: a work session can start ~dozens of times a day for a
heavy user, and spawning a whole separate `BrowserWindow` (the popup pattern) on every single
Play click would add real latency and weight to the single most frequent action in the app —
directly working against the "just the glowing digits" zero-friction identity the report itself
flagged as worth protecting. A plain `<input>` that fades in with the existing hover controls
costs nothing extra and needs no window round-trip.

- Field is optional and never blocks Play — `startCountdown()` only reads
  `task-label-input`'s value (trimmed; empty → `null`) at the moment a *fresh* work session
  starts (`remainingSeconds === WORK_SECONDS`), not on every Play click — so resuming from pause
  doesn't re-prompt or overwrite the label already captured for the in-progress session.
- Once a session is underway (running **or** paused — deliberately not gated on `running` alone,
  see below), the label input is hidden and a small read-only caption shows the captured label
  instead, so the hover area stays focused on playback controls during an active session.
- **Caption visibility bugfix during implementation**: the first version hid the caption
  whenever `!running`, which meant pausing a labeled session made the label disappear — the
  opposite of useful, since knowing what you paused on on is exactly when a reminder helps most.
  Fixed by keying visibility off "has this work session actually started"
  (`remainingSeconds !== WORK_SECONDS`) instead of "is it currently ticking," so the caption
  correctly persists through a pause and only the input/caption pair as a whole hides again once
  Stop resets the session back to a fresh 25:00.
- The label is cleared (both `state.currentTaskLabel` and the input's own value) on Stop, so an
  old label can't silently carry into a new, unrelated session.

**3. Records / history.** New `history.json` (`<userData>`, main-process-owned), append-only.
One entry per *naturally completed* work session (never for one ended early via Stop — recording
only happens inside the `complete-work-session` IPC handler, which is only ever invoked from the
natural-completion path in `renderer.js`, so "don't count Stops" falls out of the architecture
rather than needing a separate check): `{ timestamp, taskLabel, estimatePomodoros, longBreak }`.
Reachable via a new **"History"** item in the right-click menu (added between Settings and the
About items), opening as its own fixed-size popup (`380×440`) via the same `openPopup()` pattern
as everything else, with its own working close (×) button and Close button — not repeating the
earlier "popup with no way to close" bug.

- **Retention: kept indefinite, with a generous soft cap of 5,000 entries** (`MAX_HISTORY_ENTRIES`
  in `main.js`; oldest entries drop off past that) rather than a small rolling window. The report
  explicitly frames unlimited retention as "the actual point of a Records sheet," and 5,000
  completed pomodoros is years of daily use for any real person — the cap exists purely as a
  sanity backstop against the file growing without bound, not as a real-world retention policy.
- The list itself is a plain most-recent-first scrollable list (date/time, label or "(no
  label)", a small "long break" badge on the 4th-session entries) — no charts, per the report's
  own "doesn't need graphs" guidance.
- **Security note**: unlike the About popups' hardcoded content (rendered via `innerHTML` because
  it's static, author-written text), the History list is built entirely with
  `createElement`/`textContent` in `popup.js`, never `innerHTML` — task labels are genuine
  free-text user input here, so this list is the one place in the app where that distinction
  actually matters.

**4. Effort estimation.** A second small inline field next to the task label
(`#task-estimate-input`, number, default 1, 1–99), captured and sanitized the same way and at
the same moment as the label. Deliberately no separate task-estimation UI or task database, per
the report's explicit "do not build fuzzy matching" instruction — matching is exact-string, done
client-side in `popup.js` when the History popup renders. A **"Today's tasks"** summary section
at the top of the History popup groups today's entries by exact label text and shows
`actual / estimate` per label (falling back to just `actual` if no estimate was ever given for
that label) — the simplest surface the report allowed ("a small summary line per distinct task
label," explicitly not required to be "somewhere during the session itself").

**5. Strict mode.** A new Settings checkbox, off by default. Turned out to need less new logic
than expected: sessions ended via Stop were *already* never recorded or counted (recording only
ever happens on natural completion, per §3 above) — so "Stop voids the Pomodoro" was already true
of the existing Stop behavior even before this section existed. The actual behavioral change
strict mode makes is narrower and matches the report's own framing: **it removes Pause during a
running work session** (`updateButtonVisibility()` hides the Pause button whenever
`strictMode && sessionType === 'work'`, plus a matching guard inside `pauseCountdown()` itself in
case it's ever invoked another way), which is what actually enforces Cirillo's "indivisible, no
pausing to check messages" rule — without it, a user could always just pause through any
interruption, no matter what "voiding on Stop" implies on its own. Break sessions are entirely
unaffected by the setting, per the report. Also added a distinct toast ("Pomodoro voided — not
counted.") when Stop is pressed on a work session in strict mode, purely for clarity — the app
already didn't count/log Stopped sessions, but strict mode is the one context where a user is
likely pressing Stop *specifically because* an interruption happened, so confirming that choice
explicitly seemed worth the one extra line, even though it wasn't strictly required by the
acceptance criteria.

**6. Long break length setting.** Number input in Settings, 15–30 (Cirillo's own range),
default 20 — clamped identically to how `alarmMinutes` was already clamped (`Math.min(30,
Math.max(15, Math.round(n)))` in `sanitizeSettingsPartial`). Threaded through
`open-session-end-popup` → the popup's own query string → back through `session-end-choice`'s
`breakMinutes`, so the actual break length used when the user picks "Yes" always matches
whatever's currently configured, not a value baked in when the popup was first opened.

**7. Overlearning nudge.** **Threshold: more than 5 minutes (300s) remaining** at the moment Stop
is pressed during a work session — used the report's own example value directly rather than
picking a different number, since it was already a reasonable, round threshold and there was no
strong reason to deviate. Reuses the exact same toast element/mechanism as the minute-mark alarm
(just a different message, no sound or digit-pulse — this is meant to read as a passive tip, not
an alert). Explicitly skipped when strict mode is on, per the report — in strict mode, Stop is
already framed as an intentional void, so "the Pomodoro isn't really over" tip doesn't apply.

**8 & 9 — explicitly out of scope this pass**, per the spec's own pre-authorization to cut these
first if needed:
- **Interruption workflow** (log-an-interruption popup, attached to the eventual history entry):
  not built. The rest of this pass (counter/long-break, task binding, history, estimation, strict
  mode, long-break setting, overlearning nudge) already covers every item the report marked High
  or Medium priority, and is a large amount of new surface area on its own; adding a further
  popup + renderer-side interruption buffer + another history field was judged not worth the
  added risk to an already-large change for what the report itself scoped as the *lowest*
  priority optional item.
- **Activity Inventory** (a backlog beyond "today"): not built, exactly per the report's own
  recommendation — it explicitly called this "closer to a small task-management feature than a
  timer feature" and said it's only worth doing if NeonModoro is meant to grow into a fuller
  planning tool, which is a product decision, not an implementation gap. The History popup (§3)
  already functions as a de facto record of what's been worked on, which the report itself noted
  as a sufficient stand-in for now.

**New IPC surface added** (all validated in `main.js` before touching disk or other windows, same
treatment as the existing `update-settings`/`resize-window`/`move-window`/`session-end-choice`):
`get-progress`, `complete-work-session` (only place `history.json`/`progress.json` are ever
written — sanitizes `taskLabel` via trim+80-char cap and `estimatePomodoros` via a 1–99 clamp
before anything is persisted), `get-history` (read-only). `sanitizeSettingsPartial` gained
`strictMode` (boolean) and `longBreakMinutes` (15–30 clamp) alongside the existing fields.
`open-session-end-popup` now carries a `longBreak` flag; `session-end-choice` now carries the
resolved `breakMinutes` back to the clock window instead of being a bare string.

Verified: the cycle/long-break wraparound math and all settings/task-label sanitization were
unit-tested in isolation (plain Node, outside Electron) before wiring them in — including a
prototype-pollution attempt (`{ ...partial, __proto__: {...} }`) against `sanitizeSettingsPartial`,
confirmed harmless since it only ever copies whitelisted keys into a fresh object. `node --check`
on all five JS files, a real `electron .` launch (clean), and `npm run dist` (succeeded, `asar
list` confirms no new files were left unbundled — no new HTML files were needed since History/
Settings/About/session-end all share the existing `popup.html` shell).

### v7 — task-panel contrast fix + New/Continue Pomodoro flow (2026-08-27)

Two pieces of feedback on v6's task-binding UI.

**Task-panel contrast/sizing.** The label input was genuinely too small and sat close enough to
the Play button below it to read as overlapping at typical window sizes. Fixed by: increasing
font-size 11px → 14px and widening the label input (13em → 17em), switching the input background
from a fairly translucent `rgba(15,17,20,0.65)` to a near-solid `rgba(6,8,10,0.92)` with a
brighter `rgba(255,255,255,0.6)` border and a drop shadow (the same dark-behind/light-edge
contrast fix already used for the Play/Pause/Stop buttons back in the first round of feedback,
applied here too), and moving the panel up (`bottom: 17%` → `26%`) so it's clearly separated
from the controls row instead of crowding it — the layout change below made this easier, since
the two are no longer trying to occupy overlapping visual space at all in the common case.

**New Pomodoro / Continue Pomodoro.** Replaced the old "just show Play" behavior for a fresh,
not-yet-started work session with a two-button choice, per the request:

- **"New Pomodoro"**: reveals the task label + estimate fields (now the same fields from §2 of
  v6, just reached via an explicit action instead of being always-hoverable) plus a Start button
  — which is the existing Play button, relabeled by context rather than duplicated, since its
  role ("begin the countdown") is identical either way.
- **"Continue Pomodoro"**: opens the History popup directly (new `open-history-popup` IPC
  channel, thin wrapper around the existing `openPopup('history')`), where every history row
  with a task label now has its own **Continue** button. Picking one closes History and sends
  `{ taskLabel, estimatePomodoros }` back to the clock window (new `continue-task` IPC channel,
  sanitized in `main.js` through the same `sanitizeSessionPayload()` already used for completed
  sessions), which pre-fills the compose fields and drops the user into the same "New Pomodoro"
  compose view, ready to hit Start. It does **not** auto-start the countdown — consistent with
  the rest of the app, starting a Pomodoro is always an explicit, deliberate action, never
  something that happens silently in the background while the user was somewhere else (the
  History popup) a moment before.
- A small "← Back" link inside the compose view returns to the two-button choice without
  starting anything, in case "New Pomodoro" was clicked by mistake.
- **Scoping decision**: a `continue-task` message that arrives while the clock isn't at a fresh,
  idle work session (e.g. a session is already running, or it's break time) is simply ignored —
  there's no sensible place to drop a pre-filled task in that state, and queuing it for
  "whenever the app next goes idle" felt more likely to surprise a user than to help one.

State machine notes (`renderer.js`): the fresh-work condition (`sessionType === 'work' &&
remainingSeconds === WORK_SECONDS`, already used for task-label capture in v6) now also drives a
`composingNewSession` flag that distinguishes "choosing" (two buttons) from "composing" (fields +
Start) within that same fresh state. Resuming a paused session and both break states are
completely unaffected — they still just show a single Play, exactly as before; the new choice
only replaces Play in the one specific case where a *fresh* work session is about to begin.
`composingNewSession` is reset to `false` on both Stop and on actually starting the countdown, so
the app always lands back on the two-button choice (not a stale compose view) the next time it's
idle.

Rebuilt; `asar list` re-verified (no new HTML files needed — the History popup gained a button,
it didn't need a new page).

### v8 — title redesign; New/Continue Pomodoro dropped (2026-08-27)

Follow-up request explicitly reverted v7's New Pomodoro / Continue Pomodoro two-button flow
("drop the previous request") and replaced task titling with a different design: a persistent
title sitting directly above the digits, rather than a field reached through a button.

**Removed entirely**: `#btn-new-pomodoro`, `#btn-continue-pomodoro`, `#btn-compose-back` and
their handlers, the `composingNewSession` state, the old `.task-panel`/`.choice-btn`/
`.compose-back`/`.task-caption` CSS, and the `open-history-popup` / `continue-task` IPC channels
(main.js, both preloads, and the History popup's per-row "Continue" button) — none of it is
reachable any other way now that the two-button choice is gone, so it was deleted rather than
left dead. The clock is back to a single Play/Pause/Stop row, exactly as before v7.

**New title design** (`index.html`/`style.css`/`renderer.js`):
- `.digits-wrap` is now a flex column: a `#title-bar` (containing `#title-input`) sits above a
  new `.digits-stack` wrapper (which holds exactly what `.digits-wrap` used to hold directly —
  the ghost "88:88" layer and the real value layer). This was the simplest way to stack a title
  above the existing ghost/value pair without disturbing how that pair positions itself
  (`.digits.ghost` is `position: absolute` relative to the nearest positioned ancestor, which is
  now `.digits-stack` instead of `.digits-wrap`).
- The title is a real, transparent-background `<input>` at all times — no pill, no box, matching
  the app's existing "nothing behind anything" visual language — with only a hairline underline
  that appears while it's focused, as the sole affordance that it's editable. Sized in `vw`
  (4.2vw) so it scales with the window the same way the digits themselves do.
- **Commit model**: typing and pressing **Enter** blurs the field (locks in whatever's typed as
  the title, no countdown side effect); pressing **Play** also commits it via the same
  `commitTitle()` path (defensively called from `startCountdown()`, on top of blur already firing
  naturally when focus moves to the Play button) *and* starts the countdown. Both routes converge
  on one function so there's exactly one place that decides what counts as "the title."
- **The title is no longer cleared on Stop or on a completed session** — this is a deliberate
  change from v6/v7's behavior, where the task fields reset every time. A title is now closer to
  a real title (persists until the user changes it) than a per-session prompt, which also matches
  a common real pattern: several Pomodoros in a row on the same task, without retyping its name
  each time. The field is only ever editable again once the clock is back at a fresh, idle work
  session (`remainingSeconds === WORK_SECONDS`, not running) — the same condition v6/v7 already
  used to gate the old task-label capture, just applied to when the `<input>` is `disabled` vs.
  live now, rather than to whether a whole panel is shown.
- Effort estimation kept, but slimmed to just the number field (`#estimate-panel`), hover-fade
  near the controls — the same spot/behavior the old task-panel occupied, minus the text input
  that moved up into the title bar.

**Settings: "Hide title"** — a new checkbox (`hideTitle`, default off). When on: `#app` gets a
`title-hidden` class that hides `.title-bar` entirely via CSS (same mechanism already used to
hide it during breaks), *and* `commitTitle()` short-circuits to always record `null` rather than
reading the (now-inaccessible) input's value — so turning the feature off doesn't just hide the
UI while silently continuing to log whatever text happens to still be sitting in the hidden
input; a hidden title genuinely means "no titles are captured."

**History: "Untitled dd/mm/yyyy" instead of "(no label)"** — per the request, an untitled
completed session's history row now reads `Untitled 27/08/2026` (the entry's own completion
date, `dd/mm/yyyy`) rather than a generic placeholder. This is purely a **display** decision in
`popup.js` (`entryLabel()`/`formatDateDMY()`) — `history.json` still stores `taskLabel: null` for
an untitled entry, exactly as before; the formatted string is never written to disk, so it can't
drift from the entry's real date or get treated as if it were a real, storable task name. The
"Today's tasks" summary groups by this same computed label, so today's untitled sessions
correctly bucket together under one "Untitled dd/mm/yyyy" line rather than being silently
excluded (which is what the old `if (!entry.taskLabel) continue;` did).

Rebuilt; `asar list` re-verified (still no new HTML files — everything reused `index.html` and
the existing `popup.html` panels).

### v9 — popup overflow fix, Pomodoro count relocated, title spacing (2026-08-27)

Four pieces of feedback.

**About NeonModoro was cutting off its own title and Close button.** Root cause: `.popup-box`
had no height constraint, so when a panel's content (in practice, `.info-body`'s text) was
taller than the fixed-size popup window, the box itself just grew taller than the window and,
being vertically centered by `.popup-body`'s flex `align-items: center`, overflowed equally
top and bottom — clipped by the OS window edge on both sides, with no way to scroll to the rest
(`body { overflow: hidden }` already blocked any page-level scroll). Fixed properly rather than
just making the window bigger (which only delays the same bug for longer content later):
`.popup-box` and `.popup-panel` are now a bounded flex column (`height`/`max-height: calc(100% -
16px)`), with `.info-title` and `.modal-actions` marked `flex-shrink: 0` so they're never
compressed or pushed out, and `.info-body` alone (`flex: 1 1 auto; min-height: 0; overflow-y:
auto`) absorbing any overflow as an internal scroll instead of growing the box. Added a slim
custom `::-webkit-scrollbar` (matches the dark theme) to `.info-body` and `.history-list` so the
scroll affordance is visible, not just functional. Also bumped `about-pomodoro`/`about-app` to
420px tall (from 400/380) and `settings` to 430px (from 400, to fit the new checkbox added
below) — headroom, not the actual fix; the scrolling behavior is what guarantees correctness
regardless of window size or how much text ends up in a panel later.

**Pomodoro count moved and made permanent.** The 4-dot cycle indicator was tucked into a
hover-only top-left corner — easy to miss entirely, which was the complaint. Moved into the
normal flex flow of `.digits-wrap`, directly beneath `.digits-stack` (so it's literally under
the MM:SS digits now, centered with them), and made **always visible** rather than hover-gated —
the one deliberate exception to the app's usual "nothing shows until you interact" rule, since
the point of this specific piece of UI is to be glanceable at rest. Also enlarged the dots
slightly (6px → 8px) now that they're a permanent fixture rather than a hover-only detail.

**New Settings toggle: "Hide Pomodoro count"** (`hidePomodoroCount`, default off) — for anyone
who'd rather the dots not be there at all, now that they're always on-screen instead of tucked
away. Same pattern as "Hide title": an `#app.count-hidden` class hides `.cycle-dots` via CSS,
driven by the same settings-sync path (`main.js` → `sanitizeSettingsPartial` → `settings-changed`
broadcast → `renderer.js`'s `applySettings()`).

**Title spacing and size.** `.title-bar`'s `margin-bottom` (the gap between the title and the
digits) increased from `0.6vw` to `1.4vw`, and `#title-input`'s `font-size` from `4.2vw` to
`4.6vw` — both still `vw`-based so they keep scaling proportionally with the window like
everything else in the clock face, rather than becoming a fixed size that would look
disproportionate at very small or very large window sizes.

Rebuilt; `asar list` re-verified.

### v10 — clock-face aspect ratio fix; count redesigned to match sketch (2026-08-27)

User feedback included an annotated screenshot (two mockups: the current state with the 4-dot
row circled in red, showing it visibly cut in half; and a hand-sketched replacement with a small
icon + "Pomodoro" text sitting beneath the digits with no clipping).

**Root cause, not just a symptom fix.** The dot row wasn't an edge-case bug — it was clipped at
the *default* window size (360×131, from `ASPECT_RATIO = 2.75`). Budgeting the stack in `vw`-
equivalent-of-width terms (since window height is always exactly `width / ASPECT_RATIO`, the
whole layout is proportionally fixed regardless of actual window size): digits at `26vw` + the
title block (enlarged in v9, `~7.6vw` including its margin) already consumed `~33.6vw` out of the
`36.36vw` of height that `2.75` provides (`100/2.75`), leaving only `~2.76vw` — about 10px at the
default width — for anything below. That's not enough room for *any* legible third element,
which is why the dot row rendered visibly clipped rather than just cramped.

Fixed at the source: **`ASPECT_RATIO` changed from `2.75` to `2.4`** (`main.js`) — the window is
now proportionally a bit taller relative to its width. This was `2.75` since v1, chosen back when
the clock face was digits-only; a title above and a count below are permanent parts of the layout
now, so the shape needed to change with them rather than continuing to shrink new elements to fit
an increasingly cramped budget. Since `MIN_HEIGHT`/`maxHeight`/the default `startHeight` are all
*derived* from the constant (not separately hardcoded), this was a one-line change with no other
code affected — resize/min/max all recompute automatically.

**Redesigned the indicator to match the sketch**: a small glowing circular icon + `"Pomodoro
N/4"` text, replacing the 4-dot row, with no background pill — floating directly on the
transparent background the same way the title above the digits already does, rather than the
dots' translucent dark capsule. Simplified from the sketch's more detailed hand-drawn icon shape
to a plain filled circle (reusing the existing glowing-dot visual language from elsewhere in the
app) since anything more detailed wouldn't read clearly at the small sizes this renders at near
the low end of the window's size range — noting this simplification explicitly rather than
guessing at exact icon art from a quick sketch. Kept `hidePomodoroCount`/`#app.count-hidden`
working unchanged — same settings toggle, now hiding `.pomodoro-count` instead of `.cycle-dots`.

**Verified visually, not just by math**: wrote a small dev-only helper
(`scripts/dev-screenshot.js`, not packaged) that loads `index.html` standalone at a given width
and captures a PNG via `webContents.capturePage()`, specifically so this class of "does it
actually fit in the window" bug can be checked by looking at a real render instead of trusting
CSS arithmetic alone. Captured at the default width (360px) and near the small end (200px) —
confirmed the title, digits, and "● Pomodoro 0/4" are all fully visible with no clipping at
either size.

**New standing practice**: uninstall the previous build before shipping an updated installer,
per explicit instruction. Found the existing install's own uninstaller
(`<install-dir>/Uninstall NeonModoro.exe`, standard for an NSIS-built app) and ran it silently
(`/S`) after this build, then removed the empty install-directory shell it left behind. This
should be standard practice for every future update pass, not just this one — always uninstall
the previous build first (silently, via its own `Uninstall <name>.exe /S`) rather than just
handing over a new installer on top of an existing install.

Rebuilt; `asar list` re-verified.

### v11 — open-sourced; macOS + Linux packaging, CI, MIT license (2026-08-27)

NeonModoro is going open source. This pass adds macOS and Linux packaging alongside the existing
Windows NSIS build, without touching the Windows output, plus the licensing and CI groundwork an
open-source repo needs. Extended the existing architecture throughout rather than rewriting it —
in particular the custom IPC-driven drag/resize (chosen in v3 specifically to keep right-click
working on Windows by avoiding native `-webkit-app-region: drag`) is unchanged and, per its own
design, should already be OS-agnostic.

**License**: added `LICENSE` (MIT) — `package.json` already declared `"license": "MIT"`, this just
adds the actual file and a README badge/link. No entitlement/paid-tier code exists anywhere in the
app to remove; there never was any.

**`package.json` build config**: added `mac` (dmg + zip, x64 and arm64) and `linux` (AppImage +
`.deb`) target blocks alongside the existing `win`/`nsis` block, none of which were touched. Added
`dist:win` / `dist:mac` / `dist:linux` scripts; changed the previously Windows-hardcoded `dist`
script to plain `electron-builder` so it now builds for whatever host OS it's run on, matching how
`pack` already worked. Skipped `.rpm` and Snap/Flatpak for this pass, per the brief — worth
revisiting if Linux users specifically ask for either.

**macOS: separate x64/arm64 artifacts, not a universal binary.** electron-builder can merge both
into one universal `.dmg` via `@electron/universal`, trading two downloads for one — but that merge
step carries its own historical rough edges (asar validation, native-module conflicts across
architectures) that this app has no native/prebuilt dependencies to justify risking. Separate
artifacts are the safer, more conventional, easier-to-debug-from-CI-logs choice, at the cost of a
user needing to pick the right download for their Mac (documented in README's macOS install
section).

**Icons for all three platforms from the same artwork.** `scripts/generate-icon.js` already drew
the icon (`drawIcon()`) and PNG-encoded it (`encodePNG()`) from scratch for the Windows `.ico`;
extended it to also emit `assets/icon.icns` (a hand-rolled ICNS container — magic + length header,
then PNG-in-OSType chunks for `icp4/icp5/icp6/ic07/ic08/ic09/ic10` covering 16px through 1024px,
which modern macOS accepts directly without needing `iconutil` or any external tool) and
`assets/icon.png` (512×512, the single-file option electron-builder's `linux.icon` accepts) plus a
full `assets/icons/<size>x<size>.png` set (16 through 1024) for anything downstream that wants
individual sizes. All four outputs share the exact same procedural drawing code, so the artwork
can't drift out of sync between platforms — this was a packaging-format change, not a redesign.
Verified the regenerated `icon.ico` is byte-identical in size/content to the pre-existing one
(same `SIZES` array, same draw code, nothing about the Windows path changed).

**Platform-specific window behavior** (`main.js`):
- **macOS always-on-top**: added `mainWindow.setAlwaysOnTop(true, 'floating')` (macOS-only, also
  applied to popup windows) — plain `alwaysOnTop: true` can still be covered by another app's
  fullscreen Space on macOS, and `'floating'` is the level that actually stays above those, matching
  the "always visible" behavior the Windows build already gets from the default level there.
- **Window icon path**: added `windowIconPath()`, returning the right container per
  `process.platform` (`.ico` / `.icns` / `.png`) for the `BrowserWindow` `icon` option — this only
  affects unpackaged dev runs (`npm start`); a packaged app gets its real icon from `build.<platform>.icon`
  in `package.json`. Also calls `app.dock.setIcon()` on macOS at launch, same dev-run-only caveat.
- **`frame: false` and window controls**: confirmed by reading Electron's own docs rather than by
  testing on real macOS hardware (none available in this environment) — `frame: false` suppresses
  the traffic-light buttons because there's no title bar for them to attach to; no code change was
  needed or made here. Flagging this as verified-by-documentation, not verified-by-running, same as
  the drag/resize and context-menu items below.
- **Quit behavior**: `window-all-closed` already called `app.quit()` unconditionally (no
  `if (process.platform !== 'darwin')` guard that a lot of Electron templates default to), which
  already satisfies "no phantom background process on Mac." Left as-is; added a comment explaining
  *why* it's deliberately not platform-gated, since an unexplained absence of the usual mac guard
  reads as an oversight rather than a decision.
- **Drag/resize/context-menu**: per journal v3/v4, these already avoid every platform-specific trap
  this environment is aware of (no native drag-region, `Menu.popup()` is Electron's own cross-platform
  API). Not modified. **Could not directly test on macOS or Linux** — no such hardware/OS available
  here — so this is relying on the CI workflow (below) and Electron's own cross-platform contract
  for actual verification, not firsthand confirmation. Flagging explicitly rather than claiming
  tested behavior.

**Linux transparency**: added `warnIfLikelyNoCompositor()` — a best-effort, non-blocking heuristic
(Wayland display present, or a known compositing desktop environment name in `XDG_CURRENT_DESKTOP`)
that logs a console warning at launch if neither signal is present. Electron has no real API to
query compositor presence, so this can't be more than a heuristic in either direction; the actual
guarantee is the documentation in README's Linux install section explaining that a non-compositing
X11 setup renders the transparent area as solid black, so a user who hits this understands it's an
environment limitation, not an app bug.

**CI**: added `.github/workflows/build.yml` — a matrix over `windows-latest` / `macos-latest` /
`ubuntu-latest`, each running `npm ci` then its platform's `dist:<platform>` script, uploading the
result as a workflow artifact. Triggers on `v*` tags (so tagging a release produces all three
platform packages, including macOS, without the maintainer owning a Mac — the single highest-value
piece of this pass) and on pull requests against `main` as a build-health check. Added a
`libfuse2`-install step gated to the Ubuntu runner, since recent Ubuntu GitHub runner images
dropped it by default and the AppImage build tooling electron-builder downloads needs it.

**Docs**: README got new "Installing" (Windows/macOS/Linux, including the Gatekeeper/SmartScreen
bypass steps and the Linux transparency caveat), "Continuous integration", and expanded "Building
an installer" sections, plus new Notes-on-implementation-choices bullets for every decision above
and an updated Project structure listing. `LICENSE` referenced from the README header.

Rebuilt (`npm run dist`, Windows/host target only, in this environment); `asar list` re-verified —
file scope for the Windows package is unchanged from before this pass. `dist:mac` and `dist:linux`
could not be run locally (no macOS/Linux host available here); their correctness rests on the CI
workflow added above actually succeeding on GitHub's runners, which the maintainer should confirm
on the first tagged push or PR after this lands.
