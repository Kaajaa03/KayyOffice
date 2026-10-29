import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { MAX_BODY_BYTES, parseEvent } from './validate';
import type { AgentEvent } from '../shared/types';

export interface ServerOptions {
  token: string;
  port: number;
  onEvent: (e: AgentEvent) => void;
}

export interface RunningServer {
  port: number;
  address: string;
  close(): Promise<void>;
}

const HOST = '127.0.0.1';
const MAX_PORT_TRIES = 20;

export function startServer(opts: ServerOptions): Promise<RunningServer> {
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/event') return void res.writeHead(404).end();
    if (req.headers['x-kayy-token'] !== opts.token) return void res.writeHead(401).end();

    const chunks: Buffer[] = [];
    let size = 0;
    let rejected = false;
    req.on('data', (c: Buffer) => {
      if (rejected) return;
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        rejected = true;
        chunks.length = 0;
        res.writeHead(413, { Connection: 'close' }).end();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (rejected) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        return void res.writeHead(400).end();
      }
      const event = parseEvent(parsed);
      if (!event) return void res.writeHead(400).end();
      opts.onEvent(event);
      res.writeHead(204).end();
    });
  });

  return new Promise((resolve, reject) => {
    let port = opts.port;
    let tries = 0;
    const onError = (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && ++tries < MAX_PORT_TRIES) {
        port += 1;
        server.listen(port, HOST);
      } else reject(err);
    };
    server.on('error', onError);
    server.on('listening', () => {
      server.off('error', onError);
      const a = server.address() as AddressInfo;
      resolve({
        port: a.port,
        address: a.address,
        close: () =>
          new Promise<void>((r) => {
            server.close(() => r());
            server.closeAllConnections();
          }),
      });
    });
    server.listen(port, HOST);
  });
}
