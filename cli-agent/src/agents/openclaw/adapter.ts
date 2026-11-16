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
import { openclawMcpServersFromAttach } from '../../tools/mcp-attach';
import type { McpAttach } from '../../tools/mcp-attach';
import {
  mcpAttachForEphemeral,
  wrapEphemeralPlan,
} from '../../tools/runtime/ephemeral-pack';

const IMAGE = 'cli-agent-openclaw:0.1.0';

/**
 * coding includes bundle-mcp and the shell. toolSearch off keeps those tools
 * in the model request. apply_patch and edit stay denied: GigaChat calls them
 * instead of MCP and the patch tool fails the run. write, exec and
 * code_execution stay available so a role can run arithmetic in its container.
 */
function openclawMcpToolPolicy(): Record<string, unknown> {
  return {
    profile: 'coding',
    toolSearch: false,
    deny: ['edit', 'apply_patch'],
  };
}

function openclawPrompt(request: AdapterRequest): string {
  const hint = packSystemHint(request);
  const task = withPackTaskPrefix(request);
  return hint ? `${hint}  ${task}` : task;
}

function openclawMcpWithEnvRefs(
  attach: McpAttach,
  processEnv: Record<string, string>,
): Record<string, unknown> {
  for (const server of attach.servers) {
    Object.assign(processEnv, server.env ?? {});
  }
  return openclawMcpServersFromAttach({
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

export const openclawAdapter: CliAgentAdapter = {
  slug: 'openclaw',
  displayName: 'OpenClaw',
  description: 'Запускает openclaw agent exec в одноразовом контейнере.',
  image: IMAGE,
  supportsToolsFilter: true,
  supportsSkillsFilter: true,
  plan(request: AdapterRequest) {
    const blocked = rejectUnsupportedFilters(openclawAdapter, request);
    if (blocked) {
      return blocked;
    }
    const baseUrl = resolveBaseUrl(request);
    const local = usesLocalOpenAiCompat(request);
    const providerId = local ? 'openai' : request.provider;
    const modelId = bareModelId(request.model, request.provider);
    const modelRef = modelId
      ? modelId.includes('/')
        ? modelId
        : `${providerId}/${modelId}`
      : '';
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
    const cwd = packCwd ? '/workspace' : '/tmp';

    const execTail: string[] = [
      'agent',
      'exec',
      '--json',
      '--cwd',
      cwd,
      '--thinking',
      'off',
      '--timeout',
      '150',
      '--message-file',
      '/tmp/openclaw-prompt.txt',
    ];
    if (modelRef) {
      execTail.push('--model', modelRef);
    }

    const writePrompt = 'printf %s "$1" > /tmp/openclaw-prompt.txt && shift';

    const mcpServers =
      mcp && request.mcpAttach
        ? openclawMcpWithEnvRefs(
            mcpAttachForEphemeral(request.mcpAttach),
            env,
          )
        : null;

    if (local && openAiBase && modelId && modelRef) {
      const openclawJson = JSON.stringify({
        models: {
          providers: {
            [providerId]: {
              baseUrl: openAiBase,
              apiKey: request.apiKey || 'ollama',
              api: 'openai-completions',
              models: [
                {
                  id: modelId,
                  name: modelId,
                  reasoning: false,
                  input: ['text'],
                  cost: {
                    input: 0,
                    output: 0,
                    cacheRead: 0,
                    cacheWrite: 0,
                  },
                  contextWindow: 128000,
                  maxTokens: 8192,
                },
              ],
            },
          },
        },
        agents: {
          defaults: {
            model: { primary: modelRef },
            timeoutSeconds: 300,
          },
        },
        ...(mcpServers
          ? { mcp: { servers: mcpServers }, tools: openclawMcpToolPolicy() }
          : {}),
      });
      env.OPENCLAW_CONFIG_JSON = openclawJson;
      const command = [
        'sh',
        '-c',
        [
          'mkdir -p "$HOME/.openclaw"',
          'printf %s "$OPENCLAW_CONFIG_JSON" > "$HOME/.openclaw/openclaw.json"',
          writePrompt,
          'exec openclaw "$@"',
        ].join(' && '),
        'openclaw',
        openclawPrompt(request),
        ...execTail,
      ];
      return wrapEphemeralPlan(
        isolateEmptyPackContext(okPlan(IMAGE, command, env, request), request),
        request,
        env,
      );
    }

    const seed =
      mcpServers != null
        ? [
            'mkdir -p "$HOME/.openclaw"',
            `node -e 'require("fs").writeFileSync(process.argv[1], JSON.stringify({mcp:{servers:JSON.parse(process.env.OPENCLAW_MCP_JSON||"{}")},tools:JSON.parse(process.env.OPENCLAW_TOOLS_JSON||"{}")},null,2))' "$HOME/.openclaw/openclaw.json"`,
          ]
        : [];
    if (mcpServers) {
      env.OPENCLAW_MCP_JSON = JSON.stringify(mcpServers);
      env.OPENCLAW_TOOLS_JSON = JSON.stringify(openclawMcpToolPolicy());
    }
    const command = [
      'sh',
      '-c',
      `${writePrompt} && exec openclaw "$@"`,
      'openclaw',
      openclawPrompt(request),
      ...execTail,
    ];
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
    const blob = stdout
      .split('\n')
      .filter((l) => !/^\$\s*\/workspace\/bin\//.test(l.trim()))
      .join('\n')
      .trim();
    const pick = (parsed: {
      final?: string;
      terminalReply?: { text?: string };
      message?: { content?: string } | string;
      text?: string;
      result?: { text?: string };
      payloads?: Array<{ text?: string }>;
    }): string | null => {
      if (typeof parsed.final === 'string' && parsed.final.trim()) {
        return parsed.final.trim();
      }
      if (typeof parsed.payloads?.[0]?.text === 'string') {
        return parsed.payloads[0].text.trim();
      }
      if (typeof parsed.terminalReply?.text === 'string') {
        return parsed.terminalReply.text;
      }
      if (typeof parsed.result?.text === 'string') return parsed.result.text;
      if (typeof parsed.text === 'string') return parsed.text;
      if (typeof parsed.message === 'string') return parsed.message;
      if (
        typeof parsed.message === 'object' &&
        typeof parsed.message?.content === 'string'
      ) {
        return parsed.message.content;
      }
      return null;
    };
    try {
      const whole = pick(JSON.parse(blob) as Parameters<typeof pick>[0]);
      if (whole) return whole;
    } catch {
      // fall through
    }
    const start = blob.indexOf('{');
    const end = blob.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        const whole = pick(
          JSON.parse(blob.slice(start, end + 1)) as Parameters<typeof pick>[0],
        );
        if (whole) return whole;
      } catch {
        // fall through
      }
    }
    return blob;
  },
};
