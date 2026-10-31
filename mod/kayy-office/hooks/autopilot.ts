// Autopilot: a local, conservative policy that lets routine work in the project through without a
// dialog. Pure: every fact it needs (root, the resolved real path, home) is handed in. Anything it
// is not sure about is "no" — the call then goes the normal way (overlay card or dialog).
// Everything is an allowlist: commands, flags, path shapes. A token that matches nothing => no.
import { riskOf } from './risk'
import { NEVER_FORWARD, type CheckEvent, type Verdict } from './approver'

export type AutopilotInput = { tool: string; args: unknown; isReadOnly?: boolean }
export type AutopilotCtx = {
  /** The base for relative paths: the session's cwd when it lies inside the root, else the root. */
  cwd: string
  /** The project root ($.session.root()), as spelled. Only the first entry is used. */
  roots: string[]
  /** The same root with every link resolved (`$.fs.stat(..., { resolve: true })`). */
  realRoots: string[]
  /** Where the tool's path really lands, links resolved; undefined = unknown = no. */
  realPath?: string
  /** The user's home directory, when known (USERPROFILE / HOME). */
  home?: string
}
export type AutopilotDecision = { allow: boolean; why: string }

const no = (why: string): AutopilotDecision => ({ allow: false, why })
const yes = (why: string): AutopilotDecision => ({ allow: true, why })

const READ_TOOLS = new Set(['Read', 'Grep', 'Glob', 'LS', 'NotebookRead'])
const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const SHELL_TOOLS = new Set(['Bash', 'PowerShell'])
const NEVER = new Set([...NEVER_FORWARD, 'WebFetch', 'WebSearch'])

// ---------- names ----------

/** Folders never touched automatically, at any depth (read or write, path or shell token). */
const PROTECTED_DIRS = new Set(['.git', '.claude', '.vscode', '.ssh', '.aws', '.azure', '.kube', '.docker', '.gnupg', '.config'])
/** Folders never written automatically (code that runs on install, commit or CI). */
// test folders: `npm test` runs whatever is written there, so a routine Write must not reach them
const NO_WRITE_DIRS = new Set(['.husky', 'node_modules', '.github', '.claude-plugin', '.idea', '.devcontainer', 'tests', 'test', '__tests__'])

/** Secret files: never read or written automatically (by name, case-insensitive). */
export const isSecretName = (name: string): boolean => {
  const n = name.toLowerCase()
  return (
    n.startsWith('.env') ||
    n.startsWith('id_') ||
    n.startsWith('credentials') ||
    n.startsWith('token') ||
    n.startsWith('secrets') ||
    n.startsWith('secret.') ||
    /^(\.|_)(npmrc|netrc|pypirc|git-credentials|gitconfig|bashrc|bash_profile|profile|zshrc|claude\.json)$/.test(n) ||
    n === '.git-credentials' ||
    /\.(pem|p12|pfx|key|kdbx|keystore|jks|ppk|asc|gpg)$/.test(n)
  )
}

/** Files never written automatically: they configure or run code (tests, builds, hooks, Claude). */
const isNoWriteName = (name: string): boolean => {
  const n = name.toLowerCase()
  return (
    /^(package\.json|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|\.npmrc|\.yarnrc(\.yml)?|\.mcp\.json|\.gitattributes|\.gitmodules|claude\.md|claude\.local\.md|agents\.md|electron-builder\.ya?ml|makefile)$/.test(n) ||
    /^tsconfig.*\.json$/.test(n) ||
    /\.config\.[a-z0-9]+$/.test(n) || // vitest.config.ts, vite.config.mjs, eslint.config.js, ...
    /\.(test|spec)\.[a-z0-9]+$/.test(n) || // run by `npm test` the moment they are written
    /^\.[a-z0-9-]+rc(\.[a-z0-9]+)?$/.test(n) || // .eslintrc, .babelrc.js, .prettierrc.json
    // scripts the OS or a shell runs directly; ordinary .js/.ts sources stay writable
    /\.(cmd|bat|ps1|psm1|psd1|sh|bash|zsh|vbs|vbe|wsf|hta|lnk|exe|dll|msi|reg|scr)$/.test(n)
  )
}

