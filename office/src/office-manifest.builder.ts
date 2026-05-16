import { Injectable, Logger } from '@nestjs/common';
import type {
  PluginManifestOnInitBuilder,
  PluginManifestRequestV2,
} from '@kosolapus/plugin-ts-sdk';
import { publicationPullEndpointFromEnv } from './getUrlFromEnv';
import { getOfficeExecutors } from './executors.index';

@Injectable()
export class OfficePluginManifestBuilder implements PluginManifestOnInitBuilder {
  private readonly logger = new Logger(OfficePluginManifestBuilder.name);

  buildManifestRequest(): PluginManifestRequestV2 {
    const entries = getOfficeExecutors();
    const pull = publicationPullEndpointFromEnv();
    const request: PluginManifestRequestV2 = {
      kind: 'plugin_manifest_request_v2',
      pluginId: 'office',
      publicationVersion:
        process.env.PLUGIN_PUBLICATION_VERSION?.trim() ?? '0.0.1',
      label: 'Офис',
      description:
        'Чтение и запись CSV, XLSX, извлечение текста из DOCX; batch pull executor list на TCP с executor ingress.',
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
