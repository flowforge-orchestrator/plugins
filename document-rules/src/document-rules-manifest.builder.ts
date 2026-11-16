import { Injectable, Logger } from '@nestjs/common';
import type {
  PluginManifestOnInitBuilder,
  PluginManifestRequestV2,
} from '@kosolapus/plugin-ts-sdk';
import { publicationPullEndpointFromEnv } from './getUrlFromEnv';
import { getDocumentRulesExecutors } from './executors.index';

@Injectable()
export class DocumentRulesManifestBuilder implements PluginManifestOnInitBuilder {
  private readonly logger = new Logger(DocumentRulesManifestBuilder.name);

  buildManifestRequest(): PluginManifestRequestV2 {
    const entries = getDocumentRulesExecutors();
    const pull = publicationPullEndpointFromEnv();
    const request: PluginManifestRequestV2 = {
      kind: 'plugin_manifest_request_v2',
      pluginId: 'document-rules',
      publicationVersion:
        process.env.PLUGIN_PUBLICATION_VERSION?.trim() ?? '0.0.1',
      label: 'Обработка документа',
      description:
        'Пресет принимает файл, применяет зафиксированные правила и отдаёт новый файл.',
      variables: [],
      staticAssets: [],
      executors: entries.map((entry) => ({ nodeType: entry.nodeType })),
      pull: { host: pull.host, port: pull.port },
    };

    this.logger.log(
      `[registration] manifest request → plugin-manager:\n${JSON.stringify(request)}`,
    );
    return request;
  }
}
