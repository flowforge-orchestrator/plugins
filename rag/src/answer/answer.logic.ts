/** Build prompts for grounded multi-turn chat over retrieved context. */

export type ChatHistoryTurn = {
  role: 'user' | 'bot' | 'assistant';
  text: string;
};

export function normalizeHistory(raw: unknown): ChatHistoryTurn[] {
  if (raw == null || raw === '') return [];
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const out: ChatHistoryTurn[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const roleRaw = String((item as { role?: unknown }).role ?? '');
    const text = String(
      (item as { text?: unknown; content?: unknown }).text ??
        (item as { content?: unknown }).content ??
        '',
    ).trim();
    if (!text) continue;
    const role: ChatHistoryTurn['role'] =
      roleRaw === 'bot' || roleRaw === 'assistant' ? 'bot' : 'user';
    out.push({ role, text: text.slice(0, 800) });
  }
  return out.slice(-12);
}

export function buildAnswerSystemPrompt(): string {
  return [
    'You are a helpful RAG chat assistant over a document collection.',
    'Use ONLY the provided retrieval context for factual claims.',
    'Ground every name, number, and rule in the context; if a detail is missing, say so.',
    'When the user asks for a list or for completeness, enumerate DISTINCT organizations and documents present in the context (do not stop at the first 2–3 if more appear).',
    'If the context covers only a subset of the corpus, say that the answer is limited to the retrieved fragments and is not a full catalog.',
    'Conversation history is the prior turns of THIS chat — use it for follow-ups, pronouns, and "give examples"/clarifications.',
    'If the latest user message is small talk (hello, thanks, ok, yes/no without a clear question), reply briefly in kind and do NOT dump curriculum facts unless they clearly ask.',
    'If the user asks for examples or a list and the context does not contain them, say that clearly; do not invent names or repeat an earlier unrelated answer.',
    'If context is insufficient for the latest question, say so briefly instead of repeating a previous answer.',
    'Answer in the same language as the latest user message.',
    'Be concise. No chunk IDs, no raw hit dumps.',
    'Return a single JSON object: {"answer": string}.',
  ].join('\n');
}

export function buildAnswerUserPrompt(input: {
  message: string;
  context: string;
  history?: ChatHistoryTurn[];
}): string {
  return JSON.stringify(
    {
      history: (input.history ?? []).map((t) => ({
        role: t.role,
        text: t.text,
      })),
      message: input.message,
      context: input.context.slice(0, 12000),
    },
    null,
    2,
  );
}

export function parseAnswerPayload(payload: unknown): string {
  if (typeof payload === 'string' && payload.trim()) return payload.trim();
  if (payload && typeof payload === 'object') {
    const answer = (payload as { answer?: unknown }).answer;
    if (typeof answer === 'string' && answer.trim()) return answer.trim();
  }
  throw new Error('LLM answer payload missing answer string');
}

/** Enrich short follow-ups for hybrid search using the prior user question only.
 * Do not paste the previous bot answer — it re-biases retrieval toward the same docs.
 */
export function buildSearchQuery(input: {
  message: string;
  history: ChatHistoryTurn[];
}): string {
  const message = input.message.trim();
  if (!message) return message;
  const priorUsers = input.history
    .filter((t) => t.role === 'user')
    .map((t) => t.text.trim())
    .filter(Boolean);
  const lastUser = [...priorUsers].reverse().find((t) => t !== message);
  const looksShort =
    message.length < 80 ||
    /^(да|нет|ок|хорошо|привет|здравств|спасибо|а |и |еще|ещё|а что|какие|дай|примеры)/i.test(
      message,
    );
  if (!looksShort || !lastUser) return message;
  return [lastUser, message].filter(Boolean).join('\n');
}
