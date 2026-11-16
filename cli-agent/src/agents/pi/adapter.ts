import {
  bareModelId,
  cliToolAllowlist,
  hasMcpAttach,
  okPlan,
  openAiCompatibleBaseUrl,
  packSystemHint,
  rejectUnsupportedFilters,
  resolveBaseUrl,
  usesLocalOpenAiCompat,
  isolateEmptyPackContext,
  withPackTaskPrefix,
} from '../adapter-common';
import type { AdapterPlan, AdapterRequest, CliAgentAdapter } from '../types';
import { parseOpenAiStyleUsage } from '../usage';
import {
  EPHEMERAL_MATERIALIZE_SHELL,
  EPHEMERAL_ROOT,
  EPHEMERAL_TOOL_BINS_SHELL,
  ephemeralEnvForRequest,
  joinShellSteps,
  needsEphemeralMaterialize,
  resolvedSkillNames,
} from '../../tools/runtime/ephemeral-pack';

const IMAGE = 'cli-agent-pi:0.1.0';

/**
 * Drop message_update / thinking deltas so Docker stream caps keep tool calls
 * + final answer. Runs in the container via `node -e`.
 */
const PI_NDJSON_FILTER = [
  'const keep=new Set(["session","agent_start","agent_end","turn_start","turn_end","message_end","tool_execution_start","tool_execution_end"]);',
  'const rl=require("readline").createInterface({input:process.stdin,crlfDelay:Infinity});',
  'rl.on("line",line=>{',
  'const t=line.trim();',
  'if(!t.startsWith("{"))return;',
  'try{',
  'const o=JSON.parse(t);',
  'if(!keep.has(o.type))return;',
  'if(o.type==="message_end"){',
  'const r=o.message&&o.message.role;',
  'if(r!=="assistant"&&r!=="toolResult")return;',
  '}',
  'process.stdout.write(t+"\\n");',
  '}catch{}})',
].join('');

function skillPath(skill: string): string {
  const trimmed = skill.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.startsWith('/')
    ? trimmed
    : `${EPHEMERAL_ROOT}/skills/${trimmed}`;
}

/** Copy ToolProvider env so bash bins can run without spawning MCP stdio. */
function mergeMcpToolEnv(
  env: Record<string, string>,
  request: AdapterRequest,
): void {
  const serverEnv = request.mcpAttach?.servers?.[0]?.env;
  if (!serverEnv) return;
  for (const key of [
    'TOOL_PROVIDER_TOOLS',
    'CONVEYOR_API_BASE',
    'TOOL_PROVIDER_SESSION',
    'CHUK_SEARCH_DIAGRAM_ID',
    'CHUK_GRAPH_DIAGRAM_ID',
  ]) {
    if (typeof serverEnv[key] === 'string' && serverEnv[key]) {
      env[key] = serverEnv[key];
    }
  }
}

function withEphemeralPrelude(
  plan: AdapterPlan,
  request: AdapterRequest,
  env: Record<string, string>,
): AdapterPlan {
  if (!plan.ok || !needsEphemeralMaterialize(request)) {
    return plan;
  }
  Object.assign(env, ephemeralEnvForRequest(request));
  mergeMcpToolEnv(env, request);
  const steps = [
    EPHEMERAL_MATERIALIZE_SHELL,
    ...(hasMcpAttach(request) ? [EPHEMERAL_TOOL_BINS_SHELL] : []),
  ];
  if (plan.command[0] === 'sh' && plan.command[1] === '-c') {
    return {
      ...plan,
      env: { ...plan.env, ...env },
      command: [
        'sh',
        '-c',
        joinShellSteps(...steps, String(plan.command[2])),
        ...plan.command.slice(3),
      ],
    };
  }
  return {
    ...plan,
    env: { ...plan.env, ...env },
    command: [
      'sh',
      '-c',
      joinShellSteps(...steps, 'exec "$0" "$@"'),
      ...plan.command,
    ],
  };
}

