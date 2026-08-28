# NeonModoro

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Build](https://github.com/hdem12/NeonModoro/actions/workflows/build.yml/badge.svg)](https://github.com/hdem12/NeonModoro/actions/workflows/build.yml)

A frameless, transparent, always-on-top neon Pomodoro timer for Windows, macOS, and Linux. Just the glowing `MM:SS` digits float on your desktop, no window chrome, no background box. Drag it anywhere, resize from a corner, hover for playback controls.

## Download

Get the latest build for your platform from the [Releases page](https://github.com/hdem12/NeonModoro/releases/latest):

- **Windows**: the `.exe` installer
- **macOS**: the `.dmg` (Apple Silicon and Intel builds are separate downloads)
- **Linux**: the `.AppImage` or `.deb`

First-run notes:

- **Windows**: SmartScreen will show an "unrecognized app" warning the first time you run the installer. Click **More info**, then **Run anyway**. NeonModoro is free and open source without a paid code-signing certificate, which is what triggers this.
- **macOS**: Gatekeeper will block the first launch. Right-click the app, choose **Open**, then confirm. If that doesn't work, run `xattr -cr /Applications/NeonModoro.app` in Terminal.
- **Linux**: mark the AppImage executable (`chmod +x NeonModoro-*.AppImage`) and run it, or install the `.deb` with your package manager. No warning to bypass. Transparency requires a compositing window manager (the default on most modern desktops); without one the background renders solid black instead of transparent.

## Features

- Frameless, transparent, always-on-top window, draggable and resizable from anywhere.
- 25-minute work sessions and 5-minute breaks, with a longer break automatically offered every 4th session.
- Optional session title and a running Pomodoro count.
- History log of completed sessions, with an estimated-vs-actual summary.
- Custom digit color, an optional alert sound near the end of a session, and a Strict mode that disables pausing mid-session.
- No account, no telemetry, works fully offline.

## Development

```bash
git clone https://github.com/hdem12/NeonModoro.git
cd NeonModoro/app
npm install
npm start
```

Build an installer with `npm run dist:win`, `npm run dist:mac`, or `npm run dist:linux` (each outputs to `app/dist/`). Pushing a `v*` tag builds and publishes all three platforms automatically via GitHub Actions.

## License

MIT. See [LICENSE](LICENSE).
