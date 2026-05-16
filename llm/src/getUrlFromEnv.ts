/** TCP endpoint advertised for batch-pull / executor ingress (env: PLUGIN_PULL_ADVERTISED_*, listen port fallbacks). */
export function publicationPullEndpointFromEnv(): { host: string; port: number } {
  const listenPort = Number(
    process.env.PLUGIN_TCP_PORT ??
    process.env.EXECUTOR_TCP_PORT ??
    process.env.PORT ??
    '9400',
  );
  /** Routable FROM plugin-manager (not “localhost” when PM runs elsewhere). */
  const host = process.env.PLUGIN_PULL_ADVERTISED_HOST?.trim() ?? '127.0.0.1';
  const port =
    process.env.PLUGIN_PULL_ADVERTISED_PORT !== undefined &&
    process.env.PLUGIN_PULL_ADVERTISED_PORT !== ''
      ? Number(process.env.PLUGIN_PULL_ADVERTISED_PORT)
      : listenPort;
  return { host, port };
}
