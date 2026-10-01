import {
  chatMetricsSnapshot,
  noteChatGraph,
  noteChatLlm,
  noteChatQuestion,
  noteChatTurn,
  noteChatVector,
  resetChatMetricsForTests,
  usageFromLlmPayload,
} from './chat-metrics';

describe('chat metrics', () => {
  beforeEach(() => resetChatMetricsForTests());

  it('Zero: unknown run is empty', () => {
    expect(chatMetricsSnapshot('missing')).toMatchObject({
      turns: 0,
      tools: 0,
      vectorHits: 0,
    });
  });

  it('One: a search records hits separately from the graph expand', () => {
    noteChatQuestion('r', 'где теория короче?');
    noteChatTurn('r');
    noteChatVector('r', 8, 120, 3);
    expect(chatMetricsSnapshot('r')).toMatchObject({
      question: 'где теория короче?',
      turns: 1,
      tools: 1,
      vectorCalls: 1,
      vectorHits: 8,
      embedTokens: 120,
      graphCalls: 1,
      graphNodes: 3,
    });
  });

  it('Many: tokens add across calls', () => {
    noteChatLlm('r', {
      promptTokens: 10,
      completionTokens: 4,
      reasoningTokens: 1,
    });
    noteChatLlm('r', {
      promptTokens: 7,
      completionTokens: 2,
      reasoningTokens: 0,
    });
    noteChatGraph('r', 5);
    expect(chatMetricsSnapshot('r')).toMatchObject({
      llmCalls: 2,
      promptTokens: 17,
      completionTokens: 6,
      reasoningTokens: 1,
      tools: 1,
      graphNodes: 5,
    });
  });

  it('Exception: a blank run id is ignored', () => {
    noteChatTurn('');
    noteChatLlm('', {
      promptTokens: 1,
      completionTokens: 1,
      reasoningTokens: 1,
    });
    expect(chatMetricsSnapshot('')).toMatchObject({
      turns: 0,
      promptTokens: 0,
    });
  });

  it('reads Ollama and OpenAI usage shapes', () => {
    expect(
      usageFromLlmPayload({ prompt_eval_count: 11, eval_count: 3 }),
    ).toEqual({
      promptTokens: 11,
      completionTokens: 3,
      reasoningTokens: 0,
    });
    expect(
      usageFromLlmPayload({
        usage: {
          prompt_tokens: 5,
          completion_tokens: 2,
          completion_tokens_details: { reasoning_tokens: 9 },
        },
      }),
    ).toEqual({
      promptTokens: 5,
      completionTokens: 2,
      reasoningTokens: 9,
    });
  });
});
