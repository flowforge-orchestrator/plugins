import {
  cliToolAllowlist,
  hasMcpAttach,
  hasSkillPack,
  okPlan,
  packSystemHint,
  rejectUnsupportedFilters,
  isolateEmptyPackContext,
  withPackTaskPrefix,
} from '../adapter-common';
import type { AdapterRequest, CliAgentAdapter } from '../types';
import { parseOpenAiStyleUsage } from '../usage';
import {
  EPHEMERAL_MATERIALIZE_SHELL,
  EPHEMERAL_MCP_CONFIG,
  EPHEMERAL_ROOT,
  ephemeralEnvForRequest,
  joinShellSteps,
  mcpConfigJsonEphemeral,
  needsEphemeralMaterialize,
  resolvedSkillNames,
  skillDirEphemeral,
} from '../../tools/runtime/ephemeral-pack';

const IMAGE = 'cli-agent-claude-code:0.1.0';

/** Claude flags after `-p <prompt>`. */
function claudeTailFlags(request: AdapterRequest, mcp: boolean): string[] {
  const flags = ['--output-format', 'json', '--bare', '--strict-mcp-config'];
  if (request.model) {
    flags.push('--model', request.model);
  }
  if (mcp) {
    flags.push('--mcp-config', EPHEMERAL_MCP_CONFIG);
  } else {
    const allow = cliToolAllowlist(request.tools, 'claude');
    flags.push('--tools', allow == null ? '' : allow.join(','));
  }
  const skillNames = resolvedSkillNames(request);
  if (hasSkillPack(request)) {
    flags.push('--add-dir', EPHEMERAL_ROOT);
    for (const skill of skillNames) {
      const dir = skillDirEphemeral(skill);
      if (dir) {
        flags.push('--add-dir', dir);
      }
    }
  } else {
    flags.push('--disable-slash-commands');
  }
  const hint = packSystemHint(request);
  if (hint) {
    flags.push('--append-system-prompt', hint);
  }
  if (mcp || hasSkillPack(request)) {
    flags.push(
      '--allow-dangerously-skip-permissions',
      '--dangerously-skip-permissions',
    );
  }
  return flags;
}

/**
 * Always Anthropic cloud via real `claude` CLI — never Ollama/OpenAI-compat
 * Messages API substitution.
 */
function claudeProviderEnv(request: AdapterRequest): Record<string, string> {
  return {
    HOME: '/home/agent',
    ANTHROPIC_API_KEY: request.apiKey,
    CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT: '1',
  };
}

export const claudeCodeAdapter: CliAgentAdapter = {
  slug: 'claude-code',
  displayName: 'Claude Code',
  description:
    'Запускает Claude Code (`claude -p`) с нативной Anthropic-моделью с ноды.',
  image: IMAGE,
  supportsToolsFilter: true,
  supportsSkillsFilter: true,
  plan(request: AdapterRequest) {
    const blocked = rejectUnsupportedFilters(claudeCodeAdapter, request);
    if (blocked) {
      return blocked;
    }
    const env = claudeProviderEnv(request);

    const mcp = hasMcpAttach(request);
    const ephemeral = needsEphemeralMaterialize(request);
    const tail = claudeTailFlags(request, mcp);

    if (mcp || ephemeral) {
      if (mcp && request.mcpAttach) {
        env.MCP_ATTACH_CONFIG = mcpConfigJsonEphemeral(request.mcpAttach);
      }
      if (ephemeral) {
        Object.assign(env, ephemeralEnvForRequest(request));
      }
      // Write MCP JSON via node (printf %s corrupts payloads containing '%').
      const writeMcp = mcp
        ? `node -e 'require("fs").writeFileSync(process.argv[1], process.env.MCP_ATTACH_CONFIG||"")' ${EPHEMERAL_MCP_CONFIG}`
        : '';
      const prelude = joinShellSteps(
        ...(ephemeral ? [EPHEMERAL_MATERIALIZE_SHELL] : []),
        ...(writeMcp ? [writeMcp] : []),
        'TASK=$1',
        'shift',
        'exec claude -p "$TASK" "$@"',
      );
      const command = [
        'sh',
        '-c',
        prelude,
        'sh',
        withPackTaskPrefix(request),
        ...tail,
      ];
      return isolateEmptyPackContext(
        okPlan(IMAGE, command, env, request),
        request,
      );
    }

    const command = [
      'claude',
      '-p',
      withPackTaskPrefix(request),
      ...tail,
    ];
    return isolateEmptyPackContext(okPlan(IMAGE, command, env, request), request);
  },
  parseUsage(stdout, stderr) {
    return parseOpenAiStyleUsage(`${stdout}\n${stderr}`);
  },
  extractText(stdout) {
    const body = stdout.trim();
    const jsonLine = body
      .split('\n')
      .map((l) => l.trim())
      .reverse()
      .find((l) => l.startsWith('{'));
    const candidate = jsonLine || body;
    try {
      const parsed = JSON.parse(candidate) as { result?: string; text?: string };
      if (typeof parsed.result === 'string') {
        return parsed.result;
      }
      if (typeof parsed.text === 'string') {
        return parsed.text;
      }
    } catch {
      // plain text
    }
    return body;
  },
};
