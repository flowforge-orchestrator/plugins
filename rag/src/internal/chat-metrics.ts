export type ChatUsage = {
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
};

export type ChatMetrics = {
  question: string;
  turns: number;
  llmCalls: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  tools: number;
  vectorCalls: number;
  vectorHits: number;
  graphCalls: number;
  graphNodes: number;
  embedTokens: number;
};

type Bucket = ChatMetrics & { at: number };

const runs = new Map<string, Bucket>();
const MAX_RUNS = 200;

function empty(): ChatMetrics {
  return {
    question: '',
    turns: 0,
    llmCalls: 0,
    promptTokens: 0,
    completionTokens: 0,
    reasoningTokens: 0,
    tools: 0,
    vectorCalls: 0,
    vectorHits: 0,
    graphCalls: 0,
    graphNodes: 0,
    embedTokens: 0,
  };
}

function bucket(runId: string): Bucket {
  let row = runs.get(runId);
  if (!row) {
    if (runs.size >= MAX_RUNS) {
      let oldestId = '';
      let oldestAt = Infinity;
      for (const [id, item] of runs) {
        if (item.at < oldestAt) {
          oldestAt = item.at;
          oldestId = id;
        }
      }
      if (oldestId) runs.delete(oldestId);
    }
    row = { ...empty(), at: Date.now() };
    runs.set(runId, row);
  }
  row.at = Date.now();
  return row;
}

export function noteChatQuestion(runId: string, message: string): void {
  const text = message.trim();
  if (!runId || !text) return;
  const row = bucket(runId);
  if (!row.question) row.question = text.slice(0, 180);
}

export function noteChatTurn(runId: string): void {
  if (!runId) return;
  bucket(runId).turns += 1;
}

export function noteChatLlm(runId: string, usage: ChatUsage): void {
  if (!runId) return;
  const row = bucket(runId);
  row.llmCalls += 1;
  row.promptTokens += usage.promptTokens;
  row.completionTokens += usage.completionTokens;
  row.reasoningTokens += usage.reasoningTokens;
}

export function noteChatTool(runId: string): void {
  if (!runId) return;
  bucket(runId).tools += 1;
}

export function noteChatVector(
  runId: string,
  hits: number,
  embedTokens = 0,
  graphNodes = 0,
): void {
  if (!runId) return;
  const row = bucket(runId);
  row.tools += 1;
  row.vectorCalls += 1;
  row.vectorHits += nonNeg(hits);
  row.embedTokens += nonNeg(embedTokens);
  row.graphCalls += 1;
  row.graphNodes += nonNeg(graphNodes);
}

export function noteChatGraph(runId: string, nodes: number): void {
  if (!runId) return;
  const row = bucket(runId);
  row.tools += 1;
  row.graphCalls += 1;
  row.graphNodes += nonNeg(nodes);
}

export function chatMetricsSnapshot(runId: string): ChatMetrics {
  const row = runId ? runs.get(runId) : undefined;
  if (!row) return empty();
  return {
    question: row.question,
    turns: row.turns,
    llmCalls: row.llmCalls,
    promptTokens: row.promptTokens,
    completionTokens: row.completionTokens,
    reasoningTokens: row.reasoningTokens,
    tools: row.tools,
    vectorCalls: row.vectorCalls,
    vectorHits: row.vectorHits,
    graphCalls: row.graphCalls,
    graphNodes: row.graphNodes,
    embedTokens: row.embedTokens,
  };
}

export function resetChatMetricsForTests(): void {
  runs.clear();
}

function nonNeg(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

function pos(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

export function usageFromLlmPayload(data: unknown): ChatUsage {
  const row =
    data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const usage =
    row.usage && typeof row.usage === 'object'
      ? (row.usage as Record<string, unknown>)
      : {};
  const details =
    usage.completion_tokens_details &&
    typeof usage.completion_tokens_details === 'object'
      ? (usage.completion_tokens_details as Record<string, unknown>)
      : {};
  return {
    promptTokens: pos(usage.prompt_tokens) || pos(row.prompt_eval_count),
    completionTokens: pos(usage.completion_tokens) || pos(row.eval_count),
    reasoningTokens: pos(details.reasoning_tokens),
  };
}
