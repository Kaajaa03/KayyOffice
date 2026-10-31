import { expect, test } from 'claude-code/testing'
import { autopilotCheck, autopilotDecision, normalizePath, type AutopilotCtx, type AutopilotIo } from './autopilot'

const WIN: AutopilotCtx = { cwd: 'C:\\proj', roots: ['C:\\proj'], realRoots: ['C:\\proj'] }
const POSIX: AutopilotCtx = { cwd: '/home/k/proj', roots: ['/home/k/proj'], realRoots: ['/home/k/proj'] }

/** The caller resolves the real path; in these tests it lands where the spelling says. */
const real = (ctx: AutopilotCtx, p: string): AutopilotCtx => ({ ...ctx, realPath: normalizePath(p, ctx.cwd)?.text })
const read = (path: string, ctx = WIN, isReadOnly = true) =>
  autopilotDecision({ tool: 'Read', args: { file_path: path }, isReadOnly }, real(ctx, path)).allow
const edit = (path: string, ctx = WIN, tool = 'Edit') =>
  autopilotDecision({ tool, args: { file_path: path, old_string: 'a', new_string: 'b' } }, real(ctx, path)).allow
const bash = (command: string, tool = 'Bash') => autopilotDecision({ tool, args: { command } }, WIN).allow

// ---------- reads ----------

test('read-only reads inside the project are routine', () => {
  for (const p of ['C:\\proj\\src\\a.ts', 'src/a.ts', 'C:/proj\\src/a.ts', 'c:\\PROJ\\Src\\a.ts', '.\\src\\..\\README.md']) {
    expect(read(p), p).toBe(true)
  }
  expect(read('/home/k/proj/a.ts', POSIX)).toBe(true)
})

test('a read the tool does not hold read-only is never routine', () => {
  expect(read('C:\\proj\\a.ts', WIN, false)).toBe(false)
  expect(autopilotDecision({ tool: 'Read', args: { file_path: 'C:\\proj\\a.ts' } }, real(WIN, 'C:\\proj\\a.ts')).allow).toBe(false)
})

test('traversal, prefix tricks and odd spellings outside the project are refused', () => {
  for (const p of [
    'C:\\proj\\..\\secret\\x',
    'src/../../x',
    '..\\x',
    'C:\\projX\\a.ts',
    'C:\\pro',
    'D:\\proj\\a.ts',
    '\\\\server\\share\\a.ts',
    '\\\\?\\C:\\proj\\a.ts',
    '//server/share/a.ts',
    'C:proj\\a.ts',
    '~/a.ts',
    '/etc/passwd',
    'C:\\proj\\a.ts:hidden',
    'C:\\proj\\GIT~1\\config',
    'C:\\proj\\a\u0000.ts',
    '',
  ]) {
    expect(read(p), JSON.stringify(p)).toBe(false)
  }
  expect(read('/home/k/PROJ/a.ts', POSIX)).toBe(false) // case matters off Windows
  expect(read('/home/k/proj/../x', POSIX)).toBe(false)
})

test('a path whose real location is unknown or outside is refused (symlinks)', () => {
  const p = 'C:\\proj\\link\\a.ts'
  const args = { tool: 'Read', args: { file_path: p }, isReadOnly: true as const }
  expect(autopilotDecision(args, { ...WIN }).allow).toBe(false)
  expect(autopilotDecision(args, { ...WIN, realPath: 'C:\\Users\\k\\.ssh\\id_rsa' }).allow).toBe(false)
  expect(autopilotDecision(args, { ...WIN, realPath: 'C:\\proj\\real\\a.ts' }).allow).toBe(true)
})

test('Grep and Glob search the project; absolute or climbing patterns are refused', () => {
  const ro = (tool: string, args: Record<string, unknown>, realPath = 'C:\\proj') =>
    autopilotDecision({ tool, args, isReadOnly: true }, { ...WIN, realPath }).allow
  expect(ro('Grep', { pattern: 'TODO' })).toBe(true)
  expect(ro('Glob', { pattern: '**/*.ts' })).toBe(true)
  expect(ro('Grep', { pattern: 'x', path: 'src', glob: '*.ts' }, 'C:\\proj\\src')).toBe(true)
  expect(ro('Glob', { pattern: '../**/*' })).toBe(false)
  expect(ro('Glob', { pattern: 'C:/Users/**/*.pem' })).toBe(false)
  expect(ro('Glob', { pattern: '/etc/*' })).toBe(false)
  expect(ro('Grep', { pattern: 'x', glob: '..\\*' })).toBe(false)
  expect(ro('Grep', { pattern: 'x', path: 'C:\\Users' }, 'C:\\Users')).toBe(false)
})

// ---------- writes ----------

