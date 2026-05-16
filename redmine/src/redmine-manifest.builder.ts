import { Injectable, Logger } from '@nestjs/common';
import type {
  PluginManifestOnInitBuilder,
  PluginManifestRequestV2,
} from '@kosolapus/plugin-ts-sdk';
import { publicationPullEndpointFromEnv } from './getUrlFromEnv';
import { getRedmineExecutors } from './redmine/executors.index';

@Injectable()
export class RedminePluginManifestBuilder implements PluginManifestOnInitBuilder {
  private readonly logger = new Logger(RedminePluginManifestBuilder.name);

  buildManifestRequest(): PluginManifestRequestV2 {
    const entries = getRedmineExecutors();
    const pull = publicationPullEndpointFromEnv();
    const request: PluginManifestRequestV2 = {
      kind: 'plugin_manifest_request_v2',
      pluginId: 'redmine',
      publicationVersion:
        process.env.PLUGIN_PUBLICATION_VERSION?.trim() ?? '0.0.2',
      label: 'Redmine',
      description:
        'Интеграция с Redmine REST API: задачи, wiki, справочники; batch pull executor list на TCP с executor ingress.',
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
