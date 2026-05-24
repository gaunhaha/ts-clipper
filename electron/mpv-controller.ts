import { spawn, ChildProcess } from 'node:child_process';
import net from 'node:net';
import { randomBytes } from 'node:crypto';

type MpvEvent =
  | { type: 'time-pos'; value: number | null }
  | { type: 'duration'; value: number | null }
  | { type: 'pause'; value: boolean }
  | { type: 'volume'; value: number }
  | { type: 'mute'; value: boolean }
  | { type: 'eof' }
  | { type: 'file-loaded'; path: string }
  | { type: 'error'; message: string };

interface Pending {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
}

export interface MpvControllerOptions {
  mpvPath: string;
  wid: string;
  onEvent: (evt: MpvEvent) => void;
}

export class MpvController {
  private proc: ChildProcess | null = null;
  private socket: net.Socket | null = null;
  private pipeName = `ts-clipper-mpv-${randomBytes(6).toString('hex')}`;
  private pendings = new Map<number, Pending>();
  private nextRequestId = 1;
  private buffer = '';
  private currentFile: string | null = null;

  constructor(private opts: MpvControllerOptions) {}

  async start(): Promise<void> {
    const pipePath = `\\\\.\\pipe\\${this.pipeName}`;
    this.proc = spawn(
      this.opts.mpvPath,
      [
        `--wid=${this.opts.wid}`,
        `--input-ipc-server=${pipePath}`,
        '--idle=yes',
        '--force-window=yes',
        '--keep-open=yes',
        '--pause=yes',
        '--no-osc',
        '--no-osd-bar',
        '--no-input-default-bindings',
        '--no-input-builtin-bindings',
        '--no-terminal',
        '--hr-seek=yes',
        '--cache=yes',
        '--demuxer-lavf-probesize=10000000',
      ],
      { windowsHide: true, stdio: 'ignore' },
    );

    this.proc.on('exit', (code) => {
      this.opts.onEvent({
        type: 'error',
        message: `mpv 進程結束 (code=${code})`,
      });
      this.proc = null;
    });

    await this.connectPipe(pipePath);
    await this.observeProperties();
  }

  private connectPipe(pipePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tryConnect = (attempts: number) => {
        const s = net.createConnection(pipePath);
        const onError = (err: Error) => {
          s.destroy();
          if (attempts <= 0) return reject(err);
          setTimeout(() => tryConnect(attempts - 1), 100);
        };
        s.once('error', onError);
        s.once('connect', () => {
          s.off('error', onError);
          this.socket = s;
          s.on('data', (chunk) => this.onPipeData(chunk));
          s.on('error', (err) =>
            this.opts.onEvent({ type: 'error', message: `pipe error: ${err.message}` }),
          );
          s.on('close', () => {
            this.socket = null;
          });
          resolve();
        });
      };
      tryConnect(30);
    });
  }

  private async observeProperties() {
    // observe_property: [observe_property, id, name]
    await this.command(['observe_property', 1, 'time-pos']);
    await this.command(['observe_property', 2, 'duration']);
    await this.command(['observe_property', 3, 'pause']);
    await this.command(['observe_property', 4, 'eof-reached']);
    await this.command(['observe_property', 5, 'volume']);
    await this.command(['observe_property', 6, 'mute']);
  }

  private onPipeData(chunk: Buffer) {
    this.buffer += chunk.toString('utf8');
    let idx: number;
    while ((idx = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      try {
        this.onMessage(JSON.parse(line));
      } catch {
        // ignore non-JSON lines
      }
    }
  }

  private onMessage(msg: any) {
    if (msg.request_id !== undefined) {
      const p = this.pendings.get(msg.request_id);
      if (p) {
        this.pendings.delete(msg.request_id);
        if (msg.error && msg.error !== 'success') {
          p.reject(new Error(msg.error));
        } else {
          p.resolve(msg.data);
        }
      }
      return;
    }
    if (msg.event === 'property-change') {
      switch (msg.name) {
        case 'time-pos':
          this.opts.onEvent({ type: 'time-pos', value: msg.data ?? null });
          break;
        case 'duration':
          this.opts.onEvent({ type: 'duration', value: msg.data ?? null });
          break;
        case 'pause':
          this.opts.onEvent({ type: 'pause', value: !!msg.data });
          break;
        case 'eof-reached':
          if (msg.data) this.opts.onEvent({ type: 'eof' });
          break;
        case 'volume':
          this.opts.onEvent({ type: 'volume', value: Number(msg.data) || 0 });
          break;
        case 'mute':
          this.opts.onEvent({ type: 'mute', value: !!msg.data });
          break;
      }
    } else if (msg.event === 'file-loaded') {
      this.opts.onEvent({ type: 'file-loaded', path: this.currentFile ?? '' });
    }
  }

  command(command: unknown[]): Promise<unknown> {
    if (!this.socket) return Promise.reject(new Error('mpv pipe not connected'));
    const id = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      this.pendings.set(id, { resolve, reject });
      this.socket!.write(JSON.stringify({ command, request_id: id }) + '\n', (err) => {
        if (err) {
          this.pendings.delete(id);
          reject(err);
        }
      });
      setTimeout(() => {
        if (this.pendings.has(id)) {
          this.pendings.delete(id);
          reject(new Error('mpv command timeout'));
        }
      }, 5000);
    });
  }

  setProperty(name: string, value: unknown): Promise<unknown> {
    return this.command(['set_property', name, value]);
  }

  async loadFile(filePath: string) {
    this.currentFile = filePath;
    await this.command(['loadfile', filePath, 'replace']);
    await this.setProperty('pause', true);
  }

  dispose() {
    this.socket?.destroy();
    this.socket = null;
    if (this.proc && !this.proc.killed) {
      try {
        this.proc.kill();
      } catch {
        // ignore
      }
    }
    this.proc = null;
  }
}
