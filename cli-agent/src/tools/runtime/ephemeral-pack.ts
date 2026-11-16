import type { McpAttach } from '../mcp-attach';
import { mcpConfigJsonFromAttach } from '../mcp-attach';
import type { RulesAttach, SkillAttach } from '../skill-attach';
import {
  agentsMdFromRules,
  skillNamesFromAttach,
} from '../skill-attach';
import { INSTANCE_MCP_SOURCE } from './ephemeral-pack.generated';

/** In-container paths (tmpfs) — no host workspace mount. */
export const EPHEMERAL_ROOT = '/tmp/pack';
export const EPHEMERAL_MCP_BRIDGE = '/tmp/tool-provider-mcp.mjs';
export const EPHEMERAL_MCP_CONFIG = '/tmp/mcp-attach.json';

/**
 * Rewrite stdio server args that pointed at pack workspace bins
 * to the ephemeral bridge path.
 */
export function mcpAttachForEphemeral(attach: McpAttach): McpAttach {
  return {
    ...attach,
    servers: attach.servers.map((s) => ({
      ...s,
      args: s.args.map((a) =>
        a.includes('instance-mcp') || a.includes('rag-mcp')
          ? EPHEMERAL_MCP_BRIDGE
          : a,
      ),
    })),
  };
}

export function mcpConfigJsonEphemeral(attach: McpAttach): string {
  return mcpConfigJsonFromAttach(mcpAttachForEphemeral(attach));
}

/**
 * Join shell steps with newlines so heredoc terminators stay alone on a line.
 */
export function joinShellSteps(...steps: string[]): string {
  return steps.filter((s) => s.trim().length > 0).join('\n');
}

const BRIDGE_LIT = JSON.stringify(EPHEMERAL_MCP_BRIDGE);
const ROOT_LIT = JSON.stringify(EPHEMERAL_ROOT);

/**
 * Shell prelude: materialize MCP bridge + pack from env.
 * Prefers `node`, falls back to `python3`.
 * Env: EPHEMERAL_BRIDGE_B64, EPHEMERAL_PACK_B64 (skills + agentsMd from providers).
 */
export const EPHEMERAL_MATERIALIZE_SHELL = `if command -v node >/dev/null 2>&1; then
node - <<'NODE'
const fs = require('fs');
const path = require('path');
const bridge = ${BRIDGE_LIT};
fs.writeFileSync(bridge, Buffer.from(process.env.EPHEMERAL_BRIDGE_B64 || '', 'base64'));
const raw = process.env.EPHEMERAL_PACK_B64 || '';
if (!raw.trim()) process.exit(0);
const data = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
const root = ${ROOT_LIT};
fs.mkdirSync(root, { recursive: true });
if (data.agentsMd) fs.writeFileSync(path.join(root, 'AGENTS.md'), data.agentsMd);
for (const [name, body] of Object.entries(data.skills || {})) {
  const d = path.join(root, 'skills', name);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'SKILL.md'), body);
}
for (const [name, body] of Object.entries(data.ruleFiles || {})) {
  const d = path.join(root, 'rules');
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, name), body);
}
NODE
elif command -v python3 >/dev/null 2>&1; then
python3 - <<'PY'
import base64, json, os
from pathlib import Path
bridge = Path(${BRIDGE_LIT})
bridge.write_bytes(base64.b64decode(os.environ.get("EPHEMERAL_BRIDGE_B64", "")))
raw = os.environ.get("EPHEMERAL_PACK_B64", "")
if not raw.strip():
    raise SystemExit(0)
data = json.loads(base64.b64decode(raw))
root = Path(${ROOT_LIT})
root.mkdir(parents=True, exist_ok=True)
agents = data.get("agentsMd") or ""
if agents:
    (root / "AGENTS.md").write_text(agents)
for name, body in (data.get("skills") or {}).items():
    d = root / "skills" / name
    d.mkdir(parents=True, exist_ok=True)
    (d / "SKILL.md").write_text(body)
for name, body in (data.get("ruleFiles") or {}).items():
    d = root / "rules"
    d.mkdir(parents=True, exist_ok=True)
    (d / name).write_text(body)
PY
else
  echo "ephemeral-pack: need node or python3" >&2
  exit 127
fi`;

/**
 * Shell CLIs without a native MCP client (e.g. pi --tools bash) call these bins.
 * Requires TOOL_PROVIDER_TOOLS (+ CONVEYOR_API_BASE) in the process env.
 */
