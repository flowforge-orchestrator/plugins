import { Injectable, Logger } from '@nestjs/common';
import type {
  PluginManifestOnInitBuilder,
  PluginManifestRequestV2,
} from '@kosolapus/plugin-ts-sdk';
import { publicationPullEndpointFromEnv } from './getUrlFromEnv';
import { getExampleExecutors } from './executors.index';
// Optional (enable per intake):
// import { staticUiManifestFragment } from './patterns/static-ui/manifest.fragment';
// import { widgetManifestFragment } from './patterns/widget/manifest.fragment';

@Injectable()
export class ExampleManifestBuilder implements PluginManifestOnInitBuilder {
  private readonly logger = new Logger(ExampleManifestBuilder.name);

  buildManifestRequest(): PluginManifestRequestV2 {
    const entries = getExampleExecutors();
    const pull = publicationPullEndpointFromEnv();

    const request: PluginManifestRequestV2 = {
      kind: 'plugin_manifest_request_v2',
      pluginId: 'example',
      publicationVersion:
        process.env.PLUGIN_PUBLICATION_VERSION?.trim() ?? '0.0.1',
      label: 'Example',
      description: 'Reference plugin for plugin-author skill (echo executor).',
      variables: [],
      staticAssets: [],
      executors: entries.map((e) => ({ nodeType: e.nodeType })),
      pull: { host: pull.host, port: pull.port },
    };

    this.logger.log(
      `[registration] manifest request:\n${JSON.stringify(request)}`,
    );

    return request;
  }
}
