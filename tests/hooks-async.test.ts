import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installHooks } from '../src/main/installer';
import { EVENT_NAMES } from '../src/shared/types';

const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const HOOK = 'C:\\h\\hook.js';

describe('hooks do not make Claude wait', () => {
  it('every event hook runs in the background (async), so a tool call is never delayed by the hook process', () => {
    const p = join(mkdtempSync(join(tmpdir(), 'kayy-async-')), 'settings.json');
    installHooks(p, HOOK);
    const s = read(p);
    for (const name of [...EVENT_NAMES, 'PostToolUseFailure']) {
      expect(s.hooks[name][0].hooks[0].async, name).toBe(true);
    }
  });
  it('the PermissionRequest hook stays blocking: it must wait for the user', () => {
    const p = join(mkdtempSync(join(tmpdir(), 'kayy-async-')), 'settings.json');
    installHooks(p, HOOK);
    const h = read(p).hooks.PermissionRequest[0].hooks[0];
    expect(h.async).toBeUndefined();
    expect(h.timeout).toBe(25);
  });
});
