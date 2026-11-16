import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LlmConfigExecutor } from './llm-config.executor';
import { parseLlmConfig } from './llm-config.types';

describe('llm-config', () => {
  it('packs provider/model/baseUrl/apiKey into llmConfig', async () => {
    const ex = new LlmConfigExecutor();
    const out = await ex.execute({
      inputs: {
        provider: 'ollama',
        model: 'gemma4:12b-mlx',
        baseUrl: 'http://host.docker.internal:11434/v1',
        apiKey: 'ollama',
      },
    } as never);
    assert.equal(out.status, 'ok');
    const cfg = parseLlmConfig(out.llmConfig);
    assert.ok(cfg);
    assert.equal(cfg!.provider, 'ollama');
    assert.equal(cfg!.model, 'gemma4:12b-mlx');
    assert.equal(cfg!.baseUrl, 'http://host.docker.internal:11434/v1');
    assert.equal(cfg!.apiKey, 'ollama');
  });

  it('rejects empty provider', async () => {
    const ex = new LlmConfigExecutor();
    const out = await ex.execute({
      inputs: { provider: '  ', apiKey: 'k' },
    } as never);
    assert.match(out.status, /^error:/);
    assert.equal(out.llmConfig, '');
  });
});
