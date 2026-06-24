import { Injectable, Logger } from '@nestjs/common';
import type {
  PluginManifestOnInitBuilder,
  PluginManifestRequestV2,
} from '@kosolapus/plugin-ts-sdk';
import { getCaldavExecutors } from './caldav/executors.index';
import { publicationPullEndpointFromEnv } from './getUrlFromEnv';

@Injectable()
export class CaldavManifestBuilder implements PluginManifestOnInitBuilder {
  private readonly logger = new Logger(CaldavManifestBuilder.name);

  buildManifestRequest(): PluginManifestRequestV2 {
    const entries = getCaldavExecutors();
    const pull = publicationPullEndpointFromEnv();
    const request: PluginManifestRequestV2 = {
      kind: 'plugin_manifest_request_v2',
      pluginId: 'caldav',
      publicationVersion:
        process.env.PLUGIN_PUBLICATION_VERSION?.trim() ?? '0.0.1',
      label: 'CalDAV',
      description:
        'Универсальный CalDAV: календари и CRUD событий (Nextcloud, iCloud, Radicale и др.).',
      variables: [],
      staticAssets: [],
      executors: entries.map((e) => ({ nodeType: e.nodeType })),
      pull: { host: pull.host, port: pull.port },
    };

    this.logger.log(
      `[registration] manifest request → plugin-manager:\n${JSON.stringify(request)}`,
    );

    return request;
  }
}
