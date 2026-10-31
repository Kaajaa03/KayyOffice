import http from 'node:http';
import { NonceCache, responseProof, verifyAuth } from './auth';
import type { AddressInfo } from 'node:net';
import { MAX_BODY_BYTES, cleanLabel, parseEvent, str } from './validate';
import type { AgentEvent, PermissionAnswer, PermissionPayload } from '../shared/types';

export interface ServerOptions {
  token: string;
  port: number;
  onEvent: (e: AgentEvent) => void;
  /** Resolves with the user's decision; aborted when the client disconnects. */
  onPermission?: (p: PermissionPayload, signal: AbortSignal) => Promise<PermissionAnswer>;
}

interface RunningServer {
  port: number;
  address: string;
  close(): Promise<void>;
}

const HOST = '127.0.0.1';
const MAX_PORT_TRIES = 20;
const MAX_OPTIONS = 4;
const BODY_TIMEOUT_MS = 10_000;

/** Collects a size-limited body; answers 413 itself when the limit is exceeded. */
function readBody(req: http.IncomingMessage, res: http.ServerResponse, done: (body: Buffer) => void): void {
  const chunks: Buffer[] = [];
  let size = 0;
  let rejected = false;
  req.setTimeout(BODY_TIMEOUT_MS, () => req.destroy()); // a slow body must not hold the socket open
  req.on('error', () => {}); // aborted uploads are normal; nothing to answer
  req.on('data', (c: Buffer) => {
    if (rejected) return;
    size += c.length;
    if (size > MAX_BODY_BYTES) {
      rejected = true;
      chunks.length = 0;
      res.writeHead(413, { Connection: 'close' }).end(() => req.destroy());
      return;
    }
    chunks.push(c);
  });
  req.on('end', () => { if (!rejected) done(Buffer.concat(chunks)); });
}

function parsePermission(raw: unknown): PermissionPayload | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const sessionId = str(r.sessionId, 200);
  const agentId = str(r.agentId, 200);
  const tool = str(r.tool, 100);
  if (!sessionId || !agentId || !tool) return null;
  const summary = str(r.summary, 300) ?? '';
  if (r.options === undefined) return { sessionId, agentId, tool, summary };
  // A question card: only for AskUserQuestion, with 2-4 non-empty option labels; anything else is malformed.
  if (tool !== 'AskUserQuestion' || !Array.isArray(r.options) || r.options.length < 2 || r.options.length > MAX_OPTIONS) return null;
  const options = r.options.map((o) => cleanLabel(o, 80));
  if (!summary.trim() || options.some((o) => o === undefined)) return null;
  return { sessionId, agentId, tool, summary: cleanLabel(summary, 300)!, options: options as string[] };
}

export function startServer(opts: ServerOptions): Promise<RunningServer> {
  const nonces = new NonceCache();
  // Set once listening. Browsers always send the Host they navigated to, so a rebound DNS name
  // (evil.example -> 127.0.0.1) is refused here before any body is read.
  let allowedHosts: string[] = [];
  const server = http.createServer((req, res) => {
    if (!allowedHosts.includes(req.headers.host ?? '')) return void res.writeHead(421, { Connection: 'close' }).end();
    const route = req.url;
    if (req.method !== 'POST' || (route !== '/event' && route !== '/permission')) return void res.writeHead(404).end();

    readBody(req, res, (body) => {
      // Signed request (see auth.ts): the token itself never goes over the wire.
      const bodyText = body.toString('utf8');
      const nonce = req.headers['x-kayy-nonce'];
      if (!verifyAuth(opts.token, nonce, req.headers['x-kayy-auth'], route, bodyText) || !nonces.useOnce(nonce as string)) {
        return void res.writeHead(401).end();
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(bodyText);
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
      // The client trusts a decision only with a proof that binds nonce AND decision and needs the
      // token, so a process squatting on the port cannot forge an allow.
      // A clicked option goes out as decision "choice:<index>" (proof over exactly that string), only for a
      // question; the labels never travel back, the mod maps the index onto its own question.
      const reply = (answer: PermissionAnswer) => {
        if (res.writableEnded) return;
        const choice = typeof answer === 'object' ? answer.choice : undefined;
        const valid = choice === undefined || (payload.options !== undefined && Number.isInteger(choice) && choice >= 0 && choice < payload.options.length);
        const out = valid ? answer : 'ask';
        const proofOf = typeof out === 'object' ? `choice:${out.choice}` : out;
        res.writeHead(200, {
          'content-type': 'application/json',
          'x-kayy-proof': responseProof(opts.token, nonce as string, proofOf),
        }).end(JSON.stringify(typeof out === 'object' ? { decision: 'choice', choice: out.choice } : { decision: out }));
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
      allowedHosts = [`127.0.0.1:${a.port}`, `localhost:${a.port}`];
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
