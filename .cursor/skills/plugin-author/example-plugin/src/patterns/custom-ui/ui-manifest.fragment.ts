/**
 * Custom UI manifest — merge into *ManifestBuilder.buildManifestRequest().
 * Replace `myplugin`, keys, and labels for your plugin.
 */
import type { PluginManifestRequestV2 } from '@kosolapus/plugin-ts-sdk';

/** Base URL reachable from plugin-manager: http://{PLUGIN_PULL_ADVERTISED_HOST}:{PLUGIN_HEALTH_HTTP_PORT} */
declare function pluginAssetHttpBaseUrl(): string;

const UI_KEYS = {
  launchForm: 'ui.form.launch',
  statusForm: 'ui.form.status',
  executorWidget: 'ui.widget.myplugin',
} as const;

export const MYPLUGIN_WIDGET_ASSET_KEY = UI_KEYS.executorWidget;

export function myPluginStaticAssets(): PluginManifestRequestV2['staticAssets'] {
  const base = pluginAssetHttpBaseUrl();
  return [
    {
      key: UI_KEYS.launchForm,
      url: `${base}/assets/${UI_KEYS.launchForm}`,
      mediaType: 'application/javascript',
    },
    {
      key: UI_KEYS.statusForm,
      url: `${base}/assets/${UI_KEYS.statusForm}`,
      mediaType: 'application/javascript',
    },
    {
      key: UI_KEYS.executorWidget,
      url: `${base}/assets/${UI_KEYS.executorWidget}`,
      mediaType: 'application/javascript',
    },
  ];
}

export function myPluginUiForms(): NonNullable<PluginManifestRequestV2['ui']> {
  return {
    forms: [
      {
        id: 'launch',
        label: 'My plugin: launch',
        description: 'Submit payload via process public portal',
        assetKey: UI_KEYS.launchForm,
        icon: 'i-lucide-play',
      },
      {
        id: 'status',
        label: 'My plugin: status',
        description: 'Latest run + poll by diagram-id',
        assetKey: UI_KEYS.statusForm,
        icon: 'i-lucide-activity',
      },
    ],
  };
}

/** Filename map for PluginAssetHttpModule (served from dist/ui/ at runtime). */
export function myPluginAssetEntries(): Record<
  string,
  { file: string; mediaType?: string }
> {
  return {
    [UI_KEYS.launchForm]: { file: 'ui.form.launch.mjs' },
    [UI_KEYS.statusForm]: { file: 'ui.form.status.mjs' },
    [UI_KEYS.executorWidget]: { file: 'ui.widget.myplugin.mjs' },
  };
}

/** Manifest builder excerpt:
 *
 * return {
 *   ...
 *   staticAssets: myPluginStaticAssets(),
 *   ui: myPluginUiForms(),
 *   executors: entries.map((e) => ({
 *     nodeType: e.nodeType,
 *     requiredTemplateKeys: [MYPLUGIN_WIDGET_ASSET_KEY],
 *   })),
 * };
 */
