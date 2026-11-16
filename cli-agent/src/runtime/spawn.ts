import http from 'node:http';
import { assertEnv, dockerHostConfig, type ContainerSpec } from './docker-args';
import { demuxDockerLogsCapped, type StreamAccounting } from './stream-accounting';

const SOCKET = process.env.DOCKER_SOCKET?.trim() || '/var/run/docker.sock';

export type SpawnResult = StreamAccounting & {
  exitCode: number;
  timedOut: boolean;
};

export type SpawnRunner = (
  spec: ContainerSpec,
  timeoutMs: number,
) => Promise<SpawnResult>;

/** Abort kills the running container; the run resolves with the logs read so far. */
export async function runContainer(
  spec: ContainerSpec,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<SpawnResult> {
  signal?.throwIfAborted();
  await ensureImage(spec.image);
  signal?.throwIfAborted();
  const env = assertEnv(spec.env ?? {});
  const created = await dockerJson<{ Id?: string }>('POST', '/containers/create', {
    Image: spec.image,
    Cmd: spec.command.length > 0 ? [...spec.command] : undefined,
    Env: Object.entries(env).map(([key, value]) => `${key}=${value}`),
    WorkingDir: spec.workingDir,
    HostConfig: dockerHostConfig(
      spec.workspaceHostPath,
      spec.extraBinds,
      spec.extraHosts,
    ),
  });
  const id = created.body.Id;
  if (created.status >= 300 || !id) {
    throw new Error(`docker create failed: ${created.status} ${created.raw.slice(0, 300)}`);
  }
  let timedOut = false;
  const kill = () => {
    void dockerRaw('POST', `/containers/${id}/kill`).catch(() => undefined);
  };
  signal?.addEventListener('abort', kill, { once: true });
  try {
    signal?.throwIfAborted();
    const started = await dockerJson('POST', `/containers/${id}/start`);
    if (started.status >= 300 && started.status !== 304) {
      throw new Error(`docker start failed: ${started.status} ${started.raw.slice(0, 300)}`);
    }
    let finished: { status: number; body: { StatusCode?: number }; raw: string };
    try {
      finished = await dockerJson<{ StatusCode?: number }>(
        'POST',
        `/containers/${id}/wait`,
        undefined,
        timeoutMs,
      );
    } catch (error) {
      timedOut = true;
      await dockerRaw('POST', `/containers/${id}/kill`).catch(() => undefined);
      const logs = await dockerRaw('GET', `/containers/${id}/logs?stdout=1&stderr=1`).catch(
        () => ({ status: 0, body: Buffer.alloc(0) }),
      );
      const streams = demuxDockerLogsCapped(logs.body);
      return {
        exitCode: 124,
        timedOut: true,
        ...streams,
      };
    }
    const logs = await dockerRaw('GET', `/containers/${id}/logs?stdout=1&stderr=1`);
    const streams = demuxDockerLogsCapped(logs.body);
    return {
      exitCode: finished.body.StatusCode ?? 1,
      timedOut,
      ...streams,
    };
  } finally {
    signal?.removeEventListener('abort', kill);
    await dockerRaw('DELETE', `/containers/${id}?force=1`).catch(() => undefined);
  }
}

export const defaultSpawnRunner: SpawnRunner = runContainer;

async function ensureImage(image: string): Promise<void> {
  const inspect = await dockerRaw('GET', `/images/${encodeURIComponent(image)}/json`);
  if (inspect.status === 200) {
    return;
  }
  const slash = image.lastIndexOf('/');
  const colon = image.lastIndexOf(':');
  const tag = colon > slash ? image.slice(colon + 1) : 'latest';
  const name = colon > slash ? image.slice(0, colon) : image;
  const pulled = await dockerRaw(
    'POST',
    `/images/create?fromImage=${encodeURIComponent(name)}&tag=${encodeURIComponent(tag)}`,
  );
  if (pulled.status >= 300) {
    throw new Error(
      `docker pull failed: ${pulled.status} ${pulled.body.toString('utf8').slice(0, 300)}`,
    );
  }
}

function dockerJson<T>(
  method: string,
  path: string,
  body?: unknown,
  timeoutMs?: number,
): Promise<{ status: number; body: T; raw: string }> {
  return dockerRaw(method, path, body, timeoutMs).then((response) => {
    const raw = response.body.toString('utf8');
    let parsed = {} as T;
    if (raw) {
      try {
        parsed = JSON.parse(raw) as T;
      } catch {
        parsed = {} as T;
      }
    }
    return { status: response.status, body: parsed, raw };
  });
}

function dockerRaw(
  method: string,
  path: string,
  body?: unknown,
  timeoutMs?: number,
): Promise<{ status: number; body: Buffer }> {
  const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        socketPath: SOCKET,
        path,
        method,
        headers: {
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': payload.length }
            : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) });
        });
      },
    );
    if (timeoutMs !== undefined) {
      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error('docker wait timed out'));
      });
    }
    req.on('error', reject);
    if (payload) {
      req.end(payload);
    } else {
      req.end();
    }
  });
}
