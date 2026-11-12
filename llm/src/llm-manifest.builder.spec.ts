import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LlmPluginManifestBuilder } from './llm-manifest.builder';

const GENERATION_EXECUTOR_IDS = [
  'llm.openai.generate',
  'llm.ollama.generate',
  'plugin.huggingface.inference',
] as const;

describe('published llm manifest', () => {
  it('includes OpenAI, Ollama, and Hugging Face Inference executors', () => {
    const manifest = new LlmPluginManifestBuilder().buildManifestRequest();
    const executorIds = manifest.executors.map((executor) => executor.nodeType);

    assert.equal(manifest.kind, 'plugin_manifest_request_v2');
    assert.equal(manifest.pluginId, 'llm');
    for (const id of GENERATION_EXECUTOR_IDS) {
      assert.ok(executorIds.includes(id), id);
    }
  });
});
