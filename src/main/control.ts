import type { PermissionDecision, PermissionRequestInfo } from '../shared/types';

/** After this long without an answer the hook falls back to Claude Code's normal prompt. */
export const PERMISSION_TIMEOUT_MS = 20000;

interface Waiting {
  info: PermissionRequestInfo;
  settle: (d: PermissionDecision) => void;
}

export class PermissionQueue {
  private items = new Map<string, Waiting>();
  private timeoutMs: number;
  private onChange?: () => void;

  constructor(opts: { timeoutMs?: number; onChange?: () => void } = {}) {
    this.timeoutMs = opts.timeoutMs ?? PERMISSION_TIMEOUT_MS;
    this.onChange = opts.onChange;
  }

  add(req: Omit<PermissionRequestInfo, 'ts'>, signal?: AbortSignal): Promise<PermissionDecision> {
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout>;
      const settle = (d: PermissionDecision) => {
        if (!this.items.delete(req.id)) return;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        resolve(d);
        this.onChange?.();
      };
      const onAbort = () => settle('ask');
      timer = setTimeout(() => settle('ask'), this.timeoutMs);
      signal?.addEventListener('abort', onAbort);
      this.items.set(req.id, { info: { ...req, ts: Date.now() }, settle });
      this.onChange?.();
    });
  }

  resolve(id: string, decision: 'allow' | 'deny'): boolean {
    const w = this.items.get(id);
    if (!w) return false;
    w.settle(decision);
    return true;
  }

  pending(): PermissionRequestInfo[] {
    return [...this.items.values()].map((w) => w.info);
  }

  dispose(): void {
    for (const w of [...this.items.values()]) w.settle('ask');
  }
}
