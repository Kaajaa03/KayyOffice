import { app } from 'electron';
import { writeFileSync } from 'node:fs';

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