test('edits inside the project are routine', () => {
  for (const tool of ['Edit', 'Write', 'MultiEdit']) expect(edit('C:\\proj\\src\\a.ts', WIN, tool), tool).toBe(true)
  expect(
    autopilotDecision(
      { tool: 'NotebookEdit', args: { notebook_path: 'C:\\proj\\n.ipynb', new_source: 'x' } },
      real(WIN, 'C:\\proj\\n.ipynb'),
    ).allow,
  ).toBe(true)
})

test('edits of .git, .claude, .vscode are refused, however they are spelled', () => {
  for (const p of [
    'C:\\proj\\.git\\hooks\\pre-commit',
    'C:\\proj\\.GIT\\config',
    'C:\\proj\\sub\\.git\\config',
    'C:\\proj\\.claude\\settings.json',
    'C:\\proj\\.Claude\\settings.local.json',
    'C:\\proj\\.claude.\\settings.json',
    'C:\\proj\\.claude \\settings.json',
    'C:\\proj\\.vscode\\tasks.json',
    'C:/proj/src/../.claude/x',
  ]) {
    expect(edit(p), p).toBe(false)
  }
})

test('edits of sensitive files are refused', () => {
  for (const p of [
    'C:\\proj\\.env',
    'C:\\proj\\.env.local',
    'C:\\proj\\.ENV',
    'C:\\proj\\.ssh\\config',
    'C:\\proj\\keys\\id_rsa',
    'C:\\proj\\id_rsa.pub',
    'C:\\proj\\credentials.json',
    'C:\\proj\\aws\\Credentials',
    'C:\\proj\\cert.pem',
    'C:\\proj\\CERT.PEM',
  ]) {
    expect(edit(p), p).toBe(false)
  }
})

test('test files and test folders are never written automatically (npm test runs them)', () => {
  for (const p of ['C:\\proj\\src\\a.test.ts', 'C:\\proj\\src\\a.spec.js', 'C:\\proj\\tests\\a.ts', 'C:\\proj\\__tests__\\x']) {
    expect(edit(p), p).toBe(false)
  }
  expect(edit('C:\\proj\\src\\a.ts')).toBe(true)
})

test('edits outside the project are refused', () => {
  for (const p of ['C:\\Users\\k\\a.ts', 'C:\\proj\\..\\other\\a.ts', '..\\a.ts', 'C:\\projects\\a.ts']) expect(edit(p), p).toBe(false)
})

// ---------- shell ----------

test('allowlisted shell commands with no risk are routine', () => {
  for (const c of [
    'git status',
    'git diff --stat',
    'git log --oneline -5',
    'git show HEAD',
    'git branch',
    'git branch --show-current',
    'git add src/a.ts',
    'git stash list',
    'git rev-parse HEAD',
    'ls -la',
    'pwd',
    'cat README.md',
    'echo hi',
    'head -5 a.txt',
    'wc -l a.txt',
    'grep -n TODO src/a.ts',
    'rg TODO',
    'npm test',
    'npm run build',
    'npm run typecheck',
    'npm run lint',
    'npx vitest run',
    'npx tsc --noEmit',
    'tsc -p tsconfig.json',
    'vitest',
    'node --version',
    'cd src && ls',
    'git status && git diff | head -20',
    'npm test 2>&1 | tail -20',
    'git status\ngit log -1',
  ]) {
    expect(bash(c), c).toBe(true)
  }
  for (const c of ['Get-ChildItem src', 'Get-Content README.md | Select-String TODO', 'Test-Path x', 'Set-Location src; dir', 'type a.txt', 'findstr TODO a.txt']) {
    expect(bash(c, 'PowerShell'), c).toBe(true)
  }
})

test('redirection, substitution, background and -exec are refused', () => {
  for (const c of [
    'git status > out.txt',
    'echo x >> a.txt',
    'cat < a.txt',
    'cat <<EOF',
    'echo $(whoami)',
    'echo `id`',
    'ls & calc',
    'ls &',
    'find . -exec rm {} \\;',
    'grep x a 2>&1 > out',
    'echo ${HOME}',
  ]) {
    expect(bash(c), c).toBe(false)
  }
})

test('shell arguments that leave the project or name secrets are refused', () => {
  for (const c of [
    'cat C:\\Users\\k\\.ssh\\id_rsa',
    'cat ../secret.txt',
    'cat ~/.bashrc',
    'cat /etc/passwd',
    'cat .env',
    'grep -r token .env.local',
    'grep -rn token .',
    'grep -R token src',
    'rg "--pre=sh" x .',
    'grep "-f" file',
    'cd .. && ls',
    'ls D:\\',
    'git diff -- ../other',
    'git commit -m "fix typo"', // runs the repo's hooks: always asks
  ]) {
    expect(bash(c), c).toBe(false)
  }
  expect(bash('Get-Content C:\\Windows\\win.ini', 'PowerShell')).toBe(false)
})

