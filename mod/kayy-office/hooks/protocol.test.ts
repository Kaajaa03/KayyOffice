import { expect, test } from 'claude-code/testing'
import { randomHex, signRequest, verifyReply } from './overlay'
import { equalsConstantTime, hmacHex } from './sha256'

const TOKEN = 'tok-123'

/** What the overlay server checks: the auth over exactly this nonce, path and body. */
const serverAccepts = (token: string, path: string, headers: Record<string, string>, body: string) => {
  const nonce = headers['x-kayy-nonce'] ?? ''
  if (!/^[0-9a-f]{32}$/.test(nonce)) return false
  return equalsConstantTime(headers['x-kayy-auth'] ?? '', hmacHex(token, `req|${nonce}|${path}|${body}`))
}

const reply = (nonce: string, decision: string, proofFor = decision, proofNonce = nonce) => ({
  headers: { 'x-kayy-proof': hmacHex(TOKEN, `res|${proofNonce}|${proofFor}`) },
  text: JSON.stringify({ decision }),
})

test('a signed request carries nonce and auth, never the token', () => {
  const body = '{"event":"Stop"}'
  const nonce = randomHex(16)
  const headers = signRequest(TOKEN, nonce, '/event', body)
  expect(Object.keys(headers).sort()).toEqual(['content-type', 'x-kayy-auth', 'x-kayy-nonce'])
  expect(JSON.stringify(headers)).not.toContain(TOKEN)
  expect(headers['x-kayy-nonce']).toMatch(/^[0-9a-f]{32}$/)
  expect(headers['x-kayy-auth']).toBe(hmacHex(TOKEN, `req|${nonce}|/event|${body}`))
  expect(serverAccepts(TOKEN, '/event', headers, body)).toBe(true)
})

test('the server rejects a tampered body, path, nonce or a wrong key', () => {
  const body = '{"tool":"Bash","summary":"ls"}'
  const headers = signRequest(TOKEN, randomHex(16), '/permission', body)
  expect(serverAccepts(TOKEN, '/permission', headers, body.replace('ls', 'rm -rf /'))).toBe(false)
  expect(serverAccepts(TOKEN, '/event', headers, body)).toBe(false)
  expect(serverAccepts(TOKEN, '/permission', { ...headers, 'x-kayy-nonce': randomHex(16) }, body)).toBe(false)
  expect(serverAccepts('other-token', '/permission', headers, body)).toBe(false)
})

test('nonces are fresh per request', () => {
  const seen = new Set(Array.from({ length: 50 }, () => randomHex(16)))
  expect(seen.size).toBe(50)
})

test('a reply counts only with the proof for exactly its decision and nonce', () => {
  const nonce = randomHex(16)
  expect(verifyReply(TOKEN, nonce, reply(nonce, 'allow'))).toBe('allow')
  expect(verifyReply(TOKEN, nonce, reply(nonce, 'deny'))).toBe('deny')
  // decision swapped, proof of the old one
  expect(verifyReply(TOKEN, nonce, reply(nonce, 'allow', 'deny'))).toBe('ask')
  expect(verifyReply(TOKEN, nonce, reply(nonce, 'deny', 'allow'))).toBe('ask')
  // proof made for another nonce (a replayed reply)
  expect(verifyReply(TOKEN, nonce, reply(nonce, 'allow', 'allow', randomHex(16)))).toBe('ask')
  // the old protocol's proof, HMAC(token, nonce)
  expect(verifyReply(TOKEN, nonce, { headers: { 'x-kayy-proof': hmacHex(TOKEN, nonce) }, text: '{"decision":"allow"}' })).toBe('ask')
})

test('a missing proof, a short proof, a wrong key or a broken body is ask', () => {
  const nonce = randomHex(16)
  expect(verifyReply(TOKEN, nonce, { headers: {}, text: '{"decision":"allow"}' })).toBe('ask')
  expect(verifyReply(TOKEN, nonce, { headers: { 'x-kayy-proof': 'ab' }, text: '{"decision":"allow"}' })).toBe('ask')
  expect(
    verifyReply(TOKEN, nonce, { headers: { 'x-kayy-proof': hmacHex('wrong', `res|${nonce}|allow`) }, text: '{"decision":"allow"}' }),
  ).toBe('ask')
  expect(verifyReply(TOKEN, nonce, { ...reply(nonce, 'allow'), text: 'not json' })).toBe('ask')
  expect(verifyReply(TOKEN, nonce, reply(nonce, 'yes'))).toBe('ask')
})
