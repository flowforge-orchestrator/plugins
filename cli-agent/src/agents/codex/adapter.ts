import {
  hasMcpAttach,
  isolateEmptyPackContext,
  okPlan,
  packSystemHint,
  rejectUnsupportedFilters,
  withPackTaskPrefix,
} from '../adapter-common';
import type { AdapterRequest, CliAgentAdapter } from '../types';
import { parseOpenAiStyleUsage } from '../usage';
import { codexMcpTomlFromAttach } from '../../tools/mcp-attach';
import {
  mcpAttachB64WriteShell,
  mcpAttachForEphemeral,
  wrapEphemeralPlan,
} from '../../tools/runtime/ephemeral-pack';

const IMAGE = 'cli-agent-codex:0.1.0';
const CODEX_MCP_TOML = '/home/.codex/mcp-attach.toml';

export const codexAdapter: CliAgentAdapter = {
  slug: 'codex',
  displayName: 'Codex',
  description:
    'Запускает OpenAI Codex (`codex exec`) с нативной моделью с ноды (не Ollama OSS).',
  image: IMAGE,
  supportsToolsFilter: true,
  supportsSkillsFilter: true,
  plan(request: AdapterRequest) {
    const blocked = rejectUnsupportedFilters(codexAdapter, request);
    if (blocked) {
      return blocked;
    }
    const mcp = hasMcpAttach(request);
    const inner = [
      'exec',
      '--skip-git-repo-check',
      '--json',
      '--ephemeral',
      // When MCP is attached we must load the seeded config.toml fragment.
      ...(mcp ? [] : ['--ignore-user-config']),
      '--ignore-rules',
      // One-shot Docker is already the sandbox; allow workspace bins (rag-*).
      '-s',
      'danger-full-access',
      '--dangerously-bypass-approvals-and-sandbox',
      // Cut remote plugin/catalog stalls that hang OSS turns.
      '-c',
      'features.plugins=false',
      '-c',
      'web_search="disabled"',
    ];
    // Empty tools/skills ports mean no pack context: do not inject AGENTS.md /
    // skills usage (otherwise Codex learns chuk_i_gek + bin tools from workspace).
    if (request.skills.length === 0 && !mcp) {
      inner.push('-c', 'project_doc_max_bytes=0');
      inner.push('-c', 'include_skills_usage_instructions=false');
      inner.push('-c', 'include_plugin_usage_instructions=false');
      inner.push('-c', 'include_apps_usage_instructions=false');
    }
    // HOME must not be under /tmp — Codex refuses helper binaries there and stalls.
    // tmpfs /home starts empty — mkdir before exec (do not set CODEX_HOME to a
    // missing path; Codex errors immediately).
    const env: Record<string, string> = {
      HOME: '/home',
      OPENAI_API_KEY: request.apiKey,
    };

    if (request.model) {
      inner.push('-m', request.model);
    }
    const hint = packSystemHint(request);
    const task = withPackTaskPrefix(request);
    const prompt = hint ? `${hint}  ${task}` : task;
    inner.push(prompt);

    const seedMcp = mcp && request.mcpAttach
      ? [
          'mkdir -p "$HOME/.codex"',
          mcpAttachB64WriteShell(CODEX_MCP_TOML),
          `cat ${CODEX_MCP_TOML} >> "$HOME/.codex/config.toml"`,
        ]
      : ['mkdir -p "$HOME/.codex"'];
    if (mcp && request.mcpAttach) {
      env.MCP_ATTACH_B64 = Buffer.from(
        codexMcpTomlFromAttach(mcpAttachForEphemeral(request.mcpAttach)),
        'utf8',
      ).toString('base64');
    }

    const command = [
      'sh',
      '-c',
      `${seedMcp.join(' && ')} && exec codex "$@"`,
      'codex',
      ...inner,
    ];
    let plan = isolateEmptyPackContext(
      okPlan(IMAGE, command, env, request),
      request,
    );
    // Do not start inside the pack cwd when skills are empty — avoids incidental
    // discovery of AGENTS.md / skills even if project_doc is disabled.
    if (plan.ok && request.skills.length === 0 && !mcp) {
      plan = { ...plan, workingDir: '/home' };
    }
    return wrapEphemeralPlan(
      plan,
      request,
      env,
    );
  },
  parseUsage(stdout, stderr) {
    return parseOpenAiStyleUsage(`${stdout}\n${stderr}`);
  },
  extractText(stdout) {
    const lines = stdout.split('\n');
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i]?.trim();
      if (!line?.startsWith('{')) {
        continue;
      }
      try {
        const parsed = JSON.parse(line) as {
          type?: string;
          item?: { type?: string; text?: string };
        };
        if (
          parsed.type === 'item.completed' &&
          parsed.item?.type === 'agent_message' &&
          typeof parsed.item.text === 'string'
        ) {
          return parsed.item.text;
        }
      } catch {
        // keep scanning
      }
    }
    return stdout.trim();
  },
};
