import { contextBridge, ipcRenderer } from 'electron';

type Bounds = { x: number; y: number; width: number; height: number };
type ExportOpts = {
  input: string;
  output: string;
  inSec: number;
  outSec: number;
  mode: 'copy' | 'reencode';
  encoder?: string;
  videoBitrateK?: number;
};

const api = {
  openTs: (): Promise<string | null> => ipcRenderer.invoke('dialog:openTs'),
  saveMp4: (defaultName: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:saveMp4', defaultName),
  saveImage: (defaultName: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:saveImage', defaultName),
  setVideoBounds: (b: Bounds | null) => ipcRenderer.invoke('video:setBounds', b),
  mpv: {
    load: (filePath: string) => ipcRenderer.invoke('mpv:load', filePath),
    command: (cmd: unknown[]) => ipcRenderer.invoke('mpv:command', cmd),
    setProperty: (name: string, value: unknown) =>
      ipcRenderer.invoke('mpv:setProperty', name, value),
    screenshot: (filePath: string): Promise<string> =>
      ipcRenderer.invoke('mpv:screenshot', filePath),
    onEvent: (listener: (evt: any) => void) => {
      const handler = (_: unknown, evt: unknown) => listener(evt);
      ipcRenderer.on('mpv:event', handler);
      return () => ipcRenderer.off('mpv:event', handler);
    },
  },
  ffmpeg: {
    probe: (filePath: string) => ipcRenderer.invoke('ffmpeg:probe', filePath),
    export: (opts: ExportOpts) => ipcRenderer.invoke('ffmpeg:export', opts),
    cancel: () => ipcRenderer.invoke('ffmpeg:cancel'),
    onProgress: (listener: (p: { percent: number; frame: number; fps: number; speed: number }) => void) => {
      const handler = (_: unknown, p: any) => listener(p);
      ipcRenderer.on('ffmpeg:progress', handler);
      return () => ipcRenderer.off('ffmpeg:progress', handler);
    },
  },
  shell: {
    revealFile: (p: string) => ipcRenderer.invoke('shell:revealFile', p),
  },
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
