// Sends fake Claude Code events to the running Kayy Office app.
// Usage: npm run mock -- <single|team|permission|error|cleanup>   (MOCK_SECONDS=60)
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { requestAuth } from '../src/main/auth';
import { join } from 'node:path';
import type { AgentEvent, EventName } from '../src/shared/types';

const dir = process.env.KAYY_CONFIG_DIR || join(process.env.APPDATA ?? '', 'KayyOffice');
const cfg = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8')) as { token: string; port: number };
const seconds = Number(process.env.MOCK_SECONDS ?? 60);

const TOOLS = ['Edit', 'Bash', 'Read', 'WebFetch', 'Grep', 'Write', 'PowerShell'];
const CREW = [
  ['planner', 'C:\\ai\\Claude'],
  ['coder', 'C:\\dev\\KayyOffice'],
  ['tester', 'C:\\dev\\KayyOffice'],
  ['researcher', 'C:\\dev\\site'],
  ['reviewer', 'C:\\dev\\infra'],
] as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];

async function send(e: Partial<AgentEvent> & { event: EventName; sessionId: string }): Promise<void> {
  const body = JSON.stringify({ ts: Date.now(), agentId: e.sessionId, cwd: 'C:\\dev\\mock', ...e } satisfies AgentEvent);
  const nonce = randomBytes(16).toString('hex');
  try {
    await fetch(`http://127.0.0.1:${cfg.port}/event`, {
      method: 'POST',
      headers: { 'x-kayy-nonce': nonce, 'x-kayy-auth': requestAuth(cfg.token, nonce, '/event', body) },
      body,
    });
  } catch {
    console.error('App not reachable – is Kayy Office running?');
    process.exit(1);
  }
}

async function worker(id: string, cwd: string, until: number): Promise<void> {
  await send({ event: 'SessionStart', sessionId: id, cwd });
  while (Date.now() < until) {
    const tool = pick(TOOLS);
    await send({ event: 'PreToolUse', sessionId: id, cwd, tool });
    await sleep(rnd(500, 3000));
    await send({ event: 'PostToolUse', sessionId: id, cwd, tool });
    if (Math.random() < 0.15) {
      const sub = `${id}-sub`;
      await send({ event: 'SubagentStart', sessionId: id, agentId: sub, parentId: id, cwd });
      await sleep(rnd(1500, 4000));
      await send({ event: 'SubagentStop', sessionId: id, agentId: sub, parentId: id, cwd });
    }
    await sleep(rnd(200, 1200));
  }
  await send({ event: 'Stop', sessionId: id, cwd });
}

async function main(): Promise<void> {
const scenario = process.argv[2] ?? 'team';
const until = Date.now() + seconds * 1000;

switch (scenario) {
  case 'single':
    await worker('mock-single', 'C:\\dev\\KayyOffice', until);
    break;
  case 'team':
    await Promise.all(CREW.map(([n, cwd]) => worker(`mock-${n}`, cwd, until)));
    break;
  case 'permission':
    await send({ event: 'SessionStart', sessionId: 'mock-perm', cwd: 'C:\\dev\\KayyOffice' });
    await send({ event: 'PreToolUse', sessionId: 'mock-perm', cwd: 'C:\\dev\\KayyOffice', tool: 'Bash' });
    await sleep(1500);
    await send({ event: 'Notification', sessionId: 'mock-perm', cwd: 'C:\\dev\\KayyOffice', message: 'Claude needs your permission to use Bash' });
    break;
  case 'error':
    await send({ event: 'PostToolUse', sessionId: 'mock-err', cwd: 'C:\\dev\\KayyOffice', tool: 'Bash', message: 'ERROR: command failed' });
    break;
  case 'cleanup':
    for (const [n] of CREW) await send({ event: 'SessionEnd', sessionId: `mock-${n}` });
    for (const id of ['mock-single', 'mock-perm', 'mock-err']) await send({ event: 'SessionEnd', sessionId: id });
    break;
  default:
    console.error('unknown scenario', scenario);
    process.exit(2);
}
}

void main();
