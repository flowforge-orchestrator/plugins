/** TCP endpoint advertised for batch-pull / executor ingress. */
export function publicationPullEndpointFromEnv(): { host: string; port: number } {
  const listenPort = Number(
    process.env.PLUGIN_TCP_PORT ??
      process.env.EXECUTOR_TCP_PORT ??
      process.env.PORT ??
      '9406',
  );
  const host = process.env.PLUGIN_PULL_ADVERTISED_HOST?.trim() ?? '127.0.0.1';
  const port =
    process.env.PLUGIN_PULL_ADVERTISED_PORT !== undefined &&
    process.env.PLUGIN_PULL_ADVERTISED_PORT !== ''
      ? Number(process.env.PLUGIN_PULL_ADVERTISED_PORT)
      : listenPort;
  return { host, port };
}

/** Base URL for static UI assets (plugin-manager fetches during publication). */
export function pluginAssetHttpBaseUrl(): string {
  const host = process.env.PLUGIN_PULL_ADVERTISED_HOST?.trim() ?? '127.0.0.1';
  const port = Number(process.env.PLUGIN_HEALTH_HTTP_PORT ?? '9407');
  return `http://${host}:${port}`;
}
