#!/usr/bin/env node
/**
 * Prints Process Builder steps / payloads for Wave A processes.
 * Live creation uses Process Builder MCP after executors are published
 * and folder "CLI agents" exists (see create-cli-agent-folder.mjs).
 *
 * Usage:
 *   FOLDER_ID=<uuid> node scripts/create-cli-agent-processes.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AGENTS = [
  { slug: 'hermes', title: 'CLI agent: Hermes' },
  { slug: 'claude-code', title: 'CLI agent: Claude Code' },
  { slug: 'codex', title: 'CLI agent: Codex' },
  { slug: 'cursor', title: 'CLI agent: Cursor' },
  { slug: 'aider', title: 'CLI agent: Aider' },
  { slug: 'opencode', title: 'CLI agent: OpenCode' },
  { slug: 'zai', title: 'CLI agent: Z.ai' },
];

const folderId = process.env.FOLDER_ID ?? '<FOLDER_ID>';
const here = dirname(fileURLToPath(import.meta.url));
const template = readFileSync(join(here, 'process-graph.template.json'), 'utf8');

const plans = AGENTS.map(({ slug, title }) => {
  const toolName = `cli_agent_${slug.replace(/-/g, '_')}`;
  const nodeType = `plugin.cli-agent.${slug}`;
  const apply = JSON.parse(
    template
      .replaceAll('__TITLE__', title)
      .replaceAll('__TOOL_NAME__', toolName)
      .replaceAll('__NODE_TYPE__', nodeType),
  );
  return {
    title,
    folderId,
    nodeType,
    toolName,
    steps: [
      'process_create',
      'process_apply',
      'process_validate',
      'process_publish',
    ],
    apply,
  };
});

console.log(JSON.stringify({ folderName: 'CLI agents', folderId, plans }, null, 2));
