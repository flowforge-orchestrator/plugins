import { Injectable, Logger } from '@nestjs/common';
import type {
  PluginManifestOnInitBuilder,
  PluginManifestRequestV2,
} from '@kosolapus/plugin-ts-sdk';
import { publicationPullEndpointFromEnv } from './getUrlFromEnv';
import { getTelegramExecutors } from './telegram/executors.index';

@Injectable()
export class TelegramPluginManifestBuilder implements PluginManifestOnInitBuilder {
  private readonly logger = new Logger(TelegramPluginManifestBuilder.name);

  buildManifestRequest(): PluginManifestRequestV2 {
    const entries = getTelegramExecutors();
    const pull = publicationPullEndpointFromEnv();
    const request: PluginManifestRequestV2 = {
      kind: 'plugin_manifest_request_v2',
      pluginId: 'telegram',
      publicationVersion:
        process.env.PLUGIN_PUBLICATION_VERSION?.trim() ?? '0.0.5',
      label: 'Telegram',
      description:
        'Bot API и локальная история переписки (SQLite): запись, список с фильтрами и offset, одна запись, список чатов.',
      variables: [],
      staticAssets: [],
      executors: entries.map((e) => ({ nodeType: e.nodeType })),
      pull: { host: pull.host, port: pull.port },
    };

    this.logger.log(
      `[registration] manifest request → plugin-manager (executors здесь только nodeType; transport ниже из @Executor):\n${JSON.stringify(request)}`,
    );
    this.logger.log(
      `[registration] декларированный transport до отправки batch pull:\n${JSON.stringify(
        entries.map((e) => ({
          nodeType: e.nodeType,
          transport: e.opts.transport,
        })),
      )}`,
    );

    return request;
  }
}
