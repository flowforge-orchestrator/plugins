import { Injectable, Logger } from '@nestjs/common';
import type {
  PluginManifestOnInitBuilder,
  PluginManifestRequestV2,
} from '@kosolapus/plugin-ts-sdk';
import { getCliAgentExecutors } from './agents/executors.index';
import { publicationPullEndpointFromEnv } from './getUrlFromEnv';

@Injectable()
export class CliAgentManifestBuilder implements PluginManifestOnInitBuilder {
  private readonly logger = new Logger(CliAgentManifestBuilder.name);

  buildManifestRequest(): PluginManifestRequestV2 {
    const entries = getCliAgentExecutors();
    const pull = publicationPullEndpointFromEnv();
    const request: PluginManifestRequestV2 = {
      kind: 'plugin_manifest_request_v2',
      pluginId: 'cli-agent',
      publicationVersion: process.env.PLUGIN_PUBLICATION_VERSION?.trim() ?? '0.0.1',
      label: 'CLI agents',
      description:
        'Взаимозаменяемые CLI coding agents в одноразовых Docker-контейнерах.',
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
