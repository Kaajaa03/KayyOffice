// Procedural pixel-art app icon plus a dependency-free PNG encoder and ICO container writer.
import { deflateSync } from 'node:zlib';

export const ICON_SIZES = [16, 32, 48, 256] as const;
const GRID = 16;

type Rgba = [number, number, number, number];
const hex = (h: string): Rgba => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];

const BG = '#1b1e28';

/** The icon on a 16x16 pixel grid: a tiny desk with a monitor and a gold status dot. */
function gridPixels(): Rgba[] {
  const px: Rgba[] = Array.from({ length: GRID * GRID }, () => hex(BG));
  const rect = (x: number, y: number, w: number, h: number, color: string): void => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) px[j * GRID + i] = hex(color);
  };
  for (const [x, y] of [[0, 0], [15, 0], [0, 15], [15, 15]]) px[y * GRID + x] = [0, 0, 0, 0]; // rounded tile
  rect(3, 3, 10, 7, '#c9ced8'); // monitor bezel
  rect(4, 4, 8, 5, '#339af0'); // screen
  rect(5, 5, 4, 1, '#a5d8ff'); // code lines
  rect(5, 7, 5, 1, '#a5d8ff');
  rect(7, 10, 2, 2, '#868e96'); // stand
  rect(1, 12, 14, 1, '#d19a5c'); // desk top (lit edge)
  rect(1, 13, 14, 1, '#a9713b');
  rect(2, 14, 1, 1, '#6b4423'); // legs
  rect(13, 14, 1, 1, '#6b4423');
  rect(11, 1, 4, 4, BG); // gold dot with a dark ring so it reads on the bezel
  rect(12, 2, 2, 2, '#ffd43b');
  return px;
}

/** RGBA pixels (row-major) of the icon at `size` px, nearest-neighbour scaled from the 16x16 grid. */
export function iconRgba(size: number): Buffer {
  const grid = gridPixels();
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const p = grid[Math.floor((y * GRID) / size) * GRID + Math.floor((x * GRID) / size)];
      out.set(p, (y * size + x) * 4);
    }
  }
  return out;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** 8-bit RGBA PNG, no interlacing, filter 0 on every scanline. */
export function encodePng(width: number, height: number, rgba: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  return Buffer.concat([PNG_SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

export interface IcoImage { size: number; png: Buffer }

/** ICO container whose entries are PNG-compressed images (Vista+; size 256 is stored as 0). */
export function encodeIco(images: IcoImage[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = header.length + dir.length;
  images.forEach((img, i) => {
    const e = i * 16;
    dir[e] = img.size >= 256 ? 0 : img.size;
    dir[e + 1] = img.size >= 256 ? 0 : img.size;
    dir.writeUInt16LE(1, e + 4); // planes
    dir.writeUInt16LE(32, e + 6); // bits per pixel
    dir.writeUInt32LE(img.png.length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += img.png.length;
  });
  return Buffer.concat([header, dir, ...images.map((i) => i.png)]);
}

export const renderPng = (size: number): Buffer => encodePng(size, size, iconRgba(size));
export const renderIco = (): Buffer => encodeIco(ICON_SIZES.map((size) => ({ size, png: renderPng(size) })));
