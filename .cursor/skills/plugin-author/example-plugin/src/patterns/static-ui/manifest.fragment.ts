/**
 * Static UI pattern — merge into manifest builder when intake includes islands/forms.
 * Reference-only: wire AssetHttpModule + vite build in your plugin; see example-plugin patterns.
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
