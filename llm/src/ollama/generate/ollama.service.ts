
export type OllamaGenerateParams = {
  baseUrl: string;
  model: string;
  systemPrompt?: string;
  userPrompt: string;
};

export type OllamaGenerateResult = {
  text: string;
  rawText: string;
  model?: string;
  doneReason?: string;
  promptEvalCount?: number;
  evalCount?: number;
  totalDuration?: number;
};

type OllamaStreamChunk = {
  model?: string;
  response?: string;
  message?: { role?: string; content?: string };
  done?: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  total_duration?: number;
  [k: string]: unknown;
};

export class OllamaHttpService {
  async generateText(
    params: OllamaGenerateParams,
  ): Promise<OllamaGenerateResult> {
    const base = params.baseUrl.replace(/\/$/, '');
    const url = `${base}/api/chat`;

    const messages: Array<{ role: string; content: string }> = [];
    if (params.systemPrompt) {
      messages.push({ role: 'system', content: params.systemPrompt });
    }
    messages.push({ role: 'user', content: params.userPrompt });

    const body = {
      model: params.model,
      messages,
      stream: true,
      keep_alive: '1h',
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      const hint =
        res.status === 500
          ? ' (Проверьте: 1) Executor и Ollama на одной машине или укажите OLLAMA_BASE_URL, напр. http://host.docker.internal:11434; 2) модель загружена: ollama run ' +
            params.model +
            ')'
          : '';
      throw new Error(
        `Ollama API error: ${res.status} ${res.statusText}${errText ? ` - ${errText}` : ''}${hint}`,
      );
    }

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error('Ollama response has no body');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    let lastChunk: OllamaStreamChunk | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const chunk = JSON.parse(trimmed) as OllamaStreamChunk;
          lastChunk = chunk;
          const content = chunk.message?.content ?? chunk.response;
          if (typeof content === 'string') {
            text += content;
          }
        } catch {
          // skip malformed lines
        }
      }
    }

    if (buffer.trim()) {
      try {
        const chunk = JSON.parse(buffer.trim()) as OllamaStreamChunk;
        lastChunk = chunk;
        const content = chunk.message?.content ?? chunk.response;
        if (typeof content === 'string') {
          text += content;
        }
      } catch {
        // skip
      }
    }

    const doneReason = lastChunk?.done_reason ?? '';

    if (doneReason === 'load') {
      throw new Error(
        'Ollama generation incomplete: model was still loading (done_reason=load). Retry after model loads.',
      );
    }

    return {
      text: text.trim(),
      rawText: text,
      model: lastChunk?.model ?? params.model,
      doneReason,
      promptEvalCount: lastChunk?.prompt_eval_count,
      evalCount: lastChunk?.eval_count,
      totalDuration: lastChunk?.total_duration,
    };
  }
}