const DOS_DEVICE = /^(con|prn|aux|nul|com[0-9\u00b9\u00b2\u00b3]|lpt[0-9\u00b9\u00b2\u00b3]|conin\$|conout\$|clock\$)$/i
const isDeviceName = (seg: string) => DOS_DEVICE.test(seg.split('.')[0] ?? '')

/** Control, format, bidi, zero-width, odd separators and look-alike dots/slashes. */
const SUSPICIOUS = /[\u0000-\u001f\u007f-\u00a0\u00ad\u061c\u1680\u180e\u2000-\u200f\u2024-\u2026\u2028-\u202f\u205f-\u206f\u2215\u2216\u2044\u3000\ufe52\ufe68\ufeff\uff0e\uff0f\uff3c]/

// ---------- paths ----------

export type NormalPath = { isWindows: boolean; segments: string[]; text: string }

/**
 * Folds a path to absolute segments, or undefined when it cannot be placed safely: empty, NUL or
 * other suspicious characters, UNC/device (`\\server`, `\\?\`), drive-relative (`C:x`), home
 * (`~`), a `..` above the root, an alternate data stream (`a:b`), an 8.3 short name (`GIT~1`),
 * a segment Windows would silently trim (`.git.`, `.git `), or a DOS device name (`con`, `nul.txt`).
 */
export const normalizePath = (path: string, cwd: string): NormalPath | undefined => {
  if (typeof path !== 'string' || path.length === 0 || SUSPICIOUS.test(path)) return undefined
  const base = resolveBase(cwd)
  if (base === undefined) return undefined
  const s = path.replace(/\\/g, '/')
  if (s.startsWith('//') || s.startsWith('~')) return undefined
  let isWindows: boolean
  let segments: string[]
  let rest: string
  if (/^[A-Za-z]:/.test(s)) {
    if (s[2] !== '/') return undefined // drive-relative
    isWindows = true
    segments = [s.slice(0, 2).toLowerCase()]
    rest = s.slice(3)
  } else if (s.startsWith('/')) {
    if (base.isWindows) return undefined // "\x" means "this drive's root": ambiguous, refuse
    isWindows = false
    segments = []
    rest = s.slice(1)
  } else {
    isWindows = base.isWindows
    segments = [...base.segments]
    rest = s
  }
  for (const part of rest.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (segments.length <= (isWindows ? 1 : 0)) return undefined
      segments.pop()
      continue
    }
    if (!isSafeSegment(part, isWindows)) return undefined
    segments.push(part)
  }
  const text = isWindows ? segments[0] + '/' + segments.slice(1).join('/') : '/' + segments.join('/')
  return { isWindows, segments, text }
}

const isSafeSegment = (part: string, isWindows: boolean) => {
  if (part.includes(':')) return false // alternate data stream or a stray drive
  if (/~\d/.test(part)) return false // 8.3 short name
  if (isWindows && /[. ]$/.test(part)) return false // Windows trims trailing dots and spaces
  if (isDeviceName(part)) return false
  return true
}

const resolveBase = (cwd: string): NormalPath | undefined => {
  if (typeof cwd !== 'string' || SUSPICIOUS.test(cwd)) return undefined
  const s = cwd.replace(/\\/g, '/')
  if (/^[A-Za-z]:\//.test(s) || /^[A-Za-z]:$/.test(s)) {
    const segments = [s.slice(0, 2).toLowerCase(), ...s.slice(3).split('/').filter(p => p !== '' && p !== '.')]
    if (segments.some(p => p === '..')) return undefined
    return { isWindows: true, segments, text: s }
  }
  if (s.startsWith('/') && !s.startsWith('//')) {
    const segments = s.slice(1).split('/').filter(p => p !== '' && p !== '.')
    if (segments.some(p => p === '..')) return undefined
    return { isWindows: false, segments, text: s }
  }
  return undefined
}

