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
import { crushMcpFromAttach } from '../../tools/mcp-attach';
import type { McpAttach } from '../../tools/mcp-attach';
import {
  mcpAttachForEphemeral,
  wrapEphemeralPlan,
} from '../../tools/runtime/ephemeral-pack';

const IMAGE = 'cli-agent-crush:0.1.0';

function crushPermissions(request: AdapterRequest): Record<string, unknown> | undefined {
  if (
    request.skills.length === 0 &&
    request.tools.length === 0 &&
    !hasMcpAttach(request)
  ) {
    return undefined;
  }
  return {
    allowed_tools: ['bash', 'view', 'ls', 'grep', 'agent', 'mcp'],
  };
}

function crushPrompt(request: AdapterRequest): string {
  const hint = packSystemHint(request);
  const task = withPackTaskPrefix(request);
  return hint ? `${hint}\n\n${task}` : task;
}

/**
 * Crush expands `$...` inside MCP env values. Tool source contains JS template
 * literals (`${BASE}`), so pass env by reference instead of embedding it.
 */
function crushMcpWithEnvRefs(
  attach: McpAttach,
  processEnv: Record<string, string>,
): Record<string, unknown> {
  for (const server of attach.servers) {
    Object.assign(processEnv, server.env ?? {});
  }
  return crushMcpFromAttach({
    ...attach,
    servers: attach.servers.map((server) => ({
      ...server,
      ...(server.env
        ? {
            env: Object.fromEntries(
              Object.keys(server.env).map((key) => [key, `\${${key}}`]),
            ),
          }
        : {}),
    })),
  });
}

export const crushAdapter: CliAgentAdapter = {
  slug: 'crush',
  displayName: 'Crush',
  description: 'Запускает crush run в одноразовом контейнере.',
  image: IMAGE,
  supportsToolsFilter: true,
  supportsSkillsFilter: true,
  plan(request: AdapterRequest) {
    const blocked = rejectUnsupportedFilters(crushAdapter, request);
    if (blocked) {
      return blocked;
    }
    const baseUrl = resolveBaseUrl(request);
    const providerId = usesLocalOpenAiCompat(request)
      ? 'ollama'
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

    const mcp = hasMcpAttach(request);
    const packCwd =
      request.workspaceMounted &&
      (request.skills.length > 0 || request.tools.length > 0);
    const mcpBlock =
      mcp && request.mcpAttach
        ? crushMcpWithEnvRefs(
            mcpAttachForEphemeral(request.mcpAttach),
            env,
          )
        : null;

    const crushRunTail: string[] = [
      '--data-dir',
      '/tmp/crush-data',
      'run',
    ];
    if (!packCwd) {
      crushRunTail.push('--quiet');
    }
    if (packCwd) {
      crushRunTail.push('-c', '/workspace');
    }
    if (modelRef) {
      crushRunTail.push('-m', modelRef);
    }

    if (usesLocalOpenAiCompat(request) && openAiBase && modelId) {
      const crushJson: Record<string, unknown> = {
        providers: {
          [providerId]: {
            base_url: openAiBase,
            api_key: request.apiKey || 'ollama',
            type: 'openai',
            models: [
              {
                id: modelId,
                name: modelId,
                context_window: 128000,
              },
            ],
          },
        },
        models: {
          large: { provider: providerId, model: modelId },
          small: { provider: providerId, model: modelId },
        },
      };
      const permissions = crushPermissions(request);
      if (permissions) {
        crushJson.permissions = permissions;
      }
      if (mcpBlock) {
        crushJson.mcp = mcpBlock;
      }
      env.CRUSH_CONFIG_JSON = JSON.stringify(crushJson);

      const command = [
        'sh',
        '-c',
        'mkdir -p "$HOME/.config/crush" /tmp/crush-data && printf %s "$CRUSH_CONFIG_JSON" > "$HOME/.config/crush/crush.json" && exec crush "$@"',
        'crush',
        ...crushRunTail,
        crushPrompt(request),
      ];
      return wrapEphemeralPlan(
        isolateEmptyPackContext(okPlan(IMAGE, command, env, request), request),
        request,
        env,
      );
    }

    const seed =
      mcpBlock != null
        ? [
            'mkdir -p "$HOME/.config/crush" /tmp/crush-data',
            `node -e 'require("fs").writeFileSync(process.argv[1], JSON.stringify({mcp:JSON.parse(process.env.CRUSH_MCP_JSON||"{}")},null,2))' "$HOME/.config/crush/crush.json"`,
          ]
        : ['mkdir -p /tmp/crush-data'];
    if (mcpBlock) {
      env.CRUSH_MCP_JSON = JSON.stringify(mcpBlock);
    }
    const command = ['crush', ...crushRunTail, crushPrompt(request)];
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
