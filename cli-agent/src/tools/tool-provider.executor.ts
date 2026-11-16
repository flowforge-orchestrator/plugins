import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  ExecContext,
  Executor,
  loadHelpFromFile,
} from '@kosolapus/plugin-ts-sdk';
import { publicationPullEndpointFromEnv } from '../getUrlFromEnv';
import type { McpAttach } from './mcp-attach';
import {
  TOOL_PROVIDER_STATIC_KEYS,
  ToolProviderOutputDto,
} from './tool-provider.io';
import {
  parseToolInstance,
  type ToolInstancePayload,
} from './tool-instance.types';

/**
 * Bind ToolInstance payloads into a one-shot MCP attach for this provider run.
 * Adapters only translate attach → CLI MCP config; they never see pack paths.
 */
function bindInstances(
  instances: ToolInstancePayload[],
  opts: {
    apiBase: string;
    bridgePath: string;
    serverId: string;
    sessionId: string;
  },
): McpAttach {
  const toolNames = instances.map((i) => i.meta.name);
  return {
    version: 1,
    servers: [
      {
        id: opts.serverId,
        transport: 'stdio',
        command: 'node',
        args: [opts.bridgePath],
        env: {
          CONVEYOR_API_BASE: opts.apiBase,
          TOOL_PROVIDER_SESSION: opts.sessionId,
          TOOL_PROVIDER_TOOLS: JSON.stringify(instances),
        },
      },
    ],
    toolNames,
  };
}

/** Every non-static input value that parses as ToolInstance. */
function collectInstances(
  inputs: Record<string, unknown>,
): ToolInstancePayload[] {
  const instances: ToolInstancePayload[] = [];
  const names = new Set<string>();
  for (const [key, raw] of Object.entries(inputs)) {
    if (TOOL_PROVIDER_STATIC_KEYS.has(key)) continue;
    if (raw == null || String(raw).trim() === '') continue;
    const parsed = parseToolInstance(raw);
    if (!parsed) {
      throw new Error(`invalid ToolInstance on port "${key}"`);
    }
    if (names.has(parsed.meta.name)) {
      throw new Error(`duplicate tool name: ${parsed.meta.name}`);
    }
    names.add(parsed.meta.name);
    instances.push(parsed);
  }
  return instances;
}

function stringField(
  inputs: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = inputs[key];
  return typeof v === 'string' ? v : undefined;
}

@Executor<Record<string, unknown>, ToolProviderOutputDto>({
  nodeType: 'plugin.cli-agent.tool-provider',
  name: 'CLI tool provider',
  description:
    'Динамические входы ToolInstance → opaque mcpAttach для CLI-агента.',
  help: loadHelpFromFile(join(__dirname, 'tool-provider')),
  tags: ['cli-agent', 'tools', 'mcp'],
  pluginId: 'cli-agent',
  // Dynamic ports: add only the tool instance inputs you wire (see help).
  inputs: null,
  outputs: ToolProviderOutputDto,
  transport: { type: 'tcp', params: publicationPullEndpointFromEnv() },
})
export class ToolProviderExecutor {
  execute(
    ctx: ExecContext<Record<string, unknown>>,
  ): Promise<ToolProviderOutputDto> {
    try {
      const inputs = (ctx.inputs ?? {}) as Record<string, unknown>;
      const instances = collectInstances(inputs);
      if (instances.length === 0) {
        throw new Error(
          'add at least one dynamic input port with a ToolInstance',
        );
      }
      const apiBase = (
        stringField(inputs, 'apiBase')?.trim() ||
        process.env.CONVEYOR_API_BASE?.trim() ||
        'http://host.docker.internal:18080'
      ).replace(/\/$/, '');
      const bridgePath =
        stringField(inputs, 'mcpBridgePath')?.trim() ||
        '/tmp/tool-provider-mcp.mjs';
      const serverId =
        stringField(inputs, 'serverId')?.trim() || 'tool-provider';
      const sessionId = randomUUID();
      const attach = bindInstances(instances, {
        apiBase,
        bridgePath,
        serverId,
        sessionId,
      });
      return Promise.resolve({
        mcpAttach: JSON.stringify(attach),
        toolNames: JSON.stringify(attach.toolNames ?? []),
        sessionId,
        status: 'ok',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return Promise.resolve({
        mcpAttach: '',
        toolNames: '[]',
        sessionId: '',
        status: `error: ${message}`,
      });
    }
  }
}
