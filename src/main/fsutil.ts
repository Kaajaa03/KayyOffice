import { copyFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

let counter = 0;

/** Writes via a temp file in the same directory and renames it over the target, so a crash
 *  never leaves a half-written file. Windows may refuse the rename (EPERM/EBUSY, e.g. a virus
 *  scanner or editor holds the target): then copy over it instead. */
export function writeFileAtomic(path: string, text: string): void {
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
