import { Injectable, Logger } from '@nestjs/common';
import type {
  PluginManifestOnInitBuilder,
  PluginManifestRequestV2,
} from '@kosolapus/plugin-ts-sdk';
import { getExecutionExecutors } from './execution/executors.index';
import { publicationPullEndpointFromEnv } from './getUrlFromEnv';

@Injectable()
export class ExecutionManifestBuilder implements PluginManifestOnInitBuilder {
  private readonly logger = new Logger(ExecutionManifestBuilder.name);

  buildManifestRequest(): PluginManifestRequestV2 {
    const entries = getExecutionExecutors();
    const pull = publicationPullEndpointFromEnv();
    const request: PluginManifestRequestV2 = {
      kind: 'plugin_manifest_request_v2',
      pluginId: 'execution',
      publicationVersion: process.env.PLUGIN_PUBLICATION_VERSION?.trim() ?? '0.0.1',
      label: 'Execution',
      description:
        'Код в песочнице, edge-функция и одноразовый контейнер без сети.',
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
