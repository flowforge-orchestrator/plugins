import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { EPHEMERAL_TOOL_BINS_SHELL } from './ephemeral-pack';

describe('EPHEMERAL_TOOL_BINS_SHELL', () => {
  it('executes an async function tool source without adding async twice', () => {
    const tools = JSON.stringify([
      {
        meta: { name: 'rag_search' },
        source: 'async function (input) { return `result:${input.query}`; }',
      },
    ]);
    const stdout = execFileSync(
      'sh',
      [
        '-c',
        `${EPHEMERAL_TOOL_BINS_SHELL}
TOOL_BIN_NAME=rag_search node /tmp/pack/bin/_tool_run telegram`,
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, TOOL_PROVIDER_TOOLS: tools },
      },
    );

    assert.equal(stdout, 'result:telegram');
  });
});
