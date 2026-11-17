import {
  hermesMcpServersYaml,
  mcpConfigJsonFromAttach,
} from '../tools/mcp-attach';
import {
  EPHEMERAL_ROOT,
  resolvedSkillNames,
} from '../tools/runtime/ephemeral-pack';
import { A2A_SERVER_ID } from '../a2a/tools';
import { namedProviderBaseUrl } from './provider';
import type { AdapterPlan, AdapterRequest, CliAgentAdapter } from './types';

export function hasSkillPack(request: AdapterRequest): boolean {
  return (
    Boolean(request.skillAttach?.skills?.length) ||
    Boolean(request.rulesAttach?.rules?.length) ||
    request.skills.length > 0
  );
}

/**
 * Legacy pack tool ids (search/graph) — facts now come via mcpAttach MCP tools.
 * Kept for allowlist remapping when adapters still receive name lists.
 */
export const WORKSPACE_BIN_TOOLS = new Set([
  'add',
  'search',
  'graph',
  'rag-search',
  'rag-graph',
  'ground_entities',
  'trace_relation',
  'ontology',
  'inventory',
  'read_section',
  'normalize_ask',
]);

export function isWorkspaceBinTool(name: string): boolean {
  return WORKSPACE_BIN_TOOLS.has(name.trim());
}

/**
 * Map pack tool ids to CLI allowlists.
 * - `null` → do not pass a tools flag (keep CLI defaults that include shell)
 * - `string[]` → pass this allowlist (may remap pack ids → Bash/bash)
 */
export function cliToolAllowlist(
  tools: string[],
  kind: 'claude' | 'pi' | 'hermes' | 'passthrough',
): string[] | null {
  if (tools.length === 0) {
    return [];
  }
  const onlyWorkspaceBins = tools.every((t) => isWorkspaceBinTool(t));
  if (onlyWorkspaceBins) {
    if (kind === 'claude') return ['Bash'];
    if (kind === 'pi') return ['bash'];
    // Hermes toolsets do not know pack ids; keep default toolsets (shell).
    if (kind === 'hermes') return null;
    return null;
  }
  return tools;
}

export function rejectUnsupportedFilters(
  adapter: Pick<CliAgentAdapter, 'supportsToolsFilter' | 'supportsSkillsFilter'>,
  request: AdapterRequest,
): AdapterPlan | null {
  if (request.tools.length > 0 && !adapter.supportsToolsFilter) {
    return {
      ok: false,
      reason: 'this CLI cannot narrow tools; leave tools empty for defaults',
    };
  }
  if (request.skills.length > 0 && !adapter.supportsSkillsFilter) {
    return {
      ok: false,
      reason: 'this CLI cannot narrow skills; leave skills empty for defaults',
    };
  }
  return null;
}

export function resolveBaseUrl(request: AdapterRequest): string {
  if (request.baseUrl) {
    return request.baseUrl;
  }
  return namedProviderBaseUrl(request.provider);
}

/** Anthropic SDK appends `/v1/messages`; Ollama expects the host root, not `.../v1`. */
export function anthropicCompatibleBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '').replace(/\/v1$/i, '');
}

/** OpenAI-compatible clients expect a base that ends with `/v1`. */
export function openAiCompatibleBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) {
    return '';
  }
  return /\/v1$/i.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

/** Strip a leading `provider/` prefix from model ids when the CLI adds its own. */
export function bareModelId(model: string, provider: string): string {
  const trimmed = model.trim();
  if (!trimmed || !provider) {
    return trimmed;
  }
  const prefix = `${provider.trim().toLowerCase()}/`;
  if (trimmed.toLowerCase().startsWith(prefix)) {
    return trimmed.slice(prefix.length);
  }
  return trimmed;
}

export function usesLocalOpenAiCompat(request: AdapterRequest): boolean {
  return request.provider === 'ollama' || request.provider === 'custom';
}

export function workingDir(request: AdapterRequest): string {
  return request.workspaceMounted ? '/workspace' : '/tmp';
}

/** True when ToolProvider supplied an MCP attach descriptor. */
export function hasMcpAttach(request: AdapterRequest): boolean {
  return Boolean(request.mcpAttach?.servers?.length);
}

