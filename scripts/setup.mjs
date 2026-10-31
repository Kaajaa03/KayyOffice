// One-command setup for Windows, macOS and Linux: node scripts/setup.mjs [--no-start]
// Installs the dependencies, builds the overlay, registers the Claude mod and starts the app.
import { spawn, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';
const noStart = process.argv.includes('--no-start');
// `claude` and `npm` are .cmd shims on Windows, which only a shell can start
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: root, shell: isWin, encoding: 'utf8', ...opts });
const step = (n, text) => console.log(`\n[${n}/4] ${text}`);
const fail = (text) => { console.error(`\nFehler: ${text}`); process.exit(1); };

if (Number(process.versions.node.split('.')[0]) < 20) fail(`Node.js 20 oder neuer nötig (gefunden: ${process.versions.node}). https://nodejs.org`);
if (run('claude', ['--version']).status !== 0) fail('Claude Code nicht gefunden. Installieren: npm i -g @anthropic-ai/claude-code');

step(1, 'Abhängigkeiten installieren');
if (run('npm', ['install', '--no-audit', '--no-fund'], { stdio: 'inherit' }).status !== 0) fail('npm install fehlgeschlagen.');

step(2, 'Overlay bauen');
if (run('npm', ['run', 'build'], { stdio: 'inherit' }).status !== 0) fail('Build fehlgeschlagen.');

step(3, 'Claude-Mod installieren');
const marketplace = run('claude', ['plugin', 'marketplace', 'add', isWin ? `"${root}"` : root]);
// a marketplace that is already registered is fine: refresh it instead
if (marketplace.status !== 0) run('claude', ['plugin', 'marketplace', 'update', 'kayy'], { stdio: 'inherit' });
const install = run('claude', ['plugin', 'install', 'kayy-office@kayy']);
if (install.status !== 0 && !/already/i.test(`${install.stdout}${install.stderr}`)) {
  fail(`Mod-Installation fehlgeschlagen:\n${install.stdout}${install.stderr}`);
}
console.log('Mod kayy-office@kayy ist installiert.');

step(4, noStart ? 'Fertig (App nicht gestartet)' : 'App starten');
if (!noStart) {
  spawn('npm', ['start'], { cwd: root, shell: isWin, detached: true, stdio: 'ignore', windowsHide: true }).unref();
}
console.log('\nFertig. Öffne eine NEUE Claude-Sitzung und tippe /office. Das Büro erscheint, sobald ein Agent arbeitet (Demo: Tray-Icon → Demo zeigen).');
