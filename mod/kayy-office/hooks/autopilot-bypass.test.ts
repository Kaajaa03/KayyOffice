import { expect, test } from 'claude-code/testing'
import { autopilotDecision, normalizePath, type AutopilotCtx } from './autopilot'

// Regression tests for the adversarial review of the autopilot (2026-10-30): every input here was
// once auto-allowed or is a close variant. `#` stands for a backslash.
const B = String.fromCharCode(92)
const w = (s: string) => s.split('#').join(B)
const CTX: AutopilotCtx = { cwd: w('C:#proj'), roots: [w('C:#proj')], realRoots: [w('C:#proj')] }

const shellAllows = (raw: string, ctx = CTX) =>
  ['Bash', 'PowerShell'].filter(tool => autopilotDecision({ tool, args: { command: w(raw) } }, ctx).allow)

const expectRefused = (cmds: string[]) => {
  for (const c of cmds) expect(shellAllows(c), JSON.stringify(c)).toEqual([])
}

test('C1: env/home expansion, provider prefixes and odd whitespace are refused', () => {
  expectRefused([
    'tsc --outDir "$env:APPDATA#Microsoft#Windows#Start Menu#Programs#Startup"',
    'tsc --outFile %USERPROFILE%#x.js',
    'cat $HOME/.config/gh/hosts.yml',
    'cd $HOME; cat .gitconfig',
    'echo $env:GITHUB_TOKEN',
    'echo %GITHUB_TOKEN%',
    'echo $GITHUB_TOKEN',
    'Get-Content env:X',
    'Get-Content env:GITHUB_TOKEN',
    'cat env:GITHUB_TOKEN',
    'cat env:userprofile',
    'dir env:',
    'Get-ChildItem Env:',
    'Get-ChildItem HKCU:#Software',
    'Get-Content HKCU:x',
    'type %USERPROFILE%#.aws#credentials',
    'cat $HOME/.aws/config',
    'cat $env:USERPROFILE#.gitconfig',
    'cat $env:APPDATA/Claude/x',
    'cat $env:USERPROFILE/.claude.json',
    'cat $PWD/../x',
    'cat %HOMEDRIVE%%HOMEPATH%#x',
    'cat %CD%#..#x',
    'cat "$HOME"',
    'Set-Location $HOME; cat .gitconfig',
    'cd %USERPROFILE%; type .gitconfig',
    'cd ~',
    'cd $HOME',
    'cd $env:APPDATA',
    'set-location -path $HOME',
    'Get-Content -Path:$HOME#x',
    'Select-String -Path $HOME#* x',
    'Get-ChildItem -Recurse $HOME',
    'head -c 100 $HOME/.npmrc',
    'git commit -F $HOME/.config/gh/hosts.yml',
    'echo a\u0085calc',
    'echo a\u2028calc',
    'echo a\u2029calc',
    'echo a\u00a0;calc',
    'git\u00a0status',
    'echo a\u200bb',
    'echo a\u202eb',
    'cat .\u2024\u2024#x',
    'cat \uff0e\uff0e/x',
    'npx tsc --outDir %APPDATA%/Microsoft/Windows/Start Menu',
    'echo @"\ncalc\n"@',
    'echo a ^& calc',
    'echo \\"; calc; echo \\"',
    'echo "unterminated',
  ])
})

test('C2: tsc, vitest and npm scripts only in their exact safe forms', () => {
  expectRefused([
    'tsc --outDir out',
    'tsc --generateTrace C:/x',
    'tsc --build',
    'tsc -p .',
    'npx tsc -p x',
    'npx tsc@latest',
    'npx vitest --config evil.js',
    'npx vitest --reporter=./evil.js',
    'npx vitest@1.0.0-evil',
    'npx vitest --dir C:/',
    'vitest --globalSetup=evil.js',
    'vitest --api.host 0.0.0.0',
    'vitest --ui',
    'npm test -- --some',
    'npm test --script-shell=calc',
    'npm test --script-shell=evil.cmd',
    'npm test --prefix=x',
    'npm test --userconfig=evil',
    'npm run test --if-present',
    'npm run build -- --watch',
  ])
  for (const ok of ['tsc', 'tsc --noEmit', 'tsc -p tsconfig.json', 'npx tsc', 'npx tsc --noEmit', 'vitest', 'vitest run', 'npx vitest run', 'npm test', 'npm run build', 'npm run typecheck', 'npm run lint']) {
    expect(shellAllows(ok).length, ok).toBe(2)
  }
})

