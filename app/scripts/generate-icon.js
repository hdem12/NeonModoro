// Generates assets/icon.ico (Windows), assets/icon.icns (macOS), and
// assets/icon.png + assets/icons/*.png (Linux) from scratch (no external image
// tools / no network), using only Node's built-in zlib for PNG compression.
// Draws a simple neon cyan "colon" glyph on a dark rounded LCD-bezel background
// at several sizes and packs them into each platform's native icon container.
// The artwork itself (drawIcon below) is identical across all three outputs —
// this is purely a packaging-format difference, not a redesign.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZES = [16, 24, 32, 48, 64, 128, 256];
// macOS/Linux want larger source sizes than Windows .ico traditionally does
// (Retina displays, HiDPI Linux desktops, and app-store-style large tiles).
const LARGE_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

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

  // Raw scanlines, each prefixed with filter byte 0 (none).
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

// Draws the icon at `size` px, returns a Buffer of raw RGBA pixels (size*size*4).
function drawIcon(size) {
  const buf = Buffer.alloc(size * size * 4);

  const bg = [10, 16, 20]; // dark bezel
  const accent = [191, 239, 255]; // cyan, matches --accent-work
  const cornerRadius = size * 0.22;

  // colon dot geometry (two dots stacked vertically, centered)
  const dotRadius = size * 0.085;
  const cx = size / 2;
  const cyTop = size * 0.36;
  const cyBottom = size * 0.64;
  const glowRadius = dotRadius * 2.6;

  function roundedRectAlpha(x, y) {
    const rx = Math.max(0, Math.abs(x - size / 2) - (size / 2 - cornerRadius));
    const ry = Math.max(0, Math.abs(y - size / 2) - (size / 2 - cornerRadius));
    const d = Math.sqrt(rx * rx + ry * ry);
    if (d <= cornerRadius) return 1;
    const edge = d - cornerRadius;
    return edge < 1 ? 1 - edge : 0;
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

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

function buildICO(sizes) {
  const images = sizes.map((size) => {
    const rgba = drawIcon(size);
    const png = encodePNG(size, size, rgba);
    return { size, png };
  });

  const headerSize = 6;
  const dirEntrySize = 16;
  const dirOffset = headerSize;
  let dataOffset = headerSize + dirEntrySize * images.length;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  const dirEntries = [];
  const dataParts = [];

  for (const img of images) {
    const entry = Buffer.alloc(dirEntrySize);
    const dim = img.size >= 256 ? 0 : img.size;
    entry.writeUInt8(dim, 0); // width (0 = 256)
    entry.writeUInt8(dim, 1); // height (0 = 256)
    entry.writeUInt8(0, 2); // color palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(img.png.length, 8); // size of image data
    entry.writeUInt32LE(dataOffset, 12); // offset of image data
    dataOffset += img.png.length;
    dirEntries.push(entry);
    dataParts.push(img.png);
  }

  return Buffer.concat([header, ...dirEntries, ...dataParts]);
}

// macOS .icns container: 'icns' magic + total length, then a sequence of
// TLV chunks (4-byte OSType + 4-byte length-including-header + PNG data).
// Modern macOS (10.7+) accepts plain PNG data in these OSTypes directly, so
// no need for the older raw/JPEG2000 encodings or an external iconutil call.
const ICNS_TYPE_BY_SIZE = {
  16: 'icp4',
  32: 'icp5',
  64: 'icp6',
  128: 'ic07',
  256: 'ic08',
  512: 'ic09',
  1024: 'ic10',
};

function buildICNS(sizes) {
  const chunks = [];
  for (const size of sizes) {
    const type = ICNS_TYPE_BY_SIZE[size];
    if (!type) continue; // skip sizes with no defined ICNS OSType (e.g. 24, 48)
    const png = encodePNG(size, size, drawIcon(size));
    const header = Buffer.alloc(8);
    header.write(type, 0, 'ascii');
    header.writeUInt32BE(8 + png.length, 4);
    chunks.push(Buffer.concat([header, png]));
  }
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(8);
  header.write('icns', 0, 'ascii');
  header.writeUInt32BE(8 + body.length, 4);
  return Buffer.concat([header, body]);
}

const ico = buildICO(SIZES);
const icoPath = path.join(__dirname, '..', 'assets', 'icon.ico');
fs.writeFileSync(icoPath, ico);
console.log(`Wrote ${icoPath} (${ico.length} bytes, sizes: ${SIZES.join(', ')})`);

const icns = buildICNS(LARGE_SIZES);
const icnsPath = path.join(__dirname, '..', 'assets', 'icon.icns');
fs.writeFileSync(icnsPath, icns);
console.log(`Wrote ${icnsPath} (${icns.length} bytes)`);

// Linux: electron-builder's simplest path is a single 512x512+ PNG, so that's
// the one wired into package.json. assets/icons/<size>x<size>.png is also
// emitted as a full icon-theme-style set, for anything downstream (desktop
// files, packaging tools, contributors' own scripts) that wants individual
// sizes rather than one large PNG to scale down itself.
const iconPngPath = path.join(__dirname, '..', 'assets', 'icon.png');
fs.writeFileSync(iconPngPath, encodePNG(512, 512, drawIcon(512)));
console.log(`Wrote ${iconPngPath} (512x512)`);

const iconsDir = path.join(__dirname, '..', 'assets', 'icons');
fs.mkdirSync(iconsDir, { recursive: true });
for (const size of LARGE_SIZES) {
  const p = path.join(iconsDir, `${size}x${size}.png`);
  fs.writeFileSync(p, encodePNG(size, size, drawIcon(size)));
}
console.log(`Wrote ${LARGE_SIZES.length} PNGs to ${iconsDir} (${LARGE_SIZES.join(', ')})`);
