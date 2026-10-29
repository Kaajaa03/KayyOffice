import { describe, it, expect } from 'vitest';
import { shouldShowCard, parseApprovalMode, DEFAULT_APPROVAL_MODE } from '../src/main/approvals';

describe('approval mode', () => {
  it('defaults to risky (no card for everyday commands)', () => expect(DEFAULT_APPROVAL_MODE).toBe('risky'));
  it('parses valid values and falls back to the default', () => {
    expect(parseApprovalMode('all')).toBe('all');
    expect(parseApprovalMode('off')).toBe('off');
    expect(parseApprovalMode('risky')).toBe('risky');
    expect(parseApprovalMode('nonsense')).toBe('risky');
    expect(parseApprovalMode(undefined)).toBe('risky');
  });
  it('all: every request gets a card', () => {
    expect(shouldShowCard('all', 'Bash', 'npm test')).toBe(true);
  });
  it('off: never a card (normal Claude dialog handles it)', () => {
    expect(shouldShowCard('off', 'Bash', 'rm -rf /')).toBe(false);
  });
  it('risky: only destructive or sensitive requests get a card', () => {
    expect(shouldShowCard('risky', 'Bash', 'npm test')).toBe(false);
    expect(shouldShowCard('risky', 'Edit', 'C:\\dev\\a.ts')).toBe(false);
    expect(shouldShowCard('risky', 'Bash', 'git push --force origin main')).toBe(true);
    expect(shouldShowCard('risky', 'Write', 'C:\\proj\\.env')).toBe(true);
  });
});
