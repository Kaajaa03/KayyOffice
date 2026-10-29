import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync('dist', { recursive: true });

const common = { bundle: true, sourcemap: false, logLevel: 'info' };

await Promise.all([
  build({ ...common, entryPoints: ['src/main/main.ts'], outfile: 'dist/main.js', platform: 'node', target: 'node22', external: ['electron'] }),
  build({ ...common, entryPoints: ['src/main/preload.ts'], outfile: 'dist/preload.js', platform: 'node', target: 'node22', external: ['electron'] }),
  build({ ...common, entryPoints: ['src/renderer/renderer.ts'], outfile: 'dist/renderer.js', platform: 'browser', target: 'chrome120' }),
  build({ ...common, entryPoints: ['src/renderer/welcome.ts'], outfile: 'dist/welcome.js', platform: 'browser', target: 'chrome120' }),
]);

copyFileSync('src/renderer/index.html', 'dist/index.html');
copyFileSync('src/renderer/welcome.html', 'dist/welcome.html');
