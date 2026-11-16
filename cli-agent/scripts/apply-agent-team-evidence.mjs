#!/usr/bin/env node
/**
 * Create/refresh process "CLI agents: A2A evidence team [<label>]", publish, ask chuk_i_gek questions.
 *
 * Team: orchestrator (rules packs/a2a-evidence/AGENTS.md) + roles
 *   graph    — rag_graph,             skill graph-specialist
 *   vector   — rag_search,            skill vector-specialist
 *   grounder — rag_graph + rag_search, skill grounder
 *
 *   WEB_BASE=http://localhost:18080 node scripts/apply-agent-team-evidence.mjs
 *
 * Env:
 *   TEAM_SUITE        questions file under scripts/smoke/chuk-gek, default questions.json
 *   TEAM_QUESTIONS    comma-separated ids, default q21; "all" — the whole file
 *   TEAM_LLM          ollama | gigachat, default ollama
 *   TEAM_MODEL        LLM model, default gemma4:31b-cloud (ollama) / GigaChat-2 (gigachat)
 *   TEAM_AGENT        CLI agent for orchestrator and roles, default opencode
 *   TEAM_AGENT_MODEL  model for Cursor / Codex / Claude Code
 *   TEAM_API_KEY_SECRET  secret name for the factory apiKey (Cursor / Codex / Claude Code key)
 *   TEAM_LABEL        diagram title suffix and output file name, default <agent>-<model>
 *   TEAM_BUDGET_MS    per question, default 1800000
 *   TEAM_RUN=0        apply + publish only
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { processBuilder } from './lib/process-builder.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, '..', rel), 'utf8');

const WEB = process.env.WEB_BASE || 'http://localhost:18080';
const FOLDER_ID = process.env.TEAM_FOLDER_ID || 'ca314815-30d9-4f9a-9890-3a3a34275acd';
const LLM = process.env.TEAM_LLM || 'ollama';
const MODEL = process.env.TEAM_MODEL || (LLM === 'gigachat' ? 'GigaChat-2' : 'gemma4:31b-cloud');
const AGENT = process.env.TEAM_AGENT || 'opencode';
const AGENT_MODEL = process.env.TEAM_AGENT_MODEL || '';
const API_KEY_SECRET = process.env.TEAM_API_KEY_SECRET || '';
const LABEL = process.env.TEAM_LABEL || `${AGENT}-${AGENT_MODEL || MODEL}`.replace(/[^\w.-]+/g, '_');
const TITLE = `CLI agents: A2A evidence team [${LABEL}]`;
const OUT = join(here, `../.agent-team-evidence-${LABEL}.json`);
const BUDGET_MS = Number(process.env.TEAM_BUDGET_MS || 1_800_000);
const API_BASE = process.env.CONVEYOR_API_BASE || 'http://host.docker.internal:18080';

const suite = JSON.parse(read(`scripts/smoke/chuk-gek/${process.env.TEAM_SUITE || 'questions.json'}`));
const wanted = (process.env.TEAM_QUESTIONS || 'q21').split(',').map((s) => s.trim());
const QUESTIONS = wanted[0] === 'all' ? suite.questions : wanted.map((id) => {
  const q = suite.questions.find((x) => x.id === id);
  if (!q) throw new Error(`unknown question ${id}`);
  return q;
});

function taskFor(q) {
  return [
    `Вопрос по рассказу «Чук и Гек»: ${q.prompt}`,
    ...(q.options?.length
      ? ['Варианты ответа:', ...q.options.map((o, i) => `${i + 1}. ${o}`), 'Выбери один вариант и подтверди его проверенными доказательствами из базы.']
      : ['Ответь кратко и подтверди ответ проверенными доказательствами из базы.']),
  ].join('\n');
}

/** Grade the ANSWER section (whole text when absent) by the question's accept/reject patterns. */
function grade(q, text) {
  const answer = (/ANSWER:\s*([\s\S]*?)(?:\n\s*VERIFIED EVIDENCE:|$)/.exec(text)?.[1] ?? text).trim();
  const test = (p) => new RegExp(p, 'i').test(answer);
  const accept = q.accept ?? [q.gold.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')];
  return {
    answer,
    correct: accept.every(test) && !(q.reject ?? []).some(test),
    citations: (text.match(/\[(?:G|V)\d+\]/g) ?? []).length,
    verified: /VERIFIED EVIDENCE:/.test(text),
  };
}

const TOOLS = {
  rag_search: {
    meta: {
      name: 'rag_search',
      description:
        'Dense vector search over chuk_i_gek (story «Чук и Гек»). Pass the question or a tight paraphrase. Returns text chunks.',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Natural-language search query' } },
        required: ['query'],
      },
    },
    source: read('packs/graph-kg/tools/rag_search.js'),
  },
  rag_graph: {
    meta: {
      name: 'rag_graph',
      description:
        'Knowledge-graph neighborhood for chuk_i_gek. Pass an entity or relation name (e.g. Чук, мать, ямщик).',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Entity or relation name' } },
        required: ['query'],
      },
    },
    source: read('packs/graph-kg/tools/rag_graph.js'),
  },
};

