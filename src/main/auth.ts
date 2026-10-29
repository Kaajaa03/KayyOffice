import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Request signing between the overlay and its clients (hook.js, the Claude mod).
 * The token itself NEVER travels: a process squatting on the port must not learn it, otherwise it
 * could forge both the request check and the response proof.
 *   x-kayy-nonce : fresh random hex per request (replays are rejected by NonceCache)
 *   x-kayy-auth  : HMAC-SHA256(token, "req|" + nonce + "|" + path + "|" + body)
 *   x-kayy-proof : (on /permission replies) HMAC-SHA256(token, "res|" + nonce + "|" + decision)
 */
const hmac = (token: string, msg: string) => createHmac('sha256', token).update(msg).digest('hex');

export const requestAuth = (token: string, nonce: string, path: string, body: string): string =>
  hmac(token, `req|${nonce}|${path}|${body}`);

export const responseProof = (token: string, nonce: string, decision: string): string =>
  hmac(token, `res|${nonce}|${decision}`);

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}

export function verifyAuth(token: string, nonce: unknown, auth: unknown, path: string, body: string): boolean {
  if (typeof nonce !== 'string' || !/^[0-9a-f]{16,64}$/i.test(nonce)) return false;
  if (typeof auth !== 'string' || !/^[0-9a-f]{64}$/i.test(auth)) return false;
  return safeEqual(requestAuth(token, nonce, path, body), auth.toLowerCase());
}

/** Remembers recently used nonces so a captured request cannot be replayed. Bounded. */
export class NonceCache {
  private seen = new Map<string, number>(); // nonce -> expiry (insertion ordered)

  constructor(private max = 4096, private ttlMs = 10 * 60_000, private now: () => number = Date.now) {}

  useOnce(nonce: string): boolean {
    const t = this.now();
    for (const [n, exp] of this.seen) {
      if (exp > t) break;
      this.seen.delete(n);
    }
    if (this.seen.has(nonce)) return false;
    this.seen.set(nonce, t + this.ttlMs);
    while (this.seen.size > this.max) this.seen.delete(this.seen.keys().next().value as string);
    return true;
  }

  size(): number {
    return this.seen.size;
  }
}
