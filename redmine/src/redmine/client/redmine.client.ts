/**
 * HTTP-клиент для Redmine REST API.
 * @see https://www.redmine.org/projects/redmine/wiki/rest_api
 *
 * Аутентификация: X-Redmine-API-Key.
 * Content-Type: application/json обязателен для POST/PUT.
 */
export type RedmineClientConfig = {
  baseUrl: string;
  apiKey: string;
};

export class RedmineClient {
  constructor(private readonly config: RedmineClientConfig) {}

  private get base(): string {
    return this.config.baseUrl.replace(/\/$/, '');
  }

  private async request<T>(
    method: string,
    path: string,
    opts?: {
      body?: unknown;
      query?: Record<string, string | number | undefined>;
    },
  ): Promise<{ data: T; status: number; text: string }> {
    const url = new URL(`${this.base}${path}`);
    if (opts?.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
      }
    }

    const res = await fetch(url.toString(), {
      method,
      headers: {
        'X-Redmine-API-Key': this.config.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: opts?.body ? JSON.stringify(opts.body) : undefined,
    });

    const text = await res.text();
    let data: T | undefined;
    if (text) {
      try {
        data = JSON.parse(text) as T;
      } catch {
        // не JSON — оставляем undefined
      }
    }

    return { data: data as T, status: res.status, text };
  }

  get<T>(path: string, query?: Record<string, string | number | undefined>) {
    return this.request<T>('GET', path, { query });
  }

  post<T>(path: string, body: unknown) {
    return this.request<T>('POST', path, { body });
  }

  put<T>(path: string, body: unknown) {
    return this.request<T>('PUT', path, { body });
  }

  delete(path: string) {
    return this.request<void>('DELETE', path);
  }
}
