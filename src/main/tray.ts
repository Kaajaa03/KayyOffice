// Tray icon with menu and tooltip, plus the global show/hide hotkey.
import { app, globalShortcut, Menu, nativeImage, Tray } from 'electron';
import { iconPath } from './icon';
import { tooltipText } from './tooltip';
import { t } from '../shared/i18n';
import type { Lang } from '../shared/i18n';

const HOTKEY = 'Control+Alt+O';
export const HOTKEY_LABEL = HOTKEY.replace('Control', 'Ctrl');

interface TrayDeps { toggle(): void; openSettings(): void; demo(): void }

export function createTray(deps: TrayDeps, initialLang: Lang) {
  const tray = new Tray(nativeImage.createFromPath(iconPath()));
  tray.on('click', deps.toggle);
  tray.on('double-click', deps.openSettings);
  globalShortcut.register(HOTKEY, deps.toggle);
  app.on('will-quit', () => globalShortcut.unregisterAll());

  let lang = initialLang;
  let stats = { working: 0, waiting: 0 };
  let tooltip = '';

  const updateTooltip = () => {
    const text = tooltipText(stats, lang);
    if (text === tooltip) return;
    tooltip = text;
    tray.setToolTip(text);
  };
  const setLang = (next: Lang) => {
    lang = next;
    tooltip = '';
    updateTooltip();
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: t(lang, 'tray.toggle', { hotkey: HOTKEY_LABEL }), click: deps.toggle },
      { label: t(lang, 'tray.settings'), click: deps.openSettings },
      { label: t(lang, 'tray.demo'), click: deps.demo },
      { type: 'separator' },
      { label: t(lang, 'tray.quit'), click: () => app.quit() },
    ]));
  };
  setLang(lang);

  return {
    setLang,
    setStats(next: { working: number; waiting: number }): void { stats = next; updateTooltip(); },
  };
}
