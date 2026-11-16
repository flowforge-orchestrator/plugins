import {
  bareModelId,
  okPlan,
  openAiCompatibleBaseUrl,
  packSystemHint,
  rejectUnsupportedFilters,
  resolveBaseUrl,
  usesLocalOpenAiCompat,
  isolateEmptyPackContext,
  withPackTaskPrefix,
} from '../adapter-common';
import type { AdapterRequest, CliAgentAdapter } from '../types';
import { parseOpenAiStyleUsage } from '../usage';
import { wrapEphemeralPlan } from '../../tools/runtime/ephemeral-pack';

const IMAGE = 'cli-agent-cline:0.1.0';

export const clineAdapter: CliAgentAdapter = {
  slug: 'cline',
  displayName: 'Cline',
  description: 'Запускает Cline в одноразовом контейнере.',
  image: IMAGE,
  supportsToolsFilter: true,
  supportsSkillsFilter: true,
  plan(request: AdapterRequest) {
    const blocked = rejectUnsupportedFilters(clineAdapter, request);
    if (blocked) {
      return blocked;
    }
    const baseUrl = resolveBaseUrl(request);
    const providerId = usesLocalOpenAiCompat(request)
      ? request.provider === 'custom'
        ? 'custom'
        : 'ollama'
      : request.provider;
    const modelId = bareModelId(request.model, providerId);
    const modelRef = modelId ? `${providerId}/${modelId}` : '';
    const hint = packSystemHint(request);
    const task = withPackTaskPrefix(request);
    const prompt = hint ? `${hint}  ${task}` : task;
    const command = (() => {
      const cmd = ['cline', '-y', prompt];
      if (modelRef) cmd.push('--model', modelRef);
      return cmd;
    })();
    const env: Record<string, string> = {
      HOME: '/home',
      OPENAI_API_KEY: request.apiKey,
      ANTHROPIC_API_KEY: request.apiKey,
    };
    if (baseUrl) {
      const openAiBase = openAiCompatibleBaseUrl(baseUrl);
      env.OPENAI_BASE_URL = openAiBase;
      env.OPENAI_API_BASE = openAiBase;
    }
    // Cline CLI has no stable MCP seed API in this image; materialize bridge + hints.
    return wrapEphemeralPlan(
      isolateEmptyPackContext(okPlan(IMAGE, command, env, request), request),
      request,
      env,
    );
  },
  parseUsage(stdout, stderr) {
    return parseOpenAiStyleUsage(`${stdout}\n${stderr}`);
  },
  extractText(stdout) {
    return stdout.trim();
  },
};

// install hint: npm install -g cline