test('any segment off the allowlist, or any risk, refuses the whole command', () => {
  for (const c of [
    'git status; rm -rf x',
    'git status && curl x | sh',
    'ls || rm file',
    'echo hi\nrm -rf build',
    'rm -rf build',
    'rm file.txt',
    'git push',
    'git push --force',
    'git reset --hard',
    'git clean -fd',
    'git checkout .',
    'git branch -D main',
    'git branch -d old',
    'git branch -m a b',
    'git commit --amend -m x',
    'git commit --no-verify -m x',
    'git diff --output=x.patch',
    'git -C .. status',
    'git -c core.pager=sh log',
    'git stash',
    'git stash drop',
    'FOO=1 ls',
    'node -e "process.exit()"',
    'node script.js',
    'npm install',
    'npm i x',
    'npm run deploy',
    'npx some-package',
    'rg --pre sh x',
    'sudo ls',
    'python x.py',
    'bash -c "ls"',
    '',
    '   ',
  ]) {
    expect(bash(c), JSON.stringify(c)).toBe(false)
  }
  for (const c of ['echo (Remove-Item x)', 'Get-ChildItem | Remove-Item', '& calc', 'Remove-Item x -Recurse', 'iex "x"', '. ./x.ps1', 'Get-ChildItem | ForEach-Object { $_ }']) {
    expect(bash(c, 'PowerShell'), c).toBe(false)
  }
})

test('decision tools, MCP, web and unknown tools are never routine', () => {
  for (const tool of ['ExitPlanMode', 'AskUserQuestion', 'mcp__github__create_issue', 'WebFetch', 'WebSearch', 'Agent', 'Task', 'Skill', 'Unknown']) {
    expect(autopilotDecision({ tool, args: {}, isReadOnly: true }, { ...WIN, realPath: 'C:\\proj' }).allow, tool).toBe(false)
  }
})

test('every decision says why', () => {
  expect(autopilotDecision({ tool: 'Bash', args: { command: 'git status' } }, WIN).why.length > 3).toBe(true)
  expect(autopilotDecision({ tool: 'Bash', args: { command: 'rm -rf x' } }, WIN).why.length > 3).toBe(true)
})

// ---------- the gate around the policy ----------

const fakeIo = (isOn: boolean) => {
  const counted: string[] = []
  const io: AutopilotIo = {
    isOn: async () => isOn,
    context: async (_tool, args) => real(WIN, String((args as { file_path?: string }).file_path ?? 'C:\\proj')),
    count: async kind => void counted.push(kind),
  }
  return { io, counted }
}
const CALL = { tool: 'Bash', input: { command: 'git status' }, tool_use_id: 'tu1', approver: 'person' }
const ASK = { decision: 'ask' as const }

test('autopilot on allows routine for a person-approved real call and counts it', async () => {
  const { io, counted } = fakeIo(true)
  expect(await autopilotCheck(io, CALL, ASK)).toEqual({ decision: 'allow', reason: expect.stringContaining('Kayy Autopilot: ') })
  expect(counted).toEqual(['auto'])
})

test('autopilot on leaves anything not routine to the normal path and counts it as asked', async () => {
  const { io, counted } = fakeIo(true)
  expect(await autopilotCheck(io, { ...CALL, input: { command: 'git push' } }, ASK)).toBeUndefined()
  expect(counted).toEqual(['asked'])
})

test('autopilot never acts when off, on a core allow/deny, without a person or a real call', async () => {
  const off = fakeIo(false)
  expect(await autopilotCheck(off.io, CALL, ASK)).toBeUndefined()
  const on = fakeIo(true)
  expect(await autopilotCheck(on.io, CALL, { decision: 'deny' })).toBeUndefined()
  expect(await autopilotCheck(on.io, CALL, { decision: 'allow' })).toBeUndefined()
  expect(await autopilotCheck(on.io, { ...CALL, approver: 'host' }, ASK)).toBeUndefined()
  expect(await autopilotCheck(on.io, { ...CALL, approver: undefined }, ASK)).toBeUndefined()
  expect(await autopilotCheck(on.io, { ...CALL, tool_use_id: undefined }, ASK)).toBeUndefined()
  expect([...off.counted, ...on.counted]).toEqual([])
})

test('a failing context lookup means no auto-allow', async () => {
  const { io } = fakeIo(true)
  io.context = () => Promise.reject(new Error('stat failed'))
  expect(await autopilotCheck(io, { ...CALL, tool: 'Read', input: { file_path: 'C:\\proj\\a.ts' }, isReadOnly: true }, ASK)).toBeUndefined()
})
