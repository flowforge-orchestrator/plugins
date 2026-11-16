import type { McpAttach, McpStdioServer } from '../tools/mcp-attach';
import { EPHEMERAL_MCP_BRIDGE } from '../tools/runtime/ephemeral-pack';
import type { ToolInstancePayload } from '../tools/tool-instance.types';
import type { A2aMember } from './session';

export const A2A_SERVER_ID = 'a2a';

export type A2aToolName =
  | 'a2a_spawn'
  | 'a2a_wait'
  | 'a2a_reply'
  | 'a2a_ask_parent'
  | 'a2a_send'
  | 'a2a_inbox';

const TASK_ID = {
  type: 'string',
  description: 'Agent id returned by a2a_spawn (e.g. "a2")',
};

const TOOL_META: Record<
  A2aToolName,
  { description: string; inputSchema: Record<string, unknown> }
> = {
  a2a_spawn: {
    description:
      'Start a new agent on a self-contained subtask. Returns its state: completed (result), input-required (question for you), working (poll a2a_wait) or failed.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'Role name from the roster' },
        task: {
          type: 'string',
          description: 'Full instructions; the new agent sees nothing else',
        },
        wait: {
          type: 'boolean',
          description: 'false: return immediately and poll a2a_wait later',
        },
      },
      required: ['agent', 'task'],
    },
  },
  a2a_wait: {
    description:
      'Wait for an agent you spawned. Returns its current state; call again while it is working.',
    inputSchema: {
      type: 'object',
      properties: { taskId: TASK_ID },
      required: ['taskId'],
    },
  },
  a2a_reply: {
    description:
      'Answer the question of an agent you spawned (state input-required). Returns its next state.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: TASK_ID,
        message: { type: 'string', description: 'Your answer' },
      },
      required: ['taskId', 'message'],
    },
  },
  a2a_ask_parent: {
    description:
      'Ask the agent that spawned you for information only it has. Blocks until it answers or the wait slice ends.',
    inputSchema: {
      type: 'object',
      properties: { question: { type: 'string' } },
      required: ['question'],
    },
  },
  a2a_send: {
    description:
      'Send a note to another running agent by id. It reads notes with a2a_inbox.',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Agent id' },
        message: { type: 'string' },
      },
      required: ['to', 'message'],
    },
  },
  a2a_inbox: {
    description:
      'Read notes sent to you, the states of agents you spawned, and ids of running peers.',
    inputSchema: { type: 'object', properties: {} },
  },
};

export function toolsForAgent(opts: {
  isRoot: boolean;
  depth: number;
  maxDepth: number;
}): A2aToolName[] {
  const tools: A2aToolName[] = [];
  if (opts.depth < opts.maxDepth) {
    tools.push('a2a_spawn', 'a2a_wait', 'a2a_reply');
  }
  if (!opts.isRoot) {
    tools.push('a2a_ask_parent');
  }
  tools.push('a2a_send', 'a2a_inbox');
  return tools;
}

/** Runs inside the agent container via instance-mcp; A2A_HUB / A2A_TOKEN come from server env. */
function hubCallSource(op: string): string {
  return `async function (input) {
  const res = await fetch(process.env.A2A_HUB + '/a2a/${op}', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer ' + process.env.A2A_TOKEN,
    },
    body: JSON.stringify(input || {}),
  });
  const body = await res.json();
  if (!body.ok) throw new Error(body.error || 'a2a hub error ' + res.status);
  return body.result;
}`;
}

export function a2aToolInstances(tools: A2aToolName[]): ToolInstancePayload[] {
  return tools.map((name) => ({
    version: 1,
    meta: { name, ...TOOL_META[name] },
    source: hubCallSource(name.slice('a2a_'.length)),
    language: 'javascript',
  }));
}

export function a2aMcpServer(
  hubUrl: string,
  token: string,
  tools: A2aToolName[],
): McpStdioServer {
  return {
    id: A2A_SERVER_ID,
    transport: 'stdio',
    command: 'node',
    args: [EPHEMERAL_MCP_BRIDGE],
    env: {
      A2A_HUB: hubUrl.replace(/\/$/, ''),
      A2A_TOKEN: token,
      TOOL_PROVIDER_TOOLS: JSON.stringify(a2aToolInstances(tools)),
    },
  };
}

/** User servers keep their position: some adapters read env from servers[0]. */
export function withA2aServer(
  attach: McpAttach | null,
  server: McpStdioServer,
  tools: A2aToolName[],
): McpAttach {
  const servers = (attach?.servers ?? []).filter((s) => s.id !== A2A_SERVER_ID);
  return {
    version: 1,
    servers: [...servers, server],
    toolNames: [...(attach?.toolNames ?? []), ...tools],
  };
}

export function buildAgentPrompt(opts: {
  agentId: string;
  member: A2aMember;
  parentId: string | null;
  tools: A2aToolName[];
  roster: A2aMember[];
  spawnsLeft: number;
  task: string;
}): string {
  const { member } = opts;
  const lines = [
    opts.parentId === null
      ? `You are agent ${opts.agentId} (${member.agent}), the orchestrator of an agent team.`
      : `You are agent ${opts.agentId}, role "${member.name}" (${member.agent}), in an agent team; agent ${opts.parentId} gave you this task.`,
  ];
  if (member.description) {
    lines.push(`Your role: ${member.description}`);
  }
  lines.push(`Team tools (MCP server "${A2A_SERVER_ID}"): ${opts.tools.join(', ')}.`);
  if (opts.tools.includes('a2a_spawn')) {
    lines.push(
      opts.spawnsLeft > 0
        ? `Delegate self-contained subtasks with a2a_spawn; pass the role name as "agent". Up to ${opts.spawnsLeft} more agents may be started in this team. Roles:`
        : 'The team is at its agent limit: do the work yourself.',
      ...(opts.spawnsLeft > 0
        ? opts.roster.map((m) => `- ${m.name}${m.description ? `: ${m.description}` : ` (${m.agent})`}`)
        : []),
      'a2a_spawn / a2a_wait / a2a_reply return a state: working → call a2a_wait again; input-required → answer with a2a_reply; completed → use the result; failed → handle it yourself.',
    );
  } else {
    lines.push('You cannot start agents: do the work yourself.');
    lines.push(
      'Story facts come only from your MCP knowledge tools. Model memory is not a source: if a tool did not return a fact, write NOT FOUND.',
      'You may write and run code in this container (python or node) to calculate. A derived number is valid only as the stdout of a command you ran: quote the command and the stdout. Do not calculate in your head. The shell is not a source of story facts.',
    );
  }
  if (opts.tools.includes('a2a_ask_parent')) {
    lines.push(
      `If you are blocked on information only agent ${opts.parentId} has, call a2a_ask_parent.`,
    );
  }
  lines.push(
    'Your last message is your result. End with the final answer as plain text.',
    '',
    'Task:',
    opts.task,
  );
  return lines.join('\n');
}
