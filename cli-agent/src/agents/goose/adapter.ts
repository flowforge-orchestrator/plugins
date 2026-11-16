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
import { gooseExtensionsYamlFromAttach } from '../../tools/mcp-attach';
import {
  mcpAttachForEphemeral,
  wrapEphemeralPlan,
} from '../../tools/runtime/ephemeral-pack';

const IMAGE = 'cli-agent-goose:0.1.0';

export const gooseAdapter: CliAgentAdapter = {
  slug: 'goose',
  displayName: 'goose',
  description: 'Запускает goose run --no-session в одноразовом контейнере.',
  image: IMAGE,
  supportsToolsFilter: true,
  supportsSkillsFilter: true,
  plan(request: AdapterRequest) {
    const blocked = rejectUnsupportedFilters(gooseAdapter, request);
    if (blocked) {
      return blocked;
    }
    const baseUrl = resolveBaseUrl(request);
    const gooseProvider = usesLocalOpenAiCompat(request)
      ? 'openai'
      : request.provider || 'openai';
    const modelId = bareModelId(request.model, request.provider);
    const mcp = hasMcpAttach(request);
    const packActive =
      request.skills.length > 0 || request.tools.length > 0 || mcp;
    const env: Record<string, string> = {
      HOME: '/home',
      OPENAI_API_KEY: request.apiKey || 'ollama',
      GOOSE_PROVIDER: gooseProvider,
    };
    if (modelId) {
      env.GOOSE_MODEL = modelId;
    }
    if (baseUrl) {
      const openAiBase = openAiCompatibleBaseUrl(baseUrl);
      env.OPENAI_BASE_URL = openAiBase;
      env.OPENAI_HOST = openAiBase.replace(/\/v1\/?$/i, '');
      env.GOOSE_PROVIDER = gooseProvider;
    }

    const system = packSystemHint(request);
    const flagsAfterText: string[] = ['--provider', gooseProvider];
    if (packActive) {
      flagsAfterText.push(
        '--no-profile',
        '--with-builtin',
        'developer',
        '--max-turns',
        '8',
      );
    }
    if (system) {
      flagsAfterText.push('--system', system);
    }
    if (modelId) {
      flagsAfterText.push('--model', modelId);
    }

    const seed: string[] = [];
    if (mcp && request.mcpAttach) {
      env.GOOSE_EXTENSIONS_B64 = Buffer.from(
        gooseExtensionsYamlFromAttach(mcpAttachForEphemeral(request.mcpAttach)),
        'utf8',
      ).toString('base64');
      seed.push(
        'mkdir -p "$HOME/.config/goose"',
        'node -e \'require("fs").writeFileSync(process.env.HOME+"/.config/goose/config.yaml", Buffer.from(process.env.GOOSE_EXTENSIONS_B64||"","base64"))\'',
      );
    }

    const command = ['goose', 'run', '--no-session'];
    if (!packActive) {
      command.push('--quiet');
    }
    command.push('-t', withPackTaskPrefix(request), ...flagsAfterText);
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
    return stdout
      .split('\n')
      .filter((l) => !/^\$\s*\/workspace\/bin\//.test(l.trim()))
      .join('\n')
      .trim();
  },
};
