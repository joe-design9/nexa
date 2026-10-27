import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('nexaDesktop', {
  isDesktop: true,
  appVersion: process.env.npm_package_version ?? '1.0.0',
  /** 'admin' in der Admin-Version („Nexa Admin“), sonst 'standard'. */
  getBuildVariant: (): Promise<string> => ipcRenderer.invoke('nexa:get-build-variant') as Promise<string>,
  getServerUrl: (): Promise<string> => ipcRenderer.invoke('nexa:get-server-url') as Promise<string>,
  setServerUrl: (url: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('nexa:set-server-url', url) as Promise<{ ok: boolean; error?: string }>,
});