const same = (a: string, b: string, isWindows: boolean) => (isWindows ? a.toLowerCase() === b.toLowerCase() : a === b)

/** True when `path` is `root` or below it; Windows compares case-insensitively. */
export const isInside = (path: NormalPath, root: NormalPath): boolean =>
  path.isWindows === root.isWindows &&
  path.segments.length >= root.segments.length &&
  root.segments.every((seg, i) => same(seg, path.segments[i]!, path.isWindows))

const SYSTEM_DIRS = new Set(['appdata', 'windows', 'program files', 'program files (x86)', 'programdata', 'system32', 'syswow64', '$recycle.bin'])
const POSIX_SYSTEM = new Set(['etc', 'usr', 'bin', 'sbin', 'var', 'opt', 'lib', 'lib64', 'boot', 'dev', 'proc', 'sys', 'root', 'tmp', 'private', 'system', 'library', 'applications'])

/**
 * Why a project root is too wide for autopilot, or undefined when it is a real project folder:
 * a drive or filesystem root, the user's home or one of its parents, or a system folder.
 */
export const rootProblem = (root: string | undefined, home: string | undefined): string | undefined => {
  if (root === undefined) return 'kein Projektordner'
  const r = resolveBase(root)
  if (r === undefined) return 'Projektordner nicht eindeutig'
  const segs = r.segments.map(s => s.toLowerCase())
  const depth = r.isWindows ? segs.length - 1 : segs.length
  if (depth <= 0) return 'Projektordner ist ein Laufwerk'
  if (segs.some(s => SYSTEM_DIRS.has(s))) return 'Projektordner liegt in einem System-/AppData-Ordner'
  if (r.isWindows && segs[1] === 'users' && depth <= 2) return 'Projektordner ist das Benutzerverzeichnis'
  if (!r.isWindows) {
    if (POSIX_SYSTEM.has(segs[0]!)) return 'Projektordner liegt in einem Systemordner'
    if ((segs[0] === 'home' || segs[0] === 'users') && depth <= 2) return 'Projektordner ist das Benutzerverzeichnis'
  }
  const h = home === undefined ? undefined : resolveBase(home)
  if (h !== undefined && isInside(h, r)) return 'Projektordner ist das Benutzerverzeichnis oder enthält es'
  return undefined
}

const isProtectedSeg = (seg: string) => PROTECTED_DIRS.has(seg.toLowerCase())

/** Checks the path as spelled and where it really lands: both inside the root, neither protected. */
const checkPath = (spelled: string, ctx: AutopilotCtx, isWrite: boolean): AutopilotDecision => {
  const root = resolveBase(ctx.roots[0] ?? '')
  const realRoot = resolveBase(ctx.realRoots[0] ?? '')
  const p = normalizePath(spelled, ctx.cwd)
  if (p === undefined) return no('Pfad nicht eindeutig')
  if (root === undefined || !isInside(p, root)) return no('Pfad außerhalb des Projekts')
  if (ctx.realPath === undefined) return no('Ziel nicht auflösbar')
  const r = normalizePath(ctx.realPath, ctx.cwd)
  if (r === undefined || realRoot === undefined || !isInside(r, realRoot)) return no('Ziel (Link) außerhalb des Projekts')
  for (const one of [p, r]) {
    const below = one.segments.slice(root.segments.length)
    if (below.some(isProtectedSeg)) return no('geschützter Ordner (.git/.claude/.vscode/.ssh/…)')
    if (below.some(isSecretName)) return no('sensible Datei')
    if (isWrite) {
      if (below.some(s => NO_WRITE_DIRS.has(s.toLowerCase()))) return no('Hook-/Abhängigkeits-/CI-Ordner')
      if (isNoWriteName(below.at(-1) ?? '')) return no('Konfigurations- oder Skriptdatei')
    }
  }
  return yes(isWrite ? 'Bearbeiten im Projekt' : 'Lesen im Projekt')
}

