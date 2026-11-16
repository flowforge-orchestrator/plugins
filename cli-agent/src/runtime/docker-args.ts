import { MEMORY_BYTES, PIDS_LIMIT } from './limits';

const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type ContainerSpec = {
  image: string;
  command: readonly string[];
  env?: Record<string, string>;
  workspaceHostPath?: string | null;
  workingDir?: string;
  /** Extra host:container binds (e.g. CA bundle for custom HTTPS). */
  extraBinds?: string[];
  /** `host:ip` entries for /etc/hosts (e.g. `host.docker.internal:host-gateway`). */
  extraHosts?: string[];
};

export type DockerHostConfig = {
  NetworkMode: 'bridge';
  Memory: number;
  PidsLimit: number;
  ReadonlyRootfs: true;
  CapDrop: ['ALL'];
  SecurityOpt: ['no-new-privileges:true'];
  Tmpfs: Record<string, string>;
  Binds?: string[];
  ExtraHosts?: string[];
  PublishAllPorts: false;
};

export function dockerHostConfig(
  workspaceHostPath?: string | null,
  extraBinds?: readonly string[],
  extraHosts?: readonly string[],
): DockerHostConfig {
  const config: DockerHostConfig = {
    NetworkMode: 'bridge',
    Memory: MEMORY_BYTES,
    PidsLimit: PIDS_LIMIT,
    ReadonlyRootfs: true,
    CapDrop: ['ALL'],
    SecurityOpt: ['no-new-privileges:true'],
    Tmpfs: {
      // Ephemeral pack + MCP bridge live under /tmp; Cursor agent state under /home.
      // 64m/128m filled quickly with skills+MCP and caused "database or disk is full".
      '/tmp': 'rw,nosuid,size=512m',
      '/home': 'rw,nosuid,size=512m',
      '/root': 'rw,nosuid,size=256m',
    },
    PublishAllPorts: false,
  };
  const binds: string[] = [...(extraBinds ?? [])];
  if (workspaceHostPath) {
    binds.push(`${workspaceHostPath}:/workspace:rw`);
  }
  if (binds.length > 0) {
    config.Binds = binds;
  }
  if (extraHosts && extraHosts.length > 0) {
    config.ExtraHosts = [...extraHosts];
  }
  return config;
}

export function assertEnv(env: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (!ENV_KEY_PATTERN.test(key) || /[\r\n\0]/.test(value)) {
      throw new Error(`env key ${key} is not allowed`);
    }
    out[key] = value;
  }
  return out;
}
