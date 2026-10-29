// Starts the built app, samples CPU/RAM, prints PASS/FAIL for the idle budget.
// Usage: npm run build && npm run perf [-- active]
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(__dirname, '..');
const electron = join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const active = process.argv[2] === 'active';
const seconds = 24;
const out = join(mkdtempSync(join(tmpdir(), 'kayy-perf-')), 'perf.json');

const IDLE_CPU_MAX = 1; // percent
const IDLE_RAM_MAX = 150; // MB (private bytes, all Electron processes)

const app = spawn(electron, [root, `--perf=${out}`, `--perf-seconds=${seconds}`], { stdio: 'ignore' });
app.on('exit', () => {
  const r = JSON.parse(readFileSync(out, 'utf8'));
  console.log(JSON.stringify(r, null, 2));
  if (active) { console.log('(active run – informational only)'); return; }
  const ok = r.cpuPercent < IDLE_CPU_MAX && r.privateMB < IDLE_RAM_MAX;
  console.log(`${ok ? 'PASS' : 'FAIL'}  idle cpu ${r.cpuPercent}% (<${IDLE_CPU_MAX})  ram ${r.privateMB} MB private (<${IDLE_RAM_MAX})`);
  process.exitCode = ok ? 0 : 1;
});

if (active) {
  setTimeout(() => {
    spawnSync('npx', ['tsx', 'tools/mock-events.ts', 'team'], { cwd: root, shell: true, env: { ...process.env, MOCK_SECONDS: String(seconds - 8) }, stdio: 'ignore' });
  }, 4000);
}
