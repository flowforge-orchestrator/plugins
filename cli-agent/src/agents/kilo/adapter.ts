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
  withPackTaskPrefix,
} from '../adapter-common';
import type { AdapterRequest, CliAgentAdapter } from '../types';
import { parseOpenAiStyleUsage } from '../usage';
import { opencodeMcpFromAttach } from '../../tools/mcp-attach';
import {
  EPHEMERAL_ROOT,
  mcpAttachForEphemeral,
  wrapEphemeralPlan,
} from '../../tools/runtime/ephemeral-pack';

const IMAGE = 'cli-agent-kilo:0.1.0';

function kiloPrompt(request: AdapterRequest): string {
  const hint = packSystemHint(request);
  const task = withPackTaskPrefix(request);
  return hint ? `${hint}\n\n${task}` : task;
}

function appendKiloPackFlags(
  command: string[],
  request: AdapterRequest,
): void {
  if (packContextPaths(request).length > 0) {
    command.push('--dir', EPHEMERAL_ROOT);
    for (const path of packContextPaths(request)) {
      command.push('--file', path);
    }
  } else if (!hasMcpAttach(request)) {
    command.push('--pure');
  }
}

export const kiloAdapter: CliAgentAdapter = {
  slug: 'kilo',
  displayName: 'Kilo Code',
  description: 'Запускает kilo run в одноразовом контейнере.',
  image: IMAGE,
  supportsToolsFilter: true,
  supportsSkillsFilter: true,
  plan(request: AdapterRequest) {
    const blocked = rejectUnsupportedFilters(kiloAdapter, request);
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
    const openAiBase = baseUrl ? openAiCompatibleBaseUrl(baseUrl) : '';
    const env: Record<string, string> = {
      HOME: '/home',
      OPENAI_API_KEY: request.apiKey || 'ollama',
    };
    if (openAiBase) {
      env.OPENAI_BASE_URL = openAiBase;
      env.OPENAI_API_BASE = openAiBase;
    }

    const prompt = kiloPrompt(request);
    const local = usesLocalOpenAiCompat(request);

    const mcpBlock =
      hasMcpAttach(request) && request.mcpAttach
        ? opencodeMcpFromAttach(mcpAttachForEphemeral(request.mcpAttach))
        : null;

    // Kilo (OpenCode fork) needs ~/.config/kilo/opencode.json for local models.
    if (local && openAiBase && modelId) {
      const opencodeJson = JSON.stringify({
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
        ...(mcpBlock ? { mcp: mcpBlock } : {}),
      });
      env.KILO_OPENCODE_JSON = opencodeJson;
      const command = [
        'sh',
        '-c',
        'mkdir -p "$HOME/.config/kilo" && printf %s "$KILO_OPENCODE_JSON" > "$HOME/.config/kilo/opencode.json" && exec kilo "$@"',
        'kilo',
        'run',
        '--auto',
        '--format',
        'json',
      ];
      appendKiloPackFlags(command, request);
      if (modelRef) {
        command.push('-m', modelRef);
      }
      command.push(prompt);
      return wrapEphemeralPlan(
        isolateEmptyPackContext(okPlan(IMAGE, command, env, request), request),
        request,
        env,
      );
    }

    const seed =
      mcpBlock != null
        ? [
            'mkdir -p "$HOME/.config/kilo"',
            `node -e 'require("fs").writeFileSync(process.argv[1], JSON.stringify({mcp:JSON.parse(process.env.KILO_MCP_JSON||"{}")},null,2))' "$HOME/.config/kilo/opencode.json"`,
          ]
        : [];
    if (mcpBlock) {
      env.KILO_MCP_JSON = JSON.stringify(mcpBlock);
    }
    const command = ['kilo', 'run', '--auto', '--format', 'json'];
    appendKiloPackFlags(command, request);
    if (modelRef) {
      command.push('-m', modelRef);
    }
    command.push(prompt);
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
    const texts: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('{')) continue;
      try {
        const parsed = JSON.parse(trimmed) as {
          type?: string;
          part?: { text?: string; type?: string };
          message?: { content?: string };
          text?: string;
        };
        if (typeof parsed.text === 'string' && parsed.text.trim()) {
          texts.push(parsed.text.trim());
          continue;
        }
        if (
          parsed.type === 'text' &&
          typeof parsed.part?.text === 'string' &&
          parsed.part.text.trim()
        ) {
          texts.push(parsed.part.text.trim());
          continue;
        }
        if (typeof parsed.part?.text === 'string' && parsed.part.text.trim()) {
          texts.push(parsed.part.text.trim());
          continue;
        }
        if (typeof parsed.message?.content === 'string') {
          texts.push(parsed.message.content.trim());
        }
      } catch {
        // keep scanning
      }
    }
    if (texts.length > 0) {
      return texts[texts.length - 1] ?? '';
    }
    return stdout.trim();
  },
};
