// State logic of the settings window: validated snapshot + whitelisted, live-applied setters.
// All side effects (windows, tray, power, autostart, config file) come in through `SettingsDeps`,
// so this module is unit-tested without Electron.
import { parseApprovalMode } from './approvals';
import type { ApprovalMode } from './approvals';
import { clampOpacity } from './opacity';
import { parsePlacement } from './position';
import type { Placement, Point } from './position';
import { SCALES, stepScale } from './scale';
import { parseLanguage } from '../shared/i18n';
import type { Lang } from '../shared/i18n';

export interface SettingsSnapshot {
  language: Lang;
  scale: number;
  opacity: number;
  placement: Placement | undefined;
  approvals: ApprovalMode;
  awake: boolean;
  autostart: boolean;
  autostartAvailable: boolean;
  hooks: boolean;
  mod: boolean;
  port: number;
  version: string;
  hotkey: string;
}

type SetError = 'unknown' | 'invalid' | 'unavailable' | 'failed';
export type SetResult = { ok: true } | { ok: false; error: SetError };

/** Result of a settings-window button (install hooks, open a file, ...): a plain-language text to show inline. */
export interface ActionResult { ok: boolean; text: string }

export interface SettingsDeps {
  initial: Pick<SettingsSnapshot, 'language' | 'scale' | 'opacity' | 'placement' | 'approvals' | 'awake'>;
  version: string;
  hotkey: string;
  autostartAvailable: boolean;
  getAutostart(): boolean;
  setAutostart(on: boolean): void;
  applyLanguage(lang: Lang): void;
  /** Applies the wanted scale and returns the one actually used (fitted to the display). */
  applyScale(scale: number): number;
  applyOpacity(opacity: number): void;
  /** Moves the overlay to the preset and returns its new top-left position. */
  applyPlacement(p: Placement): Point;
  setAwake(on: boolean): void;
  setApprovals(mode: ApprovalMode): void;
  persist(patch: Record<string, unknown>): void;
  hooksInstalled(): boolean;
  modActive(): boolean;
  port(): number;
  /** Something changed: push a fresh snapshot to the settings window and refresh the tray. */
  changed(): void;
}

const KEYS = ['language', 'scale', 'opacity', 'placement', 'approvals', 'awake', 'autostart'] as const;
type Key = (typeof KEYS)[number];
const isKey = (k: unknown): k is Key => typeof k === 'string' && (KEYS as readonly string[]).includes(k);

export class SettingsModel {
  private v: SettingsDeps['initial'];

  constructor(private deps: SettingsDeps) {
    this.v = { ...deps.initial };
  }

  snapshot(): SettingsSnapshot {
    return {
      ...this.v,
      autostart: this.deps.autostartAvailable && this.deps.getAutostart(), autostartAvailable: this.deps.autostartAvailable,
      hooks: this.deps.hooksInstalled(), mod: this.deps.modActive(), port: this.deps.port(),
      version: this.deps.version, hotkey: this.deps.hotkey,
    };
  }

  set(key: unknown, value: unknown): SetResult {
    if (!isKey(key)) return { ok: false, error: 'unknown' };
    try {
      const patch = this.apply(key, value);
      if (patch === 'invalid' || patch === 'unavailable') return { ok: false, error: patch };
      if (Object.keys(patch).length) this.deps.persist(patch);
      this.deps.changed();
      return { ok: true };
    } catch {
      return { ok: false, error: 'failed' };
    }
  }

  stepScale(dir: 1 | -1): SetResult {
    return this.set('scale', stepScale(this.v.scale, dir));
  }

  /** The user dragged the overlay: the preset no longer applies. */
  dragged(pos: Point): void {
    this.v.placement = undefined;
    this.deps.persist({ position: pos, placement: undefined });
    this.deps.changed();
  }

  /** Applies one validated value; returns the config patch, or why it was refused. Throws when the side effect fails. */
  private apply(key: Key, value: unknown): Record<string, unknown> | 'invalid' | 'unavailable' {
    switch (key) {
      case 'language': {
        const lang = parseLanguage(value);
        if (!lang) return 'invalid';
        this.deps.applyLanguage(lang);
        this.v.language = lang;
        return { language: lang };
      }
      case 'scale': {
        if (typeof value !== 'number' || !(SCALES as readonly number[]).includes(value)) return 'invalid';
        this.v.scale = this.deps.applyScale(value);
        return { scale: this.v.scale };
      }
      case 'opacity': {
        if (typeof value !== 'number' || !Number.isFinite(value)) return 'invalid';
        const o = clampOpacity(value);
        this.deps.applyOpacity(o);
        this.v.opacity = o;
        return { opacity: o };
      }
      case 'placement': {
        const p = parsePlacement(value);
        if (!p) return 'invalid';
        const position = this.deps.applyPlacement(p);
        this.v.placement = p;
        return { position, placement: p };
      }
      case 'approvals': {
        if (value !== parseApprovalMode(value)) return 'invalid';
        this.deps.setApprovals(value as ApprovalMode);
        this.v.approvals = value as ApprovalMode;
        return { approvals: value };
      }
      case 'awake': {
        if (typeof value !== 'boolean') return 'invalid';
        this.deps.setAwake(value);
        this.v.awake = value;
        return { awake: value };
      }
      case 'autostart': {
        if (typeof value !== 'boolean') return 'invalid';
        if (!this.deps.autostartAvailable) return 'unavailable';
        this.deps.setAutostart(value);
        return {};
      }
    }
  }
}
