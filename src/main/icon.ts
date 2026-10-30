import { app } from 'electron';
import { join } from 'node:path';

/** App icon (ICO from `npm run icon`): tray and settings window; the packaged exe/installer get it via electron-builder. */
export const iconPath = (): string =>
  app.isPackaged ? join(process.resourcesPath, 'icon.ico') : join(app.getAppPath(), 'build', 'icon.ico');
