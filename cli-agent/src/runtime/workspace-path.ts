import path from 'node:path';

export type WorkspaceResolution =
  | { ok: true; hostPath: string | null; mounted: boolean }
  | { ok: false; reason: string };

export function workspaceRootFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const raw = env.CLI_AGENT_WORKSPACE_ROOT?.trim();
  if (!raw) {
    return path.resolve('/var/lib/cli-agent/workspaces');
  }
  return path.resolve(raw);
}

export function resolveWorkspacePath(
  workspace: string | undefined,
  root: string = workspaceRootFromEnv(),
): WorkspaceResolution {
  const trimmed = (workspace ?? '').trim();
  if (!trimmed) {
    return { ok: true, hostPath: null, mounted: false };
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(trimmed);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return {
      ok: false,
      reason: `workspace must be under CLI_AGENT_WORKSPACE_ROOT (${resolvedRoot})`,
    };
  }
  return { ok: true, hostPath: resolved, mounted: true };
}
