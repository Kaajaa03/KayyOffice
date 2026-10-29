import { describe, it, expect } from 'vitest';
import { NonceCache, requestAuth, responseProof, verifyAuth } from '../src/main/auth';

const TOKEN = 'a'.repeat(64);
const NONCE = '0123456789abcdef0123456789abcdef';

describe('request auth', () => {
  it('is a 64-char hex HMAC, deterministic', () => {
    const a = requestAuth(TOKEN, NONCE, '/event', '{"x":1}');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(requestAuth(TOKEN, NONCE, '/event', '{"x":1}')).toBe(a);
  });
  it('verifies only the exact token, nonce, path and body', () => {
    const body = '{"x":1}';
    const auth = requestAuth(TOKEN, NONCE, '/event', body);
    expect(verifyAuth(TOKEN, NONCE, auth, '/event', body)).toBe(true);
    expect(verifyAuth('b'.repeat(64), NONCE, auth, '/event', body)).toBe(false);
    expect(verifyAuth(TOKEN, NONCE.replace('0', '1'), auth, '/event', body)).toBe(false);
    expect(verifyAuth(TOKEN, NONCE, auth, '/permission', body)).toBe(false);
    expect(verifyAuth(TOKEN, NONCE, auth, '/event', '{"x":2}')).toBe(false);
  });
  it('rejects missing, short, non-hex or non-ASCII values without throwing', () => {
    expect(verifyAuth(TOKEN, undefined, 'x', '/event', '{}')).toBe(false);
    expect(verifyAuth(TOKEN, NONCE, undefined, '/event', '{}')).toBe(false);
    expect(verifyAuth(TOKEN, NONCE, 'abc', '/event', '{}')).toBe(false);
    expect(verifyAuth(TOKEN, NONCE, 'é'.repeat(64), '/event', '{}')).toBe(false);
    expect(verifyAuth(TOKEN, 'short', requestAuth(TOKEN, 'short', '/event', '{}'), '/event', '{}')).toBe(false); // nonce too short
  });
});

describe('response proof', () => {
  it('binds nonce and decision', () => {
    const p = responseProof(TOKEN, NONCE, 'allow');
    expect(p).toMatch(/^[0-9a-f]{64}$/);
    expect(responseProof(TOKEN, NONCE, 'deny')).not.toBe(p);
    expect(responseProof(TOKEN, NONCE.replace('0', '1'), 'allow')).not.toBe(p);
  });
});

describe('NonceCache', () => {
  it('accepts a nonce once, rejects replays', () => {
    const c = new NonceCache();
    expect(c.useOnce(NONCE)).toBe(true);
    expect(c.useOnce(NONCE)).toBe(false);
  });
  it('forgets nonces after the ttl and stays bounded', () => {
    let now = 0;
    const c = new NonceCache(3, 1000, () => now);
    ['n1xxxxxxxx', 'n2xxxxxxxx', 'n3xxxxxxxx', 'n4xxxxxxxx'].forEach((n) => c.useOnce(n));
    expect(c.size()).toBeLessThanOrEqual(3);
    now = 2000;
    expect(c.useOnce('n4xxxxxxxx')).toBe(true);
  });
});
