/**
 * Opaque MCP attach descriptor produced by ToolProvider, consumed by CLI adapters.
 * Adapters must not invent server paths — only translate this shape to CLI-native config.
 */

export type McpStdioServer = {
  id: string;
  transport: 'stdio';
  command: string;
  args: string[];
  env?: Record<string, string>;
};

export type McpAttach = {
  version: 1;
  servers: McpStdioServer[];
  /** Optional names for system hints (not an allowlist). */
  toolNames?: string[];
};

export function parseMcpAttach(raw: unknown): McpAttach | null {
  if (raw == null || raw === '') return null;
  let value: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      value = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  if (obj.version !== 1 || !Array.isArray(obj.servers)) return null;
  const servers: McpStdioServer[] = [];
  for (const item of obj.servers) {
    if (!item || typeof item !== 'object') continue;
    const s = item as Record<string, unknown>;
    if (s.transport !== 'stdio') continue;
    if (typeof s.id !== 'string' || !s.id.trim()) continue;
    if (typeof s.command !== 'string' || !s.command.trim()) continue;
    if (!Array.isArray(s.args) || !s.args.every((a) => typeof a === 'string')) {
      continue;
    }
    const env =
      s.env && typeof s.env === 'object' && !Array.isArray(s.env)
        ? Object.fromEntries(
            Object.entries(s.env as Record<string, unknown>).filter(
              (e): e is [string, string] => typeof e[1] === 'string',
            ),
          )
        : undefined;
    servers.push({
      id: s.id.trim(),
      transport: 'stdio',
      command: s.command.trim(),
      args: s.args as string[],
      ...(env && Object.keys(env).length > 0 ? { env } : {}),
    });
  }
  if (servers.length === 0) return null;
  const toolNames = Array.isArray(obj.toolNames)
    ? obj.toolNames.filter((t): t is string => typeof t === 'string')
    : undefined;
  return {
    version: 1,
    servers,
    ...(toolNames && toolNames.length > 0 ? { toolNames } : {}),
  };
}

/** Claude / Cursor style mcpServers JSON file contents. */
export function mcpConfigJsonFromAttach(attach: McpAttach): string {
  const mcpServers: Record<string, { command: string; args: string[]; env?: Record<string, string> }> =
    {};
  for (const s of attach.servers) {
    mcpServers[s.id] = {
      command: s.command,
      args: s.args,
      ...(s.env ? { env: s.env } : {}),
    };
  }
  return JSON.stringify({ mcpServers });
}

/**
 * Hermes treats bare `command: node` as its own isolated runtime and stalls on
 * "Installing Python dependencies" during MCP connect. Use the absolute binary.
 */
function hermesStdioCommand(command: string): string {
  if (command === 'node' || command.endsWith('/node')) {
    return '/usr/local/bin/node';
  }
  return command;
}

/** Built-ins that crowd out attached MCP servers. terminal, file and code_execution stay on so a role can run arithmetic in its container. */
const HERMES_DISABLED_TOOLSETS = [
  'browser',
  'web',
  'search',
  'memory',
  'skills',
  'delegation',
  'tts',
  'todo',
  'clarify',
  'vision',
  'image_gen',
  'cronjob',
  'session_search',
  'computer_use',
];

/** Hermes config.yaml fragment for mcp_servers (root-level key). */
export function hermesMcpServersYaml(attach: McpAttach): string {
  const lines = ['mcp_servers:'];
  for (const s of attach.servers) {
    lines.push(`  ${s.id}:`);
    lines.push(`    command: ${JSON.stringify(hermesStdioCommand(s.command))}`);
    lines.push('    args:');
    for (const a of s.args) {
      lines.push(`      - ${JSON.stringify(a)}`);
    }
    if (s.env && Object.keys(s.env).length > 0) {
      lines.push('    env:');
      for (const [k, v] of Object.entries(s.env)) {
        lines.push(`      ${k}: ${JSON.stringify(v)}`);
      }
    }
    lines.push('    enabled: true');
    lines.push('    connect_timeout: 60');
  }
  // MCP tools stay out of the model request while tool_search is auto: Hermes
  // replaces them with tool_search/tool_call, and GigaChat does not use that bridge.
  lines.push('tools:');
  lines.push('  tool_search:');
  lines.push('    enabled: off');
  lines.push('agent:');
  lines.push('  disabled_toolsets:');
  for (const name of HERMES_DISABLED_TOOLSETS) {
    lines.push(`    - ${name}`);
  }
  return `${lines.join('\n')}\n`;
}

