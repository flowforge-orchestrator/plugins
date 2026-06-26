/**
 * Static UI pattern — minimal manifest stub.
 * Full wiring (HTTP module, build-ui, host API): ../custom-ui/
 */
import type { PluginManifestRequestV2 } from '@kosolapus/plugin-ts-sdk';

export function staticUiManifestFragment(): Pick<
  PluginManifestRequestV2,
  'staticAssets' | 'ui'
> {
  return {
    staticAssets: [
      {
        key: 'ui.form.demo',
        url: 'http://example:9414/assets/ui.form.demo',
        mediaType: 'application/javascript',
      },
    ],
    ui: {
      forms: [
        {
          id: 'demo',
          label: 'Demo form',
          assetKey: 'ui.form.demo',
        },
      ],
    },
  };
}
