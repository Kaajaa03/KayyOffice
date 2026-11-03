import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { appLog } from './diag';
import { writeFileAtomic } from './fsutil';

interface Config {
  token: string;
  port: number;
  devLogDir?: string;
  welcomeShown?: boolean;
  /** Set once the installed app switched "start with Windows" on by default (the user's later choice stays). */
  autostartInit?: boolean;
  /** The person's choice for "start with Windows"; absent = on. Re-applied at every start. */
  autostart?: boolean;
  /** 'all' | 'risky' (default) | 'off': which permission requests get an overlay card. */
  approvals?: string;
  /** 'de' | 'en'; absent = follow the system language. */
  language?: string;
  /** Where the overlay was dragged to (window top-left, screen px); absent = top centre. */
  position?: { x: number; y: number };
  /** The tray preset the position came from, so the menu can show it checked; absent after a free drag. */
  placement?: string;
  /** Overlay size step (see scale.ts: 0.67, 1, 1.33, 1.67, 2); absent = 1. */
  scale?: number;
  /** Overlay opacity 0.5-1 (see opacity.ts); absent = 1. */
  opacity?: number;
  /** Keep the PC awake while agents work; absent = on. */
  awake?: boolean;
  /** Beep when an agent starts needing the person; absent = off. */
  sound?: boolean;
}

const DEFAULT_PORT = 47821;

export function loadConfig(dir: string): Config {
  const file = join(dir, 'config.json');
  if (existsSync(file)) {
    try {
      const c = JSON.parse(readFileSync(file, 'utf8')) as Partial<Config>;
      if (typeof c.token === 'string' && c.token.length >= 32) {
        const p = c.port ?? 0;
        return { ...c, token: c.token, port: Number.isInteger(p) && p >= 1024 && p <= 65535 ? p : DEFAULT_PORT };
      }
    } catch (e) {
      appLog('warn', 'config: config.json unreadable, generating a new one', e);
    }
  }
  mkdirSync(dir, { recursive: true });
  // keep the broken file so the settings in it are not lost silently
  if (existsSync(file)) copyFileSync(file, `${file}.bak`);
  const fresh: Config = { token: randomBytes(32).toString('hex'), port: DEFAULT_PORT };
  writeFileAtomic(file, JSON.stringify(fresh, null, 2));
  return fresh;
}

export function updateConfig(dir: string, patch: Partial<Config>): void {
  const c = loadConfig(dir);
  writeFileAtomic(join(dir, 'config.json'), JSON.stringify({ ...c, ...patch }, null, 2));
}

/**
 * The shared config lives in the home folder, NOT in %APPDATA%: Claude Desktop (a Store app) sees AppData
 * redirected into its package, so the app and the Claude mod would read two different config.json files.
 */
export const defaultConfigDir = (home: string = homedir()): string => join(home, '.kayy-office');

/** First run in the new folder: take over settings, roles and roster from the old AppData folder. */
export function migrateLegacyConfig(dir: string, legacyDir: string): void {
  try {
    if (existsSync(join(dir, 'config.json')) || !existsSync(join(legacyDir, 'config.json'))) return;
    mkdirSync(dir, { recursive: true });
    for (const name of ['config.json', 'roles.json', 'roster.json']) {
      if (existsSync(join(legacyDir, name))) copyFileSync(join(legacyDir, name), join(dir, name));
    }
  } catch (e) {
    appLog('warn', 'config: migration from the old folder failed', e);
  }
}