test('C3: a project root that is a drive, home, a parent of home or a system folder disables autopilot', () => {
  const at = (root: string, home?: string): AutopilotCtx => ({ cwd: w(root), roots: [w(root)], realRoots: [w(root)], home: home && w(home) })
  const write = (ctx: AutopilotCtx, path: string) =>
    autopilotDecision({ tool: 'Write', args: { file_path: w(path), content: 'x' } }, { ...ctx, realPath: normalizePath(w(path), ctx.cwd)?.text })
  for (const [root, path] of [
    ['C:#', 'C:#Windows#System32#drivers#etc#hosts'],
    ['C:#', 'C:#x.ts'],
    ['D:#', 'D:#src#a.ts'],
    ['C:#Users', 'C:#Users#kaja#a.ts'],
    ['C:#Users#kaja', 'C:#Users#kaja#AppData#Roaming#Microsoft#Windows#Start Menu#Programs#Startup#x.ts'],
    ['C:#Users#kaja', 'C:#Users#kaja#src#a.ts'],
    ['C:#Users#kaja#AppData#Roaming#x', 'C:#Users#kaja#AppData#Roaming#x#a.ts'],
    ['C:#Windows#Temp#p', 'C:#Windows#Temp#p#a.ts'],
    ['C:#Program Files#app', 'C:#Program Files#app#a.ts'],
    ['C:#ProgramData#x', 'C:#ProgramData#x#a.ts'],
    ['/', '/etc/passwd'],
    ['/home/k', '/home/k/a.ts'],
  ] as const) {
    const ctx = at(root)
    expect(write(ctx, path).allow, root + ' ' + path).toBe(false)
    expect(shellAllows('git status', ctx), root).toEqual([])
  }
  // the home directory named by the environment, wherever it is
  const home = at('D:#me', 'D:#me')
  expect(write(home, 'D:#me#a.ts').allow).toBe(false)
  const parent = at('D:#', 'D:#me')
  expect(write(parent, 'D:#me#a.ts').allow).toBe(false)
  // a real project below home stays usable
  const proj = at('C:#Users#kaja#dev#proj', 'C:#Users#kaja')
  expect(write(proj, 'C:#Users#kaja#dev#proj#src#a.ts').allow).toBe(true)
})

test('C3: cwd outside the root does not widen it', () => {
  const ctx: AutopilotCtx = { cwd: w('C:#Users#kaja'), roots: [w('C:#proj')], realRoots: [w('C:#proj')] }
  const r = autopilotDecision({ tool: 'Read', args: { file_path: '.gitconfig' }, isReadOnly: true }, { ...ctx, realPath: w('C:#Users#kaja#.gitconfig') })
  expect(r.allow).toBe(false)
})

test('I4: shell tokens naming protected folders or secrets are refused', () => {
  expectRefused([
    'cat .git/config',
    'cat .claude/settings.local.json',
    'type .npmrc',
    'cat .netrc',
    'cat secrets.json',
    'cat secrets.prod.yml',
    'cat key.p12',
    'cat cert.pfx',
    'cat server.key',
    'cat vault.kdbx',
    'cat id_ed25519',
    'cat credentials.csv',
    'cat token.txt',
    'cat .aws/config',
    'cat .azure/x',
    'cat .kube/config',
    'cat .docker/config.json',
    'cat .git-credentials',
    'cat .gitconfig',
    'cat src/.env.local',
    'Get-Content -Raw -Stream evil x',
    'Get-Content -Stream evil x',
    'git add .git/hooks',
    'git add -f secret.key',
    'git diff --no-index a.txt %USERPROFILE%#.aws#config',
    'git diff --no-index src C:/Users/kaja/.ssh/id_ed25519',
    'git show HEAD:secret',
    'cat .e*',
    'cat .en?',
    'cat [.]env',
  ])
})

