// Settings-window buttons, hook installation with plain-language results, and the one-time hooks advice.
import { app, dialog, shell } from 'electron';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { updateConfig } from './config';
import { appLog, appLogPath } from './diag';
import { hooksInstalled, installHooks, stageHook, uninstallHooks } from './installer';
import { localDate, writeDevLog, writeWeekLog } from './log';
import type { EventLog } from './log';
import type { ActionResult } from './settings';
import type { SettingsWindow } from './window';
import { t } from '../shared/i18n';
import type { Lang } from '../shared/i18n';

interface ActionDeps {
  lang(): Lang;
  configDir: string;
  devLogDir: string;
  rolesPath: string;
  eventLog: EventLog;
  settings: SettingsWindow;
  adviceAsked: boolean;
  startDemo(): void;
  /** Hooks were installed/removed: refresh the settings window. */
  changed(): void;
}

const ok = (text = ''): ActionResult => ({ ok: true, text });

export function createActions(d: ActionDeps) {
  const claudeSettings = join(homedir(), '.claude', 'settings.json');
  const hookSource = app.isPackaged ? join(process.resourcesPath, 'hook', 'hook.js') : join(app.getAppPath(), 'hook', 'hook.js');
  const readClaudeSettings = (): string | null => { try { return readFileSync(claudeSettings, 'utf8'); } catch { return null; /* no settings file yet */ } };
  const failed = (): ActionResult => ({ ok: false, text: t(d.lang(), 'dialog.failed') });
  let adviceDone = d.adviceAsked;

  function install(): ActionResult {
    const lang = d.lang();
    try {
      const { backupPath } = installHooks(claudeSettings, stageHook(hookSource, d.configDir));
      const noNode = spawnSync('where', ['node'], { windowsHide: true }).status !== 0;
      return ok([
        t(lang, 'dialog.hooksInstalled'),
        backupPath ? t(lang, 'dialog.backup', { path: backupPath }) : '',
        t(lang, 'dialog.newSessions'),
      ].filter(Boolean).join('\n') + (noNode ? `\n\n${t(lang, 'dialog.noNode')}` : ''));
    } catch (e) {
      appLog('error', 'installer: install failed', e);
      return failed();
    }
  }

  function uninstall(): ActionResult {
    try {
      uninstallHooks(claudeSettings);
      return ok(t(d.lang(), 'dialog.hooksRemoved'));
    } catch (e) {
      appLog('error', 'installer: uninstall failed', e);
      return failed();
    }
  }

  async function openFile(file: string): Promise<ActionResult> {
    const err = await shell.openPath(file);
    return err ? { ok: false, text: t(d.lang(), 'set.msg.openFailed') } : ok();
  }

  async function run(name: unknown): Promise<ActionResult> {
    const today = localDate(Date.now());
    switch (name) {
      case 'install-hooks': { const r = install(); d.changed(); return r; }
      case 'remove-hooks': { const r = uninstall(); d.changed(); return r; }
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

  return {
    run,
    hooksInstalled: () => hooksInstalled(readClaudeSettings()),

    /** Keeps an already staged hook in sync with this app version (protocol changes must not silently break it). */
    refreshStagedHook(): void {
      try { if (existsSync(join(d.configDir, 'hook.js'))) stageHook(hookSource, d.configDir); } catch (e) { appLog('warn', 'main: could not refresh staged hook.js', e); }
    },

    /** Once, when the Claude mod reports while the hooks are installed too: the hooks only cost a
     *  process per tool call and add nothing, so offer to remove them. Asked once, ever. */
    async adviseAboutHooks(): Promise<void> {
      if (adviceDone) return;
      adviceDone = true;
      if (!hooksInstalled(readClaudeSettings())) return;
      updateConfig(d.configDir, { hooksAdvice: 'asked' });
      const lang = d.lang();
      const { response } = await dialog.showMessageBox({
        type: 'question',
        title: 'Kayy Office',
        message: t(lang, 'advice.hooks.text'),
        buttons: [t(lang, 'advice.hooks.remove'), t(lang, 'advice.hooks.keep')],
        defaultId: 1,
        cancelId: 1,
      });
      if (response === 0) uninstall();
    },
  };
}
