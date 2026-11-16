import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ExecutionManifestBuilder } from './execution-manifest.builder';

const EXECUTION_EXECUTOR_IDS = [
  'plugin.execution.code',
  'plugin.execution.edge',
  'plugin.execution.container',
] as const;

describe('published execution manifest', () => {
  it('returns code, value transform, and one-shot container executors', () => {
    const manifest = new ExecutionManifestBuilder().buildManifestRequest();
    const executorIds = manifest.executors.map((executor) => executor.nodeType);

    assert.equal(manifest.kind, 'plugin_manifest_request_v2');
    assert.equal(manifest.pluginId, 'execution');
    assert.deepEqual(executorIds, [...EXECUTION_EXECUTOR_IDS]);
  });
});