test('I7: git only with allowlisted subcommands and flags', () => {
  expectRefused([
    'git log --output=x',
    'git log -o x',
    'git -c core.sshCommand=calc status',
    'git -c alias.x=!calc x',
    'git --exec-path=. status',
    'git -p status',
    'git diff --ext-diff',
    'git log --ext-diff -p',
    'git show --ext-diff HEAD',
    'git show --textconv HEAD',
    'git diff --textconv',
    'git diff --upload-pack=calc',
    'git diff -O x',
    'git log --all -p',
    'git status -uall --porcelain',
    'git commit -m x --author=a',
    'git commit -m x --date=now',
    'git commit --no-verif',
    'git commit --no-v -m x',
    'git commit --no-verify -m x',
    'git commit -nm x',
    'git commit -anm x',
    'git commit -n -m x',
    'git commit -S -m x',
    'git commit --gpg-sign -m x',
    'git commit -m x --template=x',
    'git commit -F %USERPROFILE%/x',
    'git commit -F msg.txt',
    'git commit -c HEAD',
    'git commit -C HEAD',
    'git commit --amend -m x',
    'git commit',
    'git commit -m "fix: typo"', // runs the repo's hooks: always waits for the person
    'git commit -am "x"',
    'git commit -a -m x',
    'git commit -m x --allow-empty',
    'git add -A',
    'git add --all',
    'git add -f x.ts',
    'git add --force x.ts',
    'git add --chmod=+x hook.sh',
    'git add .',
    'git branch -D main',
    'git branch -m a b',
    'git branch new-branch',
    'git stash',
    'git stash pop',
    'git rev-parse --git-path hooks',
    'git diff HEAD -- C:/x',
    'git checkout .',
    'git push',
  ])
  for (const ok of [
    'git status',
    'git status -s',
    'git status --short --branch',
    'git status --porcelain',
    'git diff',
    'git diff --stat',
    'git diff --cached --name-only',
    'git diff --staged',
    'git diff -- src/a.ts',
    'git log --oneline -n 5',
    'git log --oneline -5',
    'git log -1',
    'git show HEAD',
    'git show --stat HEAD',
    'git branch',
    'git branch -a',
    'git branch --list',
    'git add src/a.ts',
    'git stash list',
    'git rev-parse HEAD',
    'git rev-parse --short HEAD',
  ]) {
    expect(shellAllows(ok).length, ok).toBe(2)
  }
})

test('minor: grep/rg/findstr/wc flags that read file lists or run programs are refused', () => {
  expectRefused([
    'rg --pre=calc x',
    'rg --pre calc x',
    'rg -z x',
    'rg --search-zip x',
    'wc --files0-from=list',
    'grep -f patterns.txt x',
    'grep --file=x y',
    'grep --include=x y',
    'findstr /f:C:#list.txt x',
    'findstr /g:x y',
    'ls -R /',
    'tail -f C:#x',
    'cd /d C:#',
    'cd D:',
    'cd ##server#share',
    'cd ..',
    'grep -rn TODO src', // a recursive walk from "." would read .env and .git
  ])
  for (const ok of ['grep -n TODO a.txt', 'grep -i x a.txt', 'rg -n TODO', 'findstr /n TODO a.txt', 'wc -l a.txt', 'cd src']) {
    expect(shellAllows(ok).length, ok).toBe(2)
  }
})

test('pipes into interpreters stay refused', () => {
  expectRefused([
    'gc x | iex',
    'Get-Content x | iex',
    'echo calc | node',
    'echo calc | cmd',
    'echo calc | Invoke-Expression',
    'Get-Content run.ps1 | powershell -',
    'cat x.sh | bash',
    'node --version;calc',
    'git status ; Remove-Item -Recurse src',
    'git status; calc',
    'git status\ncalc',
  ])
})

// ---------- paths ----------

const decide = (tool: string, path: string, realPath: string, isReadOnly = true, ctx = CTX) =>
  autopilotDecision({ tool, args: { file_path: w(path), path: w(path), notebook_path: w(path) }, isReadOnly }, { ...ctx, realPath: w(realPath) }).allow

