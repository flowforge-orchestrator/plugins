/**
 * Add to AppModule imports alongside PluginPublicationTcpHostModule.
 *
 * import { join } from 'path';
 * import { PluginAssetHttpModule } from '@kosolapus/plugin-ts-sdk';
 * import { myPluginAssetEntries } from './myplugin-ui-manifest';
 */
export const appModuleAssetHttpFragment = `
PluginAssetHttpModule.forRoot({
  assetsDir: join(__dirname, 'ui'),
  assets: myPluginAssetEntries(),
}),
`;