export const EPHEMERAL_TOOL_BINS_SHELL = `mkdir -p ${EPHEMERAL_ROOT}/bin
node - <<'NODE'
const fs = require('fs');
const dir = ${ROOT_LIT} + '/bin';
const runner = \`#!/usr/bin/env node
const vm = require('node:vm');
const path = require('node:path');
const name = process.env.TOOL_BIN_NAME || path.basename(process.argv[1]);
const query = process.argv.slice(2).join(' ').trim();
if (!query) { console.error('usage: ' + name + ' <query>'); process.exit(2); }
let list;
try { list = JSON.parse(process.env.TOOL_PROVIDER_TOOLS || '[]'); }
catch (e) { console.error('TOOL_PROVIDER_TOOLS:', e); process.exit(3); }
const tool = (Array.isArray(list) ? list : []).find((t) => t && t.meta && t.meta.name === name);
if (!tool) { console.error('unknown tool ' + name); process.exit(3); }
const src = String(tool.source || '').trimStart();
const wrapped = src.startsWith('async function')
  ? src
  : src.startsWith('function')
    ? 'async ' + src
    : src;
const fn = vm.runInNewContext('(' + wrapped + ')', {
  fetch, console, setTimeout, clearTimeout, Buffer, process, URL, globalThis,
});
Promise.resolve(fn({ query })).then((r) => {
  process.stdout.write(typeof r === 'string' ? r : JSON.stringify(r, null, 2));
}).catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
\`;
fs.writeFileSync(dir + '/_tool_run', runner, { mode: 0o755 });
for (const name of ['rag_search', 'rag_graph']) {
  fs.writeFileSync(
    dir + '/' + name,
    '#!/bin/sh\\nexport TOOL_BIN_NAME=' + name + '\\nexec node ' + dir + '/_tool_run "$@"\\n',
    { mode: 0o755 },
  );
}
NODE
export PATH="${EPHEMERAL_ROOT}/bin:$PATH"`;

export type EphemeralPackRequest = {
  skillAttach: SkillAttach | null;
  rulesAttach: RulesAttach | null;
  mcpAttach: McpAttach | null;
};

export function ephemeralEnvForRequest(request: EphemeralPackRequest): {
  EPHEMERAL_BRIDGE_B64: string;
  EPHEMERAL_PACK_B64: string;
} {
  const skills: Record<string, string> = {};
  for (const s of request.skillAttach?.skills ?? []) {
    skills[s.name] = s.body;
  }
  const agentsMd = agentsMdFromRules(request.rulesAttach);
  const ruleFiles: Record<string, string> = {};
  for (const r of request.rulesAttach?.rules ?? []) {
    if (/^(agents\.md|agents|rules)$/i.test(r.name)) continue;
    ruleFiles[r.name.endsWith('.md') ? r.name : `${r.name}.md`] = r.body;
  }
  const pack = { agentsMd, skills, ruleFiles };
  const needPack =
    Boolean(agentsMd) ||
    Object.keys(skills).length > 0 ||
    Object.keys(ruleFiles).length > 0;
  return {
    EPHEMERAL_BRIDGE_B64: Buffer.from(INSTANCE_MCP_SOURCE, 'utf8').toString(
      'base64',
    ),
    EPHEMERAL_PACK_B64: needPack
      ? Buffer.from(JSON.stringify(pack), 'utf8').toString('base64')
      : '',
  };
}

export function skillDirEphemeral(skill: string): string {
  const trimmed = skill.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/')) return trimmed;
  return `${EPHEMERAL_ROOT}/skills/${trimmed}`;
}

export function needsEphemeralMaterialize(
  request: EphemeralPackRequest,
): boolean {
  return (
    Boolean(request.mcpAttach?.servers?.length) ||
    Boolean(request.skillAttach?.skills?.length) ||
    Boolean(request.rulesAttach?.rules?.length)
  );
}

/**
 * Prepend materialize (+ optional extra shell steps) to an adapter plan.
 * Merges `env` into the plan env.
 */
export function wrapEphemeralPlan<
  T extends {
    ok: boolean;
    command?: string[];
    env?: Record<string, string>;
  },
>(
  plan: T,
  request: EphemeralPackRequest,
  env: Record<string, string>,
  extraSteps: string[] = [],
): T {
  if (!plan.ok || !plan.command) {
    return plan;
  }
  if (!needsEphemeralMaterialize(request) && extraSteps.length === 0) {
    return plan;
  }
  if (needsEphemeralMaterialize(request)) {
    Object.assign(env, ephemeralEnvForRequest(request));
  }
  const steps = [
    ...(needsEphemeralMaterialize(request) ? [EPHEMERAL_MATERIALIZE_SHELL] : []),
    ...extraSteps,
  ];
  if (steps.length === 0) {
    return { ...plan, env: { ...plan.env, ...env } };
  }
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

/** Write env MCP_ATTACH_CONFIG → path (node; safe for `%` in payloads). */
export function mcpAttachWriteShell(path: string): string {
  return `node -e 'require("fs").writeFileSync(process.argv[1], process.env.MCP_ATTACH_CONFIG||"")' ${JSON.stringify(path)}`;
}

/** Write env MCP_ATTACH_B64 (base64) → path. */
export function mcpAttachB64WriteShell(path: string): string {
  return `node -e 'require("fs").writeFileSync(process.argv[1], Buffer.from(process.env.MCP_ATTACH_B64||"","base64"))' ${JSON.stringify(path)}`;
}

/** Skill names for CLI flags — from attach, not from a baked list. */
export function resolvedSkillNames(request: {
  skillAttach: SkillAttach | null;
  skills: string[];
}): string[] {
  const fromAttach = skillNamesFromAttach(request.skillAttach);
  if (fromAttach.length > 0) return fromAttach;
  return request.skills;
}
