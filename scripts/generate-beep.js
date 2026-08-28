// Generates assets/beep.wav from scratch (pure Node, no deps, no network):
// a short two-tone chime used for the minute-mark alarm in Settings.

const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;

function tone(freq, durationMs, startGain = 0.5) {
  const n = Math.round((durationMs / 1000) * SAMPLE_RATE);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    // short attack/release envelope to avoid clicks
    const fadeLen = Math.min(n * 0.15, SAMPLE_RATE * 0.01);
    let envelope = 1;
    if (i < fadeLen) envelope = i / fadeLen;
    else if (i > n - fadeLen) envelope = (n - i) / fadeLen;
    samples[i] = Math.sin(2 * Math.PI * freq * t) * startGain * envelope;
  }
  return samples;
}

function concat(...arrays) {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

function silence(durationMs) {
  return new Float32Array(Math.round((durationMs / 1000) * SAMPLE_RATE));
}

const chime = concat(
  tone(880, 140, 0.45),
  silence(30),
  tone(1108.73, 220, 0.45)
);

function encodeWavPCM16(floatSamples, sampleRate) {
  const numSamples = floatSamples.length;
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample; // mono
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * bytesPerSample;

  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, floatSamples[i]));
    buf.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }

  return buf;
}

const wav = encodeWavPCM16(chime, SAMPLE_RATE);
const outPath = path.join(__dirname, '..', 'assets', 'beep.wav');
fs.writeFileSync(outPath, wav);
console.log(`Wrote ${outPath} (${wav.length} bytes)`);
