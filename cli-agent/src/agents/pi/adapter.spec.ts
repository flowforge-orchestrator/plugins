import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractPiJsonText, piAdapter } from './adapter';

describe('extractPiJsonText', () => {
  it('prefers final text-only assistant message over toolCall turn', () => {
    const stdout = [
      JSON.stringify({
        type: 'message_end',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'toolCall',
              name: 'bash',
              arguments: { command: '/workspace/bin/rag-search "Гек"' },
            },
          ],
        },
      }),
      JSON.stringify({
        type: 'message_end',
        message: {
          role: 'toolResult',
          content: [{ type: 'text', text: 'чужое купе' }],
        },
      }),
      JSON.stringify({
        type: 'message_end',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Ночью Гек по ошибке зашёл в чужое купе.',
            },
          ],
          stopReason: 'stop',
        },
      }),
    ].join('\n');
    assert.equal(
      extractPiJsonText(stdout),
      'Ночью Гек по ошибке зашёл в чужое купе.',
    );
  });

  it('ignores tool-markup text blobs', () => {
    const stdout = JSON.stringify({
      type: 'message_end',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: '```bashcall:bash{command:/workspace/bin/rag-search "x"}',
          },
        ],
      },
    });
    assert.equal(extractPiJsonText(stdout), '');
  });

  it('reads agent_end messages', () => {
    const stdout = JSON.stringify({
      type: 'agent_end',
      messages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'toolCall',
              arguments: { command: '/workspace/bin/rag-graph "Гек"' },
            },
          ],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Он зашёл в чужое купе.' }],
        },
      ],
    });
    assert.equal(extractPiJsonText(stdout), 'Он зашёл в чужое купе.');
  });
});

describe('piAdapter.plan', () => {
  it('pipes json mode through ndjson filter and appends pack hint', () => {
    const plan = piAdapter.plan({
      task: 'Что случилось с Геком?',
      provider: 'ollama',
      model: 'gemma4:12b-mlx',
      baseUrl: 'http://host.docker.internal:11434/v1',
      apiKey: 'ollama',
      tools: ['search', 'graph'],
      skills: [],
      workspaceMounted: false,
      mcpAttach: null,
      skillAttach: {
        version: 1,
        skills: [
          { name: 'graph-kg', body: '# g\n' },
          { name: 'vector-search', body: '# v\n' },
        ],
      },
      rulesAttach: {
        version: 1,
        rules: [{ name: 'AGENTS.md', body: '# a\n' }],
      },
    });
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.ok(plan.env.PI_NDJSON_FILTER);
    assert.ok(plan.command.some((c) => String(c).includes('PI_NDJSON_FILTER')));
    assert.ok(plan.command.includes('--append-system-prompt'));
    assert.ok(plan.command.includes('--skill'));
    assert.ok(plan.command.includes('bash'));
  });

  it('refuses MCP attach honestly (no native MCP client)', () => {
    const plan = piAdapter.plan({
      task: 'Что было в телеграмме?',
      provider: 'ollama',
      model: 'gemma4:12b-mlx',
      baseUrl: 'http://host.docker.internal:11434/v1',
      apiKey: 'ollama',
      tools: [],
      skills: [],
      workspaceMounted: false,
      mcpAttach: {
        version: 1,
        servers: [
          {
            id: 'tool-provider',
            transport: 'stdio',
            command: 'node',
            args: ['/tmp/tool-provider-mcp.mjs'],
            env: { TOOL_PROVIDER_TOOLS: '[]' },
          },
        ],
        toolNames: ['rag_search', 'rag_graph'],
      },
      skillAttach: null,
      rulesAttach: null,
    });
    assert.equal(plan.ok, false);
    if (plan.ok) return;
    assert.match(plan.reason, /no native MCP client/i);
  });
});
