import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import {
  GIGACHAT_CONTENT_PROXY_BASE,
  GIGACHAT_PROXY_UPSTREAM_ENV,
  GIGACHAT_TRANSLATE_SOURCE,
  flattenMessageContent,
  gigachatContentProxyShell,
  installGigachatContentProxy,
  rewriteOpenAiBaseUrls,
} from './gigachat-content-proxy';

describe('gigachat content proxy', () => {
  it('leaves a string content unchanged', () => {
    assert.equal(flattenMessageContent('pong'), 'pong');
  });

  it('joins one text part into a string', () => {
    assert.equal(
      flattenMessageContent([{ type: 'text', text: 'pong' }]),
      'pong',
    );
  });

  it('joins many text parts and keeps a non-text part', () => {
    assert.equal(
      flattenMessageContent([
        { type: 'text', text: 'a' },
        'b',
        { type: 'image', url: 'x' },
      ]),
      'ab{"type":"image","url":"x"}',
    );
  });

  it('rewrites only the upstream base inside env and argv', () => {
    const upstream = 'https://api.giga.chat/v1';
    assert.equal(
      rewriteOpenAiBaseUrls(upstream, upstream),
      GIGACHAT_CONTENT_PROXY_BASE,
    );
    assert.equal(rewriteOpenAiBaseUrls('leave-me', upstream), 'leave-me');
    const spec = installGigachatContentProxy(
      {
        command: ['qwen', '--openai-base-url', upstream, '-p', 'hi'],
        env: {
          OPENAI_BASE_URL: upstream,
          OPENAI_API_KEY: 'tok',
        },
      },
      upstream,
    );
    assert.equal(spec.env.OPENAI_BASE_URL, GIGACHAT_CONTENT_PROXY_BASE);
    assert.equal(spec.env.OPENAI_API_KEY, 'tok');
    assert.equal(spec.env[GIGACHAT_PROXY_UPSTREAM_ENV], upstream);
    assert.equal(spec.command[0], 'sh');
    assert.ok(spec.command[2]?.includes('gigachat-openai-proxy.mjs'));
    assert.ok(spec.command.includes(GIGACHAT_CONTENT_PROXY_BASE));
    assert.equal(spec.command.includes(upstream), false);
  });

  it('rewrites the upstream base inside base64 env values', () => {
    const upstream = 'https://api.giga.chat/v1';
    const config = JSON.stringify({ provider: { gigachat: { options: { baseURL: upstream } } } });
    const other = Buffer.from('leave-me').toString('base64');
    const spec = installGigachatContentProxy(
      { command: ['opencode', 'run'], env: { MCP_ATTACH_B64: Buffer.from(config).toString('base64'), PACK_B64: other } },
      upstream,
    );
    const decoded = Buffer.from(spec.env.MCP_ATTACH_B64 ?? '', 'base64').toString('utf8');
    assert.ok(decoded.includes(GIGACHAT_CONTENT_PROXY_BASE));
    assert.equal(decoded.includes(upstream), false);
    assert.equal(spec.env.PACK_B64, other);
  });

  it('prefixes an existing sh -c script instead of nesting exec', () => {
    const upstream = 'https://api.giga.chat/v1';
    const spec = installGigachatContentProxy(
      {
        command: ['sh', '-c', 'exec kilo "$@"', 'kilo', 'run', 'ping'],
        env: { OPENAI_BASE_URL: upstream },
      },
      upstream,
    );
    assert.equal(spec.command[0], 'sh');
    assert.equal(spec.command[1], '-c');
    assert.match(spec.command[2] ?? '', /gigachat-openai-proxy\.mjs/);
    assert.match(spec.command[2] ?? '', /exec kilo/);
    assert.equal(spec.command[3], 'kilo');
  });
});

type Translator = {
  toGigachatRequest: (body: unknown) => { body: Record<string, any>; functions: boolean };
  fromGigachatCompletion: (body: unknown) => Record<string, any>;
  sseFromCompletion: (completion: unknown, includeUsage: boolean) => string;
};

function translator(): Translator {
  const sandbox: Record<string, unknown> = {};
  runInNewContext(
    `${GIGACHAT_TRANSLATE_SOURCE}\nexports = { toGigachatRequest, fromGigachatCompletion, sseFromCompletion };`,
    sandbox,
  );
  return sandbox.exports as Translator;
}

