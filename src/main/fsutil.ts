import { copyFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

let counter = 0;

/** A settings file may be a symlink into a dotfiles repo: replace the target, not the link. */
function resolveLink(path: string): string {
  try { return realpathSync(path); } catch { return path; /* does not exist yet */ }
}

/** Writes via a temp file in the same directory and renames it over the target, so a crash
 *  never leaves a half-written file. Windows may refuse the rename (EPERM/EBUSY, e.g. a virus
 *  scanner or editor holds the target): then copy over it instead. */
export function writeFileAtomic(requested: string, text: string): void {
  const path = resolveLink(requested);
  const tmp = join(dirname(path), `.${basename(path)}.${process.pid}.${counter++}.tmp`);
  try {
    writeFileSync(tmp, text);
    try {
      renameSync(tmp, path);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EPERM' && code !== 'EBUSY') throw err;
      copyFileSync(tmp, path);
    }
  } finally {
    try { unlinkSync(tmp); } catch { /* already renamed away or never created */ }
  }
}
