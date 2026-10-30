// Generates build/icon.png (256x256) and build/icon.ico (16/32/48/256). Usage: npx tsx tools/make-icon.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderIco, renderPng } from './icon-lib';

const dir = resolve(__dirname, '..', 'build');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'icon.png'), renderPng(256));
writeFileSync(join(dir, 'icon.ico'), renderIco());
console.log(`wrote ${join(dir, 'icon.png')} and ${join(dir, 'icon.ico')}`);