const argsOf = (args: unknown): Record<string, unknown> =>
  typeof args === 'object' && args !== null && !Array.isArray(args) ? (args as Record<string, unknown>) : {}

/** A search glob that stays in the project and does not aim at secrets or protected folders. */
const isPlainPattern = (pattern: unknown) => {
  if (pattern === undefined) return true
  if (typeof pattern !== 'string' || SUSPICIOUS.test(pattern)) return false
  if (pattern.includes('..') || /^[\\/~]/.test(pattern) || /^[A-Za-z]:/.test(pattern) || pattern.includes('$') || pattern.includes('%')) return false
  const parts = pattern.toLowerCase().split(/[\\/]/)
  const SECRETISH = /\.env|\.ssh|\.npmrc|\.netrc|id_|credential|secret|token|\.pem|\.p12|\.pfx|\.key|\.kdbx|\.git|\.claude|\.aws|\.azure|\.kube|\.docker|\.gnupg/
  return !parts.some(p => SECRETISH.test(p) || isProtectedSeg(p))
}

// ---------- shell ----------

type Token = { text: string; isQuoted: boolean }

/**
 * Splits a command into segments of tokens at unquoted `;`, `&&`, `||`, `|` and line breaks.
 * Undefined for anything this cannot read with certainty: an unterminated quote, a lone `&`.
 */
const tokenize = (cmd: string): Token[][] | undefined => {
  const segments: Token[][] = [[]]
  let cur: Token | undefined
  let quote: string | undefined
  const push = () => {
    if (cur !== undefined) segments.at(-1)!.push(cur)
    cur = undefined
  }
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i]!
    if (quote !== undefined) {
      if (c === quote) quote = undefined
      else cur!.text += c
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      cur = cur ?? { text: '', isQuoted: true }
      cur.isQuoted = true
      continue
    }
    if (c === ' ' || c === '\t') {
      push()
      continue
    }
    const two = cmd.slice(i, i + 2)
    if (two === '&&' || two === '||') {
      push()
      segments.push([])
      i++
      continue
    }
    if (c === '&') return undefined
    if (c === ';' || c === '|' || c === '\n' || c === '\r') {
      push()
      segments.push([])
      continue
    }
    cur = cur ?? { text: '', isQuoted: false }
    cur.text += c
  }
  if (quote !== undefined) return undefined
  push()
  return segments
}

/** A token used as a path: relative, inside the project, no protected folder, no secret, no device. */
const isPlainPathToken = (t: string): boolean => {
  if (t === '' || t.includes('..') || t.includes(':') || /^[\\/]/.test(t)) return false
  const segs = t.split(/[\\/]/).filter(s => s !== '' && s !== '.')
  return segs.every(s => !isProtectedSeg(s) && !isSecretName(s) && !isDeviceName(s) && !/~\d/.test(s) && !/[. ]$/.test(s))
}

type Rule = {
  /** Flags (exact, case-insensitive for PowerShell cmdlets) that take no value. */
  flags?: string[]
  /** Flags (exact) whose value follows as the next token and must be all digits. */
  numeric?: string[]
  /** `-5` style counts. */
  dashCount?: boolean
  /** Short flag clusters made of these letters only (`-rn`). */
  cluster?: RegExp
  /** How many positional (path/pattern) tokens it may take. */
  maxArgs: number
  isCaseInsensitive?: boolean
}