/** Codex ~/.codex/config.toml fragment (`[mcp_servers.<id>]`). */
export function codexMcpTomlFromAttach(attach: McpAttach): string {
  const lines: string[] = [];
  for (const s of attach.servers) {
    lines.push(`[mcp_servers.${tomlKey(s.id)}]`);
    lines.push(`command = ${tomlStr(s.command)}`);
    lines.push(`args = [${s.args.map(tomlStr).join(', ')}]`);
    if (s.env && Object.keys(s.env).length > 0) {
      lines.push('[mcp_servers.' + tomlKey(s.id) + '.env]');
      for (const [k, v] of Object.entries(s.env)) {
        lines.push(`${tomlKey(k)} = ${tomlStr(v)}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * OpenCode / Kilo `mcp` object (merged into opencode.json).
 * cli-agent-opencode:0.1.0 resolves the V1 flat shape `mcp.<id>` (type/command/
 * environment/enabled). Nested `mcp.servers` is ignored. Prefer OPENCODE_CONFIG
 * pointing at a dedicated file — `~/.config/opencode/opencode.json` is rewritten
 * by `opencode run` without mcp.
 * @see https://opencode.ai/docs/mcp-servers/
 */
export function opencodeMcpFromAttach(
  attach: McpAttach,
): Record<string, unknown> {
  const mcp: Record<string, unknown> = {};
  for (const s of attach.servers) {
    mcp[s.id] = {
      type: 'local',
      command: [s.command, ...s.args],
      ...(s.env && Object.keys(s.env).length > 0
        ? { environment: s.env }
        : {}),
      enabled: true,
    };
  }
  return mcp;
}

/** Goose config.yaml `extensions` map (stdio). */
export function gooseExtensionsYamlFromAttach(attach: McpAttach): string {
  const lines = ['extensions:'];
  for (const s of attach.servers) {
    const key = s.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    lines.push(`  ${key}:`);
    lines.push('    enabled: true');
    lines.push('    type: stdio');
    lines.push(`    name: ${JSON.stringify(s.id)}`);
    lines.push(`    cmd: ${JSON.stringify(s.command)}`);
    lines.push('    args:');
    for (const a of s.args) {
      lines.push(`      - ${JSON.stringify(a)}`);
    }
    if (s.env && Object.keys(s.env).length > 0) {
      lines.push('    envs:');
      for (const [k, v] of Object.entries(s.env)) {
        lines.push(`      ${k}: ${JSON.stringify(v)}`);
      }
    } else {
      lines.push('    envs: {}');
    }
    lines.push('    timeout: 300');
  }
  return `${lines.join('\n')}\n`;
}

/** OpenClaw `mcp.servers` object (merged into openclaw.json). */
export function openclawMcpServersFromAttach(
  attach: McpAttach,
): Record<string, unknown> {
  const servers: Record<string, unknown> = {};
  for (const s of attach.servers) {
    servers[s.id] = {
      enabled: true,
      transport: 'stdio',
      command: s.command,
      args: s.args,
      ...(s.env && Object.keys(s.env).length > 0 ? { env: s.env } : {}),
    };
  }
  return servers;
}

/**
 * Z.ai / zcode `mcp.servers` — same shape as Claude, but rejects unknown keys
 * (e.g. `transport` → config_mcp_server_invalid → server skipped).
 */
export function zaiMcpServersFromAttach(
  attach: McpAttach,
): Record<string, unknown> {
  const servers: Record<string, unknown> = {};
  for (const s of attach.servers) {
    servers[s.id] = {
      command: s.command,
      args: s.args,
      ...(s.env && Object.keys(s.env).length > 0 ? { env: s.env } : {}),
    };
  }
  return servers;
}

/** Crush `mcp` object (stdio servers in crush.json). */
export function crushMcpFromAttach(
  attach: McpAttach,
): Record<string, unknown> {
  const mcp: Record<string, unknown> = {};
  for (const s of attach.servers) {
    mcp[s.id] = {
      type: 'stdio',
      command: s.command,
      args: s.args,
      ...(s.env && Object.keys(s.env).length > 0 ? { env: s.env } : {}),
    };
  }
  return mcp;
}

function tomlStr(value: string): string {
  return JSON.stringify(value);
}

function tomlKey(value: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value)
    ? value
    : JSON.stringify(value);
}
