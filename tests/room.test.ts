import { describe, it, expect } from 'vitest';
import { roomLayout, KITCHEN_W, LOUNGE_W, SEAT_W, MAX_W, MAX_H } from '../src/renderer/room';

describe('roomLayout', () => {
  it('one agent gets a single 4-seat cluster in a one-row room inside the budget', () => {
    const r = roomLayout(1);
    expect(r.clusters.length).toBe(1);
    expect(r.seats.length).toBe(4);
    expect(r.rows).toBe(1);
    expect(r.w).toBeLessThanOrEqual(MAX_W);
    expect(r.h).toBeLessThanOrEqual(MAX_H);
  });
  it('the room grows wider with more agents', () => {
    expect(roomLayout(5).w).toBeGreaterThan(roomLayout(4).w);
    expect(roomLayout(5).clusters.length).toBe(2);
  });
  it('adds a second desk row when one row is full and still fits the budget', () => {
    const r = roomLayout(13);
    expect(r.rows).toBe(2);
    expect(r.h).toBeGreaterThan(roomLayout(4).h);
    expect(r.w).toBeLessThanOrEqual(MAX_W);
    expect(r.h).toBeLessThanOrEqual(MAX_H);
  });
  it('caps capacity instead of overflowing the window', () => {
    const r = roomLayout(60);
    expect(r.seats.length).toBeLessThan(60);
    expect(r.w).toBeLessThanOrEqual(MAX_W);
    expect(r.h).toBeLessThanOrEqual(MAX_H);
  });
  it('uses fewer cluster columns on a narrow window', () => {
    const narrow = roomLayout(12, 300);
    expect(narrow.w).toBeLessThanOrEqual(300);
    expect(narrow.cols).toBeLessThan(roomLayout(12).cols);
  });
  it('gives every seat a distinct position between kitchen and lounge', () => {
    const r = roomLayout(12);
    expect(new Set(r.seats.map((s) => `${s.x},${s.y}`)).size).toBe(r.seats.length);
    for (const s of r.seats) {
      expect(s.x).toBeGreaterThan(KITCHEN_W);
      expect(s.x).toBeLessThan(r.w - LOUNGE_W);
    }
  });
  it('slots 0 and 1 sit side by side (sub-agent next to parent), screens toward the viewer first', () => {
    const r = roomLayout(4);
    const [a, b, c] = r.seats;
    expect(a.y).toBe(b.y);
    expect(b.x - a.x).toBe(SEAT_W);
    expect(a.facing).toBe('up');
    expect(c.facing).toBe('down');
    expect(c.y).toBeLessThan(a.y);
  });
  it('has a coffee spot in the kitchen and lounge spots inside the room', () => {
    const r = roomLayout(3);
    expect(r.coffee.x).toBeLessThan(KITCHEN_W);
    expect(r.loungeSpots.length).toBeGreaterThanOrEqual(3);
    for (const p of r.loungeSpots) {
      expect(p.x).toBeGreaterThan(r.w - LOUNGE_W);
      expect(p.y).toBeLessThan(r.h);
    }
  });
});
