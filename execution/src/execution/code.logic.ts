import { buildLanguageSpec } from './docker-args';
import { runDocker, type DockerResult } from './docker-runner';
import { runJavascript } from './javascript-sandbox';
import { assertSource, clampTimeout } from './limits';

export type CodeLanguage = 'javascript' | 'python' | 'shell';

export type CodeRequest = {
  language?: string;
  source: string;
  input?: unknown;
  timeoutMs?: number;
};

export type CodeResult = {
  value: unknown;
  stdout: string;
  stderr: string;
  exitCode: number;
};

export async function executeCode(
  request: CodeRequest,
  runner: (
    spec: { image: string; command: readonly string[]; env?: Record<string, string> },
    timeoutMs: number,
  ) => Promise<DockerResult> = runDocker,
): Promise<CodeResult> {
  const language = parseLanguage(request.language);
  const timeoutMs = clampTimeout(request.timeoutMs);
  const input = request.input ?? null;
  const source = assertSource(request.source);
  if (language === 'javascript') {
    const ran = runJavascript(source, input, timeoutMs);
    return { value: ran.value, stdout: ran.stdout, stderr: ran.stderr, exitCode: 0 };
  }
  const docker = await runner(buildLanguageSpec(language, source, JSON.stringify(input)), timeoutMs);
  return {
    value: valueFromStdout(docker.stdout),
    stdout: docker.stdout,
    stderr: docker.stderr,
    exitCode: docker.exitCode,
  };
}

function valueFromStdout(stdout: string): unknown {
  const line = stdout
    .split('\n')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .at(-1);
  if (!line) {
    return null;
  }
  try {
    return JSON.parse(line) as unknown;
  } catch {
    return line;
  }
}

export function parseLanguage(language: string | undefined): CodeLanguage {
  const normalized = (language ?? 'javascript').trim().toLowerCase();
  if (normalized === 'javascript' || normalized === 'python' || normalized === 'shell') {
    return normalized;
  }
  throw new Error('language must be javascript, python, or shell');
}