const RULES: Record<string, Rule> = {
  pwd: { maxArgs: 0 },
  echo: { maxArgs: 20 },
  ls: { cluster: /^-[laRh1AtrS]+$/, maxArgs: 5 },
  dir: { maxArgs: 3 },
  cat: { flags: ['-n'], maxArgs: 5 },
  type: { maxArgs: 3 },
  head: { numeric: ['-n'], dashCount: true, maxArgs: 3 },
  tail: { numeric: ['-n'], dashCount: true, maxArgs: 3 },
  wc: { cluster: /^-[lwcm]+$/, maxArgs: 5 },
  // no -r/-R: a recursive walk from "." would read .env and .git contents
  grep: { cluster: /^-[nilcwFHhvsq]+$/, maxArgs: 6 },
  rg: { cluster: /^-[nilcwFHhvSsq]+$/, maxArgs: 6 },
  findstr: { flags: ['/n', '/i', '/l', '/c', '/r', '/v', '/b', '/e', '/x', '/m'], maxArgs: 6, isCaseInsensitive: true },
  cd: { maxArgs: 1 },
  'set-location': { flags: [], maxArgs: 1, isCaseInsensitive: true },
  'get-childitem': { flags: ['-recurse', '-name', '-file', '-directory', '-force'], maxArgs: 2, isCaseInsensitive: true },
  'get-content': { flags: ['-raw'], numeric: ['-totalcount', '-tail', '-head', '-first'], maxArgs: 2, isCaseInsensitive: true },
  'select-string': { flags: ['-simplematch', '-casesensitive', '-list', '-quiet'], maxArgs: 3, isCaseInsensitive: true },
  'test-path': { maxArgs: 1, isCaseInsensitive: true },
}

/** Generic check for the read-only file commands: flags on their list, positionals as plain paths. */
const genericAllowed = (name: string, args: Token[]): boolean => {
  const rule = RULES[name]
  if (rule === undefined) return false
  let positional = 0
  for (let i = 0; i < args.length; i++) {
    const tok = args[i]!
    const t = tok.text
    const key = rule.isCaseInsensitive ? t.toLowerCase() : t
    // a quoted "--pre=sh" is still a flag to rg/grep: refuse it rather than treat it as a path
    if (tok.isQuoted && /^[-/]/.test(t) && name !== 'echo') return false
    if (!tok.isQuoted && /^[-/]/.test(t) && !(name === 'echo')) {
      if (rule.flags?.includes(key)) continue
      if (rule.numeric?.includes(key)) {
        if (!/^\d{1,6}$/.test(args[i + 1]?.text ?? '')) return false
        i++
        continue
      }
      if (rule.dashCount && /^-\d{1,6}$/.test(t)) continue
      if (rule.cluster?.test(t)) continue
      return false
    }
    positional++
    if (positional > rule.maxArgs) return false
    if (!isPlainPathToken(t)) return false
  }
  return true
}

const GIT_DIFF_FLAGS = ['--stat', '--name-only', '--name-status', '--oneline', '--no-color', '--cached', '--staged', '--']

/** A git revision/path argument: plain characters, no `:` (no `HEAD:file`), no secrets. */
const isGitArg = (t: string) => /^[A-Za-z0-9._\/\\@^-]+$/.test(t) && !t.startsWith('-') && isPlainPathToken(t)

const gitAllowed = (args: Token[]): boolean => {
  const sub = args[0]?.text
  const rest = args.slice(1)
  const texts = rest.map(t => t.text)
  switch (sub) {
    case 'status':
      return texts.every(t => ['-s', '--short', '-b', '--branch', '--porcelain', '-sb'].includes(t))
    case 'diff':
    case 'log':
    case 'show': {
      for (let i = 0; i < texts.length; i++) {
        const t = texts[i]!
        if (GIT_DIFF_FLAGS.includes(t)) continue
        if (t === '-n' && /^\d{1,6}$/.test(texts[i + 1] ?? '')) {
          i++
          continue
        }
        if (sub === 'log' && /^-\d{1,6}$/.test(t)) continue
        if (!isGitArg(t)) return false
      }
      return true
    }
    case 'branch':
      return texts.every(t => ['-a', '-r', '--list', '-v', '-vv', '--show-current'].includes(t))
    case 'add':
      return texts.length > 0 && texts.every(t => t !== '.' && (t === '--' || isGitArg(t)))
    // no `commit`: it runs the repo's hooks (pre-commit etc.), so it always waits for Kaja
    case 'stash':
      return texts.length === 1 && texts[0] === 'list'
    case 'rev-parse':
      return texts.length > 0 && texts.every(t => ['--short', '--abbrev-ref', '--show-toplevel', 'HEAD'].includes(t))
    default:
      return false // also every global option before the subcommand (`-c`, `-p`, `--exec-path`)
  }
}