const ROLES = [
  {
    name: 'graph',
    tools: ['rag_graph'],
    skill: 'graph-specialist',
    description:
      'Специалист по графу знаний chuk_i_gek: сущности, связи, места, числа через rag_graph. Каждое утверждение — со ссылкой [G#] на вывод графа. Производное число — только stdout кода в своём контейнере.',
  },
  {
    name: 'vector',
    tools: ['rag_search'],
    skill: 'vector-specialist',
    description:
      'Специалист по векторной БД chuk_i_gek: поиск фрагментов текста через rag_search. Каждое утверждение — с дословной цитатой [V#]. Производное число — только stdout кода в своём контейнере.',
  },
  {
    name: 'grounder',
    tools: ['rag_graph', 'rag_search'],
    skill: 'grounder',
    description:
      'Граундер: заново достаёт каждое доказательство черновика из графа и векторной БД и выносит вердикт по каждой ссылке и утверждению. Производное число пересчитывает кодом в своём контейнере.',
  },
];

const cfg = (name, defaultValue, isPort = false) => ({ name, isPort, defaultValue });

function graph() {
  const nodes = [
    { id: 'trigger', nodeType: 'system.trigger.input', label: 'input', outputs: ['query'], config: [cfg('query', '')] },
    LLM === 'gigachat'
      ? {
          id: 'llm_config',
          nodeType: 'plugin.cli-agent.llm-config.gigachat',
          label: 'llm config (GigaChat)',
          outputs: ['llmConfig'],
          config: [
            { name: 'apiKey', type: 'ref', secretKind: 'GIGACHAT_AUTH_KEY', isPort: false, defaultValue: 'GIGACHAT_AUTH_KEY' },
            cfg('scope', process.env.TEAM_GIGACHAT_SCOPE || 'GIGACHAT_API_PERS'),
            cfg('model', MODEL),
          ],
        }
      : {
          id: 'llm_config',
          nodeType: 'plugin.cli-agent.llm-config',
          label: 'llm config',
          outputs: ['llmConfig'],
          config: [
            cfg('provider', 'ollama'),
            cfg('model', MODEL),
            cfg('baseUrl', 'http://host.docker.internal:11434/v1'),
            {
              name: 'apiKey',
              type: 'ref',
              secretKind: 'CLI_AGENT_API_KEY',
              isPort: false,
              isRequired: false,
              defaultValue: 'CLI_AGENT_API_KEY',
            },
          ],
        },
    ...Object.entries(TOOLS).map(([name, t]) => ({
      id: `ti_${name}`,
      nodeType: 'plugin.cli-agent.tool-instance',
      label: `tool ${name}`,
      outputs: ['instance'],
      config: [cfg('meta', JSON.stringify(t.meta)), cfg('source', t.source), cfg('language', 'javascript')],
    })),
    {
      id: 'ri_orchestrator',
      nodeType: 'plugin.cli-agent.rules-instance',
      label: 'rules orchestrator',
      outputs: ['instance'],
      config: [cfg('name', 'AGENTS.md'), cfg('body', read('packs/a2a-evidence/AGENTS.md'))],
    },
    {
      id: 'rp_orchestrator',
      nodeType: 'plugin.cli-agent.rules-provider',
      label: 'rules provider orchestrator',
      outputs: ['rulesAttach'],
      config: [cfg('agents', '', true)],
    },
  ];
  const edges = [
    { source: 'ri_orchestrator', target: 'rp_orchestrator', sourceHandle: 'instance', targetHandle: 'agents' },
  ];

  ROLES.forEach((role, i) => {
    const skillPort = role.skill.replace(/-/g, '_');
    nodes.push(
      {
        id: `tp_${role.name}`,
        nodeType: 'plugin.cli-agent.tool-provider',
        label: `tools ${role.name}`,
        outputs: ['mcpAttach'],
        config: [
          ...role.tools.map((t) => cfg(t, '', true)),
          cfg('apiBase', API_BASE),
          cfg('mcpBridgePath', '/tmp/tool-provider-mcp.mjs'),
        ],
      },
      {
        id: `si_${role.name}`,
        nodeType: 'plugin.cli-agent.skill-instance',
        label: `skill ${role.skill}`,
        outputs: ['instance'],
        config: [cfg('name', role.skill), cfg('body', read(`packs/a2a-evidence/skills/${role.skill}/SKILL.md`))],
      },
      {
        id: `sp_${role.name}`,
        nodeType: 'plugin.cli-agent.skill-provider',
        label: `skills ${role.name}`,
        outputs: ['skillAttach'],
        config: [cfg(skillPort, '', true)],
      },
      {
        id: `profile_${role.name}`,
        nodeType: 'plugin.cli-agent.agent-profile',
        label: `role ${role.name}`,
        outputs: ['profiles', 'status'],
        config: [
          cfg('name', role.name),
          cfg('agent', AGENT),
          cfg('description', role.description),
          ...(AGENT_MODEL ? [cfg('model', AGENT_MODEL)] : []),
          cfg('mcpAttach', '', true),
          cfg('skillAttach', '', true),
          cfg('profiles', '', true),
        ],
      },
    );
    edges.push(
      ...role.tools.map((t) => ({
        source: `ti_${t}`,
        target: `tp_${role.name}`,
        sourceHandle: 'instance',
        targetHandle: t,
      })),
      { source: `si_${role.name}`, target: `sp_${role.name}`, sourceHandle: 'instance', targetHandle: skillPort },
      { source: `tp_${role.name}`, target: `profile_${role.name}`, sourceHandle: 'mcpAttach', targetHandle: 'mcpAttach' },
      { source: `sp_${role.name}`, target: `profile_${role.name}`, sourceHandle: 'skillAttach', targetHandle: 'skillAttach' },
    );
    const next = ROLES[i + 1];
    edges.push({
      source: `profile_${role.name}`,
      target: next ? `profile_${next.name}` : 'factory',
      sourceHandle: 'profiles',
      targetHandle: 'profiles',
    });
  });

  nodes.push(
    {
      id: 'factory',
      nodeType: 'plugin.cli-agent.factory',
      label: 'agent factory',
      outputs: ['text', 'status', 'meta'],
      config: [
        cfg('task', '', true),
        cfg('llmConfig', '', true),
        cfg('rulesAttach', '', true),
        cfg('profiles', '', true),
        cfg('orchestrator', AGENT),
        cfg('roster', '[]'),
        ...(API_KEY_SECRET
          ? [{ name: 'apiKey', type: 'ref', secretKind: 'CLI_AGENT_API_KEY', isPort: false, defaultValue: API_KEY_SECRET }]
          : []),
        cfg('maxAgents', 7),
        cfg('maxDepth', 1),
        cfg('agentTimeoutMs', 900000),
        cfg('budgetMs', BUDGET_MS),
      ],
    },
    {
      id: 'output',
      nodeType: 'system.output',
      config: [cfg('text', '', true), cfg('status', '', true), cfg('meta', '', true)],
    },
  );
  edges.push(
    { source: 'trigger', target: 'factory', sourceHandle: 'query', targetHandle: 'task' },
    { source: 'llm_config', target: 'factory', sourceHandle: 'llmConfig', targetHandle: 'llmConfig' },
    { source: 'rp_orchestrator', target: 'factory', sourceHandle: 'rulesAttach', targetHandle: 'rulesAttach' },
    ...['text', 'status', 'meta'].map((h) => ({ source: 'factory', target: 'output', sourceHandle: h, targetHandle: h })),
  );

  return {
    nodes,
    edges,
    settings: {
      name: TITLE,
      description:
        'A2A team on chuk_i_gek: graph and vector specialists cite evidence, grounder re-checks citations, orchestrator keeps verified claims. Input port: query.',
      isActive: true,
      triggers: [{ type: 'manual' }, { type: 'webhook' }],
    },
  };
}

