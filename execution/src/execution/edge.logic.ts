import { runJavascript } from './javascript-sandbox';
import { clampTimeout } from './limits';

export function executeEdge(request: {
  source: string;
  input?: unknown;
  timeoutMs?: number;
}): { value: unknown } {
  const ran = runJavascript(request.source, request.input ?? null, clampTimeout(request.timeoutMs));
  return { value: ran.value };
}