describe('gigachat function translation', () => {
  const t = translator();
  const tool = {
    type: 'function',
    function: { name: 'rag_graph', description: 'graph', parameters: { type: 'object', properties: {} } },
  };

  it('leaves a request without tools free of functions', () => {
    const { body, functions } = t.toGigachatRequest({ model: 'GigaChat-2', messages: [{ role: 'user', content: 'hi' }] });
    assert.equal(functions, false);
    assert.equal(body.functions, undefined);
    assert.deepEqual(JSON.parse(JSON.stringify(body.messages)), [{ role: 'user', content: 'hi' }]);
  });

  it('maps tools and tool_choice to functions and function_call', () => {
    const auto = t.toGigachatRequest({
      messages: [],
      tools: [tool],
      tool_choice: 'auto',
      parallel_tool_calls: true,
      reasoning_effort: 'medium',
    });
    assert.equal(auto.functions, true);
    assert.equal(auto.body.reasoning_effort, undefined);
    const plain = t.toGigachatRequest({ messages: [], reasoning_effort: 'none' });
    assert.equal(plain.body.reasoning_effort, undefined);
    assert.deepEqual(JSON.parse(JSON.stringify(auto.body.functions)), [tool.function]);
    assert.equal(auto.body.function_call, 'auto');
    assert.equal(auto.body.tools, undefined);
    assert.equal(auto.body.parallel_tool_calls, undefined);
    const named = t.toGigachatRequest({ messages: [], tools: [tool], tool_choice: { type: 'function', function: { name: 'rag_graph' } } });
    assert.deepEqual(JSON.parse(JSON.stringify(named.body.function_call)), { name: 'rag_graph' });
  });

  it('rewrites tool schemas into the subset GigaChat-2 accepts', () => {
    const { body } = t.toGigachatRequest({
      messages: [],
      tools: [
        {
          type: 'function',
          function: {
            name: 'send',
            parameters: {
              $schema: 'http://json-schema.org/draft-07/schema#',
              type: 'object',
              $defs: { target: { type: 'object', properties: { id: { type: 'string' } } } },
              properties: {
                notify: { type: ['boolean', 'null'] },
                reply_to: { anyOf: [{ type: 'null' }, { type: 'string', format: 'uri' }] },
                mode: { const: 'fast' },
                level: { enum: [1, 2] },
                untyped: { description: 'free' },
                meta: { type: 'object' },
                tags: { type: 'array', items: { oneOf: [{ type: 'string' }, { type: 'number' }] } },
                target: { $ref: '#/$defs/target', description: 'who' },
                when: { type: 'string', format: 'date-time' },
              },
              required: ['notify', 'gone'],
            },
          },
        },
      ],
    });
    assert.deepEqual(JSON.parse(JSON.stringify(body.functions[0].parameters)), {
      type: 'object',
      properties: {
        notify: { type: 'boolean' },
        reply_to: { type: 'string' },
        mode: { enum: ['fast'], type: 'string' },
        level: { enum: [1, 2], type: 'number' },
        untyped: { description: 'free', type: 'string' },
        meta: { type: 'object', properties: {} },
        tags: { type: 'array', items: { type: 'string' } },
        target: { type: 'object', properties: { id: { type: 'string' } }, description: 'who' },
        when: { type: 'string', format: 'date-time' },
      },
      required: ['notify'],
    });
  });

  it('splits parallel tool calls into call/result pairs with JSON-object results', () => {
    const { body } = t.toGigachatRequest({
      messages: [
        { role: 'user', content: 'q' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            { id: 'c1', type: 'function', function: { name: 'rag_graph', arguments: '{"query":"Чук"}' } },
            { id: 'c2', type: 'function', function: { name: 'rag_search', arguments: 'not json' } },
          ],
        },
        { role: 'tool', tool_call_id: 'c2', content: 'plain text' },
        { role: 'tool', tool_call_id: 'c1', content: [{ type: 'text', text: '{"hits":1}' }] },
      ],
    });
    assert.deepEqual(JSON.parse(JSON.stringify(body.messages)), [
      { role: 'user', content: 'q' },
      { role: 'assistant', content: '', function_call: { name: 'rag_graph', arguments: { query: 'Чук' } } },
      { role: 'function', name: 'rag_graph', content: '{"hits":1}' },
      { role: 'assistant', content: '', function_call: { name: 'rag_search', arguments: { input: 'not json' } } },
      { role: 'function', name: 'rag_search', content: '{"result":"plain text"}' },
    ]);
  });

  it('maps function_call in a completion to tool_calls', () => {
    const out = t.fromGigachatCompletion({
      choices: [
        {
          index: 0,
          finish_reason: 'function_call',
          message: { role: 'assistant', content: '', functions_state_id: 's', function_call: { id: 'f1', name: 'rag_graph', arguments: { query: 'сторож' } } },
        },
      ],
    });
    const choice = out.choices[0];
    assert.equal(choice.finish_reason, 'tool_calls');
    assert.equal(choice.message.function_call, undefined);
    assert.equal(choice.message.functions_state_id, undefined);
    assert.deepEqual(JSON.parse(JSON.stringify(choice.message.tool_calls)), [
      { id: 'f1', type: 'function', function: { name: 'rag_graph', arguments: '{"query":"сторож"}' } },
    ]);
  });

  it('renders a completion as SSE chunks ending with [DONE]', () => {
    const sse = t.sseFromCompletion(
      {
        id: 'x',
        created: 1,
        model: 'GigaChat-2',
        usage: { total_tokens: 3 },
        choices: [
          {
            finish_reason: 'tool_calls',
            message: { content: '', tool_calls: [{ id: 'f1', type: 'function', function: { name: 'rag_graph', arguments: '{}' } }] },
          },
        ],
      },
      true,
    );
    const frames = sse.trim().split('\n\n').map((f) => f.replace(/^data: /, ''));
    assert.equal(frames.at(-1), '[DONE]');
    const chunks = frames.slice(0, -1).map((f) => JSON.parse(f));
    assert.deepEqual(chunks[1].choices[0].delta.tool_calls[0], {
      index: 0,
      id: 'f1',
      type: 'function',
      function: { name: 'rag_graph', arguments: '{}' },
    });
    assert.equal(chunks[2].choices[0].finish_reason, 'tool_calls');
    assert.deepEqual(chunks[3].usage, { total_tokens: 3 });
  });

  it('embeds a syntactically valid proxy script', () => {
    const script = /<< 'EOF'\n([\s\S]*?)\nEOF/.exec(gigachatContentProxyShell())?.[1] ?? '';
    const dir = mkdtempSync(join(tmpdir(), 'gigachat-proxy-'));
    const file = join(dir, 'proxy.mjs');
    writeFileSync(file, script);
    execFileSync(process.execPath, ['--check', file]);
  });
});