/** Claude-style mcpServers JSON from opaque attach. */
export function mcpConfigJsonFromRequest(request: AdapterRequest): string {
  if (!request.mcpAttach) return '';
  return mcpConfigJsonFromAttach(request.mcpAttach);
}

/**
 * Shell: write env MCP_ATTACH_CONFIG → /tmp/mcp-attach.json.
 * Set env.MCP_ATTACH_CONFIG = mcpConfigJsonFromRequest(request) before running.
 * Uses node (not printf) so payloads with '%' are not corrupted.
 */
export const MCP_ATTACH_WRITE_SHELL =
  'node -e \'require("fs").writeFileSync("/tmp/mcp-attach.json", process.env.MCP_ATTACH_CONFIG||"")\'';

/**
 * FORBIDDEN to answer from model memory / prior knowledge when pack tools,
 * MCP, or skills are attached — use those channels or fail honestly.
 */
export const PACK_NO_MEMORY_HINT =
  'FORBIDDEN: do not use your own memory, training data, or prior knowledge for facts. Use only attached tools (search/graph/MCP) and skills; if you cannot call them or they fail, say so honestly — do not invent an answer.';

const RAG_TOOL_NAME = /(?:^|__)rag_(?:search|graph)$/;

/** RAG fact tools in the attach; an attach without names is the legacy graph-kg pair. */
function ragToolNames(request: AdapterRequest): string[] {
  if (!hasMcpAttach(request)) return [];
  const names = request.mcpAttach?.toolNames;
  if (!names || names.length === 0) return ['rag_search', 'rag_graph'];
  return [...new Set(names.filter((n) => RAG_TOOL_NAME.test(n)))];
}

export function hasRagMcpAttach(request: AdapterRequest): boolean {
  return ragToolNames(request).length > 0;
}

/**
 * Names a CLI may expose a fact tool under: `<serverId>_<tool>` (OpenCode, Kilo) and
 * `mcp__<serverId>__<tool>` with hyphens folded to `_` (Hermes, Claude Code).
 * The A2A team server carries no fact tools.
 */
function ragQualifiedToolNames(request: AdapterRequest, tool: string): string[] {
  const out: string[] = [];
  for (const server of request.mcpAttach?.servers ?? []) {
    if (server.id === A2A_SERVER_ID) continue;
    out.push(`${server.id}_${tool}`, `mcp__${server.id.replace(/-/g, '_')}__${tool}`);
  }
  return out;
}

function ragToolLabel(request: AdapterRequest, tool: string): string {
  const names = ragQualifiedToolNames(request, tool);
  return names.length > 0 ? `${tool} (exposed as ${names.join(' or ')})` : tool;
}

