// Settings-window buttons (demo, logs, roles) with plain-language results.
import { shell } from 'electron';
import { existsSync } from 'node:fs';
import { appLogPath } from './diag';
import { localDate, writeDevLog, writeWeekLog } from './log';
import type { EventLog } from './log';
import type { ActionResult } from './settings';
import type { SettingsWindow } from './window';
import { t } from '../shared/i18n';
import type { Lang } from '../shared/i18n';

interface ActionDeps {
  lang(): Lang;
  devLogDir: string;
  rolesPath: string;
  eventLog: EventLog;
  settings: SettingsWindow;
  startDemo(): void;
}

const ok = (text = ''): ActionResult => ({ ok: true, text });

export function createActions(d: ActionDeps) {
  async function openFile(file: string): Promise<ActionResult> {
    const err = await shell.openPath(file);
    return err ? { ok: false, text: t(d.lang(), 'set.msg.openFailed') } : ok();
  }

  async function run(name: unknown): Promise<ActionResult> {
    const today = localDate(Date.now());
    switch (name) {
      case 'demo': d.startDemo(); return ok(t(d.lang(), 'dialog.demoRunning'));
      case 'devlog': await shell.openPath(writeDevLog(d.devLogDir, d.eventLog.day(today))); return ok();
      case 'week': await shell.openPath(writeWeekLog(d.devLogDir, today, d.eventLog)); return ok();
      case 'roles': return openFile(d.rolesPath);
      case 'diag': {
        const p = appLogPath();
        if (!p || !existsSync(p)) return ok(t(d.lang(), 'set.msg.noDiag'));
        shell.showItemInFolder(p);
        return ok();
      }
      case 'close': d.settings.close(); return ok();
      default: return { ok: false, text: t(d.lang(), 'set.err.invalid') };
    }
  }

  return { run };
}
