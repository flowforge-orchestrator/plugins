/**
 * Top-30 agent-run metrics for Graph pack / CLI agents.
 * Values are null when not observable from a single CLI run.
 * Offline/matrix layers fill judge/business fields later.
 */

export const METRIC_KEYS = [
  // 1. Agentic
  'taskSuccessRate',
  'toolCallSuccessRate',
  'averageStepsPerTask',
  'infiniteLoopRate',
  'planAdherenceRate',
  // 2. Quality
  'hallucinationRate',
  'faithfulnessGroundedness',
  'answerRelevance',
  'llmJudgeScore',
  'structuredOutputValidityRate',
  // 3. Performance
  'endToEndLatencyMs',
  'timeToFirstTokenMs',
  'timePerOutputTokenMs',
  'toolExecutionLatencyMs',
  // 4. Cost (I/O token ratio lives in extras.inputOutputTokenRatio)
  'averageCostPerTask',
  'totalTokensPerTask',
  'promptCacheHitRate',
  'contextWindowUtilizationRate',
  // 5. Reliability
  'apiErrorRate',
  'retryRate',
  'fallbackModelRate',
  'toolDependencyFailureRate',
  // 6. UX / business
  'userSatisfaction',
  'taskAbandonmentRate',
  'averageConversationTurns',
  'costPerSuccessfulTask',
  // 7. Safety
  'piiLeakageRate',
  'promptInjectionDetectionRate',
  'toxicityScore',
  'falseRefusalRate',
] as const;

export type MetricKey = (typeof METRIC_KEYS)[number];

export type MetricValue = number | null;

export type RunMetrics = Record<MetricKey, MetricValue> & {
  /** Observability extras (not in C-level 30, but needed for debugging). */
  extras: {
    agentSlug: string;
    status: string;
    exitCode: number;
    /** Original task / query text for downstream extractors. */
    task: string;
    prefetchPresent: boolean;
    toolCallsDetected: number;
    toolCallsSucceeded: number;
    ragSearchCalls: number;
    ragGraphCalls: number;
    repeatedToolCallPairs: number;
    groundedTokenOverlap: number | null;
    freestyleCodingSignals: number;
    usageKnown: boolean;
    inputTokens: number | null;
    outputTokens: number | null;
    inputOutputTokenRatio: number | null;
    workspaceMounted: boolean;
    /** Cleaned final answer text (for extractors / scoring). */
    answerText: string;
    /** Expected literal from task when pattern is known (e.g. "exactly: pong"). */
    expectedText: string | null;
  };
};

