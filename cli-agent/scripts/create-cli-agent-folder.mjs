#!/usr/bin/env node
/**
 * Creates process folder "CLI agents" via POST /folder.
 * Process Builder MCP cannot create folders.
 *
 * Usage:
 *   CONVEYOR_API_BASE=http://localhost:8080 \
 *   CONVEYOR_API_TOKEN=<bearer> \
 *   node scripts/create-cli-agent-folder.mjs
 *
 * Optional: CONVEYOR_FOLDER_PARENT_ID=<uuid>
 */

const base = (process.env.CONVEYOR_API_BASE ?? '').replace(/\/$/, '');
const token = process.env.CONVEYOR_API_TOKEN ?? '';
const parentId = process.env.CONVEYOR_FOLDER_PARENT_ID ?? null;

if (!base || !token) {
  console.error('Set CONVEYOR_API_BASE and CONVEYOR_API_TOKEN');
  process.exit(1);
}

const response = await fetch(`${base}/folder`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ name: 'CLI agents', parentId }),
});

const text = await response.text();
if (!response.ok) {
  console.error(`folder create failed: ${response.status} ${text}`);
  process.exit(1);
}

let body;
try {
  body = JSON.parse(text);
} catch {
  console.error(`folder create returned non-JSON: ${text}`);
  process.exit(1);
}

console.log(JSON.stringify({ folderId: body.id, name: body.name ?? 'CLI agents' }, null, 2));