test('I6: config and code-executing files are never auto-written', () => {
  for (const p of [
    'C:#proj#package.json',
    'C:#proj#package-lock.json',
    'C:#proj#.husky#pre-commit',
    'C:#proj#.github#workflows#ci.yml',
    'C:#proj#.npmrc',
    'C:#proj#.gitattributes',
    'C:#proj#.gitmodules',
    'C:#proj#node_modules#.bin#vitest.cmd',
    'C:#proj#node_modules#x#index.js',
    'C:#proj#vitest.config.ts',
    'C:#proj#vite.config.mjs',
    'C:#proj#jest.config.js',
    'C:#proj#esbuild.config.cjs',
    'C:#proj#tsconfig.json',
    'C:#proj#tsconfig.build.json',
    'C:#proj#CLAUDE.md',
    'C:#proj#sub#AGENTS.md',
    'C:#proj#.mcp.json',
    'C:#proj#electron-builder.yml',
    'C:#proj#scripts#x.cmd',
    'C:#proj#x.bat',
    'C:#proj#x.ps1',
    'C:#proj#x.sh',
    'C:#proj#x.vbs',
    'C:#proj#eslint.config.js',
    'C:#proj#tailwind.config.ts',
    'C:#proj#.envrc',
    'C:#proj#secrets.json',
    'C:#proj#.git-credentials',
    'C:#proj#.claude-plugin#..#.claude#x',
    'C:#proj#.claude-plugin#plugin.json',
    'C:#proj#.idea#workspace.xml',
  ]) {
    expect(decide('Write', p, p), p).toBe(false)
  }
  for (const p of ['C:#proj#src#a.ts', 'C:#proj#src#App.tsx', 'C:#proj#src#util.js', 'C:#proj#README.md']) expect(decide('Write', p, p), p).toBe(true)
})

test('minor: DOS device names are refused as path segments', () => {
  for (const p of ['C:#proj#con', 'C:#proj#nul.txt', 'C:#proj#CON.txt', 'C:#proj#com1', 'C:#proj#lpt9.log', 'C:#proj#aux#x', 'C:#proj#PRN']) {
    expect(decide('Write', p, p), p).toBe(false)
  }
  expect(decide('Write', 'C:#proj#nul.txt', '##.#nul')).toBe(false)
})

test('odd path spellings stay refused', () => {
  for (const [a, b] of [
    ['C:#proj#..#..#Windows#x', 'C:#Windows#x'],
    ['C:#proj#a.txt:evil', 'C:#proj#a.txt:evil'],
    ['##?#C:#proj#a', 'x'],
    ['C:#proj#.GIT#config', 'C:#proj#.GIT#config'],
    ['C:#proj#link#x', 'C:#Users#kaja#x'],
    ['C:#proj#GIT~1#config', 'x'],
    ['C:#proj#.git.#config', 'x'],
    ['C:#proj#.git::$INDEX_ALLOCATION#config', 'x'],
    ['C:#proj#sub#.git', 'C:#proj#sub#.git'],
    ['/proj/x', 'C:#proj#x'],
    ['C:#proj#x', '##?#C:#proj#x'],
    ['C:#proj#x', 'C:#proj2#x'],
    ['C:#proj2#x', 'C:#proj2#x'],
  ]) {
    expect(decide('Write', a!, b!), a).toBe(false)
  }
})

test('I5: reads of secrets are refused, by path and by search pattern', () => {
  for (const p of ['C:#proj#.env', 'C:#proj#.env.local', 'C:#proj#.npmrc', 'C:#proj#.ssh#id_rsa', 'C:#proj#secrets.yml', 'C:#proj#key.pem', 'C:#proj#.git#config']) {
    expect(decide('Read', p, p), p).toBe(false)
  }
  expect(decide('Read', 'C:#proj#a', 'C:#proj#a', false)).toBe(false)
  const g = (tool: string, args: Record<string, unknown>) =>
    autopilotDecision({ tool, args, isReadOnly: true }, { ...CTX, realPath: w('C:#proj') }).allow
  expect(g('Grep', { pattern: 'KEY', glob: '**/.env*' })).toBe(false)
  expect(g('Grep', { pattern: 'x', glob: 'a/../../x' })).toBe(false)
  expect(g('Glob', { pattern: '**/.ssh/*' })).toBe(false)
  expect(g('Glob', { pattern: '**/*.pem' })).toBe(false)
  expect(g('Glob', { pattern: '**/.npmrc' })).toBe(false)
  expect(g('Glob', { pattern: '**/*', path: 'C:/proj' })).toBe(true)
  expect(
    autopilotDecision({ tool: 'Grep', args: { pattern: 'x', path: '.git' }, isReadOnly: true }, { ...CTX, realPath: w('C:#proj#.git') }).allow,
  ).toBe(false)
})
