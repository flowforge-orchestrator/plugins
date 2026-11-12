import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EmailPluginManifestBuilder } from './email-manifest.builder';

const SEND_MAIL_EXECUTOR_ID = 'data.email.send';

describe('published email manifest', () => {
  it('includes the SMTP send-mail executor', () => {
    const manifest = new EmailPluginManifestBuilder().buildManifestRequest();
    const executorIds = manifest.executors.map((executor) => executor.nodeType);

    assert.equal(manifest.kind, 'plugin_manifest_request_v2');
    assert.equal(manifest.pluginId, 'email');
    assert.ok(executorIds.includes(SEND_MAIL_EXECUTOR_ID));
  });
});
