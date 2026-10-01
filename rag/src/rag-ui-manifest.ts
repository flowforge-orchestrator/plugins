import type { PluginManifestRequestV2 } from '@kosolapus/plugin-ts-sdk';
import { pluginAssetHttpBaseUrl } from './getUrlFromEnv';

const UI_ASSETS = {
  indexForm: 'ui.form.index',
  searchForm: 'ui.form.search',
  askForm: 'ui.form.ask',
  statsPipelineForm: 'ui.form.stats-pipeline',
  statsChatForm: 'ui.form.stats-chat',
  planWidget: 'ui.widget.rag.plan',
} as const;

export const RAG_PLAN_WIDGET_KEY = UI_ASSETS.planWidget;

export function ragStaticAssets(): PluginManifestRequestV2['staticAssets'] {
  const base = pluginAssetHttpBaseUrl();
  return Object.values(UI_ASSETS).map((key) => ({
    key,
    url: `${base}/assets/${key}`,
    mediaType: 'application/javascript',
  }));
}

export function ragUiForms(): NonNullable<PluginManifestRequestV2['ui']> {
  return {
    forms: [
      {
        id: 'index',
        label: 'RAG: загрузка',
        description: 'Дозагрузка DOC/PDF/изображения/ZIP в коллекцию',
        assetKey: UI_ASSETS.indexForm,
        icon: 'i-lucide-upload',
      },
      {
        id: 'search',
        label: 'RAG: поиск',
        description: 'Гибридный поиск по коллекции',
        assetKey: UI_ASSETS.searchForm,
        icon: 'i-lucide-search',
      },
      {
        id: 'ask',
        label: 'RAG: чат',
        description: 'Диалог по корпусу',
        assetKey: UI_ASSETS.askForm,
        icon: 'i-lucide-message-circle',
      },
      {
        id: 'stats-pipeline',
        label: 'RAG: метрики пайплайна',
        description: 'Сбор / чанки / граф / индексация',
        assetKey: UI_ASSETS.statsPipelineForm,
        icon: 'i-lucide-activity',
      },
      {
        id: 'stats-chat',
        label: 'RAG: метрики чата',
        description: 'Время, терны, токены, тулы, вектор и граф',
        assetKey: UI_ASSETS.statsChatForm,
        icon: 'i-lucide-chart-column',
      },
    ],
  };
}

export function ragPluginAssetEntries(): Record<
  string,
  { file: string; mediaType?: string }
> {
  return {
    [UI_ASSETS.indexForm]: { file: 'ui.form.index.mjs' },
    [UI_ASSETS.searchForm]: { file: 'ui.form.search.mjs' },
    [UI_ASSETS.askForm]: { file: 'ui.form.ask.mjs' },
    [UI_ASSETS.statsPipelineForm]: { file: 'ui.form.stats-pipeline.mjs' },
    [UI_ASSETS.statsChatForm]: { file: 'ui.form.stats-chat.mjs' },
    [UI_ASSETS.planWidget]: { file: 'ui.widget.rag.plan.mjs' },
  };
}
