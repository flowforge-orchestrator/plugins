import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import type { SpawnRunner } from '../runtime/spawn';
import { executeCliAgent } from './execute';
import { aiderAdapter } from './aider/adapter';
import { claudeCodeAdapter } from './claude-code/adapter';
import { codexAdapter } from './codex/adapter';
import { cursorAdapter } from './cursor/adapter';
import { hermesAdapter } from './hermes/adapter';

describe('executeCliAgent', () => {
  it('returns unsupported when custom lacks baseUrl (no docker)', async () => {
    let called = false;
    const runner: SpawnRunner = async () => {
      called = true;
      throw new Error('should not run');
    };
    const result = await executeCliAgent(
      hermesAdapter,
      {
        task: 'hello',
        provider: 'custom',
        baseUrl: '',
        apiKey: 'k',
      },
      runner,
    );
    assert.equal(result.status, 'unsupported');
    assert.match(result.stderr, /baseUrl/);
    assert.equal(called, false);
  });

  it('never mounts a host workspace', async () => {
    const result = await executeCliAgent(
      hermesAdapter,
      {
        task: 'hello',
        provider: 'openai',
        apiKey: 'k',
      },
      async (spec) => {
        assert.equal(spec.workspaceHostPath, null);
        assert.equal(spec.workingDir, '/tmp');
        return {
          exitCode: 0,
          timedOut: false,
          stdout: 'ok',
          stderr: '',
          stdoutBytes: 2,
          stderrBytes: 0,
          truncated: false,
        };
      },
    );
    assert.equal(result.status, 'ok');
    assert.equal(result.workspaceMounted, false);
  });

  it('returns unsupported when tools JSON is invalid', async () => {
    const result = await executeCliAgent(
      hermesAdapter,
      {
        task: 'hello',
        provider: 'openai',
        tools: '{bad',
        apiKey: 'k',
      },
      async () => {
        throw new Error('should not run');
      },
    );
    assert.equal(result.status, 'unsupported');
  });

  it('runs aider without host workspace mount', async () => {
    const result = await executeCliAgent(
      aiderAdapter,
      {
        task: 'hello',
        provider: 'openai',
        tools: '[]',
        skills: '[]',
        apiKey: 'k',
      },
      async (spec) => {
        assert.equal(spec.workspaceHostPath, null);
        assert.equal(spec.workingDir, '/tmp');
        return {
          exitCode: 0,
          timedOut: false,
          stdout: 'ok',
          stderr: '',
          stdoutBytes: 2,
          stderrBytes: 0,
          truncated: false,
        };
      },
    );
    assert.equal(result.status, 'ok');
  });

  it('builds argv via adapter and maps runner accounting', async () => {
    const runner: SpawnRunner = async (spec) => {
      assert.equal(spec.image, hermesAdapter.image);
      assert.deepEqual(spec.command.slice(0, 5), [
        'hermes',
        'chat',
        '--oneshot',
        '-q',
        'do work',
      ]);
      assert.equal(spec.env?.OPENAI_API_KEY, 'secret');
      return {
        exitCode: 0,
        timedOut: false,
        stdout: 'done\n{"usage":{"prompt_tokens":2,"completion_tokens":3,"total_tokens":5}}',
        stderr: '',
        stdoutBytes: 10,
        stderrBytes: 0,
        truncated: false,
      };
    };
    const result = await executeCliAgent(
      hermesAdapter,
      {
        task: 'do work',
        provider: 'openai',
        apiKey: 'secret',
      },
      runner,
    );
    assert.equal(result.status, 'ok');
    assert.equal(result.usageKnown, true);
    assert.equal(result.inputTokens, 2);
    assert.equal(result.outputTokens, 3);
    assert.equal(result.totalTokens, 5);
    assert.equal(result.stdoutBytes, 10);
    assert.ok(result.metricsJson);
    const metrics = JSON.parse(result.metricsJson ?? '{}');
    assert.equal(typeof metrics.endToEndLatencyMs, 'number');
    assert.equal(metrics.extras.agentSlug, 'hermes');
  });

  it('does not invent usage without machine fixture', async () => {
    const result = await executeCliAgent(
      claudeCodeAdapter,
      {
        task: 'x',
        provider: 'anthropic',
        apiKey: 'k',
      },
      async () => ({
        exitCode: 0,
        timedOut: false,
        stdout: 'plain answer',
        stderr: '',
        stdoutBytes: 12,
        stderrBytes: 0,
        truncated: false,
      }),
    );
    assert.equal(result.status, 'ok');
    assert.equal(result.usageKnown, false);
    assert.equal(result.inputTokens, undefined);
    assert.equal(result.text, 'plain answer');
  });

  it('resolves opaque llmConfig into AdapterRequest (no gigachat branch)', async () => {
    const llmConfig = JSON.stringify({
      version: 1,
      provider: 'custom',
      model: 'GigaChat',
      baseUrl: 'https://gigachat.devices.sberbank.ru/api/v1',
      apiKey: 'access-token-from-oauth',
    });
    let seenEnv: Record<string, string> | undefined;
    let seenBinds: string[] | undefined;
    process.env.CLI_AGENT_WORKSPACE_ROOT = tmpdir();
    const result = await executeCliAgent(
      hermesAdapter,
      {
        task: 'ping',
        llmConfig,
      },
      async (spec) => {
        seenEnv = spec.env;
        seenBinds = spec.extraBinds;
        assert.equal(spec.env?.OPENAI_API_KEY, 'access-token-from-oauth');
        assert.equal(
          spec.env?.OPENAI_BASE_URL ?? spec.env?.HERMES_BASE_URL,
          'http://127.0.0.1:8765/v1',
        );
        assert.match(
          spec.env?.GIGACHAT_PROXY_UPSTREAM ?? '',
          /gigachat\.devices\.sberbank\.ru|api\.giga\.chat/,
        );
        assert.match(spec.command.join('\n'), /gigachat-openai-proxy\.mjs/);
        return {
          exitCode: 0,
          timedOut: false,
          stdout: 'pong',
          stderr: '',
          stdoutBytes: 4,
          stderrBytes: 0,
          truncated: false,
        };
      },
    );
    assert.equal(result.status, 'ok');
    assert.ok(seenEnv?.NODE_EXTRA_CA_CERTS);
    assert.ok(
      seenBinds?.some((b) => b.includes('russian-trusted-ca.pem')),
      'CA bind-mount for GigaChat TLS',
    );
  });

  it('proprietary: node model wins over llmConfig ollama; no GigaChat CA bind', async () => {
    const llmConfig = JSON.stringify({
      version: 1,
      provider: 'ollama',
      model: 'gemma4:12b-mlx',
      baseUrl: 'http://host.docker.internal:11434/v1',
      apiKey: 'anthropic-key-from-secret',
    });

    const claude = await executeCliAgent(
      claudeCodeAdapter,
      { task: 'ping', model: 'sonnet', llmConfig },
      async (spec) => {
        assert.ok(spec.command.includes('--model'));
        assert.ok(spec.command.includes('sonnet'));
        assert.equal(spec.command.includes('gemma4:12b-mlx'), false);
        assert.equal(spec.env?.ANTHROPIC_API_KEY, 'anthropic-key-from-secret');
        assert.equal(spec.env?.ANTHROPIC_BASE_URL, undefined);
        assert.equal(spec.extraBinds, undefined);
        return {
          exitCode: 0,
          timedOut: false,
          stdout: '{"result":"ok"}',
          stderr: '',
          stdoutBytes: 16,
          stderrBytes: 0,
          truncated: false,
        };
      },
    );
    assert.equal(claude.status, 'ok');

    const codex = await executeCliAgent(
      codexAdapter,
      { task: 'ping', model: 'gpt-6.1-sol', llmConfig },
      async (spec) => {
        assert.ok(spec.command.includes('-m'));
        assert.ok(spec.command.includes('gpt-6.1-sol'));
        assert.equal(spec.command.includes('--oss'), false);
        assert.equal(spec.env?.CODEX_OSS_BASE_URL, undefined);
        return {
          exitCode: 0,
          timedOut: false,
          stdout: '',
          stderr: '',
          stdoutBytes: 0,
          stderrBytes: 0,
          truncated: false,
        };
      },
    );
    assert.equal(codex.status, 'ok');

    const cursor = await executeCliAgent(
      cursorAdapter,
      { task: 'ping', model: 'auto', llmConfig },
      async (spec) => {
        assert.equal(spec.command[0], 'agent');
        assert.ok(spec.command.includes('--model'));
        assert.ok(spec.command.includes('auto'));
        assert.equal(JSON.stringify(spec.command).includes('chat/completions'), false);
        assert.equal(spec.env?.CURSOR_LOCAL_BRIDGE, undefined);
        assert.equal(spec.env?.CURSOR_API_ENDPOINT, undefined);
        return {
          exitCode: 0,
          timedOut: false,
          stdout: 'ok',
          stderr: '',
          stdoutBytes: 2,
          stderrBytes: 0,
          truncated: false,
        };
      },
    );
    assert.equal(cursor.status, 'ok');
  });
});
