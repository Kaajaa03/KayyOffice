import type { EngineInterface } from 'claude-code'
import type { AgentEvent } from './mapping'
import { equalsConstantTime, hmacHex, toHex } from './sha256'
import { setLink, type Office } from './state'

/** After a failed request the overlay is left alone this long: no retry storm. */
export const PAUSE_MS = 30_000
/** Events waiting behind a slow overlay beyond this are dropped, never queued without end. */
const MAX_QUEUED = 50
/** A question card waits this long for a click (a hair over the approver's 20 s), then the normal dialog takes over. */
export const QUESTION_TIMEOUT_MS = 21_000

export type Decision = 'allow' | 'deny' | 'ask'
export type PermissionPayload = { sessionId: string; agentId: string; tool: string; summary: string; options?: string[] }

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

/**
 * Reads a /permission reply to a question card: the clicked option index, only when
 * `x-kayy-proof` equals HMAC-SHA256(token, "res|" + nonce + "|choice:" + index) for exactly that index
 * and the index is one of the `count` options. Anything else is undefined (the normal dialog).
 */
export const verifyChoice = (token: string, nonce: string, reply: { headers: Record<string, string>; text: string }, count: number): number | undefined => {
  let parsed: { decision?: unknown; choice?: unknown }
  try {
    parsed = JSON.parse(reply.text)
  } catch {
    return undefined
  }
  const index = parsed?.choice
  if (parsed?.decision !== 'choice' || typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= count) return undefined
  const proof = String(reply.headers['x-kayy-proof'] ?? '')
  return equalsConstantTime(proof, hmacHex(token, `res|${nonce}|choice:${index}`)) ? index : undefined
}

/**
 * Finds the overlay's config.json. Claude Desktop is a Store (MSIX) app: it sees %APPDATA% redirected into its
 * package, so the app (started by Windows) and this mod end up with two different files and tokens. The shared
 * file therefore lives outside AppData: `$KAYY_CONFIG_DIR`, else `%USERPROFILE%.kayy-office`, else the old `%APPDATA%KayyOffice`.
 */
async function configDirs($: EngineInterface): Promise<string[]> {
  const dirs: string[] = []
  const explicit = await $.env.get('KAYY_CONFIG_DIR')
  if (explicit) dirs.push(explicit)
  const home = await $.env.get('USERPROFILE')
  if (home) dirs.push(`${home}/.kayy-office`)
  const appData = await $.env.get('APPDATA')
  if (appData) dirs.push(`${appData}/KayyOffice`)
  return dirs
}

async function loadConfig($: EngineInterface, office: Office) {
  if (office.config !== undefined) return office.config
  for (const dir of await configDirs($)) {
    let text: unknown
    try {
      text = await $.fs.read(`${dir}/config.json`)
    } catch {
      continue
    }
    const config = parseConfig(text)
    if (config !== undefined) {
      office.config = config
      return config
    }
  }
  throw new Error('no config')
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
  const reply = await postPermission($, office, payload)
  return reply === undefined ? undefined : verifyReply(reply.token, reply.nonce, reply)
}

/** Asks a question card: the index of the option the person clicked, undefined without a proven click. */
export async function askQuestion($: EngineInterface, office: Office, payload: PermissionPayload & { options: string[] }): Promise<number | undefined> {
  let timer: { cancel: () => void } | undefined
  const timeout = new Promise<undefined>(resolve => {
    timer = $.clock.after(QUESTION_TIMEOUT_MS, () => resolve(undefined))
  })
  const reply = await Promise.race([postPermission($, office, payload), timeout]).finally(() => timer?.cancel())
  return reply === undefined ? undefined : verifyChoice(reply.token, reply.nonce, reply, payload.options.length)
}

async function postPermission($: EngineInterface, office: Office, payload: PermissionPayload & { options?: string[] }) {
  try {
    if (await isPaused($, office)) return undefined
    const config = await loadConfig($, office)
    const nonce = randomHex(16)
    const body = JSON.stringify(payload)
    const res = await $.http.fetch(`http://127.0.0.1:${config.port}/permission`, {
      method: 'POST',
      headers: signRequest(config.token, nonce, '/permission', body),
      body,
    })
    if (!res.ok) throw new Error(`status ${res.status}`)
    await setLink($, office, 'ok')
    return { token: config.token, nonce, headers: res.headers, text: res.text }
  } catch {
    await pause($, office).catch(() => undefined)
    return undefined
  }
}
