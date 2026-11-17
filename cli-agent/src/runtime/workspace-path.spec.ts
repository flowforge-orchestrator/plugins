import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { resolveWorkspacePath } from './workspace-path';

describe('resolveWorkspacePath', () => {
  const root = path.resolve('/var/lib/cli-agent/workspaces');

  it('allows empty workspace (no mount)', () => {
    assert.deepEqual(resolveWorkspacePath('', root), {
      ok: true,
      hostPath: null,
      mounted: false,
    });
  });

  it('accepts a path under the root', () => {
    const hostPath = path.join(root, 'job-1');
    assert.deepEqual(resolveWorkspacePath(hostPath, root), {
      ok: true,
      hostPath,
      mounted: true,
    });
  });

  it('rejects a path outside the root', () => {
    const result = resolveWorkspacePath('/tmp/escape', root);
    assert.equal(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.match(result.reason, /CLI_AGENT_WORKSPACE_ROOT/);
  });
});
