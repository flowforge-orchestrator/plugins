import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  exchangeGigachatAccessToken,
  GIGACHAT_DEFAULT_SCOPE,
  GIGACHAT_OAUTH_URL,
  isGigachatOpenAiBaseUrl,
  normalizeGigachatAuthorizationKey,
  resolveGigachatOpenAiBaseUrl,
  GIGACHAT_BUSINESS_OPENAI_BASE_URL,
  GIGACHAT_PERS_OPENAI_BASE_URL,
  type FetchLike,
} from './gigachat-oauth';

describe('exchangeGigachatAccessToken', () => {
  it('exchanges Authorization key for access_token', async () => {
    const calls: Array<{ url: string; init?: Parameters<FetchLike>[1] }> = [];
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            access_token: 'tok-abc',
            expires_at: 1700000000,
          }),
      };
    };

    const out = await exchangeGigachatAccessToken({
      credentials: 'auth-key-b64',
      fetchImpl,
      requestId: '11111111-1111-1111-1111-111111111111',
    });

    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.equal(out.accessToken, 'tok-abc');
    assert.equal(out.expiresAt, 1700000000);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, GIGACHAT_OAUTH_URL);
    assert.equal(calls[0].init?.method, 'POST');
    assert.equal(
      calls[0].init?.headers?.Authorization,
      'Basic auth-key-b64',
    );
    assert.equal(
      calls[0].init?.headers?.RqUID,
      '11111111-1111-1111-1111-111111111111',
    );
    assert.equal(
      calls[0].init?.body,
      `scope=${encodeURIComponent(GIGACHAT_DEFAULT_SCOPE)}`,
    );
  });

  it('rejects empty credentials without calling fetch', async () => {
    let called = false;
    const fetchImpl: FetchLike = async () => {
      called = true;
      return { ok: true, status: 200, text: async () => '{}' };
    };
    const out = await exchangeGigachatAccessToken({
      credentials: '  ',
      fetchImpl,
    });
    assert.equal(out.ok, false);
    if (out.ok) return;
    assert.match(out.reason, /credentials is empty/);
    assert.equal(called, false);
  });

  it('strips a leading Basic prefix from credentials', async () => {
    const calls: Array<{ init?: Parameters<FetchLike>[1] }> = [];
    const fetchImpl: FetchLike = async (_url, init) => {
      calls.push({ init });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ access_token: 'tok' }),
      };
    };
    const out = await exchangeGigachatAccessToken({
      credentials: 'Basic auth-key-b64',
      fetchImpl,
    });
    assert.equal(out.ok, true);
    assert.equal(calls[0].init?.headers?.Authorization, 'Basic auth-key-b64');
  });

  it('detects GigaChat OpenAI base URLs', () => {
    assert.equal(isGigachatOpenAiBaseUrl('https://api.giga.chat/v1'), true);
    assert.equal(
      isGigachatOpenAiBaseUrl('https://gigachat.devices.sberbank.ru/api/v1'),
      true,
    );
    assert.equal(
      isGigachatOpenAiBaseUrl('http://host.docker.internal:11434/v1'),
      false,
    );
  });

  it('resolves chat host to api.giga.chat for all scopes', () => {
    assert.equal(
      resolveGigachatOpenAiBaseUrl('GIGACHAT_API_PERS'),
      GIGACHAT_PERS_OPENAI_BASE_URL,
    );
    assert.equal(
      resolveGigachatOpenAiBaseUrl('GIGACHAT_API_B2B'),
      GIGACHAT_BUSINESS_OPENAI_BASE_URL,
    );
    assert.equal(
      resolveGigachatOpenAiBaseUrl('GIGACHAT_API_CORP'),
      GIGACHAT_BUSINESS_OPENAI_BASE_URL,
    );
    assert.equal(GIGACHAT_PERS_OPENAI_BASE_URL, 'https://api.giga.chat/v1');
    assert.equal(GIGACHAT_BUSINESS_OPENAI_BASE_URL, GIGACHAT_PERS_OPENAI_BASE_URL);
  });

  it('rejects response without access_token', async () => {
    const fetchImpl: FetchLike = async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ expires_at: 1 }),
    });
    const out = await exchangeGigachatAccessToken({
      credentials: 'key',
      fetchImpl,
    });
    assert.equal(out.ok, false);
    if (out.ok) return;
    assert.match(out.reason, /missing access_token/);
  });

  it('surfaces HTTP errors', async () => {
    const fetchImpl: FetchLike = async () => ({
      ok: false,
      status: 401,
      text: async () => 'unauthorized',
    });
    const out = await exchangeGigachatAccessToken({
      credentials: 'key',
      fetchImpl,
    });
    assert.equal(out.ok, false);
    if (out.ok) return;
    assert.match(out.reason, /oauth HTTP 401/);
  });

  it('retries a dropped TLS handshake and returns the token', async () => {
    let calls = 0;
    const fetchImpl: FetchLike = async () => {
      calls += 1;
      if (calls < 3) throw new Error('Client network socket disconnected');
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ access_token: 'tok', expires_at: 1 }),
      };
    };
    const out = await exchangeGigachatAccessToken({ credentials: 'key', fetchImpl });
    assert.equal(calls, 3);
    assert.equal(out.ok, true);
  });

  it('gives up after repeated network errors', async () => {
    let calls = 0;
    const fetchImpl: FetchLike = async () => {
      calls += 1;
      throw new Error('socket hang up');
    };
    const out = await exchangeGigachatAccessToken({ credentials: 'key', fetchImpl });
    assert.equal(calls, 3);
    assert.equal(out.ok, false);
    if (out.ok) return;
    assert.match(out.reason, /oauth network: socket hang up/);
  });

  it('normalizes plain client_id:client_secret to base64', () => {
    const b64 = normalizeGigachatAuthorizationKey('id-1:secret-2');
    assert.equal(b64, Buffer.from('id-1:secret-2', 'utf8').toString('base64'));
    assert.equal(
      normalizeGigachatAuthorizationKey('Basic alreadyb64='),
      'alreadyb64=',
    );
  });

  it('base64-encodes client_id:secret before Authorization header', async () => {
    const calls: Array<{ init?: Parameters<FetchLike>[1] }> = [];
    const fetchImpl: FetchLike = async (_url, init) => {
      calls.push({ init });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ access_token: 't' }),
      };
    };
    await exchangeGigachatAccessToken({
      credentials: 'cid:csecret',
      fetchImpl,
    });
    const expected = Buffer.from('cid:csecret', 'utf8').toString('base64');
    assert.equal(calls[0].init?.headers?.Authorization, `Basic ${expected}`);
  });
});
