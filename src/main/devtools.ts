// Debug runs started by flags: --perf (sample CPU/RAM) and --screenshot (capture a window); both quit the app.
import { app } from 'electron';
import type { BrowserWindow } from 'electron';
import { writeFileSync } from 'node:fs';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Samples all Electron processes every 2 s, writes averages to outPath, then quits. */
export function runPerf(seconds: number, outPath: string): void {
  const samples: Array<{ cpu: number; privateMB: number; workingSetMB: number }> = [];
  const timer = setInterval(() => {
    const m = app.getAppMetrics();
    samples.push({
      cpu: m.reduce((s, p) => s + p.cpu.percentCPUUsage, 0),
      privateMB: m.reduce((s, p) => s + (p.memory.privateBytes ?? 0), 0) / 1024,
      workingSetMB: m.reduce((s, p) => s + p.memory.workingSetSize, 0) / 1024,
    });
  }, 2000);
  setTimeout(() => {
    clearInterval(timer);
    const use = samples.slice(1); // first CPU sample is always 0
    const avg = (k: 'cpu' | 'privateMB' | 'workingSetMB') => use.reduce((s, x) => s + x[k], 0) / Math.max(1, use.length);
    writeFileSync(outPath, JSON.stringify({
      samples: use.length,
      cpuPercent: +avg('cpu').toFixed(2),
      privateMB: +avg('privateMB').toFixed(1),
      workingSetMB: +avg('workingSetMB').toFixed(1),
      processes: app.getAppMetrics().map((p) => ({ type: p.type, privateMB: +((p.memory.privateBytes ?? 0) / 1024).toFixed(1), cpu: p.cpu.percentCPUUsage })),
    }, null, 2));
    app.quit();
  }, seconds * 1000);
}

/** Saves a PNG of `win` (`wholePage`: the settings window's full scrolling page), then quits. */
export async function screenshotAndQuit(win: BrowserWindow, path: string, wholePage: boolean): Promise<void> {
  await wait(1500);
  if (wholePage) {
    const h = await win.webContents.executeJavaScript('document.documentElement.scrollHeight') as number;
    win.setMaximumSize(0, 0);
    win.setContentSize(560, h);
    await wait(300);
  }
  writeFileSync(path, (await win.webContents.capturePage()).toPNG());
  app.quit();
}
