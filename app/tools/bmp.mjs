import { readFileSync } from 'node:fs';

/** 24-bit BMP (top-down or bottom-up) → RGBA pixels. */
export function readBmp(path) {
  const b = readFileSync(path);
  if (b.toString('latin1', 0, 2) !== 'BM') throw new Error(`${path}: not a BMP`);
  const offset = b.readUInt32LE(10);
  const width = b.readInt32LE(18);
  const rawH = b.readInt32LE(22);
  const bpp = b.readUInt16LE(28);
  if (bpp !== 24 && bpp !== 32) throw new Error(`${path}: ${bpp}-bit BMP`);
  const height = Math.abs(rawH);
  const stride = Math.ceil((width * bpp) / 32) * 4;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const row = offset + (rawH < 0 ? y : height - 1 - y) * stride;
    for (let x = 0; x < width; x++) {
      const s = row + x * (bpp / 8);
      data.set([b[s + 2], b[s + 1], b[s], 255], (y * width + x) * 4);
    }
  }
  return { width, height, data };
}
