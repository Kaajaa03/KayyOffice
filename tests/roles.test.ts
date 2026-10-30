import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyRoles, assignRole, loadRoles } from '../src/main/roles';
import { projectOf } from '../src/shared/project';
import type { Agent } from '../src/shared/types';

const ag = (id: string, o: Partial<Agent> = {}): Agent => ({ id, sessionId: id, cwd: 'C:\\dev\\Proj', status: 'idle', lastEventTs: 1, ...o });
const roles = [
  { match: { namePattern: 'review' }, role: 'Reviewer', color: '#ffa94d' },
  { match: { cwdContains: 'Proj' }, role: 'Dev', color: '#4dabf7' },
];

describe('assignRole', () => {
  it('first matching role wins (name before cwd)', () => {
    expect(assignRole(ag('code-reviewer'), roles)).toMatchObject({ role: 'Reviewer', color: '#ffa94d' });
  });
  it('matches on agent name (agentType) too', () => {
    expect(assignRole(ag('x1', { name: 'security-reviewer', cwd: 'C:\\other' }), roles).role).toBe('Reviewer');
  });
  it('falls through to cwd match', () => {
    expect(assignRole(ag('worker'), roles).role).toBe('Dev');
  });
  it('returns {} when nothing matches', () => {
    expect(assignRole(ag('worker', { cwd: 'C:\\other' }), roles)).toEqual({});
  });
});

describe('loadRoles', () => {
  const file = (content: string) => {
    const p = join(mkdtempSync(join(tmpdir(), 'kayy-roles-')), 'roles.json');
    writeFileSync(p, content);
    return p;
  };
  it('returns [] for a missing file', () => expect(loadRoles(join(tmpdir(), 'nope-roles.json'))).toEqual([]));
  it('returns [] for a broken file without throwing', () => expect(loadRoles(file('{oops'))).toEqual([]));
  it('rejects colors that are not #rrggbb (they would break canvas gradients)', () => {
    const bad = ['red', '#f00', '#12345g', 'rgb(1,2,3)', ''].map((color) => ({ match: { namePattern: 'x' }, role: 'R', color }));
    expect(loadRoles(file(JSON.stringify(bad)))).toEqual([]);
    const ok = { match: { namePattern: 'x' }, role: 'R', color: '#FFA94D' };
    expect(loadRoles(file(JSON.stringify([ok])))).toEqual([ok]);
  });
  it('skips invalid entries and invalid regexes, keeps valid ones', () => {
    const p = file(JSON.stringify([{ role: 'no-match' }, { match: { namePattern: '(' }, role: 'Bad', color: '#fff' }, roles[0]]));
    expect(loadRoles(p)).toEqual([roles[0]]);
  });
});

describe('applyRoles', () => {
  it('decorates agents with role and color without mutating the input', () => {
    const input = { agents: { a: ag('a', { name: 'code-reviewer' }), b: ag('b', { cwd: 'C:\\other' }) } };
    const out = applyRoles(input, roles);
    expect(out.agents.a).toMatchObject({ role: 'Reviewer', color: '#ffa94d' });
    expect(out.agents.b.role).toBeUndefined();
    expect(input.agents.a.role).toBeUndefined();
  });
  it('keeps the roster', () => {
    const roster = [{ type: 'kayy-scout' }];
    expect(applyRoles({ agents: { a: ag('a') }, roster }, roles).roster).toBe(roster);
  });
});

describe('projectOf', () => {
  it('uses the last folder of a Windows path', () => expect(projectOf(ag('a', { cwd: 'C:\\a\\b\\Proj' }))).toBe('Proj'));
  it('uses the last folder of a posix path with trailing slash', () => expect(projectOf(ag('a', { cwd: '/home/x/proj/' }))).toBe('proj'));
});

describe('role regex handling', () => {
  afterEach(() => vi.restoreAllMocks());
  const file = (content: string) => {
    const p = join(mkdtempSync(join(tmpdir(), 'kayy-roles-')), 'roles.json');
    writeFileSync(p, content);
    return p;
  };
  it('only tests the first 200 characters of id + name', () => {
    const r = [{ match: { namePattern: 'review' }, role: 'Reviewer', color: '#ffa94d' }];
    expect(assignRole(ag('x'.repeat(300) + ' review', { cwd: 'C:\o' }), r)).toEqual({});
    expect(assignRole(ag('review' + 'x'.repeat(300), { cwd: 'C:\o' }), r).role).toBe('Reviewer');
  });
  it('compiles each pattern once at load, not on every assignRole call', () => {
    const loaded = loadRoles(file(JSON.stringify([{ match: { namePattern: 'review|audit' }, role: 'R', color: '#ffa94d' }])));
    const Real = RegExp;
    let constructed = 0;
    vi.stubGlobal('RegExp', new Proxy(Real, { construct(t, a) { constructed++; return Reflect.construct(t, a); } }));
    try {
      for (let i = 0; i < 50; i++) assignRole(ag('code-reviewer', { cwd: 'C:\o' }), loaded);
    } finally { vi.unstubAllGlobals(); }
    expect(constructed).toBe(0);
  });
});
