// Typed string tables (de primary, en) shared by main, overlay and welcome window.
export type Lang = 'de' | 'en';
export const LANGS: readonly Lang[] = ['de', 'en'];

const de = {
  // permission card
  'card.wants': '{who} möchte {tool} benutzen',
  'card.noDetails': '(keine Details)',
  'card.allow': 'Erlauben',
  'card.deny': 'Ablehnen',
  'card.more': '+{n} weitere warten',
  // blast radius notes
  'risk.deleteRecursive': 'Löscht Dateien rekursiv',
  'risk.resetHard': 'Verwirft alle lokalen Änderungen',
  'risk.forcePush': 'Überschreibt die Remote-Historie',
  'risk.clean': 'Löscht untracked Dateien',
  'risk.pipeShell': 'Führt heruntergeladenen Code aus',
  'risk.dropDb': 'Löscht Datenbank-Objekte',
  'risk.format': 'Formatiert ein Laufwerk',
  'risk.chmodRecursive': 'Ändert Rechte rekursiv',
  'risk.sensitiveFile': 'Sensible Datei (Zugangsdaten/Schlüssel)',
  // pills
  'pill.working': 'arbeitet',
  'pill.waiting': 'braucht dich',
  'pill.done': 'fertig',
  'pill.idle': 'ruht',
  'pill.error': 'Fehler',
  'pill.decision': 'Entscheidung',
  'pill.code': 'Code',
  'pill.terminal': 'Terminal',
  'pill.browser': 'Browser',
  'pill.thinking': 'denkt',
  'label.subAgent': 'Sub-Agent',
  // room
  'room.stats': 'Arbeitet: {working}  ·  Wartet: {waiting}',
  'room.overflow': '+{n} weitere',
  'room.displayWorking': 'Arbeitet {n}',
  'room.displayWaiting': 'Wartet {n}',
  'footer.agents.one': '{n} Agent',
  'footer.agents.other': '{n} Agents',
  'footer.active': '{n} aktiv',
  'footer.waiting': '{n} wartet auf dich',
  'hint.start': 'Kayy Office läuft · wartet auf Agents · Strg+Alt+O',
  // tray
  'tray.toggle': 'Anzeigen / Verstecken ({hotkey})',
  'tray.demo': 'Demo zeigen (15 s)',
  'tray.welcome': 'Willkommen / Hilfe',
  'tray.approvals': 'Freigabe-Karten im Overlay',
  'tray.approvals.risky': 'Nur bei riskanten Befehlen (Standard)',
  'tray.approvals.all': 'Bei jeder Rückfrage',
  'tray.approvals.off': 'Nie (Claude fragt normal)',
  'tray.language': 'Sprache / Language',
  'tray.installHooks': 'Hooks installieren',
  'tray.removeHooks': 'Hooks entfernen',
  'tray.devLog': 'Dev-Log (heute) öffnen',
  'tray.weekRecap': 'Wochen-Recap öffnen',
  'tray.rolesOpen': 'Rollen-Datei öffnen (roles.json)',
  'tray.rolesReload': 'Rollen neu laden',
  'tray.awake': 'Wach bleiben, solange Agents arbeiten',
  'tray.autostart': 'Mit Windows starten',
  'tray.quit': 'Beenden',
  'tooltip.idle': 'Kayy Office – ruht',
  'tooltip.active': '{n} aktiv',
  'tooltip.waiting': '{n} wartet',
  // dialogs
  'dialog.hooksInstalled': 'Hooks installiert.',
  'dialog.backup': 'Backup: {path}',
  'dialog.newSessions': 'Neue Claude-Code-Sessions nutzen sie automatisch.',
  'dialog.noNode': 'ACHTUNG: "node" wurde nicht im PATH gefunden. Die Hooks brauchen Node.js, sonst melden sie Fehler.',
  'dialog.hooksRemoved': 'Hooks entfernt.',
  'dialog.demoRunning': 'Demo läuft 15 Sekunden – schau an den oberen Bildschirmrand.',
  // welcome window
  'welcome.sub': 'Dein Pixel-Büro für Claude-Agents. Läuft lokal, kostet keine Tokens.',
  'welcome.step1.title': 'Verbinden',
  'welcome.step1.textHtml': 'Trägt die Hooks in Claude Code ein (mit Backup). Danach neue Claude-Sessions starten. Noch besser: der Mod <b>kayy-office</b> liefert mehr (Modell, Kosten, Router).',
  'welcome.step1.button': 'Hooks installieren',
  'welcome.step2.title': 'Ansehen',
  'welcome.step2.text': 'Zeigt 15 Sekunden ein Demo-Büro oben am Bildschirmrand, damit du siehst, wie es aussieht.',
  'welcome.step2.button': 'Demo zeigen',
  'welcome.step3.title': 'Bedienen',
  'welcome.step3.textHtml': 'Das Büro erscheint oben mittig, sobald Agents arbeiten. Ein-/Ausblenden mit <kbd>Strg</kbd>+<kbd>Alt</kbd>+<kbd>O</kbd>. Das Tray-Icon (unten rechts, evtl. im ^-Menü) öffnet Hooks, Dev-Log, Rollen und diese Hilfe. Freigaben beantwortest du direkt im Overlay mit Erlauben/Ablehnen.',
  'welcome.close': "Los geht's",
  'welcome.status.hooksOn': 'Hooks installiert ✓',
  'welcome.status.hooksOff': 'Hooks nicht installiert ✗',
  'welcome.status.mode': 'Freigabe-Modus: {mode}',
  'welcome.status.port': 'Overlay läuft auf Port {port}',
  'mode.risky': 'riskant',
  'mode.all': 'alle',
  'mode.off': 'aus',
} as const;

