/**
 * Widget pattern — manifest keys only.
 * Full wiring: ../custom-ui/ (build-ui, PluginAssetHttpModule, canvas host prop).
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
