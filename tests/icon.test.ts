import { describe, it, expect } from 'vitest';
import { inflateSync } from 'node:zlib';
import { ICON_SIZES, PNG_SIGNATURE, crc32, encodeIco, encodePng, iconRgba, renderIco, renderPng } from '../tools/icon-lib';

describe('crc32', () => {
  it('matches the standard check value', () => expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926));
});

describe('encodePng', () => {
  it('writes a valid RGBA PNG that round-trips through inflate', () => {
    const rgba = iconRgba(16);
    const png = encodePng(16, 16, rgba);
    expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    expect(png.readUInt32BE(16)).toBe(16); // IHDR width
    expect(png.readUInt32BE(20)).toBe(16);
    expect(png[24]).toBe(8);
    expect(png[25]).toBe(6);
    const idatLen = png.readUInt32BE(33);
    expect(png.toString('ascii', 37, 41)).toBe('IDAT');
    const raw = inflateSync(png.subarray(41, 41 + idatLen));
    expect(raw.length).toBe((16 * 4 + 1) * 16);
    expect(raw[0]).toBe(0); // filter byte
    expect(raw.subarray(1, 65).equals(rgba.subarray(0, 64))).toBe(true);
    expect(png.subarray(-12, -8).readUInt32BE(0)).toBe(0); // IEND length
    expect(png.toString('ascii', png.length - 8, png.length - 4)).toBe('IEND');
  });
  it('chunk CRCs are valid', () => {
    const png = renderPng(32);
    let pos = 8;
    while (pos < png.length) {
      const len = png.readUInt32BE(pos);
      const body = png.subarray(pos + 4, pos + 8 + len);
      expect(png.readUInt32BE(pos + 8 + len)).toBe(crc32(body));
      pos += 12 + len;
    }
    expect(pos).toBe(png.length);
  });
});

describe('icon art', () => {
  it('has opaque content, rounded transparent corners and a gold dot', () => {
    const px = iconRgba(16);
    expect(px[3]).toBe(0); // corner (0,0) transparent
    expect(px[(8 * 16 + 8) * 4 + 3]).toBe(255);
    const gold = (y: number, x: number) => [...px.subarray((y * 16 + x) * 4, (y * 16 + x) * 4 + 3)].join(',');
    expect(gold(2, 12)).toBe('255,212,59');
  });
});

describe('encodeIco', () => {
  const ico = renderIco();
  it('has an ICONDIR header with one entry per size', () => {
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(ICON_SIZES.length);
    expect(ICON_SIZES).toEqual([16, 32, 48, 256]);
  });
  it('entries point at consecutive PNG payloads with matching sizes', () => {
    let expectedOffset = 6 + 16 * ICON_SIZES.length;
    ICON_SIZES.forEach((size, i) => {
      const e = 6 + i * 16;
      expect(ico[e]).toBe(size === 256 ? 0 : size);
      expect(ico[e + 1]).toBe(size === 256 ? 0 : size);
      expect(ico.readUInt16LE(e + 4)).toBe(1);
      expect(ico.readUInt16LE(e + 6)).toBe(32);
      const len = ico.readUInt32LE(e + 8);
      const off = ico.readUInt32LE(e + 12);
      expect(off).toBe(expectedOffset);
      expect(ico.subarray(off, off + 8).equals(PNG_SIGNATURE)).toBe(true);
      expect(ico.readUInt32BE(off + 16)).toBe(size);
      expectedOffset += len;
    });
    expect(expectedOffset).toBe(ico.length);
  });
  it('encodes an arbitrary image list', () => {
    const png = renderPng(16);
    const one = encodeIco([{ size: 16, png }]);
    expect(one.length).toBe(6 + 16 + png.length);
  });
});