// Executed invocations only (not PROTOCOL prose mentioning the paths).
const BIN_SEARCH =
  /(?:^|[\$>#]\s*|exec(?:ute)?\s+)\/workspace\/bin\/rag-search\b/gim;
const BIN_GRAPH =
  /(?:^|[\$>#]\s*|exec(?:ute)?\s+)\/workspace\/bin\/rag-graph\b/gim;
const BIN_ADD =
  /(?:^|[\$>#]\s*|exec(?:ute)?\s+)\/workspace\/bin\/add\b/gim;
// JSON / tool-call envelopes (pi --mode json, opencode/kilo --format json, etc.)
const BIN_SEARCH_JSON = /"command"\s*:\s*"[^"]*rag-search[^"]*"/gim;
const BIN_GRAPH_JSON = /"command"\s*:\s*"[^"]*rag-graph[^"]*"/gim;
const BIN_ADD_JSON = /"command"\s*:\s*"[^"]*\/workspace\/bin\/add[^"]*"/gim;
// Local MCP tools: count only structured invocation envelopes — not prose
// that names the tool («cannot find rag_search», skills text, PROTOCOL).
const MCP_SEARCH =
  /"(?:name|tool|toolName)"\s*:\s*"[^"]*rag_search"|"server"\s*:\s*"tool-provider"[^}]*"tool"\s*:\s*"[^"]*rag_search"/gim;
const MCP_GRAPH =
  /"(?:name|tool|toolName)"\s*:\s*"[^"]*rag_graph"|"server"\s*:\s*"tool-provider"[^}]*"tool"\s*:\s*"[^"]*rag_graph"/gim;
const HERMES_TOOL_CALLS = /Messages:\s*\d+\s*\([^)]*?(\d+)\s*tool calls?\)/i;
const TOOL_FAIL =
  /(?:command not found|No such file|ECONNRESET|ETIMEDOUT|exit code [1-9]|Traceback \(most recent call last\))/i;
const CODING_SIGNAL =
  /(?:git init|npm install|pip install|created file|writing to|diff --git|Applied edit|Whole rewrite)/i;
const PREFETCH_MARK = /##\s*Контекст retrieval/i;
const EXACT_EXPECTED =
  /(?:reply with exactly|respond with exactly|return exactly|output exactly|exactly)\s*[:：]?\s*[«"']?(.+?)[»"']?\s*$/im;
const REFUSAL =
  /(?:i(?:'|\s)?m sorry|i cannot|i can'?t help|as an ai|refuse|not able to|cannot assist)/i;

function countMatches(re: RegExp, text: string): number {
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  return [...text.matchAll(new RegExp(re.source, flags))].length;
}

function tokenSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 3),
  );
}

function overlapRatio(answer: string, context: string): number | null {
  const a = tokenSet(answer);
  const c = tokenSet(context);
  if (a.size === 0 || c.size === 0) {
    return null;
  }
  let hit = 0;
  for (const t of a) {
    if (c.has(t)) {
      hit += 1;
    }
  }
  return hit / a.size;
}

function extractPrefetchContext(task: string): string {
  const idx = task.search(PREFETCH_MARK);
  if (idx < 0) {
    return '';
  }
  return task.slice(idx);
}

/** Pull "exactly: X" / similar expected literals from the task prompt. */
export function parseExactExpected(task: string): string | null {
  const match = task.match(EXACT_EXPECTED);
  if (!match?.[1]) return null;
  return match[1].trim();
}

/** Pull expected sum from "What is A plus B?" style prompts. */
export function parseSumExpected(task: string): string | null {
  const match = task.match(
    /what is\s+(-?\d+(?:\.\d+)?)\s+plus\s+(-?\d+(?:\.\d+)?)/i,
  );
  if (!match?.[1] || !match[2]) return null;
  const sum = Number(match[1]) + Number(match[2]);
  if (!Number.isFinite(sum)) return null;
  return String(sum);
}

const META_LINE =
  /^(?:query\s*:|tokens?\s*:|messages?\s*:|cost\s*:|session\s*:|title\s*:|duration\s*:|latency|prompt tokens|completion tokens|input tokens|output tokens|initializing |resume this session|hermes --resume|hermes -c |\[diagnostic\]|\[model-fallback|\[state\/|\[agents\/|\[session-|\[openclaw\])/i;

function extractJsonAnswerField(raw: string): string | null {
  const terminal = raw.match(
    /"terminalReply"\s*:\s*\{[^}]*?"text"\s*:\s*"((?:\\.|[^"\\])*)"/,
  );
  if (terminal?.[1] != null) {
    try {
      return JSON.parse(`"${terminal[1]}"`) as string;
    } catch {
      return terminal[1];
    }
  }
  if (raw.startsWith('{') && raw.endsWith('}')) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const nested =
        (parsed['terminalReply'] as { text?: string } | undefined)?.text ??
        (parsed['result'] as { text?: string } | undefined)?.text ??
        parsed['text'] ??
        parsed['answer'] ??
        parsed['message'];
      if (typeof nested === 'string' && nested.trim()) {
        return nested.trim();
      }
    } catch {
      // fall through
    }
  }
  return null;
}

/** Normalize answer text: prefer last non-empty line, strip wrappers. */
export function cleanAnswerText(text: string, expected?: string | null): string {
  const raw = String(text || '').trim();
  if (!raw) return '';
  const hermesBox = raw.match(
    /╭─[^\n]*Hermes[^\n]*╮\r?\n([\s\S]*?)\r?\n╰─/,
  );
  if (hermesBox?.[1] != null) {
    const body = hermesBox[1]
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .join('\n')
      .trim();
    if (body) return body.slice(0, 2000);
  }
  const fromJson = extractJsonAnswerField(raw);
  if (fromJson) return fromJson.slice(0, 2000);

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(
      (l) =>
        l.length > 0 &&
        !l.startsWith('{') &&
        !l.startsWith('[') &&
        !l.startsWith('╭') &&
        !l.startsWith('╰') &&
        !l.startsWith('┌') &&
        !l.startsWith('└') &&
        !META_LINE.test(l),
    );
  if (expected) {
    const e = normalizeForMatch(expected);
    // Prefer a line that is exactly the expected answer over chatter that
    // merely contains it (e.g. Hermes "Query: Reply with exactly: pong").
    for (const line of lines) {
      if (normalizeForMatch(line) === e) return line.slice(0, 2000);
    }
    for (const line of lines) {
      const tokens = normalizeForMatch(line).split(' ').filter(Boolean);
      if (tokens.length > 0 && tokens.length <= 3 && tokens.includes(e)) {
        return line.slice(0, 2000);
      }
    }
    if (e && normalizeForMatch(raw).split(' ').includes(e)) {
      return expected;
    }
  }
  if (lines.length === 0) {
    return raw.slice(0, 2000);
  }
  return lines[lines.length - 1]!.slice(0, 2000);
}

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 1 if answer matches expected literally / as a token; 0 if not; null if unknown. */
export function scoreExactMatch(
  answer: string,
  expected: string | null,
): number | null {
  if (!expected) return null;
  const a = normalizeForMatch(answer);
  const e = normalizeForMatch(expected);
  if (!a || !e) return 0;
  if (a === e) return 1;
  const tokens = a.split(' ').filter(Boolean);
  if (tokens.includes(e)) return 1;
  if (a.includes(e) && e.length >= 2) return 1;
  return 0;
}

function emptyMetrics(): RunMetrics {
  const base = Object.fromEntries(
    METRIC_KEYS.map((k) => [k, null]),
  ) as Record<MetricKey, MetricValue>;
  return {
    ...base,
    extras: {
      agentSlug: '',
      status: '',
      exitCode: 0,
      task: '',
      prefetchPresent: false,
      toolCallsDetected: 0,
      toolCallsSucceeded: 0,
      ragSearchCalls: 0,
      ragGraphCalls: 0,
      repeatedToolCallPairs: 0,
      groundedTokenOverlap: null,
      freestyleCodingSignals: 0,
      usageKnown: false,
      inputTokens: null,
      outputTokens: null,
      inputOutputTokenRatio: null,
      workspaceMounted: false,
      answerText: '',
      expectedText: null,
    },
  };
}

export type CollectMetricsInput = {
  agentSlug: string;
  task: string;
  text: string;
  stdout: string;
  stderr: string;
  status: string;
  exitCode: number;
  latencyMs: number;
  usageKnown: boolean;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  workspaceMounted: boolean;
  /** Gold-bank / matrix scored success (0|1); null if unknown. */
  taskSuccess?: number | null;
  /** Structured MCQ / schema validity (0|1); null if unknown. */
  structuredValid?: number | null;
};

/**
 * Fill metrics that are observable from one CLI container run.
 * Judge/business/safety rates stay null until an offline layer sets them.
 */
export function collectRunMetrics(input: CollectMetricsInput): RunMetrics {
  const m = emptyMetrics();
  // Do not scan `task` — PROTOCOL text names the bins and would false-positive.
  const blob = `${input.stdout}\n${input.stderr}`;
  const prefetchCtx = extractPrefetchContext(input.task);
  let ragSearchCalls =
    countMatches(BIN_SEARCH, blob) +
    countMatches(BIN_SEARCH_JSON, blob) +
    countMatches(MCP_SEARCH, blob);
  let ragGraphCalls =
    countMatches(BIN_GRAPH, blob) +
    countMatches(BIN_GRAPH_JSON, blob) +
    countMatches(MCP_GRAPH, blob);
  const addCalls =
    countMatches(BIN_ADD, blob) + countMatches(BIN_ADD_JSON, blob);
  const hermesToolMatch = blob.match(HERMES_TOOL_CALLS);
  const hermesToolCalls = hermesToolMatch
    ? Number(hermesToolMatch[1])
    : 0;
  let toolCallsDetected = ragSearchCalls + ragGraphCalls + addCalls;
  if (hermesToolCalls > toolCallsDetected) {
    toolCallsDetected = hermesToolCalls;
  }
  const toolFailed = TOOL_FAIL.test(blob) ? 1 : 0;
  const toolCallsSucceeded = Math.max(0, toolCallsDetected - toolFailed);
  const freestyleCodingSignals = countMatches(CODING_SIGNAL, blob);
  // crude repeat detector: identical rag-* command lines
  const toolLines = blob
    .split('\n')
    .map((l) => l.trim())
    .filter((l) =>
      /(?:^|[\$>#]\s*)\/workspace\/bin\/(rag-(search|graph)|add)\b/.test(l),
    );
  const seen = new Set<string>();
  let repeated = 0;
  for (const line of toolLines) {
    if (seen.has(line)) {
      repeated += 1;
    } else {
      seen.add(line);
    }
  }

  const grounded = overlapRatio(input.text || input.stdout, prefetchCtx);
  const inTok = input.usageKnown ? (input.inputTokens ?? null) : null;
  const outTok = input.usageKnown ? (input.outputTokens ?? null) : null;
  const totalTok = input.usageKnown
    ? (input.totalTokens ??
      (inTok != null && outTok != null ? inTok + outTok : null))
    : null;

  const expectedText =
    parseExactExpected(input.task) || parseSumExpected(input.task);
  const answerText = cleanAnswerText(
    input.text || input.stdout,
    expectedText,
  );
  const exactScore = scoreExactMatch(answerText, expectedText);
  const taskSuccess =
    input.taskSuccess !== undefined
      ? input.taskSuccess
      : exactScore;
  const structuredValid =
    input.structuredValid !== undefined
      ? input.structuredValid
      : exactScore;

  m.endToEndLatencyMs = input.latencyMs;
  m.averageStepsPerTask = toolCallsDetected > 0 ? toolCallsDetected : 1;
  m.toolCallSuccessRate =
    toolCallsDetected > 0 ? toolCallsSucceeded / toolCallsDetected : null;
  m.infiniteLoopRate = toolCallsDetected >= 2 ? repeated / toolCallsDetected : 0;
  m.apiErrorRate = input.status === 'error' ? 1 : 0;
  m.toolDependencyFailureRate =
    toolCallsDetected > 0 && toolFailed > 0 ? 1 : 0;
  m.faithfulnessGroundedness = grounded;
  m.totalTokensPerTask = totalTok;
  const ioRatio =
    inTok != null && outTok != null && outTok > 0 ? inTok / outTok : null;
  m.timePerOutputTokenMs =
    outTok != null && outTok > 0 ? input.latencyMs / outTok : null;
  m.averageConversationTurns = 1;
  m.taskSuccessRate = taskSuccess;
  m.structuredOutputValidityRate = structuredValid;
  // Exact-task relevance proxy: overlap of answer tokens with expected literal.
  if (expectedText) {
    m.answerRelevance = exactScore;
  }
  // Single-shot CLI run: no retries / fallback / abandonment observed.
  if (input.status === 'ok' || input.status === 'error') {
    m.retryRate = 0;
    m.fallbackModelRate = 0;
    m.taskAbandonmentRate = input.status === 'ok' ? 0 : null;
  }
  if (expectedText && input.status === 'ok') {
    m.falseRefusalRate = REFUSAL.test(answerText) && exactScore === 0 ? 1 : 0;
  }
  if (taskSuccess === 1 && totalTok != null) {
    // No price table yet — keep averageCost null; successful-task cost stays null.
    m.costPerSuccessfulTask = null;
  }

  m.extras = {
    agentSlug: input.agentSlug,
    status: input.status,
    exitCode: input.exitCode,
    task: input.task,
    // Legacy field: evidence prefetch was removed; always false.
    prefetchPresent: false,
    toolCallsDetected,
    toolCallsSucceeded,
    ragSearchCalls,
    ragGraphCalls,
    repeatedToolCallPairs: repeated,
    groundedTokenOverlap: grounded,
    freestyleCodingSignals,
    usageKnown: input.usageKnown,
    inputTokens: inTok,
    outputTokens: outTok,
    inputOutputTokenRatio: ioRatio,
    workspaceMounted: input.workspaceMounted,
    answerText,
    expectedText,
  };

  return m;
}

export function metricsToJson(metrics: RunMetrics): string {
  return JSON.stringify(metrics);
}
