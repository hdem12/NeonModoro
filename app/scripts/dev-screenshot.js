// Dev-only helper: loads index.html standalone (no main.js IPC handlers, so the
// renderer falls back to its hardcoded defaults) at a given width, and captures a
// PNG. Used to visually check the clock face for clipping/layout regressions
// without needing a real display. Not packaged (see package.json "files").
//
// Usage: electron scripts/dev-screenshot.js [width] [outFile]
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const ASPECT_RATIO = 2.4;
const width = parseInt(process.argv[2], 10) || 360;
const outFile = process.argv[3] || 'dev-screenshot.png';

app.commandLine.appendSwitch('disable-gpu');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width,
    height: Math.round(width / ASPECT_RATIO),
    frame: false,
    transparent: false,
    backgroundColor: '#202225',
    show: false,
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js') },
  });
  await win.loadFile(path.join(__dirname, '..', 'index.html'));
  await new Promise((r) => setTimeout(r, 800));
  const img = await win.webContents.capturePage();
  const outPath = path.join(__dirname, '..', outFile);
  fs.writeFileSync(outPath, img.toPNG());
  console.log('WROTE', outPath);
  app.quit();
});
