/**
 * GigaChat OAuth: Authorization key → short-lived access token.
 * Fetch is injected so unit tests do not hit the network.
 * Default transport trusts НУЦ Минцифры (required for devices / api.giga.chat / ngw).
 *
 * Chat API (Sber docs ind-using-api / certificates): https://api.giga.chat/v1
 * for PERS, B2B and CORP. OAuth is always ngw.devices.sberbank.ru.
 * Legacy host gigachat.devices.sberbank.ru still detected for TLS CA bind.
 */

import https from 'node:https';
import { RUSSIAN_TRUSTED_CA_PEM } from './russian-trusted-ca';

export const GIGACHAT_OAUTH_URL =
  'https://ngw.devices.sberbank.ru:9443/api/v2/oauth';

/**
 * OpenAI-compatible chat host — current Sber docs for физлиц and business.
 * @see https://developers.sber.ru/docs/ru/gigachat/quickstart/ind-using-api
 */
export const GIGACHAT_PERS_OPENAI_BASE_URL = 'https://api.giga.chat/v1';

/** Same host as PERS (scope differs only at OAuth). */
export const GIGACHAT_BUSINESS_OPENAI_BASE_URL = 'https://api.giga.chat/v1';

/** @deprecated Prefer resolveGigachatOpenAiBaseUrl(scope); alias of api.giga.chat. */
export const GIGACHAT_OPENAI_BASE_URL = GIGACHAT_PERS_OPENAI_BASE_URL;

export const GIGACHAT_DEFAULT_SCOPE = 'GIGACHAT_API_PERS';

/** ngw drops TLS handshakes under parallel token exchanges. */
const OAUTH_NETWORK_ATTEMPTS = 3;
const OAUTH_RETRY_DELAY_MS = 500;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Current entry-level chat model (legacy `GigaChat` id returns 404). */
export const GIGACHAT_DEFAULT_MODEL = 'GigaChat-2';

/** OpenAI-compatible base URL (host is shared; scope selects product line at OAuth). */
export function resolveGigachatOpenAiBaseUrl(_scope: string): string {
  return GIGACHAT_PERS_OPENAI_BASE_URL;
}

/** Container path for the merged CA bind-mount (see executeCliAgent). */
export const GIGACHAT_CA_CONTAINER_PATH = '/russian-trusted-ca.pem';

export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export type GigachatOAuthResult =
  | { ok: true; accessToken: string; expiresAt?: number }
  | { ok: false; reason: string };

/** True when baseUrl points at GigaChat OpenAI-compatible host. */
export function isGigachatOpenAiBaseUrl(baseUrl: string): boolean {
  const trimmed = baseUrl.trim();
  if (!trimmed) return false;
  try {
    const host = new URL(trimmed).hostname.toLowerCase();
    return (
      host === 'api.giga.chat' ||
      host.endsWith('.giga.chat') ||
      host === 'gigachat.devices.sberbank.ru' ||
      host.includes('gigachat')
    );
  } catch {
    return /giga\.chat|gigachat/i.test(trimmed);
  }
}

/** Default fetch: Node https + Russian Trusted CA (global fetch fails TLS). */
export function gigachatHttpsFetch(
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
): Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}> {
  const url = new URL(input);
  const method = init?.method ?? 'GET';
  const headers = init?.headers ?? {};
  const body = init?.body;

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method,
        headers,
        ca: RUSSIAN_TRUSTED_CA_PEM,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          const status = res.statusCode ?? 0;
          resolve({
            ok: status >= 200 && status < 300,
            status,
            text: async () => raw,
          });
        });
      },
    );
    req.on('error', reject);
    if (body !== undefined) {
      req.end(body);
    } else {
      req.end();
    }
  });
}

/** Shape of vault value for errors — never includes the secret itself. */
export function describeAuthKeyShape(credentials: string): string {
  const s = credentials.trim();
  const len = s.length;
  const b64Charset = /^[A-Za-z0-9+/]+=*$/.test(s);
  let decodedColon = false;
  let decodedLen = 0;
  if (b64Charset && len >= 4) {
    try {
      const decoded = Buffer.from(s, 'base64').toString('utf8');
      decodedLen = decoded.length;
      decodedColon = decoded.includes(':');
    } catch {
      /* ignore */
    }
  }
  const looksJwt = s.startsWith('eyJ') || s.split('.').length === 3;
  return `len=${len} b64Charset=${b64Charset} decodedHasColon=${decodedColon} decodedLen=${decodedLen} looksJwt=${looksJwt}`;
}

/**
 * Normalize vault value to Basic payload (base64 of client_id:client_secret).
 * Accepts Authorization key from Studio, or plain `client_id:client_secret`.
 */
export function normalizeGigachatAuthorizationKey(raw: string): string {
  let s = raw.trim().replace(/^Basic\s+/i, '');
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  // Studio shows separate Client ID / Client Secret — user may paste "id:secret".
  if (s.includes(':')) {
    return Buffer.from(s, 'utf8').toString('base64');
  }
  // Authorization key paste often includes newlines / spaces from the UI.
  return s.replace(/\s+/g, '');
}

export async function exchangeGigachatAccessToken(opts: {
  /** Resolved Authorization key (Basic payload), not the secret name. */
  credentials: string;
  scope?: string;
  fetchImpl?: FetchLike;
  requestId?: string;
}): Promise<GigachatOAuthResult> {
  const credentials = normalizeGigachatAuthorizationKey(opts.credentials);
  if (!credentials) {
    return { ok: false, reason: 'credentials is empty' };
  }
  const scope =
    (opts.scope ?? GIGACHAT_DEFAULT_SCOPE).trim() || GIGACHAT_DEFAULT_SCOPE;
  const fetchImpl = opts.fetchImpl ?? gigachatHttpsFetch;
  const rqUid =
    opts.requestId?.trim() ||
    (typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `rq-${Date.now()}`);

  let response: Awaited<ReturnType<FetchLike>> | undefined;
  let networkError = '';
  for (let attempt = 0; attempt < OAUTH_NETWORK_ATTEMPTS && !response; attempt += 1) {
    if (attempt > 0) await sleep(OAUTH_RETRY_DELAY_MS * attempt);
    try {
      response = await fetchImpl(GIGACHAT_OAUTH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          RqUID: rqUid,
          Authorization: `Basic ${credentials}`,
        },
        body: `scope=${encodeURIComponent(scope)}`,
      });
    } catch (err) {
      networkError = err instanceof Error ? err.message : String(err);
    }
  }
  if (!response) {
    return { ok: false, reason: `oauth network: ${networkError}` };
  }

  const raw = await response.text();
  if (!response.ok) {
    let hint = '';
    if (response.status === 400 && /decode|Authorization/i.test(raw)) {
      const shape = describeAuthKeyShape(credentials);
      hint = ` — в секрете нужен Authorization key (Base64 от client_id:client_secret). Сейчас: ${shape}`;
    }
    return {
      ok: false,
      reason: `oauth HTTP ${response.status}: ${raw.slice(0, 200)}${hint}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'oauth response is not JSON' };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, reason: 'oauth response is not an object' };
  }
  const obj = parsed as Record<string, unknown>;
  const accessToken =
    typeof obj.access_token === 'string' ? obj.access_token.trim() : '';
  if (!accessToken) {
    return { ok: false, reason: 'oauth response missing access_token' };
  }
  const expiresAt =
    typeof obj.expires_at === 'number' ? obj.expires_at : undefined;
  return { ok: true, accessToken, expiresAt };
}
