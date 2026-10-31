import { describe, it, expect } from 'vitest';
import { freeBenchSpots } from '../src/renderer/agents';
import { roomLayout } from '../src/renderer/room';

const room = roomLayout(2, 40, 20);
const same = (a: { x: number; y: number }, b: { x: number; y: number }) => a.x === b.x && a.y === b.y;

describe('freeBenchSpots', () => {
  it('offers every bench spot when no agent rests in the lounge', () => {
    expect(freeBenchSpots(room, 0)).toEqual(room.benchSpots);
  });

  it('never offers a spot an idle or finished agent is sitting on', () => {
    for (const reserved of [1, 2, 3]) {
      const free = freeBenchSpots(room, reserved);
      for (const taken of room.loungeSpots.slice(0, reserved)) {
        expect(free.some((s) => same(s, taken)), `reserved ${reserved}`).toBe(false);
      }
    }
  });
});
