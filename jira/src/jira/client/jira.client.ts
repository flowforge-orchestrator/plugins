import { Injectable } from '@nestjs/common';

export type JiraClientConfig = {
  baseUrl: string;
  token: string;
};

@Injectable()
export class JiraClient {
  constructor(private readonly config: JiraClientConfig) {}

  private async request<T>(
    method: string,
    path: string,
    opts?: {
      body?: unknown;
      query?: Record<string, string | undefined>;
    },
  ): Promise<T> {
    const baseUrl = this.config.baseUrl;
    const token = this.config.token;

    const url = new URL(`${baseUrl}${path}`);
    if (opts?.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined) url.searchParams.set(k, v);
      }
    }

    const res = await fetch(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: opts?.body ? JSON.stringify(opts.body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Jira API error ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
  }

  get<T>(path: string, query?: Record<string, string | undefined>) {
    return this.request<T>('GET', path, { query });
  }

  post<T>(path: string, body: unknown) {
    return this.request<T>('POST', path, { body });
  }

  put<T>(path: string, body: unknown) {
    return this.request<T>('PUT', path, { body });
  }
}
