import type { UsageParse } from './types';

/** Parse a JSON blob (line or nested) that may contain OpenAI / kilo-style usage. */
export function parseOpenAiStyleUsage(text: string): UsageParse {
  const candidates = extractJsonObjects(text);
  for (const candidate of candidates) {
    const usage = findUsageRecord(candidate);
    if (!usage) continue;
    const inputTokens = asNumber(
      usage['input_tokens'] ??
        usage['prompt_tokens'] ??
        usage['inputTokens'] ??
        usage['input'],
    );
    const outputTokens = asNumber(
      usage['output_tokens'] ??
        usage['completion_tokens'] ??
        usage['outputTokens'] ??
        usage['output'],
    );
    const totalTokens = asNumber(
      usage['total_tokens'] ?? usage['totalTokens'] ?? usage['total'],
    );
    if (
      inputTokens !== undefined ||
      outputTokens !== undefined ||
      totalTokens !== undefined
    ) {
      return {
        usageKnown: true,
        inputTokens,
        outputTokens,
        totalTokens:
          totalTokens ??
          (inputTokens !== undefined && outputTokens !== undefined
            ? inputTokens + outputTokens
            : undefined),
      };
    }
  }
  return { usageKnown: false };
}

function findUsageRecord(
  root: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const direct = asRecord(root['usage']) ?? asRecord(root['tokens']);
  if (direct && hasTokenFields(direct)) return direct;
  if (hasTokenFields(root)) return root;
  // kilo step_finish: part.tokens.{input,output,total}
  const part = asRecord(root['part']);
  const partTokens = part ? asRecord(part['tokens']) : undefined;
  if (partTokens && hasTokenFields(partTokens)) return partTokens;
  // shallow walk one level for nested wrappers
  for (const value of Object.values(root)) {
    const rec = asRecord(value);
    if (!rec) continue;
    const nested = asRecord(rec['usage']) ?? asRecord(rec['tokens']);
    if (nested && hasTokenFields(nested)) return nested;
    if (hasTokenFields(rec)) return rec;
  }
  return undefined;
}

function hasTokenFields(rec: Record<string, unknown>): boolean {
  return (
    asNumber(
      rec['input_tokens'] ??
        rec['prompt_tokens'] ??
        rec['inputTokens'] ??
        rec['input'] ??
        rec['output_tokens'] ??
        rec['completion_tokens'] ??
        rec['outputTokens'] ??
        rec['output'] ??
        rec['total_tokens'] ??
        rec['totalTokens'] ??
        rec['total'],
    ) !== undefined
  );
}

function extractJsonObjects(text: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) {
      continue;
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (isRecord(parsed)) {
        out.push(parsed);
      }
    } catch {
      // ignore
    }
  }
  if (out.length === 0) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
        if (isRecord(parsed)) {
          out.push(parsed);
        }
      } catch {
        // ignore
      }
    }
  }
  return out;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