/** Soft system hint when pack skills/tools or MCP attach are present. */
export function packSystemHint(request: AdapterRequest): string {
  const rag = ragToolNames(request);
  if (rag.length > 0) {
    const skillPaths = packContextPaths(request);
    return [
      PACK_NO_MEMORY_HINT,
      skillPaths.length > 0
        ? `Skills: read ${skillPaths.join(', ')} before working and follow them.`
        : 'Use attached MCP tools only for facts.',
      rag.length > 1
        ? `REQUIRED: call each fact tool at least once before answering: ${rag.map((t) => ragToolLabel(request, t)).join('; ')}.`
        : `REQUIRED: call the fact tool ${ragToolLabel(request, rag[0])} before answering.`,
      'If tools are deferred, use tool_search only to resolve those names, then call them. Files in the workspace are not the knowledge base.',
      'Answer only from tool results. If tools fail or return nothing useful, say so honestly — do not invent facts.',
      'A number that is not copied from tool output is valid only as the stdout of code you ran in this container (python or node). Quote the command and the stdout. Do not calculate in your head. The shell is not a source of story facts.',
    ]
      .filter(Boolean)
      .join(' ');
  }
  if (!hasSkillPack(request) && request.tools.length === 0) {
    return '';
  }
  const paths = packContextPaths(request);
  return [
    PACK_NO_MEMORY_HINT,
    `Skills and rules: read ${paths.length > 0 ? paths.join(', ') : `${EPHEMERAL_ROOT}/AGENTS.md and ${EPHEMERAL_ROOT}/skills/*`} before working and follow them.`,
    'Facts come only from attached tools and their results. Do not invent plot; no MEMORY.md or coding.',
  ].join(' ');
}

/** Imperative prefix merged into the user task so CLIs without a system channel still call bins. */
export function packTaskPrefix(request: AdapterRequest): string {
  const rag = ragToolNames(request);
  if (rag.length > 0) {
    const pick = (tool: string) => (rag.includes(tool) ? ragToolLabel(request, tool) : null);
    const search = pick('rag_search');
    const graph = pick('rag_graph');
    const steps = [
      search ? `call ${search} with the question text` : '',
      graph ? `call ${graph} with a key entity from the question` : '',
    ].filter(Boolean);
    return `${PACK_NO_MEMORY_HINT} First ${steps.join(', then ')}. Answer only from tool results; if tools fail, say so honestly. A derived number must be the stdout of python or node you ran in this container; quote the command and the stdout. Do not calculate in your head.`;
  }
  if (!hasSkillPack(request) && request.tools.length === 0) {
    return '';
  }
  return `${PACK_NO_MEMORY_HINT} Follow the attached skills and rules; take facts only from attached tool results; if tools fail, say so honestly.`;
}

/**
 * Hermes: seed ~/.hermes/config.yaml mcp_servers from env HERMES_MCP_YAML_B64
 * (base64 — assertEnv rejects newlines in values).
 */
export const HERMES_MCP_SEED_SHELL = [
  'mkdir -p "$HOME/.hermes"',
  `node - <<'NODE'
const fs = require('fs');
const path = require('path');
const os = require('os');
const p = path.join(os.homedir(), '.hermes', 'config.yaml');
let text = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
const b64 = process.env.HERMES_MCP_YAML_B64 || '';
if (!b64.trim()) process.exit(0);
let block = Buffer.from(b64, 'base64').toString('utf8');
if (!block.endsWith('\\n')) block += '\\n';
if (/^mcp_servers:\\s*$/m.test(text) || /^mcp_servers:/m.test(text)) {
  text = text.replace(/^mcp_servers:\\s*\\n[\\s\\S]*?(?=^[a-z_]+:|\\Z)/m, block);
} else {
  text = text.replace(/\\s*$/, '') + '\\n' + block;
}
fs.writeFileSync(p, text);
NODE`,
].join(' && ');

/** Re-export for adapters that write Hermes YAML from opaque attach. */
export { hermesMcpServersYaml };

export function withPackTaskPrefix(
  request: AdapterRequest,
  task: string = request.task,
): string {
  const prefix = packTaskPrefix(request);
  if (!prefix) return task;
  // Single-line friendly (assertEnv / message-file).
  return `${prefix}  Question: ${task}`;
}

/** Absolute skill/AGENTS paths under ephemeral /tmp/pack (materialized at run). */
export function packContextPaths(request: AdapterRequest): string[] {
  const names = resolvedSkillNames(request);
  if (names.length === 0 && !request.rulesAttach?.rules?.length) {
    return [];
  }
  const paths = [`${EPHEMERAL_ROOT}/AGENTS.md`];
  for (const skill of names) {
    const trimmed = skill.trim();
    if (!trimmed) continue;
    paths.push(
      trimmed.startsWith('/')
        ? trimmed
        : `${EPHEMERAL_ROOT}/skills/${trimmed}/SKILL.md`,
    );
  }
  return paths;
}

export function okPlan(
  image: string,
  command: string[],
  env: Record<string, string>,
  request: AdapterRequest,
): AdapterPlan {
  return {
    ok: true,
    image,
    command,
    env,
    workingDir: workingDir(request),
  };
}

/**
 * When tools/skills ports are empty, do not start in the mounted pack cwd
 * (AGENTS.md / project skills bleed). Mount may still exist for explicit paths.
 */
export function isolateEmptyPackContext(
  plan: AdapterPlan,
  request: AdapterRequest,
): AdapterPlan {
  if (!plan.ok) {
    return plan;
  }
  if (
    !hasSkillPack(request) &&
    request.tools.length === 0 &&
    !hasMcpAttach(request)
  ) {
    return { ...plan, workingDir: '/tmp' };
  }
  return plan;
}