export type Key = keyof typeof de;

const en: Record<Key, string> = {
  'card.wants': '{who} wants to use {tool}',
  'card.noDetails': '(no details)',
  'card.allow': 'Allow',
  'card.deny': 'Deny',
  'card.more': '+{n} more waiting',
  'risk.deleteRecursive': 'Deletes files recursively',
  'risk.resetHard': 'Discards all local changes',
  'risk.forcePush': 'Overwrites remote history',
  'risk.clean': 'Deletes untracked files',
  'risk.pipeShell': 'Runs downloaded code',
  'risk.dropDb': 'Deletes database objects',
  'risk.format': 'Formats a drive',
  'risk.chmodRecursive': 'Changes permissions recursively',
  'risk.sensitiveFile': 'Sensitive file (credentials/keys)',
  'pill.working': 'working',
  'pill.waiting': 'needs you',
  'pill.done': 'done',
  'pill.idle': 'idle',
  'pill.error': 'error',
  'pill.decision': 'decision',
  'pill.code': 'code',
  'pill.terminal': 'terminal',
  'pill.browser': 'browser',
  'pill.thinking': 'thinking',
  'label.subAgent': 'sub-agent',
  'room.stats': 'Working: {working}  ·  Waiting: {waiting}',
  'room.overflow': '+{n} more',
  'room.displayWorking': 'Working {n}',
  'room.displayWaiting': 'Waiting {n}',
  'footer.agents.one': '{n} agent',
  'footer.agents.other': '{n} agents',
  'footer.active': '{n} active',
  'footer.waiting': '{n} waiting for you',
  'hint.start': 'Kayy Office is running · waiting for agents · Ctrl+Alt+O',
  'tray.toggle': 'Show / hide ({hotkey})',
  'tray.demo': 'Show demo (15 s)',
  'tray.welcome': 'Welcome / help',
  'tray.approvals': 'Approval cards in the overlay',
  'tray.approvals.risky': 'Only for risky commands (default)',
  'tray.approvals.all': 'For every request',
  'tray.approvals.off': 'Never (Claude asks as usual)',
  'tray.language': 'Sprache / Language',
  'tray.installHooks': 'Install hooks',
  'tray.removeHooks': 'Remove hooks',
  'tray.devLog': "Open today's dev log",
  'tray.weekRecap': 'Open weekly recap',
  'tray.rolesOpen': 'Open roles file (roles.json)',
  'tray.rolesReload': 'Reload roles',
  'tray.awake': 'Stay awake while agents work',
  'tray.autostart': 'Start with Windows',
  'tray.quit': 'Quit',
  'tooltip.idle': 'Kayy Office – idle',
  'tooltip.active': '{n} active',
  'tooltip.waiting': '{n} waiting',
  'dialog.hooksInstalled': 'Hooks installed.',
  'dialog.backup': 'Backup: {path}',
  'dialog.newSessions': 'New Claude Code sessions pick them up automatically.',
  'dialog.noNode': 'WARNING: "node" was not found in PATH. The hooks need Node.js, otherwise they report errors.',
  'dialog.hooksRemoved': 'Hooks removed.',
  'dialog.demoRunning': 'The demo runs for 15 seconds – look at the top edge of your screen.',
  'welcome.sub': 'Your pixel office for Claude agents. Runs locally, costs no tokens.',
  'welcome.step1.title': 'Connect',
  'welcome.step1.textHtml': 'Registers the hooks in Claude Code (with backup). Then start new Claude sessions. Even better: the <b>kayy-office</b> mod delivers more (model, cost, router).',
  'welcome.step1.button': 'Install hooks',
  'welcome.step2.title': 'Look',
  'welcome.step2.text': 'Shows a demo office at the top edge of the screen for 15 seconds so you can see what it looks like.',
  'welcome.step2.button': 'Show demo',
  'welcome.step3.title': 'Use',
  'welcome.step3.textHtml': 'The office appears at the top centre as soon as agents work. Show/hide with <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>O</kbd>. The tray icon (bottom right, maybe in the ^ menu) opens hooks, dev log, roles and this help. You answer approvals right in the overlay with Allow/Deny.',
  'welcome.close': "Let's go",
  'welcome.status.hooksOn': 'Hooks installed ✓',
  'welcome.status.hooksOff': 'Hooks not installed ✗',
  'welcome.status.mode': 'Approval mode: {mode}',
  'welcome.status.port': 'Overlay running on port {port}',
  'mode.risky': 'risky',
  'mode.all': 'all',
  'mode.off': 'off',
};

const TABLES: Record<Lang, Record<Key, string>> = { de, en };

type Params = Record<string, string | number>;

export function t(lang: Lang, key: Key, params?: Params): string {
  const text = TABLES[lang][key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m));
}

export const keysOf = (): Key[] => Object.keys(de) as Key[];

export function parseLanguage(v: unknown): Lang | undefined {
  return v === 'de' || v === 'en' ? v : undefined;
}

/** System locale (Electron `app.getLocale()`): German systems get German, everything else English. */
export function defaultLanguage(locale: string): Lang {
  return locale.toLowerCase().startsWith('de') ? 'de' : 'en';
}
