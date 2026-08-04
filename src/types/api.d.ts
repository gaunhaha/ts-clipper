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

type ProbeInfo = {
  duration: number;
  width: number;
  height: number;
  videoCodec: string;
  audioCodec: string;
  fps: number;
  encoders: string[];
};

type ExportResult = {
  ok: boolean;
  output: string;
  durationMs: number;
  message?: string;
};

type MpvEvent =
  | { type: 'time-pos'; value: number | null }
  | { type: 'duration'; value: number | null }
  | { type: 'pause'; value: boolean }
  | { type: 'volume'; value: number }
  | { type: 'mute'; value: boolean }
  | { type: 'eof' }
  | { type: 'file-loaded'; path: string }
  | { type: 'error'; message: string };

interface Window {
  api: {
    openTs: () => Promise<string | null>;
    saveMp4: (defaultName: string) => Promise<string | null>;
    saveImage: (defaultName: string) => Promise<string | null>;
    getPathForFile: (file: File) => string;
    setVideoBounds: (b: Bounds | null) => Promise<void>;
    mpv: {
      load: (filePath: string) => Promise<boolean>;
      command: (cmd: unknown[]) => Promise<unknown>;
      setProperty: (name: string, value: unknown) => Promise<unknown>;
      screenshot: (filePath: string) => Promise<string>;
      onEvent: (listener: (evt: MpvEvent) => void) => () => void;
    };
    ffmpeg: {
      probe: (filePath: string) => Promise<ProbeInfo>;
      export: (opts: ExportOpts) => Promise<ExportResult>;
      cancel: () => Promise<boolean>;
      onProgress: (
        listener: (p: { percent: number; frame: number; fps: number; speed: number }) => void,
      ) => () => void;
    };
    shell: {
      revealFile: (path: string) => Promise<void>;
    };
  };
}
