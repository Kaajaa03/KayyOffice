// All tests create their scratch folders with os.tmpdir(): point it at one run-scoped folder and delete that afterwards.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default function setup(): () => void {
  const dir = mkdtempSync(join(tmpdir(), 'kayy-test-'));
  process.env.TEMP = dir;
  process.env.TMP = dir;
  return () => rmSync(dir, { recursive: true, force: true });
}
