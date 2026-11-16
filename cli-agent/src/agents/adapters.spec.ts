import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { McpAttach } from '../tools/mcp-attach';
import type { RulesAttach, SkillAttach } from '../tools/skill-attach';
import {
  PACK_NO_MEMORY_HINT,
  packSystemHint,
  packTaskPrefix,
} from './adapter-common';
import { CLI_AGENT_ADAPTERS } from './registry';
import { aiderAdapter } from './aider/adapter';
import { claudeCodeAdapter } from './claude-code/adapter';
import { codexAdapter } from './codex/adapter';
import { crushAdapter } from './crush/adapter';
import { cursorAdapter } from './cursor/adapter';
import { gooseAdapter } from './goose/adapter';
import { hermesAdapter } from './hermes/adapter';
import { kiloAdapter } from './kilo/adapter';
import { openclawAdapter } from './openclaw/adapter';
import { opencodeAdapter } from './opencode/adapter';
import { piAdapter } from './pi/adapter';
import { qwenAdapter } from './qwen/adapter';
import { zaiAdapter } from './zai/adapter';

/** Opaque attach as produced by plugin.cli-agent.tool-provider (graph-kg). */
const GRAPH_KG_ATTACH: McpAttach = {
  version: 1,
  servers: [
    {
      id: 'graph-kg',
      transport: 'stdio',
      command: 'node',
      args: ['/tmp/tool-provider-mcp.mjs'],
      env: { CONVEYOR_API_BASE: 'http://host.docker.internal:18080' },
    },
  ],
  toolNames: ['rag_search', 'rag_graph'],
};

const SKILL_ATTACH: SkillAttach = {
  version: 1,
  skills: [{ name: 'graph-kg', body: '# skill\n' }],
};

const RULES_ATTACH: RulesAttach = {
  version: 1,
  rules: [{ name: 'AGENTS.md', body: '# rules\n' }],
};

