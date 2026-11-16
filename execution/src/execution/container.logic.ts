import { buildContainerArgs, normalizeCommand, type ContainerSpec } from './docker-args';
import { runDocker, type DockerResult } from './docker-runner';
import { clampTimeout } from './limits';

export async function executeContainer(
  request: {
    image: string;
    command?: unknown;
    env?: Record<string, unknown>;
    timeoutMs?: number;
  },
  runner: (spec: ContainerSpec, timeoutMs: number) => Promise<DockerResult> = runDocker,
): Promise<Pick<DockerResult, 'exitCode' | 'stdout' | 'stderr'>> {
  const command = normalizeCommand(request.command);
  const spec: ContainerSpec = {
    image: request.image,
    command,
    env: stringEnv(request.env),
  };
  buildContainerArgs(spec);
  return runner(spec, clampTimeout(request.timeoutMs));
}

function stringEnv(env: Record<string, unknown> | undefined): Record<string, string> {
  if (!env) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      throw new Error(`env ${key} must be a string`);
    }
    out[key] = String(value);
  }
  return out;
}