/** Append tools/skills/context flags so ports are the source of truth. */
function appendPackFlags(command: string[], request: AdapterRequest): void {
  command.push('--no-session', '--no-extensions');
  // JSON mode keeps toolCall.command in stdout so metrics can count bin use.
  // Thinking off: less delta noise (filter drops the rest).
  command.push('--mode', 'json', '--thinking', 'off');
  const hint = packSystemHint(request);
  if (hint) {
    command.push('--append-system-prompt', hint);
  }
  const allow = cliToolAllowlist(request.tools, 'pi');
  if (allow == null) {
    // Workspace bin tools: keep default builtins (incl. bash).
  } else if (allow.length > 0) {
    command.push('--tools', allow.join(','));
  } else {
    command.push('--no-tools');
  }
  const skillNames = resolvedSkillNames(request);
  if (skillNames.length > 0) {
    for (const skill of skillNames) {
      const path = skillPath(skill);
      if (path) {
        command.push('--skill', path);
      }
    }
  } else {
    // Empty skills: no discovery and no AGENTS.md / CLAUDE.md from workspace.
    command.push('--no-skills', '--no-context-files');
  }
}

type ContentPart = {
  type?: string;
  text?: string;
  name?: string;
  arguments?: { command?: string };
};

function isToolMarkup(text: string): boolean {
  return /bashcall|tool_call|<\|\/?tool|```bash\s*call|<\/?tool_call|call:bash/i.test(
    text,
  );
}

function textFromParts(content: ContentPart[] | undefined): {
  text: string;
  hasToolCall: boolean;
} {
  if (!Array.isArray(content)) {
    return { text: '', hasToolCall: false };
  }
  let hasToolCall = false;
  const texts: string[] = [];
  for (const part of content) {
    if (part.type === 'toolCall') {
      hasToolCall = true;
      continue;
    }
    if (part.type === 'text' && typeof part.text === 'string') {
      texts.push(part.text);
    }
  }
  const text = texts.join('').trim();
  return {
    text: text && !isToolMarkup(text) ? text : '',
    hasToolCall,
  };
}

/** Exported for unit tests. */
export function extractPiJsonText(stdout: string): string {
  let lastFinal = '';
  let lastAny = '';

  const consider = (content: ContentPart[] | undefined) => {
    const { text, hasToolCall } = textFromParts(content);
    if (!text || text === '…truncated') return;
    lastAny = text;
    // Prefer answer turns (text without toolCall in the same message).
    if (!hasToolCall) {
      lastFinal = text;
    }
  };

  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(trimmed) as {
        type?: string;
        message?: {
          role?: string;
          content?: ContentPart[];
          stopReason?: string;
        };
        messages?: Array<{
          role?: string;
          content?: ContentPart[];
          stopReason?: string;
        }>;
      };
      if (
        (parsed.type === 'message_end' || parsed.type === 'turn_end') &&
        parsed.message?.role === 'assistant'
      ) {
        consider(parsed.message.content);
      }
      if (parsed.type === 'agent_end' && Array.isArray(parsed.messages)) {
        for (const msg of parsed.messages) {
          if (msg.role === 'assistant') consider(msg.content);
        }
      }
    } catch {
      // keep scanning
    }
  }

  if (lastFinal) return lastFinal;
  if (lastAny) return lastAny;

  // Clipped JSON fallback: last non-markup "text" field.
  const matches = [
    ...stdout.matchAll(/"type"\s*:\s*"text"\s*,\s*"text"\s*:\s*"((?:\\.|[^"\\])*)"/g),
  ];
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const raw = matches[i]?.[1];
    if (!raw) continue;
    let decoded = raw;
    try {
      decoded = JSON.parse(`"${raw}"`) as string;
    } catch {
      // keep raw
    }
    if (decoded.trim() && !isToolMarkup(decoded) && decoded.trim() !== '…truncated') {
      return decoded.trim();
    }
  }
  return '';
}

function withNdjsonFilter(
  plan: AdapterPlan,
  env: Record<string, string>,
): AdapterPlan {
  if (!plan.ok) return plan;
  env.PI_NDJSON_FILTER = PI_NDJSON_FILTER;
  const inner = plan.command;
  // pi … → sh -c 'pi "$@" | node -e "$PI_NDJSON_FILTER"' pi …
  if (inner[0] === 'pi') {
    return {
      ...plan,
      env: { ...plan.env, ...env },
      command: [
        'sh',
        '-c',
        'pi "$@" | node -e "$PI_NDJSON_FILTER"',
        'pi',
        ...inner.slice(1),
      ],
    };
  }
  // sh -c 'mkdir … && exec pi "$@"' → mkdir … && pi "$@" | filter
  if (inner[0] === 'sh' && inner[1] === '-c' && typeof inner[2] === 'string') {
    const script = inner[2]
      .replace(
        /&&\s*exec\s+pi\s+-p\s+"\$TASK"\s+"\$@"/,
        '&& pi -p "$TASK" "$@" | node -e "$PI_NDJSON_FILTER"',
      )
      .replace(
        /&&\s*exec\s+pi\s+-p\s+"\$PI_TASK"\s+"\$@"/,
        '&& pi -p "$PI_TASK" "$@" | node -e "$PI_NDJSON_FILTER"',
      )
      .replace(
        /&&\s*exec\s+pi\s+"\$@"/,
        '&& pi "$@" | node -e "$PI_NDJSON_FILTER"',
      )
      .replace(
        /&&\s*pi\s+"\$@"\s*$/,
        '&& pi "$@" | node -e "$PI_NDJSON_FILTER"',
      );
    return {
      ...plan,
      env: { ...plan.env, ...env },
      command: ['sh', '-c', script, ...inner.slice(3)],
    };
  }
  return { ...plan, env: { ...plan.env, ...env } };
}

export const piAdapter: CliAgentAdapter = {
  slug: 'pi',
  displayName: 'pi (pi.dev)',
  description: 'Запускает pi (pi.dev) в одноразовом контейнере.',
  image: IMAGE,
  supportsToolsFilter: true,
  supportsSkillsFilter: true,
  plan(request: AdapterRequest) {
    const blocked = rejectUnsupportedFilters(piAdapter, request);
    if (blocked) {
      return blocked;
    }
    if (hasMcpAttach(request)) {
      return {
        ok: false,
        reason:
          'pi has no native MCP client; cannot call attached tools',
      };
    }
    const baseUrl = resolveBaseUrl(request);
    const providerId = usesLocalOpenAiCompat(request)
      ? request.provider === 'custom'
        ? 'custom'
        : 'ollama'
      : request.provider;
    const modelId = bareModelId(request.model, providerId);
    const openAiBase = baseUrl ? openAiCompatibleBaseUrl(baseUrl) : '';
    const env: Record<string, string> = {
      HOME: '/home',
      OPENAI_API_KEY: request.apiKey,
      ANTHROPIC_API_KEY: request.apiKey,
    };
    if (openAiBase) {
      env.OPENAI_BASE_URL = openAiBase;
      env.OPENAI_API_BASE = openAiBase;
    }

    // Local OpenAI-compat (Ollama/vLLM) needs ~/.pi/agent/models.json —
    // pi has no built-in "ollama" provider without that file.
    if (usesLocalOpenAiCompat(request) && openAiBase && modelId) {
      const modelsJson = JSON.stringify({
        providers: {
          [providerId]: {
            baseUrl: openAiBase,
            api: 'openai-completions',
            apiKey: request.apiKey || 'ollama',
            compat: {
              supportsDeveloperRole: false,
              supportsReasoningEffort: false,
            },
            models: [{ id: modelId }],
          },
        },
      });
      const command = [
        'sh',
        '-c',
        'mkdir -p "$HOME/.pi/agent" && printf %s "$PI_MODELS_JSON" > "$HOME/.pi/agent/models.json" && exec pi -p "$PI_TASK" "$@"',
        'pi',
        '--provider',
        providerId,
        '--model',
        modelId,
      ];
      appendPackFlags(command, request);
      env.PI_MODELS_JSON = modelsJson;
      env.PI_TASK = withPackTaskPrefix(request);
      const planned = withEphemeralPrelude(
        isolateEmptyPackContext(okPlan(IMAGE, command, env, request), request),
        request,
        env,
      );
      return withNdjsonFilter(planned, env);
    }

    const command = ['pi', '-p', withPackTaskPrefix(request)];
    if (providerId) {
      command.push('--provider', providerId);
    }
    if (modelId) {
      command.push('--model', modelId);
    }
    appendPackFlags(command, request);
    const planned = withEphemeralPrelude(
      isolateEmptyPackContext(okPlan(IMAGE, command, env, request), request),
      request,
      env,
    );
    return withNdjsonFilter(planned, env);
  },
  parseUsage(stdout, stderr) {
    return parseOpenAiStyleUsage(`${stdout}\n${stderr}`);
  },
  extractText(stdout) {
    return extractPiJsonText(stdout) || stdout.trim();
  },
};

// install hint: npm install -g @mariozechner/pi-coding-agent || npm install -g pi