describe('cli-agent adapters', () => {
  it('registers wave A + scaffolded wave B with fixed image tags', () => {
    const slugs = CLI_AGENT_ADAPTERS.map((a) => a.slug);
    for (const expected of [
      'hermes',
      'claude-code',
      'codex',
      'cursor',
      'aider',
      'opencode',
      'zai',
      'kilo',
      'cline',
      'pi',
      'qwen',
      'goose',
      'crush',
      'openclaw',
      'openhands',
    ]) {
      assert.ok(slugs.includes(expected), `missing ${expected}`);
    }
    assert.equal(CLI_AGENT_ADAPTERS.length, 15);
    for (const adapter of CLI_AGENT_ADAPTERS) {
      assert.match(adapter.image, new RegExp(`^cli-agent-${adapter.slug}:0\\.1\\.0$`));
    }
  });

  it('builds expected headless argv', () => {
    const base = {
      task: 'fix bug',
      provider: 'openai',
      model: 'gpt-test',
      baseUrl: '',
      apiKey: 'k',
      tools: [] as string[],
      skills: [] as string[],
      workspaceMounted: false,
      mcpAttach: null as McpAttach | null,
      skillAttach: null as SkillAttach | null,
      rulesAttach: null as RulesAttach | null,
    };
    const hermes = hermesAdapter.plan(base);
    assert.deepEqual(hermes, {
      ok: true,
      image: hermesAdapter.image,
      command: ['hermes', 'chat', '--oneshot', '-q', 'fix bug', '--model', 'gpt-test', '--provider', 'openai'],
      env: {
        HOME: '/home',
        HERMES_API_KEY: 'k',
        OPENAI_API_KEY: 'k',
        HERMES_BASE_URL: 'https://api.openai.com/v1',
        OPENAI_BASE_URL: 'https://api.openai.com/v1',
        HERMES_PROVIDER: 'openai',
      },
      workingDir: '/tmp',
    });

    const hermesEmptyPack = hermesAdapter.plan({
      ...base,
      workspaceMounted: true,
    });
    assert.equal(hermesEmptyPack.ok, true);
    if (hermesEmptyPack.ok) {
      assert.equal(hermesEmptyPack.command[0], 'hermes');
      assert.equal(hermesEmptyPack.workingDir, '/tmp');
      assert.equal(
        hermesEmptyPack.command.some((c) => String(c).includes('skills trust')),
        false,
      );
    }

    const hermesWithSkills = hermesAdapter.plan({
      ...base,
      skillAttach: SKILL_ATTACH,
      rulesAttach: RULES_ATTACH,
    });
    assert.equal(hermesWithSkills.ok, true);
    if (hermesWithSkills.ok) {
      assert.equal(hermesWithSkills.command[0], 'sh');
      assert.ok(
        hermesWithSkills.command.some((c) => String(c).includes('skills trust')),
      );
      assert.ok(
        hermesWithSkills.command.some((c) =>
          String(c).includes('/tmp/pack'),
        ),
      );
      assert.ok(hermesWithSkills.env.EPHEMERAL_PACK_B64);
      assert.equal(hermesWithSkills.workingDir, '/tmp');
    }

    const hermesMcp = hermesAdapter.plan({
      ...base,
      tools: ['search', 'graph'],
      skillAttach: {
        version: 1,
        skills: [
          { name: 'grounded-answer', body: 'g' },
          { name: 'graph-kg', body: 'k' },
          { name: 'vector-search', body: 'v' },
        ],
      },
      rulesAttach: RULES_ATTACH,
      mcpAttach: GRAPH_KG_ATTACH,
    });
    assert.equal(hermesMcp.ok, true);
    if (hermesMcp.ok) {
      assert.equal(hermesMcp.command[0], 'sh');
      assert.ok(hermesMcp.env.HERMES_MCP_YAML_B64);
      assert.ok(
        Buffer.from(hermesMcp.env.HERMES_MCP_YAML_B64, 'base64')
          .toString('utf8')
          .includes('tool-provider-mcp.mjs'),
      );
      assert.ok(hermesMcp.env.EPHEMERAL_BRIDGE_B64);
      assert.ok(
        hermesMcp.command.some((c) => String(c).includes('HERMES_MCP_YAML_B64')),
      );
      assert.equal(hermesMcp.env.CONVEYOR_API_BASE?.includes('18080'), true);
    }

    // Without ToolProvider attach, pack tools alone must not invent MCP paths.
    const hermesNoAttach = hermesAdapter.plan({
      ...base,
      workspaceMounted: true,
      tools: ['search', 'graph'],
      skills: ['grounded-answer'],
    });
    assert.equal(hermesNoAttach.ok, true);
    if (hermesNoAttach.ok) {
      assert.equal(
        hermesNoAttach.env.HERMES_MCP_YAML_B64 == null ||
          hermesNoAttach.env.HERMES_MCP_YAML_B64 === '',
        true,
      );
    }

    const claudeMcp = claudeCodeAdapter.plan({
      ...base,
      provider: 'anthropic',
      tools: ['search', 'graph'],
      skillAttach: {
        version: 1,
        skills: [{ name: 'vector-search', body: 'v' }],
      },
      rulesAttach: RULES_ATTACH,
      mcpAttach: GRAPH_KG_ATTACH,
    });
    assert.equal(claudeMcp.ok, true);
    if (claudeMcp.ok) {
      assert.equal(claudeMcp.command[0], 'sh');
      assert.ok(
        claudeMcp.env.MCP_ATTACH_CONFIG?.includes('tool-provider-mcp.mjs'),
      );
      assert.ok(claudeMcp.env.EPHEMERAL_BRIDGE_B64);
      assert.ok(claudeMcp.command.includes('--mcp-config'));
      assert.ok(claudeMcp.command.includes('/tmp/mcp-attach.json'));
      assert.equal(claudeMcp.command.includes('--tools'), false);
    }

    const claude = claudeCodeAdapter.plan({ ...base, provider: 'anthropic' });
    assert.equal(claude.ok, true);
    if (claude.ok) {
      assert.deepEqual(claude.command.slice(0, 3), ['claude', '-p', 'fix bug']);
      assert.ok(claude.command.includes('--bare'));
      assert.ok(claude.command.includes('--strict-mcp-config'));
      assert.ok(claude.command.includes('--disable-slash-commands'));
      const toolsIdx = claude.command.indexOf('--tools');
      assert.ok(toolsIdx >= 0);
      assert.equal(claude.command[toolsIdx + 1], '');
      assert.equal(claude.env.ANTHROPIC_API_KEY, 'k');
    }

    const claudePack = claudeCodeAdapter.plan({
      ...base,
      provider: 'anthropic',
      tools: ['Read', 'Bash'],
      skillAttach: SKILL_ATTACH,
      rulesAttach: RULES_ATTACH,
    });
    assert.equal(claudePack.ok, true);
    if (claudePack.ok) {
      assert.equal(claudePack.command[0], 'sh');
      const toolsIdx = claudePack.command.indexOf('--tools');
      assert.equal(claudePack.command[toolsIdx + 1], 'Read,Bash');
      assert.ok(claudePack.command.includes('--add-dir'));
      assert.ok(claudePack.command.includes('/tmp/pack/skills/graph-kg'));
      assert.ok(claudePack.command.includes('--dangerously-skip-permissions'));
      assert.ok(claudePack.command.includes('--append-system-prompt'));
      assert.equal(claudePack.command.includes('--disable-slash-commands'), false);
      assert.ok(claudePack.env.EPHEMERAL_PACK_B64);
      assert.equal(claudePack.env.HOME, '/home/agent');
    }

    const claudeNative = claudeCodeAdapter.plan({
      ...base,
      provider: 'anthropic',
      model: 'sonnet',
      baseUrl: '',
    });
    assert.equal(claudeNative.ok, true);
    if (claudeNative.ok) {
      // Real Claude CLI only — never Ollama Messages-API substitution.
      assert.equal(claudeNative.env.ANTHROPIC_API_KEY, 'k');
      assert.equal(claudeNative.env.ANTHROPIC_BASE_URL, undefined);
      assert.equal(claudeNative.env.ANTHROPIC_AUTH_TOKEN, undefined);
      assert.ok(claudeNative.command.includes('--model'));
      assert.ok(claudeNative.command.includes('sonnet'));
    }

    const codex = codexAdapter.plan({
      ...base,
      provider: 'openai',
      baseUrl: '',
      model: 'gpt-6.1-sol',
    });
    assert.equal(codex.ok, true);
    if (codex.ok) {
      assert.equal(codex.command[0], 'sh');
      assert.ok(
        String(codex.command[2]).includes('mkdir -p "$HOME/.codex"'),
      );
      assert.ok(codex.command.includes('exec'));
      assert.ok(codex.command.includes('--skip-git-repo-check'));
      assert.ok(codex.command.includes('--json'));
      // Native Codex cloud — never --oss / Ollama local provider.
      assert.equal(codex.command.includes('--oss'), false);
      assert.equal(codex.env.CODEX_OSS_BASE_URL, undefined);
      assert.ok(codex.command.includes('--ephemeral'));
      assert.ok(codex.command.includes('--ignore-user-config'));
      assert.ok(codex.command.includes('danger-full-access'));
      assert.ok(
        codex.command.includes('--dangerously-bypass-approvals-and-sandbox'),
      );
      assert.ok(codex.command.includes('project_doc_max_bytes=0'));
      assert.ok(codex.command.includes('include_skills_usage_instructions=false'));
      assert.ok(codex.command.includes('fix bug'));
      assert.ok(codex.command.includes('features.plugins=false'));
      assert.ok(codex.command.includes('-m'));
      assert.ok(codex.command.includes('gpt-6.1-sol'));
      assert.equal(codex.workingDir, '/home');
    }

    const cursor = cursorAdapter.plan({
      ...base,
      provider: 'openai',
      model: 'auto',
      baseUrl: 'http://host.docker.internal:11434/v1',
    });
    assert.equal(cursor.ok, true);
    if (cursor.ok) {
      // Real Cursor Agent CLI — never an HTTP chat/completions wrapper.
      assert.equal(cursor.command[0], 'agent');
      assert.ok(cursor.command.includes('-p'));
      assert.ok(cursor.command.includes('--output-format'));
      assert.ok(cursor.command.includes('stream-json'));
      assert.ok(cursor.command.includes('--model'));
      assert.ok(cursor.command.includes('auto'));
      assert.ok(cursor.command.includes('fix bug'));
      const cmdBlob = JSON.stringify(cursor.command);
      assert.equal(cmdBlob.includes('chat/completions'), false);
      assert.equal(cmdBlob.includes('node -e'), false);
      assert.equal(cursor.env.CURSOR_API_KEY, 'k');
      assert.equal(cursor.env.CURSOR_LOCAL_BRIDGE, undefined);
      assert.equal(cursor.env.OPENAI_BASE_URL, undefined);
      // Ollama base is not a Cursor API endpoint — do not forward it.
      assert.equal(cursor.env.CURSOR_API_ENDPOINT, undefined);
    }

    const cursorCloud = cursorAdapter.plan({
      ...base,
      provider: 'openai',
      model: 'composer-2.5',
      baseUrl: 'https://api2.cursor.sh',
    });
    assert.equal(cursorCloud.ok, true);
    if (cursorCloud.ok) {
      assert.equal(cursorCloud.command[0], 'agent');
      assert.ok(cursorCloud.command.includes('composer-2.5'));
      assert.equal(cursorCloud.env.CURSOR_API_KEY, 'k');
      assert.equal(cursorCloud.env.CURSOR_API_ENDPOINT, 'https://api2.cursor.sh');
      assert.equal(cursorCloud.env.CURSOR_LOCAL_BRIDGE, undefined);
    }

    const aider = aiderAdapter.plan(base);
    assert.equal(aider.ok, true);
    if (aider.ok) {
      assert.ok(aider.command.includes('--message'));
      assert.ok(aider.command.includes('openai/gpt-test'));
    }

    const aiderOllama = aiderAdapter.plan({
      ...base,
      provider: 'ollama',
      model: 'gemma4:12b-mlx',
      baseUrl: 'http://host.docker.internal:11434/v1',
    });
    assert.equal(aiderOllama.ok, true);
    if (aiderOllama.ok) {
      assert.ok(aiderOllama.command.includes('openai/gemma4:12b-mlx'));
      assert.equal(
        aiderOllama.env.OPENAI_API_BASE,
        'http://host.docker.internal:11434/v1',
      );
    }

    const opencode = opencodeAdapter.plan(base);
    assert.equal(opencode.ok, true);
    if (opencode.ok) {
      assert.equal(opencode.command[0], 'sh');
      assert.ok(opencode.command.includes('opencode'));
      assert.ok(opencode.command.includes('run'));
      assert.ok(opencode.command.includes('fix bug'));
      assert.ok(opencode.env.OPENCODE_CONFIG);
    }

    const opencodePack = opencodeAdapter.plan({
      ...base,
      tools: ['graph'],
      skillAttach: SKILL_ATTACH,
    });
    assert.equal(opencodePack.ok, true);
    if (opencodePack.ok) {
      assert.equal(opencodePack.command[0], 'sh');
      assert.ok(opencodePack.command.includes('--dir'));
      assert.ok(opencodePack.command.includes('/tmp/pack'));
      assert.ok(opencodePack.command.includes('--auto'));
      assert.ok(opencodePack.command.includes('--format'));
      assert.ok(opencodePack.command.includes('json'));
      assert.ok(opencodePack.env.EPHEMERAL_PACK_B64);
    }

    const opencodeWsEmpty = opencodeAdapter.plan({
      ...base,
      workspaceMounted: true,
    });
    assert.equal(opencodeWsEmpty.ok, true);
    if (opencodeWsEmpty.ok) {
      assert.equal(opencodeWsEmpty.command.includes('--dir'), false);
      assert.equal(opencodeWsEmpty.workingDir, '/tmp');
    }

    const opencodeWsSkills = opencodeAdapter.plan({
      ...base,
      skillAttach: SKILL_ATTACH,
    });
    assert.equal(opencodeWsSkills.ok, true);
    if (opencodeWsSkills.ok) {
      assert.ok(opencodeWsSkills.command.includes('--dir'));
      assert.ok(opencodeWsSkills.command.includes('/tmp/pack'));
      assert.equal(opencodeWsSkills.workingDir, '/tmp');
    }

    const zai = zaiAdapter.plan({
      ...base,
      provider: 'custom',
      baseUrl: 'http://host.docker.internal:11434/v1',
      model: 'gemma4:12b-mlx',
    });
    assert.equal(zai.ok, true);
    if (zai.ok) {
      assert.deepEqual(zai.command.slice(0, 3), ['zcode', '-p', 'fix bug']);
      assert.ok(zai.command.includes('custom/gemma4:12b-mlx'));
    }

    const piEmpty = piAdapter.plan({
      ...base,
      provider: 'ollama',
      model: 'gemma4:12b-mlx',
      baseUrl: 'http://host.docker.internal:11434/v1',
    });
    assert.equal(piEmpty.ok, true);
    if (piEmpty.ok) {
      assert.ok(piEmpty.command.includes('--no-tools'));
      assert.ok(piEmpty.command.includes('--no-skills'));
      assert.ok(piEmpty.command.includes('--no-context-files'));
      assert.ok(piEmpty.command.includes('--no-extensions'));
      assert.ok(piEmpty.command.includes('--mode'));
      assert.ok(piEmpty.command.includes('json'));
    }

    const piPack = piAdapter.plan({
      ...base,
      provider: 'anthropic',
      tools: ['read', 'bash'],
      skillAttach: SKILL_ATTACH,
    });
    assert.equal(piPack.ok, true);
    if (piPack.ok) {
      assert.ok(piPack.command.includes('--tools'));
      assert.ok(piPack.command.includes('read,bash'));
      assert.ok(piPack.command.includes('--skill'));
      assert.ok(piPack.command.includes('/tmp/pack/skills/graph-kg'));
      assert.ok(piPack.env.EPHEMERAL_PACK_B64);
      assert.ok(piPack.command.includes('--mode'));
      assert.ok(piPack.command.includes('json'));
      assert.equal(piPack.command.includes('--no-tools'), false);
      assert.equal(piPack.command.includes('--no-skills'), false);
    }
  });


  it('refuses Aider when MCP is attached (no MCP client)', () => {
    const plan = aiderAdapter.plan({
      task: 'Что было в телеграмме?',
      provider: 'ollama',
      model: 'gemma4:12b-mlx',
      baseUrl: 'http://host.docker.internal:11434/v1',
      apiKey: 'ollama',
      tools: [],
      skills: [],
      workspaceMounted: false,
      mcpAttach: GRAPH_KG_ATTACH,
      skillAttach: SKILL_ATTACH,
      rulesAttach: RULES_ATTACH,
    });
    assert.equal(plan.ok, false);
    if (plan.ok) return;
    assert.match(plan.reason, /no MCP client/i);
  });

  it('attaches real MCP for Goose without evidence prefetch', () => {
    const plan = gooseAdapter.plan({
      task: 'Что было в телеграмме?',
      provider: 'ollama',
      model: 'gemma4:12b-mlx',
      baseUrl: 'http://host.docker.internal:11434/v1',
      apiKey: 'ollama',
      tools: [],
      skills: [],
      workspaceMounted: false,
      mcpAttach: GRAPH_KG_ATTACH,
      skillAttach: SKILL_ATTACH,
      rulesAttach: RULES_ATTACH,
    });
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    const blob = JSON.stringify(plan.command);
    assert.equal(blob.includes('_tool_run'), false);
    assert.equal(blob.includes('goose-evidence'), false);
    assert.doesNotMatch(blob, /Серегин телеграмма Задержись/);
    const gooseYaml = Buffer.from(plan.env.GOOSE_EXTENSIONS_B64 ?? '', 'base64').toString('utf8');
    assert.match(gooseYaml, /^extensions:\n/);
    assert.match(gooseYaml, /tool-provider-mcp\.mjs/);
  });

  it('attaches Cursor MCP without evidence prefetch', () => {
    const plan = cursorAdapter.plan({
      task: 'Что было в телеграмме?',
      provider: 'ollama',
      model: 'gemma4:12b-mlx',
      baseUrl: 'http://host.docker.internal:11434/v1',
      apiKey: 'ollama',
      tools: [],
      skills: [],
      workspaceMounted: false,
      mcpAttach: GRAPH_KG_ATTACH,
      skillAttach: SKILL_ATTACH,
      rulesAttach: RULES_ATTACH,
    });
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    const blob = JSON.stringify(plan.command);
    assert.equal(blob.includes('_tool_run'), false);
    assert.equal(blob.includes('cursor-fallback'), false);
    assert.ok(plan.env.MCP_ATTACH_CONFIG);
  });

  it('attaches Crush MCP without evidence prefetch', () => {
    const plan = crushAdapter.plan({
      task: 'Что было в телеграмме?',
      provider: 'ollama',
      model: 'gemma4:12b-mlx',
      baseUrl: 'http://host.docker.internal:11434/v1',
      apiKey: 'ollama',
      tools: [],
      skills: [],
      workspaceMounted: false,
      mcpAttach: GRAPH_KG_ATTACH,
      skillAttach: SKILL_ATTACH,
      rulesAttach: RULES_ATTACH,
    });
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    const blob = JSON.stringify(plan.command);
    assert.equal(blob.includes('_tool_run'), false);
    assert.equal(blob.includes('crush-fallback'), false);
    assert.equal(
      Object.hasOwn(JSON.parse(plan.env.CRUSH_CONFIG_JSON ?? '{}'), 'mcp'),
      true,
    );
  });

  it('attaches OpenClaw MCP without evidence prefetch', () => {
    const plan = openclawAdapter.plan({
      task: 'Что было в телеграмме?',
      provider: 'ollama',
      model: 'gemma4:12b-mlx',
      baseUrl: 'http://host.docker.internal:11434/v1',
      apiKey: 'ollama',
      tools: [],
      skills: [],
      workspaceMounted: false,
      mcpAttach: GRAPH_KG_ATTACH,
      skillAttach: SKILL_ATTACH,
      rulesAttach: RULES_ATTACH,
    });
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    const blob = JSON.stringify(plan.command);
    assert.equal(blob.includes('_tool_run'), false);
    assert.equal(blob.includes('openclaw-fallback'), false);
    const openclawConfig = JSON.parse(plan.env.OPENCLAW_CONFIG_JSON ?? '{}');
    assert.equal(Object.hasOwn(openclawConfig, 'mcp'), true);
    assert.equal(openclawConfig.tools.toolSearch, false);
    assert.equal(openclawConfig.tools.profile, 'coding');
    assert.deepEqual(openclawConfig.tools.deny, ['edit', 'apply_patch']);
  });

  it('attaches OpenCode MCP without evidence prefetch', () => {
    const plan = opencodeAdapter.plan({
      task: 'Что было в телеграмме?',
      provider: 'ollama',
      model: 'gemma4:12b-mlx',
      baseUrl: 'http://host.docker.internal:11434/v1',
      apiKey: 'ollama',
      tools: [],
      skills: [],
      workspaceMounted: false,
      mcpAttach: GRAPH_KG_ATTACH,
      skillAttach: SKILL_ATTACH,
      rulesAttach: RULES_ATTACH,
    });
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    const blob = JSON.stringify(plan.command);
    assert.equal(blob.includes('_tool_run'), false);
    assert.equal(blob.includes('opencode-fallback'), false);
    const config = JSON.parse(
      Buffer.from(plan.env.MCP_ATTACH_B64 ?? '', 'base64').toString('utf8'),
    );
    assert.equal(Object.hasOwn(config, 'mcp'), true);
  });

  it('attaches Qwen MCP without evidence prefetch', () => {
    const plan = qwenAdapter.plan({
      task: 'Что было в телеграмме?',
      provider: 'ollama',
      model: 'gemma4:12b-mlx',
      baseUrl: 'http://host.docker.internal:11434/v1',
      apiKey: 'ollama',
      tools: [],
      skills: [],
      workspaceMounted: false,
      mcpAttach: GRAPH_KG_ATTACH,
      skillAttach: SKILL_ATTACH,
      rulesAttach: RULES_ATTACH,
    });
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    const blob = JSON.stringify(plan.command);
    assert.equal(blob.includes('_tool_run'), false);
    assert.equal(blob.includes('qwen-fallback'), false);
    assert.ok(plan.env.MCP_ATTACH_CONFIG);
  });

  it('attaches Claude MCP without evidence prefetch', () => {
    const plan = claudeCodeAdapter.plan({
      task: 'Что было в телеграмме?',
      provider: 'ollama',
      model: 'gemma4:12b-mlx',
      baseUrl: 'http://host.docker.internal:11434/v1',
      apiKey: 'ollama',
      tools: [],
      skills: [],
      workspaceMounted: false,
      mcpAttach: GRAPH_KG_ATTACH,
      skillAttach: SKILL_ATTACH,
      rulesAttach: RULES_ATTACH,
    });
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    const blob = JSON.stringify(plan.command);
    assert.equal(blob.includes('_tool_run'), false);
    assert.equal(blob.includes('claude-fallback'), false);
    assert.ok(plan.env.MCP_ATTACH_CONFIG);
  });

  it('attaches Kilo MCP without evidence prefetch', () => {
    const plan = kiloAdapter.plan({
      task: 'Что было в телеграмме?',
      provider: 'ollama',
      model: 'gemma4:12b-mlx',
      baseUrl: 'http://host.docker.internal:11434/v1',
      apiKey: 'ollama',
      tools: [],
      skills: [],
      workspaceMounted: false,
      mcpAttach: GRAPH_KG_ATTACH,
      skillAttach: SKILL_ATTACH,
      rulesAttach: RULES_ATTACH,
    });
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    const blob = JSON.stringify(plan.command);
    assert.equal(blob.includes('_tool_run'), false);
    assert.equal(blob.includes('kilo-fallback'), false);
    assert.equal(
      Object.hasOwn(JSON.parse(plan.env.KILO_OPENCODE_JSON ?? '{}'), 'mcp'),
      true,
    );
  });

  it('pack hints forbid memory / prior knowledge when MCP or skills are present', () => {
    const withMcp = {
      task: 'Кого привез ямщик?',
      provider: 'ollama' as const,
      model: 'gemma4:12b-mlx',
      baseUrl: 'http://host.docker.internal:11434/v1',
      apiKey: 'ollama',
      tools: [] as string[],
      skills: [] as string[],
      workspaceMounted: false,
      mcpAttach: GRAPH_KG_ATTACH,
      skillAttach: SKILL_ATTACH,
      rulesAttach: RULES_ATTACH,
    };
    const hint = packSystemHint(withMcp);
    const prefix = packTaskPrefix(withMcp);
    assert.match(hint, /FORBIDDEN/);
    assert.match(hint, /prior knowledge|memory/i);
    assert.ok(hint.includes(PACK_NO_MEMORY_HINT.slice(0, 40)));
    assert.match(prefix, /FORBIDDEN/);
    assert.match(hint, /Do not calculate in your head/);
    assert.match(prefix, /stdout of python or node/);
    assert.equal(packSystemHint({ ...withMcp, mcpAttach: null, skillAttach: null, rulesAttach: null, tools: [], skills: [] }), '');
  });

  it('adds no RAG pack hints for an MCP attach without rag tools', () => {
    const request = {
      task: 'delegate',
      provider: 'ollama' as const,
      model: 'gemma4:31b-cloud',
      baseUrl: 'http://host.docker.internal:11434/v1',
      apiKey: 'ollama',
      tools: [] as string[],
      skills: [] as string[],
      workspaceMounted: false,
      mcpAttach: {
        version: 1 as const,
        servers: [{ id: 'a2a', transport: 'stdio' as const, command: 'node', args: ['/tmp/b.mjs'] }],
        toolNames: ['a2a_spawn', 'a2a_wait'],
      },
      skillAttach: null,
      rulesAttach: null,
    };
    assert.equal(packSystemHint(request), '');
    assert.equal(packTaskPrefix(request), '');
  });

  it('names only present RAG tools in both client naming styles, skipping the a2a server', () => {
    const request = {
      task: 'q',
      provider: 'ollama' as const,
      model: 'gemma4:31b-cloud',
      baseUrl: 'http://host.docker.internal:11434/v1',
      apiKey: 'ollama',
      tools: [] as string[],
      skills: [] as string[],
      workspaceMounted: false,
      mcpAttach: {
        version: 1 as const,
        servers: [
          { id: 'tool-provider', transport: 'stdio' as const, command: 'node', args: ['/tmp/b.mjs'] },
          { id: 'a2a', transport: 'stdio' as const, command: 'node', args: ['/tmp/b.mjs'] },
        ],
        toolNames: ['rag_graph', 'a2a_ask_parent'],
      },
      skillAttach: { version: 1 as const, skills: [{ name: 'graph-specialist', body: '# g' }] },
      rulesAttach: null,
    };
    const hint = packSystemHint(request as never);
    assert.match(hint, /rag_graph \(exposed as tool-provider_rag_graph or mcp__tool_provider__rag_graph\)/);
    assert.match(hint, /\/skills\/graph-specialist\/SKILL\.md/);
    assert.doesNotMatch(hint, /rag_search|a2a_rag/);
    assert.match(packTaskPrefix(request as never), /First call rag_graph \(exposed as tool-provider_rag_graph/);
  });

  it('never injects telegram evidence prefetch for local or remote MCP', () => {
    const local = {
      task: 'Что было в телеграмме?',
      provider: 'ollama' as const,
      model: 'gemma4:12b-mlx',
      baseUrl: 'http://host.docker.internal:11434/v1',
      apiKey: 'ollama',
      tools: [] as string[],
      skills: [] as string[],
      workspaceMounted: false,
      mcpAttach: GRAPH_KG_ATTACH,
      skillAttach: SKILL_ATTACH,
      rulesAttach: RULES_ATTACH,
    };
    const remote = {
      ...local,
      provider: 'custom' as const,
      model: 'GigaChat',
      baseUrl: 'https://gigachat.devices.sberbank.ru/api/v1',
      apiKey: 'access-token',
    };
    for (const adapter of [
      opencodeAdapter,
      kiloAdapter,
      qwenAdapter,
      crushAdapter,
      openclawAdapter,
      claudeCodeAdapter,
      cursorAdapter,
      gooseAdapter,
    ]) {
      for (const req of [local, remote]) {
        const plan = adapter.plan(req);
        assert.equal(plan.ok, true, adapter.slug);
        if (!plan.ok) continue;
        const blob = JSON.stringify(plan.command);
        assert.equal(
          blob.includes('_tool_run'),
          false,
          `${adapter.slug} _tool_run`,
        );
        assert.equal(
          blob.includes('Серегин телеграмма Задержись'),
          false,
          `${adapter.slug} telegram`,
        );
      }
    }
  });

  it('cursor extractText prefers last stream-json result / agent_message', () => {
    const ndjson = [
      '{"type":"tool_call","name":"rag_search"}',
      '{"type":"assistant","item":{"type":"agent_message","text":"partial"}}',
      '{"type":"result","result":"мать, Чук и Гек"}',
    ].join('\n');
    assert.equal(cursorAdapter.extractText(ndjson, ''), 'мать, Чук и Гек');
    assert.equal(cursorAdapter.extractText('plain text answer', ''), 'plain text answer');
  });

});
