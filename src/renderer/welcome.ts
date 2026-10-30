import { parseLanguage, t } from '../shared/i18n';
import type { Key, Lang } from '../shared/i18n';
import type { WelcomeStatus } from '../main/status';

interface KayyApi {
  action(name: string): Promise<string>;
  status(): Promise<WelcomeStatus>;
  onLanguage(cb: (lang: Lang) => void): void;
}
const kayy = (window as unknown as { kayy: KayyApi }).kayy;
const el = (id: string) => document.getElementById(id)!;

// the main process passes the language in the URL so the first paint is already translated
let lang: Lang = parseLanguage(new URLSearchParams(location.search).get('lang')) ?? 'de';
let status: WelcomeStatus | null = null;

function setRow(id: string, text: string, state: 'ok' | 'bad' | ''): void {
  const row = el(id);
  row.className = state;
  row.querySelector('span')!.textContent = text;
}

function render(): void {
  document.documentElement.lang = lang;
  // strings come from our own static table (never from user input), so innerHTML is safe here
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((n) => { n.textContent = t(lang, n.dataset.i18n as Key); });
  document.querySelectorAll<HTMLElement>('[data-i18n-html]').forEach((n) => { n.innerHTML = t(lang, n.dataset.i18nHtml as Key); });
  if (!status) return;
  setRow('s-hooks', t(lang, status.hooks ? 'welcome.status.hooksOn' : 'welcome.status.hooksOff'), status.hooks ? 'ok' : 'bad');
  setRow('s-mode', t(lang, 'welcome.status.mode', { mode: t(lang, `mode.${status.mode}`) }), '');
  setRow('s-port', t(lang, 'welcome.status.port', { port: status.port }), 'ok');
}

async function refresh(): Promise<void> {
  status = await kayy.status();
  render();
}

const bind = (id: string, action: string, msgId?: string) => {
  el(id).addEventListener('click', async () => {
    const text = await kayy.action(action);
    if (msgId) el(msgId).textContent = text;
    void refresh();
  });
};

bind('hooks', 'install-hooks', 'm1');
bind('demo', 'demo', 'm2');
bind('close', 'close');
kayy.onLanguage((l) => { lang = l; el('m1').textContent = ''; el('m2').textContent = ''; render(); });
render();
void refresh();
window.addEventListener('focus', () => void refresh());
