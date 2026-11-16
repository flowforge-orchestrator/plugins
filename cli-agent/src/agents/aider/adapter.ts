import {
  bareModelId,
  hasMcpAttach,
  isolateEmptyPackContext,
  okPlan,
  openAiCompatibleBaseUrl,
  packContextPaths,
  packSystemHint,
  rejectUnsupportedFilters,
  resolveBaseUrl,
  usesLocalOpenAiCompat,
} from '../adapter-common';
import type { AdapterRequest, CliAgentAdapter } from '../types';
import { parseOpenAiStyleUsage } from '../usage';
import {
  EPHEMERAL_MATERIALIZE_SHELL,
  ephemeralEnvForRequest,
  joinShellSteps,
  needsEphemeralMaterialize,
} from '../../tools/runtime/ephemeral-pack';

const IMAGE = 'cli-agent-aider:0.1.0';

/** Shared one-shot flags: history under /tmp (workspace may be non-writable). */
const AIDER_BASE_FLAGS = [
  '--yes-always',
  '--no-git',
  '--no-auto-commits',
  '--no-suggest-shell-commands',
  '--no-show-model-warnings',
  '--no-analytics',
  '--no-stream',
  '--input-history-file',
  '/tmp/aider.input.history',
  '--chat-history-file',
  '/tmp/aider.chat.history.md',
] as const;

/**
 * Aider routes models through litellm, which requires a `provider/model` id.
 * Local OpenAI-compatible endpoints (ollama/custom) use the `openai/` prefix
 * plus OPENAI_API_BASE — same as the chuk-gek smoke matrix.
 */
export function aiderLitellmModel(request: AdapterRequest): string {
  const raw = (request.model ?? '').trim();
  if (!raw) {
    return '';
  }
  if (raw.includes('/')) {
    return raw;
  }
  if (usesLocalOpenAiCompat(request) || request.provider === 'openai') {
    return `openai/${bareModelId(raw, 'openai')}`;
  }
  if (request.provider === 'openrouter') {
    return `openrouter/${bareModelId(raw, 'openrouter')}`;
  }
  if (request.provider === 'anthropic') {
    return `anthropic/${bareModelId(raw, 'anthropic')}`;
  }
  return `openai/${raw}`;
}

function aiderMessage(request: AdapterRequest): string {
  const hint = packSystemHint(request);
  return hint ? `${hint}  ${request.task}` : request.task;
}

export const aiderAdapter: CliAgentAdapter = {
  slug: 'aider',
  displayName: 'Aider',
  description: 'Запускает Aider в одноразовом контейнере.',
  image: IMAGE,
  supportsToolsFilter: true,
  supportsSkillsFilter: true,
  plan(request: AdapterRequest) {
    const blocked = rejectUnsupportedFilters(aiderAdapter, request);
    if (blocked) {
      return blocked;
    }
    if (hasMcpAttach(request)) {
      return {
        ok: false,
        reason:
          'aider has no MCP client; cannot call attached tools',
      };
    }
    const modelRef = aiderLitellmModel(request);
    const baseUrl = resolveBaseUrl(request);
    const env: Record<string, string> = {
      HOME: '/home',
      OPENAI_API_KEY: request.apiKey,
      ANTHROPIC_API_KEY: request.apiKey,
    };
    if (baseUrl) {
      const openAiBase = openAiCompatibleBaseUrl(baseUrl);
      env.OPENAI_API_BASE = openAiBase;
      env.OPENAI_BASE_URL = openAiBase;
    }

    const readPaths = packContextPaths(request);
    const command = [
      'timeout',
      '30',
      'aider',
      ...AIDER_BASE_FLAGS,
      '--message',
      aiderMessage(request),
    ];
    for (const path of readPaths) {
      command.push('--read', path);
    }
    if (modelRef) {
      command.push('--model', modelRef);
    }
    let planned = isolateEmptyPackContext(
      okPlan(IMAGE, command, env, request),
      request,
    );
    if (planned.ok && needsEphemeralMaterialize(request)) {
      Object.assign(env, ephemeralEnvForRequest(request));
      planned = {
        ...planned,
        env: { ...planned.env, ...env },
        command: [
          'sh',
          '-c',
          joinShellSteps(EPHEMERAL_MATERIALIZE_SHELL, 'exec "$0" "$@"'),
          ...planned.command,
        ],
      };
    }
    return planned;
  },
  parseUsage(stdout, stderr) {
    return parseOpenAiStyleUsage(`${stdout}\n${stderr}`);
  },
  extractText(stdout) {
    const text = stdout
      .split('\n')
      .filter((l) => !/^\$\s*\/workspace\/bin\//.test(l.trim()))
      .join('\n')
      .trim();
    const answerBlock = text.match(
      /►\s*ANSWER\s*\n+([\s\S]*?)(?:\nTokens:|\n►|\n─{3,}|$)/i,
    );
    if (answerBlock?.[1]?.trim()) {
      return answerBlock[1].trim();
    }
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const skip =
      /^(Aider v|Model:|Git repo:|Repo-map:|Added |https:\/\/aider|Warning:|─+|• |Tokens:|►)/;
    const kept = lines.filter((l) => !skip.test(l));
    if (kept.length > 0) {
      return kept[kept.length - 1] ?? text;
    }
    return text;
  },
};