const exact = (texts: string[], ...allowed: string[][]) => allowed.some(a => a.length === texts.length && a.every((t, i) => t === texts[i]))

const segmentAllowed = (tokens: Token[]): boolean => {
  const first = tokens[0]
  if (first === undefined || first.isQuoted) return false
  const name = first.text.toLowerCase()
  const args = tokens.slice(1)
  const texts = args.map(t => t.text)
  if (first.text === 'git') return gitAllowed(args)
  if (first.text === 'npm') return exact(texts, ['test'], ['run', 'build'], ['run', 'typecheck'], ['run', 'test'], ['run', 'lint'])
  if (first.text === 'node') return exact(texts, ['--version'])
  const tscArgs = (t: string[]) => exact(t, [], ['--noEmit'], ['-p', 'tsconfig.json'], ['--noEmit', '-p', 'tsconfig.json'], ['-p', 'tsconfig.json', '--noEmit'])
  const vitestArgs = (t: string[]) => exact(t, [], ['run'])
  if (first.text === 'tsc') return tscArgs(texts)
  if (first.text === 'vitest') return vitestArgs(texts)
  if (first.text === 'npx') {
    if (texts[0] === 'tsc') return tscArgs(texts.slice(1))
    if (texts[0] === 'vitest') return vitestArgs(texts.slice(1))
    return false
  }
  // Bash commands are case-sensitive; PowerShell cmdlets and aliases are not.
  const key = RULES[first.text] !== undefined ? first.text : RULES[name]?.isCaseInsensitive ? name : undefined
  if (key === undefined) return false
  if (key === 'echo') return true
  return genericAllowed(key, args)
}