function summarize(result) {
  const out = result?.publicInputs ?? result?.result?.publicInputs ?? result?.result ?? result ?? {};
  let meta = out.meta;
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta);
    } catch {
      // leave raw
    }
  }
  console.log('\nstatus:', out.status);
  console.log('text:\n' + String(out.text ?? '').slice(-3000));
  if (meta && typeof meta === 'object') {
    console.log('\ntotals:', JSON.stringify(meta.totals));
    for (const a of meta.agents ?? []) {
      console.log(
        `  ${a.id} ${a.role}/${a.slug} parent=${a.parentId ?? '-'} ${a.state} ${a.latencyMs ?? '?'}ms ${a.error ? `error=${a.error}` : ''}`,
      );
    }
    console.log('calls:');
    for (const c of meta.calls ?? []) {
      console.log(`  #${c.seq} +${c.atMs}ms ${c.kind} ${c.from} → ${c.to}: ${String(c.preview).slice(0, 160)}`);
    }
  }
  return { out, meta };
}

async function main() {
  const pb = processBuilder(WEB, 'apply-agent-team-evidence');
  await pb.open();
  const diagramId = await pb.ensureDiagram(TITLE, FOLDER_ID);
  console.log('diagram', diagramId);
  await pb.call('process_apply', { diagramId, ...graph() });
  console.log('provider ports marked:', await pb.markProviderPorts(diagramId));
  console.log('validate', JSON.stringify(await pb.call('process_validate', { diagramId })).slice(0, 400));
  await pb.call('process_publish', { diagramId });
  console.log('published');
  if (process.env.TEAM_RUN === '0') return;

  const runs = [];
  for (const q of QUESTIONS) {
    console.log(`\n=== [${LABEL}] ${q.id}: ${q.prompt}\ngold: ${q.gold}\n`);
    const task = taskFor(q);
    const startedAt = Date.now();
    let entry;
    try {
      const { runId, result } = await pb.runToEnd(diagramId, { query: task }, BUDGET_MS + 120_000);
      const { out, meta } = summarize(result);
      const text = String(out.text ?? '');
      entry = { id: q.id, runId, status: out.status, ...grade(q, text), wallMs: Date.now() - startedAt, totals: meta?.totals, agents: (meta?.agents ?? []).map((a) => ({ id: a.id, role: a.role, state: a.state, latencyMs: a.latencyMs, toolCallSuccessRate: a.metrics?.toolCallSuccessRate ?? null, error: a.error })), text, meta };
    } catch (error) {
      entry = { id: q.id, status: 'error', correct: false, error: String(error?.message ?? error), wallMs: Date.now() - startedAt };
    }
    console.log(`\n[${LABEL}] ${q.id} correct=${entry.correct} citations=${entry.citations ?? 0} status=${entry.status}`);
    runs.push(entry);
    writeFileSync(OUT, JSON.stringify({ label: LABEL, llm: LLM, model: MODEL, agent: AGENT, agentModel: AGENT_MODEL, diagramId, runs }, null, 2));
  }
  console.log(`\n[${LABEL}] score ${runs.filter((r) => r.correct).length}/${runs.length}; wrote ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
