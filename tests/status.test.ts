import { describe, it, expect } from 'vitest';
import { hooksInstalled, tooltipText } from '../src/main/status';

const entry = (command: string) => ({ hooks: [{ type: 'command', command }] });
const settings = (hooks: unknown) => JSON.stringify({ model: 'x', hooks });

describe('hooksInstalled', () => {
  it('is true when a Kayy hook (marker) is registered for any event', () => {
    expect(hooksInstalled(settings({ PreToolUse: [entry('node "/x/hook.js" --kayy-office')] }))).toBe(true);
    expect(hooksInstalled(settings({ Stop: [entry('echo hi'), entry('node h.js --kayy-office')] }))).toBe(true);
  });
  it('is false for foreign hooks, no hooks, missing or broken settings', () => {
    expect(hooksInstalled(settings({ PreToolUse: [entry('node other.js')] }))).toBe(false);
    expect(hooksInstalled(JSON.stringify({ model: 'x' }))).toBe(false);
    expect(hooksInstalled(settings({}))).toBe(false);
    expect(hooksInstalled(null)).toBe(false);
    expect(hooksInstalled('')).toBe(false);
    expect(hooksInstalled('{ not json')).toBe(false);
    expect(hooksInstalled('[]')).toBe(false);
    expect(hooksInstalled(settings({ Stop: 'garbage' }))).toBe(false);
    expect(hooksInstalled(settings({ Stop: [null, { hooks: 5 }] }))).toBe(false);
  });
  it('tolerates a UTF-8 BOM', () => {
    expect(hooksInstalled('﻿' + settings({ Stop: [entry('node h.js --kayy-office')] }))).toBe(true);
  });
});

describe('tooltipText', () => {
  it('shows active and waiting counts in the selected language', () => {
    expect(tooltipText({ working: 3, waiting: 1 }, 'de')).toBe('Kayy Office – 3 aktiv · 1 wartet');
    expect(tooltipText({ working: 3, waiting: 1 }, 'en')).toBe('Kayy Office – 3 active · 1 waiting');
  });
  it('omits zero parts and falls back to the idle text', () => {
    expect(tooltipText({ working: 2, waiting: 0 }, 'de')).toBe('Kayy Office – 2 aktiv');
    expect(tooltipText({ working: 0, waiting: 2 }, 'en')).toBe('Kayy Office – 2 waiting');
    expect(tooltipText({ working: 0, waiting: 0 }, 'de')).toBe('Kayy Office – ruht');
    expect(tooltipText({ working: 0, waiting: 0 }, 'en')).toBe('Kayy Office – idle');
  });
});
