import {
  bareModelId,
  okPlan,
  openAiCompatibleBaseUrl,
  packSystemHint,
  rejectUnsupportedFilters,
  resolveBaseUrl,
  isolateEmptyPackContext,
  withPackTaskPrefix,
} from '../adapter-common';
import type { AdapterRequest, CliAgentAdapter } from '../types';
import { parseOpenAiStyleUsage } from '../usage';
import { wrapEphemeralPlan } from '../../tools/runtime/ephemeral-pack';

const IMAGE = 'cli-agent-openhands:0.1.0';

export const openhandsAdapter: CliAgentAdapter = {
  slug: 'openhands',
  displayName: 'OpenHands',
  description: 'Запускает openhands --headless в одноразовом контейнере.',
  image: IMAGE,
  supportsToolsFilter: true,
  supportsSkillsFilter: true,
  plan(request: AdapterRequest) {
    const blocked = rejectUnsupportedFilters(openhandsAdapter, request);
    if (blocked) {
      return blocked;
    }
    const baseUrl = resolveBaseUrl(request);
    const modelId = bareModelId(request.model, request.provider);
    const hint = packSystemHint(request);
    const task = withPackTaskPrefix(request);
    const prompt = hint ? `${hint}  ${task}` : task;
    const command = [
      'openhands',
      '--headless',
      '--override-with-envs',
      '-t',
      prompt,
    ];
    const env: Record<string, string> = {
      HOME: '/home',
      LLM_API_KEY: request.apiKey,
      OPENAI_API_KEY: request.apiKey,
    };
    if (modelId) {
      env.LLM_MODEL = modelId;
    }
    if (baseUrl) {
      const openAiBase = openAiCompatibleBaseUrl(baseUrl);
      env.LLM_BASE_URL = openAiBase;
      env.OPENAI_BASE_URL = openAiBase;
    }
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
