// Generates assets/appx/*.png — the Microsoft Store tile images electron-builder's
// appx target reads from (see build.appx in package.json / the "Microsoft Store
// build" section of README.md). Without these, electron-builder falls back to its
// own bundled sample tile art for every one of them, which is what got this app
// rejected in Store certification under "10.1.1.11 On Device Tiles" (product tiles
// must not use a default/generic image). Pure Node + zlib, no external image tools
// or network — same approach as generate-icon.js, generalized to non-square canvases
// for the wide tile. The artwork (drawTile below) matches generate-icon.js's design
// (dark rounded bezel, glowing cyan "colon" dots) so the Store tiles look like the
// same app as the taskbar/desktop icon rather than a separate, unrelated image.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// name -> [width, height]. Names/dimensions per
// https://docs.microsoft.com/en-us/windows/uwp/controls-and-patterns/tiles-and-notifications-app-assets
// StoreLogo/Square44x44Logo/Square150x150Logo/Wide310x150Logo are the ones
// electron-builder's AppxTarget falls back to vendor sample art for if missing
// (see node_modules/app-builder-lib/out/targets/AppxTarget.js); SmallTile/LargeTile
// are optional but picked up automatically if present, rounding out every tile size
// Windows lets a user pick after pinning the app.
const TILES = {
  'StoreLogo.png': [50, 50],
  'Square44x44Logo.png': [44, 44],
  'Square150x150Logo.png': [150, 150],
  'SmallTile.png': [71, 71],
  'LargeTile.png': [310, 310],
  'Wide310x150Logo.png': [310, 150],
};

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgbaBuffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdr = chunk('IHDR', ihdrData);

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgbaBuffer.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idatData = zlib.deflateSync(raw, { level: 9 });
  const idat = chunk('IDAT', idatData);

  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function mix(c1, c2, t) {
  return c1 + (c2 - c1) * t;
}

// Same bezel/glow-dots artwork as generate-icon.js's drawIcon, generalized from a
// single `size` to independent width/height so the wide 310x150 tile can be drawn
// as one full-bleed canvas (dots + bezel scaled off the shorter dimension, centered
// horizontally) instead of squishing/cropping a square render into a wide rect.
// Passing width === height reproduces drawIcon(size) exactly.
function drawTile(width, height) {
  const buf = Buffer.alloc(width * height * 4);

  const bg = [10, 16, 20]; // dark bezel, matches generate-icon.js
  const accent = [191, 239, 255]; // cyan, matches --accent-work
  const minDim = Math.min(width, height);
  const cornerRadius = minDim * 0.22;

  const dotRadius = minDim * 0.085;
  const cx = width / 2;
  const cyTop = height * 0.36;
  const cyBottom = height * 0.64;
  const glowRadius = dotRadius * 2.6;

  const halfW = width / 2;
  const halfH = height / 2;

  function roundedRectAlpha(x, y) {
    const rx = Math.max(0, Math.abs(x - halfW) - (halfW - cornerRadius));
    const ry = Math.max(0, Math.abs(y - halfH) - (halfH - cornerRadius));
    const d = Math.sqrt(rx * rx + ry * ry);
    if (d <= cornerRadius) return 1;
    const edge = d - cornerRadius;
    return edge < 1 ? 1 - edge : 0;
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      const panelAlpha = roundedRectAlpha(x + 0.5, y + 0.5);

      let r = bg[0];
      let g = bg[1];
      let b = bg[2];
      let a = panelAlpha;

      const dTop = Math.hypot(x - cx, y - cyTop);
      const dBottom = Math.hypot(x - cx, y - cyBottom);
      const d = Math.min(dTop, dBottom);

      if (d <= dotRadius) {
        r = accent[0]; g = accent[1]; b = accent[2];
        a = Math.max(a, 1);
      } else if (d <= glowRadius) {
        const t = 1 - (d - dotRadius) / (glowRadius - dotRadius);
        const glowStrength = Math.pow(t, 1.6);
        r = mix(r, accent[0], glowStrength);
        g = mix(g, accent[1], glowStrength);
        b = mix(b, accent[2], glowStrength);
        a = Math.max(a, panelAlpha);
      }

      buf[idx] = Math.round(r);
      buf[idx + 1] = Math.round(g);
      buf[idx + 2] = Math.round(b);
      buf[idx + 3] = Math.round(a * 255);
    }
  }

  return buf;
}

const outDir = path.join(__dirname, '..', 'assets', 'appx');
fs.mkdirSync(outDir, { recursive: true });

for (const [name, [w, h]] of Object.entries(TILES)) {
  const png = encodePNG(w, h, drawTile(w, h));
  const outPath = path.join(outDir, name);
  fs.writeFileSync(outPath, png);
  console.log(`Wrote ${outPath} (${w}x${h}, ${png.length} bytes)`);
}
