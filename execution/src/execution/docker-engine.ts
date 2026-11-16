import http from 'node:http';
import { dockerHostConfig, type ContainerSpec } from './docker-args';
import type { DockerResult } from './docker-runner';
import { clipOutput } from './limits';

const SOCKET = process.env.DOCKER_SOCKET?.trim() || '/var/run/docker.sock';

export async function runContainer(spec: ContainerSpec, timeoutMs: number): Promise<DockerResult> {
  await ensureImage(spec.image);
  const created = await dockerJson<{ Id?: string }>('POST', '/containers/create', {
    Image: spec.image,
    Cmd: spec.command.length > 0 ? [...spec.command] : undefined,
    Env: Object.entries(spec.env ?? {}).map(([key, value]) => `${key}=${value}`),
    HostConfig: dockerHostConfig(),
  });
  const id = created.body.Id;
  if (created.status >= 300 || !id) {
    throw new Error(`docker create failed: ${created.status} ${created.raw.slice(0, 300)}`);
  }
  try {
    const started = await dockerJson('POST', `/containers/${id}/start`);
    if (started.status >= 300 && started.status !== 304) {
      throw new Error(`docker start failed: ${started.status} ${started.raw.slice(0, 300)}`);
    }
    const finished = await dockerJson<{ StatusCode?: number }>(
      'POST',
      `/containers/${id}/wait`,
      undefined,
      timeoutMs,
    );
    const logs = await dockerRaw('GET', `/containers/${id}/logs?stdout=1&stderr=1`);
    const streams = demuxDockerLogs(logs.body);
    return {
      exitCode: finished.body.StatusCode ?? 1,
      stdout: clipOutput(streams.stdout),
      stderr: clipOutput(streams.stderr),
    };
  } finally {
    await dockerRaw('DELETE', `/containers/${id}?force=1`).catch(() => undefined);
  }
}

export function demuxDockerLogs(buffer: Buffer): { stdout: string; stderr: string } {
  if (!looksMultiplexed(buffer)) {
    return { stdout: buffer.toString('utf8'), stderr: '' };
  }
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  let offset = 0;
  while (offset + 8 <= buffer.length) {
    const stream = buffer[offset];
    const size = buffer.readUInt32BE(offset + 4);
    const start = offset + 8;
    const end = start + size;
    if (end > buffer.length) {
      break;
    }
    const chunk = buffer.subarray(start, end);
    if (stream === 2) {
      stderr.push(chunk);
    } else {
      stdout.push(chunk);
    }
    offset = end;
  }
  return {
    stdout: Buffer.concat(stdout).toString('utf8'),
    stderr: Buffer.concat(stderr).toString('utf8'),
  };
}

function looksMultiplexed(buffer: Buffer): boolean {
  if (buffer.length < 8) {
    return false;
  }
  const stream = buffer[0];
  if (stream !== 1 && stream !== 2) {
    return false;
  }
  const size = buffer.readUInt32BE(4);
  return size <= buffer.length - 8;
}

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
    throw new Error(`docker pull failed: ${pulled.status} ${pulled.body.toString('utf8').slice(0, 300)}`);
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
