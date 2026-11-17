import {
  bareModelId,
  hasMcpAttach,
  hasSkillPack,
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
import { opencodeMcpFromAttach } from '../../tools/mcp-attach';
import {
  EPHEMERAL_ROOT,
  mcpAttachB64WriteShell,
  mcpAttachForEphemeral,
  wrapEphemeralPlan,
} from '../../tools/runtime/ephemeral-pack';

const IMAGE = 'cli-agent-opencode:0.1.0';
/** Dedicated path — `~/.config/opencode/opencode.json` is rewritten without mcp. */
const OPENCODE_CONFIG_JSON = '/tmp/opencode-config.json';

export const opencodeAdapter: CliAgentAdapter = {
  slug: 'opencode',
  displayName: 'OpenCode',
  description: 'Запускает OpenCode (`opencode run`) в одноразовом контейнере.',
  image: IMAGE,
  // `opencode run` has no --tools/--skills; pack arrives via ephemeral --dir.
  supportsToolsFilter: true,
  supportsSkillsFilter: true,
  plan(request: AdapterRequest) {
    const blocked = rejectUnsupportedFilters(opencodeAdapter, request);
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
    const mcp = hasMcpAttach(request);

    const hint = packSystemHint(request);
    const task = withPackTaskPrefix(request);
    const prompt = hint ? `${hint}  ${task}` : task;
    const command = ['opencode', 'run', prompt];
    if (modelRef) {
      command.push('--model', modelRef);
    }
    const packOn = request.tools.length > 0 || hasSkillPack(request) || mcp;
    if (packOn) {
      command.push('--auto', '--format', 'json');
    }
    if (hasSkillPack(request)) {
      command.push('--dir', EPHEMERAL_ROOT);
    }
    const env: Record<string, string> = {
      HOME: '/home',
      OPENAI_API_KEY: request.apiKey,
      ANTHROPIC_API_KEY: request.apiKey,
      OPENCODE_PROVIDER: providerId,
      OPENCODE_MODEL: modelId,
    };
    if (baseUrl) {
      const openAiBase = openAiCompatibleBaseUrl(baseUrl);
      env.OPENAI_BASE_URL = openAiBase;
      env.OPENCODE_BASE_URL = openAiBase;
    }
    const seed: string[] = [];
    // Full config via OPENCODE_CONFIG — home opencode.json is clobbered by `run`.
    if (baseUrl && modelId) {
      const openAiBase = openAiCompatibleBaseUrl(baseUrl);
      const cfg: Record<string, unknown> = {
        $schema: 'https://opencode.ai/config.json',
        provider: {
          [providerId]: {
            npm: '@ai-sdk/openai-compatible',
            name: providerId,
            options: {
              baseURL: openAiBase,
              apiKey: request.apiKey || 'ollama',
            },
            models: {
              [modelId]: { name: modelId },
            },
          },
        },
        model: modelRef,
      };
      if (mcp && request.mcpAttach) {
        cfg.mcp = opencodeMcpFromAttach(
          mcpAttachForEphemeral(request.mcpAttach),
        );
      }
      env.MCP_ATTACH_B64 = Buffer.from(JSON.stringify(cfg), 'utf8').toString(
        'base64',
      );
      env.OPENCODE_CONFIG = OPENCODE_CONFIG_JSON;
      seed.push(mcpAttachB64WriteShell(OPENCODE_CONFIG_JSON));
    } else if (mcp && request.mcpAttach) {
      const cfg = {
        mcp: opencodeMcpFromAttach(mcpAttachForEphemeral(request.mcpAttach)),
      };
      env.MCP_ATTACH_B64 = Buffer.from(JSON.stringify(cfg), 'utf8').toString(
        'base64',
      );
      env.OPENCODE_CONFIG = OPENCODE_CONFIG_JSON;
      seed.push(mcpAttachB64WriteShell(OPENCODE_CONFIG_JSON));
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
    const lines = stdout.split('\n');
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i]?.trim();
      if (!line?.startsWith('{')) continue;
      try {
        const parsed = JSON.parse(line) as {
          type?: string;
          part?: { text?: string; type?: string };
          message?: { content?: string | Array<{ type?: string; text?: string }> };
          text?: string;
        };
        if (typeof parsed.text === 'string' && parsed.text.trim()) {
          return parsed.text.trim();
        }
        if (typeof parsed.part?.text === 'string' && parsed.part.text.trim()) {
          return parsed.part.text.trim();
        }
        if (typeof parsed.message?.content === 'string') {
          return parsed.message.content.trim();
        }
        if (Array.isArray(parsed.message?.content)) {
          const text = parsed.message.content
            .filter((c) => c.type === 'text' && typeof c.text === 'string')
            .map((c) => c.text as string)
            .join('');
          if (text.trim()) return text.trim();
        }
      } catch {
        // keep scanning
      }
    }
    return stdout.trim();
  },
};
