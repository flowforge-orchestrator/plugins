const IMAGE_PATTERN = /^[a-z0-9][a-z0-9._:/-]{0,200}$/i;
const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const COMMAND_MAX_ARGS = 32;
const COMMAND_ARG_MAX = 4_096;

export const DOCKER_HARDENING = [
  '--rm',
  '--network',
  'none',
  '--memory',
  '256m',
  '--pids-limit',
  '64',
  '--read-only',
  '--cap-drop',
  'ALL',
  '--security-opt',
  'no-new-privileges',
  '--tmpfs',
  '/tmp:rw,noexec,nosuid,size=16m',
] as const;

export type ContainerSpec = {
  image: string;
  command: readonly string[];
  env?: Record<string, string>;
};

export type DockerHostConfig = {
  NetworkMode: 'none';
  Memory: number;
  PidsLimit: number;
  ReadonlyRootfs: true;
  CapDrop: ['ALL'];
  SecurityOpt: ['no-new-privileges:true'];
  Tmpfs: { '/tmp': 'rw,noexec,nosuid,size=16m' };
};

export function dockerHostConfig(): DockerHostConfig {
  return {
    NetworkMode: 'none',
    Memory: 256 * 1024 * 1024,
    PidsLimit: 64,
    ReadonlyRootfs: true,
    CapDrop: ['ALL'],
    SecurityOpt: ['no-new-privileges:true'],
    Tmpfs: { '/tmp': 'rw,noexec,nosuid,size=16m' },
  };
}

export function buildContainerArgs(spec: ContainerSpec): string[] {
  const image = assertImage(spec.image);
  const command = assertCommand(spec.command);
  const envArgs = envFlags(spec.env ?? {});
  return [...DOCKER_HARDENING, ...envArgs, image, ...command];
}

export function buildLanguageSpec(
  language: 'python' | 'shell',
  source: string,
  inputJson: string,
): ContainerSpec {
  const env = { EXEC_INPUT: inputJson, PYTHONDONTWRITEBYTECODE: '1', HOME: '/tmp' };
  if (language === 'python') {
    return {
      image: 'python:3.12-alpine',
      command: ['python', '-c', pythonProgram(source)],
      env,
    };
  }
  return {
    image: 'alpine:3.20',
    command: ['sh', '-c', source],
    env,
  };
}

export function normalizeCommand(raw: unknown): string[] {
  if (raw == null || raw === '') {
    return [];
  }
  if (Array.isArray(raw)) {
    return assertCommand(raw);
  }
  if (typeof raw === 'string') {
    return parseCommand(raw);
  }
  throw new Error('command must be a JSON array of strings');
}

export function parseCommand(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('[')) {
    throw new Error('command must be a JSON array of strings');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error('command must be a JSON array of strings');
  }
  if (!Array.isArray(parsed)) {
    throw new Error('command must be a JSON array of strings');
  }
  return assertCommand(parsed);
}

function assertImage(image: string): string {
  const trimmed = image.trim();
  if (!IMAGE_PATTERN.test(trimmed)) {
    throw new Error('image must be a registry reference without spaces');
  }
  return trimmed;
}

function assertCommand(command: readonly unknown[]): string[] {
  if (command.length > COMMAND_MAX_ARGS) {
    throw new Error(`command exceeds ${COMMAND_MAX_ARGS} arguments`);
  }
  return command.map((arg) => {
    if (typeof arg !== 'string') {
      throw new Error('command arguments must be strings');
    }
    if (arg.length === 0 || arg.length > COMMAND_ARG_MAX || arg.includes('\0')) {
      throw new Error('command argument is empty or too long');
    }
    return arg;
  });
}

function envFlags(env: Record<string, string>): string[] {
  const flags: string[] = [];
  for (const [key, value] of Object.entries(env)) {
    if (!ENV_KEY_PATTERN.test(key) || /[\r\n\0]/.test(value)) {
      throw new Error(`env key ${key} is not allowed`);
    }
    flags.push('-e', `${key}=${value}`);
  }
  return flags;
}

function pythonProgram(source: string): string {
  return [
    'import json, os',
    "input = json.loads(os.environ.get('EXEC_INPUT') or 'null')",
    source,
  ].join('\n');
}
