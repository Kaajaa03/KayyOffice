import type { EngineInterface } from 'claude-code'
import type { AgentEvent } from './mapping'
import { equalsConstantTime, hmacHex, toHex } from './sha256'
import { setLink, type Office } from './state'

/** After a failed request the overlay is left alone this long: no retry storm. */
export const PAUSE_MS = 30_000
/** Events waiting behind a slow overlay beyond this are dropped, never queued without end. */
const MAX_QUEUED = 50

export type Decision = 'allow' | 'deny' | 'ask'
export type PermissionPayload = { sessionId: string; agentId: string; tool: string; summary: string }

export const parseConfig = (text: unknown): { token: string; port: number } | undefined => {
  if (typeof text !== 'string') return undefined
  try {
    const raw = JSON.parse(text)
    const token = raw?.token
    const port = raw?.port
    if (typeof token !== 'string' || token.length === 0) return undefined
    if (!Number.isInteger(port) || port < 1 || port > 65535) return undefined
    return { token, port }
  } catch {
    return undefined
  }
}

export const randomHex = (bytes: number): string => toHex(crypto.getRandomValues(new Uint8Array(bytes)))

export type OverlayPath = '/event' | '/permission'

/**
 * Request auth: the token never travels. `x-kayy-auth` = HMAC-SHA256(token,
 * "req|" + nonce + "|" + path + "|" + body), body being the exact JSON string sent.
 */
export const signRequest = (token: string, nonce: string, path: OverlayPath, body: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-kayy-nonce': nonce,
  'x-kayy-auth': hmacHex(token, `req|${nonce}|${path}|${body}`),
})

/**
 * Reads a /permission reply. allow/deny count only when `x-kayy-proof` equals
 * HMAC-SHA256(token, "res|" + nonce + "|" + decision) for exactly that decision; anything else is `ask`.
 */
export const verifyReply = (token: string, nonce: string, reply: { headers: Record<string, string>; text: string }): Decision => {
  let decision: unknown
  try {
    decision = JSON.parse(reply.text)?.decision
  } catch {
    return 'ask'
  }
  if (decision !== 'allow' && decision !== 'deny') return 'ask'
  const proof = String(reply.headers['x-kayy-proof'] ?? '')
  return equalsConstantTime(proof, hmacHex(token, `res|${nonce}|${decision}`)) ? decision : 'ask'
}

/** Reads `%APPDATA%\KayyOffice\config.json` (or `$KAYY_CONFIG_DIR/config.json`, as the hook does). */
async function loadConfig($: EngineInterface, office: Office) {
  if (office.config !== undefined) return office.config
  const dir = (await $.env.get('KAYY_CONFIG_DIR')) || (await appDataDir($))
  if (!dir) throw new Error('no config dir')
  const config = parseConfig(await $.fs.read(`${dir}/config.json`))
  if (config === undefined) throw new Error('bad config')
  office.config = config
  return config
}

async function appDataDir($: EngineInterface) {
  const appData = await $.env.get('APPDATA')
  return appData ? `${appData}/KayyOffice` : undefined
}

/** Marks the overlay as gone for PAUSE_MS and forgets the config (the app may come back on a new port). */
async function pause($: EngineInterface, office: Office) {
  office.config = undefined
  office.pausedUntil = (await $.clock.now()) + PAUSE_MS
  await setLink($, office, 'off')
}

async function isPaused($: EngineInterface, office: Office) {
  return office.pausedUntil > 0 && (await $.clock.now()) < office.pausedUntil
}

async function deliver($: EngineInterface, office: Office, event: AgentEvent) {
  try {
    if (await isPaused($, office)) return
    const config = await loadConfig($, office)
    const body = JSON.stringify(event)
    const res = await $.http.fetch(`http://127.0.0.1:${config.port}/event`, {
      method: 'POST',
      headers: signRequest(config.token, randomHex(16), '/event', body),
      body,
    })
    if (!res.ok) throw new Error(`status ${res.status}`)
    await setLink($, office, 'ok')
  } catch {
    await pause($, office).catch(() => undefined)
  }
}

/**
 * Fire-and-forget: queues the event and returns at once. Events go out one at a time so the
 * overlay sees them in order; every failure is swallowed.
 */
export function sendEvent($: EngineInterface, office: Office, event: AgentEvent) {
  if (office.queued >= MAX_QUEUED) return
  office.queued += 1
  office.queue = office.queue
    .then(() => deliver($, office, event))
    .catch(() => undefined)
    .then(() => {
      office.queued -= 1
    })
}

/**
 * Asks the overlay. Resolves its decision only when the reply proves it knows the token
 * (HMAC-SHA256(token, nonce)); a reply without a valid proof counts as `ask`. Undefined when
 * the overlay is off, paused or failed.
 */
export async function askOverlay($: EngineInterface, office: Office, payload: PermissionPayload): Promise<Decision | undefined> {
  try {
    if (await isPaused($, office)) return undefined
    const config = await loadConfig($, office)
    const nonce = randomHex(16)
    const body = JSON.stringify({ ...payload, source: 'mod' })
    const res = await $.http.fetch(`http://127.0.0.1:${config.port}/permission`, {
      method: 'POST',
      headers: signRequest(config.token, nonce, '/permission', body),
      body,
    })
    if (!res.ok) throw new Error(`status ${res.status}`)
    await setLink($, office, 'ok')
    return verifyReply(config.token, nonce, res)
  } catch {
    await pause($, office).catch(() => undefined)
    return undefined
  }
}
