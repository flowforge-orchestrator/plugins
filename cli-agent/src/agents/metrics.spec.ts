import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hermesAdapter } from './hermes/adapter';
import {
  cleanAnswerText,
  collectRunMetrics,
  METRIC_KEYS,
  parseExactExpected,
  scoreExactMatch,
} from './metrics';

const HERMES_BLOB = [
  'Query: Reply with exactly: pong',
  'Initializing agent...',
  '╭─ ☤ Hermes ───────────────────────────────────────────────────────────────────╮',
  'pong',
  '╰──────────────────────────────────────────────────────────────────────────────╯',
  'Messages:       2 (1 user, 0 tool calls)',
].join('\n');

describe('collectRunMetrics', () => {
  it('exposes all 30 C-level keys', () => {
    assert.equal(METRIC_KEYS.length, 30);
  });

  it('scores exact-expected tasks from answer text', () => {
    const m = collectRunMetrics({
      agentSlug: 'crush',
      task: 'Reply with exactly: pong',
      text: 'pong',
      stdout: 'pong',
      stderr: '',
      status: 'ok',
      exitCode: 0,
      latencyMs: 900,
      usageKnown: false,
      workspaceMounted: true,
    });
    assert.equal(parseExactExpected('Reply with exactly: pong'), 'pong');
    assert.equal(scoreExactMatch('pong', 'pong'), 1);
    assert.equal(m.taskSuccessRate, 1);
    assert.equal(m.answerRelevance, 1);
    assert.equal(m.structuredOutputValidityRate, 1);
    assert.equal(m.falseRefusalRate, 0);
    assert.equal(m.retryRate, 0);
    assert.equal(m.extras.answerText, 'pong');
    assert.equal(m.extras.expectedText, 'pong');
  });

  it('cleans JSON envelopes down to answer text', () => {
    assert.equal(
      cleanAnswerText('{"terminalReply":{"text":"pong"}}'),
      'pong',
    );
  });

  it('prefers bare expected over Hermes Query echo', () => {
    assert.equal(cleanAnswerText(HERMES_BLOB, 'pong'), 'pong');
    assert.equal(hermesAdapter.extractText(HERMES_BLOB), 'pong');
  });

  it('does not treat retrieval context as prefetch adherence', () => {
    const m = collectRunMetrics({
      agentSlug: 'opencode',
      task: '## Задача\nq\n\n## Контекст retrieval\nВ Москве жили Чук и Гек',
      text: 'В Москве',
      stdout: 'В Москве',
      stderr: '',
      status: 'ok',
      exitCode: 0,
      latencyMs: 1200,
      usageKnown: false,
      workspaceMounted: true,
      taskSuccess: 1,
      structuredValid: 1,
    });
    assert.equal(m.extras.prefetchPresent, false);
    assert.equal(m.extras.toolCallsDetected, 0);
    assert.equal(m.taskSuccessRate, 1);
    assert.ok((m.faithfulnessGroundedness ?? 0) > 0);
  });

  it('detects freestyle tool use and coding signals', () => {
    const m = collectRunMetrics({
      agentSlug: 'aider',
      task: '## Контекст retrieval\nотец уезжал в командировку\nPROTOCOL: /workspace/bin/rag-search',
      text: 'ok',
      stdout:
        'git init\n$ /workspace/bin/rag-search "куда уезжал"\n$ /workspace/bin/rag-search "куда уезжал"\nnpm install foo\nMessages: 4 (1 user, 2 tool calls)',
      stderr: '',
      status: 'ok',
      exitCode: 0,
      latencyMs: 5000,
      usageKnown: true,
      inputTokens: 1700,
      outputTokens: 29,
      workspaceMounted: true,
    });
    assert.equal(m.extras.ragSearchCalls, 2);
    assert.ok((m.extras.freestyleCodingSignals ?? 0) >= 1);
    assert.ok((m.infiniteLoopRate ?? 0) > 0);
    assert.equal(m.extras.prefetchPresent, false);
  });

  it('counts JSON toolCall command envelopes', () => {
    const m = collectRunMetrics({
      agentSlug: 'pi',
      task: 'run /workspace/bin/rag-graph',
      text: 'ok',
      stdout:
        '{"type":"toolCall","name":"bash","arguments":{"command":"/workspace/bin/rag-graph \\"мать\\""}}',
      stderr: '',
      status: 'ok',
      exitCode: 0,
      latencyMs: 1000,
      usageKnown: false,
      workspaceMounted: true,
    });
    assert.equal(m.extras.ragGraphCalls, 1);
    assert.equal(m.extras.toolCallsDetected, 1);
  });

  it('does not count PROTOCOL path mentions as tool calls', () => {
    const m = collectRunMetrics({
      agentSlug: 'hermes',
      task: 'PROTOCOL: call /workspace/bin/rag-search only if needed\n## Контекст retrieval\nВ Москве',
      text: 'В Москве',
      stdout:
        'Query: PROTOCOL: call /workspace/bin/rag-search\nВ Москве\nMessages: 2 (1 user, 0 tool calls)',
      stderr: '',
      status: 'ok',
      exitCode: 0,
      latencyMs: 1000,
      usageKnown: false,
      workspaceMounted: true,
    });
    assert.equal(m.extras.toolCallsDetected, 0);
    assert.equal(m.extras.prefetchPresent, false);
  });

  it('does not count prose naming rag_search/rag_graph as tool calls', () => {
    const m = collectRunMetrics({
      agentSlug: 'hermes',
      task: 'Use rag_search and rag_graph',
      text: 'I cannot find an MCP tool named rag_search',
      stdout: [
        'I cannot find an MCP tool named rag_search.',
        'Running hermes mcp list confirms that no MCP servers are configured.',
        'Please add rag_search and rag_graph.',
        'Messages: 12 (1 user, 0 tool calls)',
      ].join('\n'),
      stderr: 'ERROR codex_core::tools::router: error=unsupported call: rag_search',
      status: 'ok',
      exitCode: 0,
      latencyMs: 1000,
      usageKnown: false,
      workspaceMounted: false,
    });
    assert.equal(m.extras.ragSearchCalls, 0);
    assert.equal(m.extras.ragGraphCalls, 0);
    assert.equal(m.extras.toolCallsDetected, 0);
    assert.equal(m.extras.toolCallsSucceeded, 0);
  });

  it('counts structured MCP tool_use envelopes', () => {
    const m = collectRunMetrics({
      agentSlug: 'claude-code',
      task: 'find telegram',
      text: 'ok',
      stdout:
        '{"type":"tool_use","name":"rag_search","input":{"query":"телеграмма"}}',
      stderr: '',
      status: 'ok',
      exitCode: 0,
      latencyMs: 1000,
      usageKnown: false,
      workspaceMounted: false,
    });
    assert.equal(m.extras.ragSearchCalls, 1);
    assert.equal(m.extras.toolCallsDetected, 1);
  });
});
