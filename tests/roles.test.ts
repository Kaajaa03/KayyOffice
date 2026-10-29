import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyRoles, assignRole, groupByProject, loadRoles, projectOf } from '../src/main/roles';
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
});

describe('groupByProject', () => {
  it('uses the last folder of a Windows path', () => expect(projectOf(ag('a', { cwd: 'C:\\a\\b\\Proj' }))).toBe('Proj'));
  it('uses the last folder of a posix path with trailing slash', () => expect(projectOf(ag('a', { cwd: '/home/x/proj/' }))).toBe('proj'));
  it('groups agents of the same cwd together', () => {
    const g = groupByProject([ag('a'), ag('b'), ag('c', { cwd: 'C:\\dev\\Other' })]);
    expect(g.Proj.map((x) => x.id)).toEqual(['a', 'b']);
    expect(Object.keys(g).sort()).toEqual(['Other', 'Proj']);
  });
});
