import vm from 'node:vm';
import { assertSource } from './limits';

export type JavascriptRun = {
  value: unknown;
  stdout: string;
  stderr: string;
};

export function runJavascript(
  source: string,
  input: unknown,
  timeoutMs: number,
): JavascriptRun {
  const body = wrapSource(assertSource(source));
  const stdout: string[] = [];
  const stderr: string[] = [];
  const sandbox: Record<string, unknown> = Object.create(null);
  sandbox.input = input;
  sandbox.console = {
    log: (...args: unknown[]) => {
      stdout.push(args.map(stringifyArg).join(' '));
    },
    error: (...args: unknown[]) => {
      stderr.push(args.map(stringifyArg).join(' '));
    },
  };
  const context = vm.createContext(sandbox, {
    codeGeneration: { strings: false, wasm: false },
  });
  let value: unknown;
  try {
    value = new vm.Script(body).runInContext(context, { timeout: timeoutMs });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`javascript failed: ${message}`);
  }
  if (isPromise(value)) {
    throw new Error('javascript failed: async code is not supported');
  }
  return {
    value,
    stdout: stdout.join('\n'),
    stderr: stderr.join('\n'),
  };
}

function wrapSource(source: string): string {
  const trimmed = source.trim();
  if (
    trimmed.startsWith('function') ||
    trimmed.startsWith('(') ||
    trimmed.includes('=>')
  ) {
    return `"use strict";\nconst __fn = (${trimmed});\n__fn(input);`;
  }
  if (trimmed.includes('return')) {
    return `"use strict";\n(function(input){\n${trimmed}\n})(input);`;
  }
  return `"use strict";\n(function(input){\nreturn (${trimmed});\n})(input);`;
}

function stringifyArg(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isPromise(value: unknown): value is Promise<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}
