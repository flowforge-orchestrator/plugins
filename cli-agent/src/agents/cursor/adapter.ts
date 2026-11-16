import {
  hasMcpAttach,
  isolateEmptyPackContext,
  okPlan,
  packSystemHint,
  rejectUnsupportedFilters,
  usesLocalOpenAiCompat,
  withPackTaskPrefix,
} from '../adapter-common';
import type { AdapterPlan, AdapterRequest, CliAgentAdapter } from '../types';
import { parseOpenAiStyleUsage } from '../usage';
import { isGigachatOpenAiBaseUrl } from '../../tools/gigachat-oauth';
import {
  mcpAttachWriteShell,
  mcpConfigJsonEphemeral,
  wrapEphemeralPlan,
} from '../../tools/runtime/ephemeral-pack';

const IMAGE = 'cli-agent-cursor:0.1.0';
const CURSOR_MCP_JSON = '/home/.cursor/mcp.json';

function isLocalOrCompatEndpoint(baseUrl: string): boolean {
  const u = baseUrl.trim().toLowerCase();
  if (!u) return false;
  if (isGigachatOpenAiBaseUrl(baseUrl)) return true;
  return (
    u.includes('11434') ||
    u.includes('localhost') ||
    u.includes('127.0.0.1') ||
    u.includes('host.docker.internal')
  );
}

function withCursorMcp(
  plan: AdapterPlan,
  request: AdapterRequest,
  env: Record<string, string>,
): AdapterPlan {
  if (!plan.ok || !hasMcpAttach(request) || !request.mcpAttach) {
    return wrapEphemeralPlan(plan, request, env);
  }
  env.MCP_ATTACH_CONFIG = mcpConfigJsonEphemeral(request.mcpAttach);
  const seed = [
    'mkdir -p "$HOME/.cursor"',
    mcpAttachWriteShell(CURSOR_MCP_JSON),
  ];
  return wrapEphemeralPlan(plan, request, env, seed);
}

/**
 * Always invoke the real Cursor Agent CLI (`agent`).
 * Cursor Agent talks to Cursor cloud (`CURSOR_API_ENDPOINT` / api2.cursor.sh) —
 * it is not an OpenAI-compatible chat/completions client. Local Ollama/custom
 * endpoints are unsupported; we still launch the CLI (honest failure) rather
 * than substituting an HTTP wrapper.
 */
function planAgent(request: AdapterRequest): AdapterPlan {
  const task = withPackTaskPrefix(request);
  const command = [
    'agent',
    '-p',
    task,
    '--output-format',
    'stream-json',
    '--trust',
    '--force',
  ];
  if (request.model) {
    command.push('--model', request.model);
  }
  if (hasMcpAttach(request) || request.tools.length > 0) {
    command.push('--approve-mcps');
  }
  const hint = packSystemHint(request);
  if (hint) {
    command[2] = `${hint}  ${task}`;
  }
  const env: Record<string, string> = {
    HOME: '/home',
    PATH: '/usr/local/bin:/usr/bin:/bin',
    CURSOR_API_KEY: request.apiKey,
  };
  // Only forward an *explicit* Cursor API endpoint — never named OpenAI defaults
  // and never Ollama/GigaChat OpenAI-compat bases.
  const baseUrl = (request.baseUrl ?? '').trim();
  if (
    baseUrl &&
    !usesLocalOpenAiCompat(request) &&
    !isLocalOrCompatEndpoint(baseUrl)
  ) {
    env.CURSOR_API_ENDPOINT = baseUrl;
  }
  return withCursorMcp(
    isolateEmptyPackContext(okPlan(IMAGE, command, env, request), request),
    request,
    env,
  );
}

export const cursorAdapter: CliAgentAdapter = {
  slug: 'cursor',
  displayName: 'Cursor',
  description:
    'Запускает Cursor Agent CLI (`agent -p`) с нативной Cursor-моделью с ноды. Ollama/HTTP chat.completions не используется.',
  image: IMAGE,
  supportsToolsFilter: true,
  supportsSkillsFilter: true,
  plan(request: AdapterRequest) {
    const blocked = rejectUnsupportedFilters(cursorAdapter, request);
    if (blocked) {
      return blocked;
    }
    return planAgent(request);
  },
  parseUsage(stdout, stderr) {
    return parseOpenAiStyleUsage(`${stdout}\n${stderr}`);
  },
  extractText(stdout) {
    const body = stdout.trim();
    if (!body) return '';
    if (!body.includes('\n{') && !body.startsWith('{')) {
      return body;
    }
    let last = '';
    for (const line of body.split('\n')) {
      const t = line.trim();
      if (!t.startsWith('{')) continue;
      try {
        const parsed = JSON.parse(t) as {
          type?: string;
          result?: string;
          item?: { type?: string; text?: string };
        };
        if (typeof parsed.result === 'string' && parsed.result.trim()) {
          last = parsed.result.trim();
        }
        const item = parsed.item;
        if (
          item &&
          (item.type === 'agent_message' ||
            item.type === 'message' ||
            item.type === 'assistant') &&
          typeof item.text === 'string' &&
          item.text.trim()
        ) {
          last = item.text.trim();
        }
      } catch {
        // skip
      }
    }
    return last || body;
  },
};
