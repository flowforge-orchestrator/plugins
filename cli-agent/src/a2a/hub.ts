import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { A2aError, type A2aSession } from './session';

const DEFAULT_PORT = 9419;
const BODY_MAX_BYTES = 256_000;

export type A2aHub = {
  /** Base URL agents use from inside their containers. */
  url: string;
  /** Docker ExtraHosts so `host.docker.internal` resolves on Linux engines. */
  extraHosts: string[];
  register(session: A2aSession): () => void;
  close(): Promise<void>;
};

export type A2aHubOptions = {
  port: number;
  host?: string;
  /** Override for the URL handed to agents; default `http://host.docker.internal:<port>`. */
  publicUrl?: string;
};

export function hubOptionsFromEnv(): A2aHubOptions {
  const port = Number(process.env.CLI_AGENT_A2A_PORT?.trim() || DEFAULT_PORT);
  return {
    port: Number.isFinite(port) && port > 0 ? port : DEFAULT_PORT,
    publicUrl: process.env.CLI_AGENT_A2A_URL?.trim() || undefined,
  };
}

export async function startA2aHub(options: A2aHubOptions): Promise<A2aHub> {
  const sessions = new Set<A2aSession>();
  const server = http.createServer((req, res) => {
    void route(sessions, req, res);
  });
  // Waits are bounded by waitSliceMs; keep sockets open past that.
  server.requestTimeout = 0;
  server.headersTimeout = 60_000;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host ?? '0.0.0.0', () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  const url = (options.publicUrl || `http://host.docker.internal:${port}`).replace(/\/$/, '');
  const extraHosts = new URL(url).hostname === 'host.docker.internal'
    ? ['host.docker.internal:host-gateway']
    : [];
  return {
    url,
    extraHosts,
    register(session) {
      sessions.add(session);
      return () => sessions.delete(session);
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

let shared: Promise<A2aHub> | null = null;

/** One hub per sidecar process, started on first factory run. */
export function sharedA2aHub(): Promise<A2aHub> {
  if (!shared) {
    shared = startA2aHub(hubOptionsFromEnv()).catch((error: unknown) => {
      shared = null;
      throw error;
    });
  }
  return shared;
}

async function route(
  sessions: Set<A2aSession>,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const match = /^\/a2a\/([a-z_]+)$/.exec(req.url ?? '');
  if (req.method !== 'POST' || !match) {
    send(404, { ok: false, error: 'not found' });
    return;
  }
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '')?.[1]?.trim();
  let session: A2aSession | undefined;
  let agentId: string | undefined;
  for (const s of token ? sessions : []) {
    agentId = s.agentIdByToken(token!);
    if (agentId) {
      session = s;
      break;
    }
  }
  if (!session || !agentId) {
    send(401, { ok: false, error: 'unknown or expired agent token' });
    return;
  }
  let args: Record<string, unknown>;
  try {
    args = await readJson(req);
  } catch (error) {
    send(400, { ok: false, error: error instanceof Error ? error.message : String(error) });
    return;
  }
  try {
    const result = await session.handle(agentId, match[1], args);
    send(200, { ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    send(error instanceof A2aError ? 200 : 500, { ok: false, error: message });
  }
}

function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > BODY_MAX_BYTES) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          reject(new Error('body must be a JSON object'));
          return;
        }
        resolve(value as Record<string, unknown>);
      } catch {
        reject(new Error('body is not JSON'));
      }
    });
    req.on('error', reject);
  });
}