/** Characters with a meaning to some shell (expansion, redirection, globbing, escapes). */
const SHELL_META = /[$%~`^<>(){}[\]*?@!#\\]/

const shellDecision = (tool: string, command: unknown): AutopilotDecision => {
  if (typeof command !== 'string' || command.trim() === '') return no('leerer Befehl')
  if (/[^\t\n\r\x20-\x7e]/.test(command)) return no('ungewöhnliche Zeichen')
  if (command.includes('--%')) return no('Stop-Parsing')
  const cmd = command.replace(/(^|[ \t])2>&1(?=[ \t]|$)/g, '$1')
  // Backslashes are fine in plain Windows paths, never next to a quote (escaping).
  if (/\\["']|["']\\/.test(cmd)) return no('Escape vor Anführungszeichen')
  const meta = cmd.replace(/\\(?=[A-Za-z0-9._-])/g, '/') // path separators are not meta
  if (SHELL_META.test(meta)) return no('Sonderzeichen ($ % ~ < > Klammern Platzhalter …)')
  if (/-exec\b/i.test(cmd)) return no('-exec')
  const segments = tokenize(cmd)
  if (segments === undefined) return no('Befehl nicht eindeutig lesbar')
  for (const seg of segments) {
    if (seg.length === 0) continue
    if (seg.some(t => /^\w{2,}:/.test(t.text) && !t.isQuoted)) return no('Provider-Pfad (env:, HKCU: …)')
    if (!segmentAllowed(seg)) return no('Befehl oder Option nicht auf der Positivliste')
  }
  if (segments.every(s => s.length === 0)) return no('leerer Befehl')
  const risk = riskOf(tool, command)
  if (risk.level !== 'none') return no(risk.note || 'Risiko erkannt')
  return yes('sicherer Befehl')
}

// ---------- the policy ----------

export const autopilotDecision = (input: AutopilotInput, ctx: AutopilotCtx): AutopilotDecision => {
  const { tool } = input
  if (NEVER.has(tool) || tool.startsWith('mcp__')) return no('nie automatisch')
  const problem = rootProblem(ctx.roots[0], ctx.home) ?? (ctx.realRoots[0] === undefined ? 'Projektordner nicht auflösbar' : rootProblem(ctx.realRoots[0], ctx.home))
  if (problem !== undefined) return no(problem)
  const args = argsOf(input.args)
  if (READ_TOOLS.has(tool)) {
    if (input.isReadOnly !== true) return no('nicht als Lesen bestätigt')
    if (!isPlainPattern(args.glob) || (tool === 'Glob' && !isPlainPattern(args.pattern))) return no('Suchmuster außerhalb des Projekts oder auf Geheimnisse')
    const path = tool === 'Read' ? args.file_path : tool === 'NotebookRead' ? args.notebook_path : (args.path ?? ctx.cwd)
    if (typeof path !== 'string') return no('kein Pfad')
    return checkPath(path, ctx, false)
  }
  if (WRITE_TOOLS.has(tool)) {
    const path = tool === 'NotebookEdit' ? args.notebook_path : args.file_path
    if (typeof path !== 'string') return no('kein Pfad')
    return checkPath(path, ctx, true)
  }
  if (SHELL_TOOLS.has(tool)) return shellDecision(tool, args.command)
  return no('Werkzeug nicht vorgesehen')
}

/** The tool's path argument the caller must resolve, if it has one (else the cwd for searches). */
export const targetPathOf = (tool: string, args: unknown, cwd: string): string | undefined => {
  const a = argsOf(args)
  if (tool === 'Read' || (WRITE_TOOLS.has(tool) && tool !== 'NotebookEdit')) return typeof a.file_path === 'string' ? a.file_path : undefined
  if (tool === 'NotebookRead' || tool === 'NotebookEdit') return typeof a.notebook_path === 'string' ? a.notebook_path : undefined
  if (tool === 'Grep' || tool === 'Glob' || tool === 'LS') return typeof a.path === 'string' ? a.path : cwd
  return undefined
}

/** The cwd counts only when it lies inside the root; otherwise relative paths start at the root. */
export const baseDir = (root: string, cwd: string): string => {
  const r = resolveBase(root)
  const c = resolveBase(cwd)
  return r !== undefined && c !== undefined && isInside(c, r) ? cwd : root
}

// ---------- the gate around it (tool.check) ----------

export type AutopilotIo = {
  isOn: () => Promise<boolean>
  /** Root and the tool path's real location for this call. */
  context: (tool: string, args: unknown) => Promise<AutopilotCtx>
  count: (kind: 'auto' | 'asked') => Promise<void>
}

/**
 * Only a real call (tool_use_id) whose core verdict is `ask` and that a person would answer,
 * with autopilot on. Resolves the allow verdict, or undefined to leave the call to the normal path.
 */
export async function autopilotCheck(
  io: AutopilotIo,
  e: CheckEvent & { isReadOnly?: true },
  core: Verdict,
): Promise<Verdict | undefined> {
  if (core.decision !== 'ask' || e.approver !== 'person' || e.tool_use_id === undefined) return undefined
  if (!(await io.isOn())) return undefined
  let decision: AutopilotDecision
  try {
    const ctx = await io.context(e.tool, e.input)
    decision = autopilotDecision({ tool: e.tool, args: e.input, isReadOnly: e.isReadOnly }, ctx)
  } catch {
    decision = no('Prüfung fehlgeschlagen')
  }
  await io.count(decision.allow ? 'auto' : 'asked').catch(() => undefined)
  return decision.allow ? { decision: 'allow', reason: `Kayy Autopilot: ${decision.why}` } : undefined
}
