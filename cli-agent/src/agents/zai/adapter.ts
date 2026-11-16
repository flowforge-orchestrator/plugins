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
import { zaiMcpServersFromAttach } from '../../tools/mcp-attach';
import {
  mcpAttachB64WriteShell,
  mcpAttachForEphemeral,
  wrapEphemeralPlan,
} from '../../tools/runtime/ephemeral-pack';

const IMAGE = 'cli-agent-zai:0.1.0';
const ZCODE_SETTINGS = '/home/.zcode/cli/setting.json';

export const zaiAdapter: CliAgentAdapter = {
  slug: 'zai',
  displayName: 'Z.ai',
  description: 'Запускает Z.ai (`zcode --prompt`) в одноразовом контейнере.',
  image: IMAGE,
  supportsToolsFilter: true,
  supportsSkillsFilter: true,
  plan(request: AdapterRequest) {
    const blocked = rejectUnsupportedFilters(zaiAdapter, request);
    if (blocked) {
      return blocked;
    }
    const baseUrl = resolveBaseUrl(request);
    const local = usesLocalOpenAiCompat(request);
    const providerId = local
      ? 'custom'
      : request.provider === 'zai'
        ? 'zai'
        : request.provider;
    const modelId =
      bareModelId(request.model, providerId) ||
      bareModelId(request.model, 'custom');
    const hint = packSystemHint(request);
    const task = withPackTaskPrefix(request);
    const prompt = hint ? `${hint}  ${task}` : task;
    const command = ['zcode', '-p', prompt, '--mode', 'yolo'];
    if (modelId) {
      command.push('--model', `${providerId}/${modelId}`);
    }
    const env: Record<string, string> = {
      HOME: '/home',
      ZAI_API_KEY: request.apiKey,
      OPENAI_API_KEY: request.apiKey,
      ZCODE_PROVIDER: providerId,
      ZCODE_MODEL: modelId,
    };
    if (baseUrl) {
      const openAiBase = openAiCompatibleBaseUrl(baseUrl);
      env.ZAI_BASE_URL = openAiBase;
      env.OPENAI_BASE_URL = openAiBase;
      env.ZCODE_BASE_URL = openAiBase;
    }
    const seed: string[] = [];
    if (hasMcpAttach(request) && request.mcpAttach) {
      const settings = {
        features: { mcp: true },
        mcp: {
          servers: zaiMcpServersFromAttach(
            mcpAttachForEphemeral(request.mcpAttach),
          ),
        },
      };
      env.MCP_ATTACH_B64 = Buffer.from(
        JSON.stringify(settings),
        'utf8',
      ).toString('base64');
      seed.push(
        'mkdir -p "$HOME/.zcode/cli"',
        mcpAttachB64WriteShell(ZCODE_SETTINGS),
      );
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
