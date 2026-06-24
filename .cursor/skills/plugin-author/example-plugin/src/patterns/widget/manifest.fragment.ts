/**
 * Widget pattern — add requiredTemplateKeys on executor + matching staticAssets entry.
 * Reference-only: no production plugin in this repo ships widgets; copy from example-plugin.
 */
export function widgetManifestFragment(): {
  staticAssetKey: string;
  requiredTemplateKeys: string[];
} {
  return {
    staticAssetKey: 'ui.widget.example',
    requiredTemplateKeys: ['ui.widget.example'],
  };
}
