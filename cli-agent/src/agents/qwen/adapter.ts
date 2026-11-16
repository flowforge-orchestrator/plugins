import {
  bareModelId,
  hasMcpAttach,
  isolateEmptyPackContext,
  okPlan,
  openAiCompatibleBaseUrl,
  packSystemHint,
  rejectUnsupportedFilters,
  resolveBaseUrl,
  usesLocalOpenAiCompat,
  withPackTaskPrefix,
} from '../adapter-common';
import type { AdapterRequest, CliAgentAdapter } from '../types';
import { parseOpenAiStyleUsage } from '../usage';
import {
  mcpAttachWriteShell,
  mcpConfigJsonEphemeral,
  wrapEphemeralPlan,
} from '../../tools/runtime/ephemeral-pack';

const IMAGE = 'cli-agent-qwen:0.1.0';
const QWEN_SETTINGS = '/home/.qwen/settings.json';

export const qwenAdapter: CliAgentAdapter = {
  slug: 'qwen',
  displayName: 'Qwen Code',
  description: 'Запускает Qwen Code в одноразовом контейнере.',
  image: IMAGE,
  supportsToolsFilter: true,
  supportsSkillsFilter: true,
  plan(request: AdapterRequest) {
    const blocked = rejectUnsupportedFilters(qwenAdapter, request);
    if (blocked) {
      return blocked;
    }
    const baseUrl = resolveBaseUrl(request);
    const local = usesLocalOpenAiCompat(request);
    const modelId = bareModelId(request.model, request.provider);
    const openAiBase = baseUrl ? openAiCompatibleBaseUrl(baseUrl) : '';
    const apiKey = request.apiKey || 'ollama';
    const hint = packSystemHint(request);
    const task = withPackTaskPrefix(request);
    const prompt = hint ? `${hint}  ${task}` : task;
    const command = ['qwen'];
    if (local) {
      command.push('--auth-type', 'openai', '--openai-api-key', apiKey);
      if (openAiBase) {
        command.push('--openai-base-url', openAiBase);
      }
    }
    // Prefer --approval-mode=yolo; -y conflicts with --approval-mode.
    command.push('-p', prompt, '--approval-mode', 'yolo');
    if (modelId) {
      command.push('--model', modelId);
    }
    const env: Record<string, string> = {
      HOME: '/home',
      OPENAI_API_KEY: apiKey,
      ANTHROPIC_API_KEY: apiKey,
      QWEN_CODE_SUPPRESS_YOLO_WARNING: '1',
    };
    if (openAiBase) {
      env.OPENAI_BASE_URL = openAiBase;
      env.OPENAI_API_BASE = openAiBase;
    }
    const seed: string[] = [];
    if (hasMcpAttach(request) && request.mcpAttach) {
      env.MCP_ATTACH_CONFIG = mcpConfigJsonEphemeral(request.mcpAttach);
      seed.push('mkdir -p "$HOME/.qwen"', mcpAttachWriteShell(QWEN_SETTINGS));
    }
    return wrapEphemeralPlan(
      isolateEmptyPackContext(okPlan(IMAGE, command, env, request), request),
      request,
      env,
      seed,
    );
  },
  parseUsage(stdout, stderr) {
    return parseOpenAiStyleUsage(`${stdout}\n${stderr}`);
  },
  extractText(stdout) {
    return stdout.trim();
  },
};

// install hint: npm install -g @qwen-code/qwen-code || npm install -g @qwenlm/qwen-code
