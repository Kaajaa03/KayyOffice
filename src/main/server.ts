import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { MAX_BODY_BYTES, parseEvent } from './validate';
import type { AgentEvent, PermissionDecision, PermissionPayload } from '../shared/types';

export interface ServerOptions {
  token: string;
  port: number;
  onEvent: (e: AgentEvent) => void;
  /** Resolves with the user's decision; aborted when the hook disconnects. */
  onPermission?: (p: PermissionPayload, signal: AbortSignal) => Promise<PermissionDecision>;
}

export interface RunningServer {
  port: number;
  address: string;
  close(): Promise<void>;
}

const HOST = '127.0.0.1';
const MAX_PORT_TRIES = 20;

/** Collects a size-limited body; answers 413 itself when the limit is exceeded. */
function readBody(req: http.IncomingMessage, res: http.ServerResponse, done: (body: Buffer) => void): void {
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
  req.on('end', () => { if (!rejected) done(Buffer.concat(chunks)); });
}

const s = (v: unknown, max: number): string | null => (typeof v === 'string' && v ? v.slice(0, max) : null);

function parsePermission(raw: unknown): PermissionPayload | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const sessionId = s(r.sessionId, 200);
  const agentId = s(r.agentId, 200);
  const tool = s(r.tool, 100);
  if (!sessionId || !agentId || !tool) return null;
  return { sessionId, agentId, tool, summary: typeof r.summary === 'string' ? r.summary.slice(0, 300) : '' };
}

export function startServer(opts: ServerOptions): Promise<RunningServer> {
  const server = http.createServer((req, res) => {
    const route = req.url;
    if (req.method !== 'POST' || (route !== '/event' && route !== '/permission')) return void res.writeHead(404).end();
    if (req.headers['x-kayy-token'] !== opts.token) return void res.writeHead(401).end();

    readBody(req, res, (body) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(body.toString('utf8'));
      } catch {
        return void res.writeHead(400).end();
      }

      if (route === '/event') {
        const event = parseEvent(parsed);
        if (!event) return void res.writeHead(400).end();
        opts.onEvent(event);
        return void res.writeHead(204).end();
      }

      const payload = parsePermission(parsed);
      if (!payload) return void res.writeHead(400).end();
      const reply = (decision: PermissionDecision) => {
        if (!res.writableEnded) res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ decision }));
      };
      if (!opts.onPermission) return reply('ask');
      const ac = new AbortController();
      res.on('close', () => { if (!res.writableFinished) ac.abort(); });
      opts.onPermission(payload, ac.signal).then(reply, () => reply('ask'));
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
