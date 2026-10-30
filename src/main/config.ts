import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { appLog } from './diag';
import { writeFileAtomic } from './fsutil';

export interface Config {
  token: string;
  port: number;
  devLogDir?: string;
  welcomeShown?: boolean;
  /** 'all' | 'risky' (default) | 'off': which permission requests get an overlay card. */
  approvals?: string;
  /** 'de' | 'en'; absent = follow the system language. */
  language?: string;
}

export const DEFAULT_PORT = 47821;

export function loadConfig(dir: string): Config {
  const file = join(dir, 'config.json');
  if (existsSync(file)) {
    try {
      const c = JSON.parse(readFileSync(file, 'utf8')) as Partial<Config>;
      if (typeof c.token === 'string' && c.token.length >= 32) {
        return { ...c, token: c.token, port: typeof c.port === 'number' ? c.port : DEFAULT_PORT };
      }
    } catch (e) {
      appLog('warn', 'config: config.json unreadable, generating a new one', e);
    }
  }
  mkdirSync(dir, { recursive: true });
  const fresh: Config = { token: randomBytes(32).toString('hex'), port: DEFAULT_PORT };
  writeFileAtomic(file, JSON.stringify(fresh, null, 2));
  return fresh;
}

export function updateConfig(dir: string, patch: Partial<Config>): void {
  const c = loadConfig(dir);
  writeFileAtomic(join(dir, 'config.json'), JSON.stringify({ ...c, ...patch }, null, 2));
}

export function saveConfigPort(dir: string, port: number): void {
  updateConfig(dir, { port });
}
