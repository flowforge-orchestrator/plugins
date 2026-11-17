import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseOpenAiStyleUsage } from './usage';

describe('parseOpenAiStyleUsage', () => {
  it('reads usage only from machine JSON fixture', () => {
    const parsed = parseOpenAiStyleUsage(
      'hello\n{"usage":{"prompt_tokens":11,"completion_tokens":7,"total_tokens":18}}\n',
    );
    assert.deepEqual(parsed, {
      usageKnown: true,
      inputTokens: 11,
      outputTokens: 7,
      totalTokens: 18,
    });
  });

  it('does not infer tokens from prose length', () => {
    assert.deepEqual(parseOpenAiStyleUsage('a'.repeat(1000)), {
      usageKnown: false,
    });
  });

  it('reads nested kilo step_finish tokens', () => {
    const parsed = parseOpenAiStyleUsage(
      '{"type":"step_finish","part":{"tokens":{"total":14194,"input":14134,"output":52}}}\n',
    );
    assert.deepEqual(parsed, {
      usageKnown: true,
      inputTokens: 14134,
      outputTokens: 52,
      totalTokens: 14194,
    });
  });
});
