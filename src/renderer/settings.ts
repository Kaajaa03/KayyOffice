import { parseLanguage, t } from '../shared/i18n';
import type { Key, Lang } from '../shared/i18n';
import type { ActionResult, SetResult, SettingsSnapshot } from '../main/settings';

interface KayyApi {
  settings: {
    get(): Promise<SettingsSnapshot | null>;
    set(key: string, value: unknown): Promise<SetResult>;
    action(name: string): Promise<ActionResult>;
    onChanged(cb: (s: SettingsSnapshot) => void): void;
  };
}
const kayy = (window as unknown as { kayy: KayyApi }).kayy;
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// the main process passes the language in the URL so the first paint is already translated
let lang: Lang = parseLanguage(new URLSearchParams(location.search).get('lang')) ?? 'de';
let snap: SettingsSnapshot | null = null;

// first run: the main process opens this window with ?intro=1 and a short welcome block on top
const intro = el('intro');
intro.hidden = !new URLSearchParams(location.search).has('intro');
el('intro-close').addEventListener('click', () => { intro.hidden = true; });

const percent = (v: number) => `${Math.round(v * 100)} %`;

function showError(text: string): void {
  el('load-error').textContent = text;
}

function setStatus(id: string, text: string, state: 'ok' | 'bad' | ''): void {
  const row = el(id);
  row.className = `status ${state}`.trim();
  row.querySelector('span')!.textContent = text;
}

function setPicked(name: string, value: string): void {
  document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`).forEach((i) => { i.checked = i.value === value; });
}

function renderStatic(): void {
  document.documentElement.lang = lang;
  // strings come from our own static table (never from user input)
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((n) => { n.textContent = t(lang, n.dataset.i18n as Key); });
  document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((n) => { n.title = t(lang, n.dataset.i18nTitle as Key); });
}

function render(): void {
  renderStatic();
  if (!snap) return;
  lang = snap.language;
  renderStatic();
  setPicked('language', snap.language);
  setPicked('scale', String(snap.scale));
  el('size-out').textContent = percent(snap.scale);
  const range = el<HTMLInputElement>('opacity');
  if (document.activeElement !== range) range.value = String(Math.round(snap.opacity * 100));
  el('opacity-out').textContent = percent(snap.opacity);
  setPicked('placement', snap.placement ?? '');
  setPicked('approvals', snap.approvals);
  setStatus('s-mod', t(lang, snap.mod ? 'set.mod.on' : 'set.mod.off'), snap.mod ? 'ok' : '');
  el('mod-hint').hidden = snap.mod;
  setStatus('s-port', t(lang, 'welcome.status.port', { port: snap.port }), 'ok');
  el<HTMLInputElement>('autostart').checked = snap.autostart;
  el<HTMLInputElement>('autostart').disabled = !snap.autostartAvailable;
  el('autostart-note').textContent = snap.autostartAvailable ? '' : t(lang, 'set.autostart.unavailable');
  el<HTMLInputElement>('awake').checked = snap.awake;
  el<HTMLInputElement>('sound').checked = snap.sound;
  el('f-version').textContent = t(lang, 'set.version', { version: snap.version });
  el('f-hotkey').textContent = t(lang, 'set.hotkey', { hotkey: lang === 'de' ? snap.hotkey.replace('Ctrl', 'Strg') : snap.hotkey });
}

const ERRORS = { unknown: 'set.err.invalid', invalid: 'set.err.invalid', unavailable: 'set.err.unavailable', failed: 'set.err.failed' } as const;

async function refresh(): Promise<void> {
  const s = await kayy.settings.get();
  if (!s) { showError(t(lang, 'set.err.load')); return; }
  snap = s;
  render();
}

async function change(key: string, value: unknown): Promise<void> {
  const r = await kayy.settings.set(key, value);
  if (r.ok) { showError(''); return; }
  showError(t(lang, ERRORS[r.error]));
  void refresh(); // put the control back to the real value
}

document.querySelectorAll<HTMLInputElement>('input[type=radio]').forEach((i) => {
  i.addEventListener('change', () => {
    if (!i.checked) return;
    void change(i.name, i.name === 'scale' ? Number(i.value) : i.value);
  });
});

// live slider: one request in flight, always the latest value
const range = el<HTMLInputElement>('opacity');
let sending = false;
let latest: number | null = null;
async function pumpOpacity(): Promise<void> {
  if (sending) return;
  sending = true;
  while (latest !== null) {
    const v = latest;
    latest = null;
    await change('opacity', v / 100);
  }
  sending = false;
}
range.addEventListener('input', () => {
  el('opacity-out').textContent = percent(Number(range.value) / 100);
  latest = Number(range.value);
  void pumpOpacity();
});

for (const id of ['autostart', 'awake', 'sound']) {
  const box = el<HTMLInputElement>(id);
  box.addEventListener('change', () => void change(id, box.checked));
}

async function run(name: string, msgId: string): Promise<void> {
  const out = el(msgId);
  out.textContent = '';
  out.classList.remove('err');
  const r = await kayy.settings.action(name);
  out.textContent = r.text;
  out.classList.toggle('err', !r.ok);
  void refresh();
}

document.querySelectorAll<HTMLElement>('[data-action]').forEach((b) => {
  b.addEventListener('click', () => void run(b.dataset.action!, 'm-tools'));
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') void kayy.settings.action('close');
});
kayy.settings.onChanged((s) => { snap = s; render(); });
window.addEventListener('focus', () => void refresh()); // the mod status changes with time
render();
void refresh();
