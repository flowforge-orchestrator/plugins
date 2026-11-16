import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GigachatConfigExecutor } from './gigachat-config.executor';
import { parseLlmConfig } from './llm-config.types';
import {
  GIGACHAT_BUSINESS_OPENAI_BASE_URL,
  GIGACHAT_PERS_OPENAI_BASE_URL,
  type FetchLike,
} from './gigachat-oauth';

describe('gigachat-config', () => {
  it('packs custom + access token into api.giga.chat', async () => {
    const fetchImpl: FetchLike = async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ access_token: 'live-token', expires_at: 1 }),
    });
    const ex = new GigachatConfigExecutor();
    ex.fetchImpl = fetchImpl;
    const out = await ex.execute({
      inputs: {
        apiKey: 'auth-key',
        scope: 'GIGACHAT_API_PERS',
        model: 'GigaChat-2',
      },
    } as never);
    assert.equal(out.status, 'ok');
    const cfg = parseLlmConfig(out.llmConfig);
    assert.ok(cfg);
    assert.equal(cfg!.provider, 'custom');
    assert.equal(cfg!.model, 'GigaChat-2');
    assert.equal(cfg!.baseUrl, GIGACHAT_PERS_OPENAI_BASE_URL);
    assert.equal(cfg!.apiKey, 'live-token');
  });

  it('maps CORP scope to api.giga.chat', async () => {
    const fetchImpl: FetchLike = async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ access_token: 'tok' }),
    });
    const ex = new GigachatConfigExecutor();
    ex.fetchImpl = fetchImpl;
    const out = await ex.execute({
      inputs: { apiKey: 'auth-key', scope: 'GIGACHAT_API_CORP' },
    } as never);
    assert.equal(out.status, 'ok');
    const cfg = parseLlmConfig(out.llmConfig);
    assert.equal(cfg!.baseUrl, GIGACHAT_BUSINESS_OPENAI_BASE_URL);
  });

  it('rejects empty apiKey ref value', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error('should not fetch');
    };
    const ex = new GigachatConfigExecutor();
    ex.fetchImpl = fetchImpl;
    const out = await ex.execute({
      inputs: { apiKey: '  ' },
    } as never);
    assert.match(out.status, /^error:/);
    assert.equal(out.llmConfig, '');
  });

  it('surfaces oauth missing access_token', async () => {
    const fetchImpl: FetchLike = async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({}),
    });
    const ex = new GigachatConfigExecutor();
    ex.fetchImpl = fetchImpl;
    const out = await ex.execute({
      inputs: { apiKey: 'key' },
    } as never);
    assert.match(out.status, /missing access_token/);
    assert.equal(out.llmConfig, '');
  });
});
