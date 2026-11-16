/**
 * GigaChat rejects OpenAI `messages[].content` arrays
 * ("invalid JSON syntax"). Kilo and Qwen send text parts that way.
 * A loopback proxy in the agent container flattens those arrays and
 * translates OpenAI tool calling to GigaChat functions. Adapters only see baseUrl/apiKey.
 */

export const GIGACHAT_CONTENT_PROXY_PORT = 8765;

export const GIGACHAT_CONTENT_PROXY_BASE = `http://127.0.0.1:${GIGACHAT_CONTENT_PROXY_PORT}/v1`;

export const GIGACHAT_PROXY_UPSTREAM_ENV = 'GIGACHAT_PROXY_UPSTREAM';

/** Join text parts. Non-text parts are kept as JSON so nothing is dropped. */
export function flattenMessageContent(content: unknown): unknown {
  if (!Array.isArray(content)) return content;
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && 'text' in part) {
        const text = (part as { text?: unknown }).text;
        if (typeof text === 'string') return text;
      }
      return JSON.stringify(part);
    })
    .join('');
}

/** Replace an OpenAI base URL embedded in env or argv. */
export function rewriteOpenAiBaseUrls(value: string, upstream: string): string {
  const needle = upstream.trim().replace(/\/+$/, '');
  if (!needle || !value.includes(needle)) return value;
  return value.split(needle).join(GIGACHAT_CONTENT_PROXY_BASE);
}

/**
 * GigaChat calls functions only in the legacy `functions` / `function_call` shape
 * (arguments as an object, one call per assistant message, results as role
 * `function` with a JSON-object content) and ignores OpenAI `tools`.
 * Shared by the proxy script and unit tests.
 */
export const GIGACHAT_TRANSLATE_SOURCE = String.raw`
function flatten(content) {
  if (!Array.isArray(content)) return content;
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && typeof part.text === 'string') return part.text;
      return JSON.stringify(part);
    })
    .join('');
}

function parseArgs(raw) {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : { input: value };
  } catch {
    return { input: raw };
  }
}

function functionResult(content) {
  const text = typeof content === 'string' ? content : JSON.stringify(content ?? '');
  try {
    const value = JSON.parse(text);
    if (value && typeof value === 'object' && !Array.isArray(value)) return text;
  } catch {}
  return JSON.stringify({ result: text });
}

function gigachatMessages(messages) {
  const names = {};
  const out = [];
  for (let i = 0; i < messages.length; i += 1) {
    const m = messages[i];
    if (!m || typeof m !== 'object') {
      out.push(m);
      continue;
    }
    const content = flatten(m.content);
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
      const results = new Map();
      let j = i + 1;
      while (j < messages.length && messages[j] && messages[j].role === 'tool') {
        results.set(messages[j].tool_call_id, messages[j]);
        j += 1;
      }
      m.tool_calls.forEach((call, k) => {
        const name = call && call.function ? call.function.name : 'tool';
        names[call.id] = name;
        out.push({
          role: 'assistant',
          content: k === 0 && typeof content === 'string' ? content : '',
          function_call: { name, arguments: parseArgs(call.function && call.function.arguments) },
        });
        const result = results.get(call.id);
        if (result) {
          out.push({ role: 'function', name, content: functionResult(flatten(result.content)) });
          results.delete(call.id);
        }
      });
      for (const [id, orphan] of results) {
        out.push({ role: 'function', name: names[id] || 'tool', content: functionResult(flatten(orphan.content)) });
      }
      i = j - 1;
      continue;
    }
    if (m.role === 'tool') {
      out.push({ role: 'function', name: names[m.tool_call_id] || m.name || 'tool', content: functionResult(content) });
      continue;
    }
    out.push(Array.isArray(m.content) ? { ...m, content } : m);
  }
  return out;
}

const GIGACHAT_FORMATS = ['date', 'date-time', 'time'];

function inferType(s) {
  if (s.properties) return 'object';
  if (s.items) return 'array';
  if (Array.isArray(s.enum) && s.enum.length > 0) {
    const t = typeof s.enum[0];
    return t === 'number' || t === 'boolean' ? t : 'string';
  }
  return 'string';
}

// GigaChat-2 rejects type arrays, null, anyOf/oneOf, $ref, const, untyped properties,
// objects without "properties" and formats other than date/date-time/time.
function gigachatSchema(schema, root, seen) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return { type: 'string' };
  let s = { ...schema };
  if (typeof s.$ref === 'string') {
    const m = /^#\/(\$defs|definitions)\/(.+)$/.exec(s.$ref);
    const target = m && root && root[m[1]] ? root[m[1]][m[2]] : undefined;
    if (!target || seen.has(s.$ref)) return { type: 'string', ...(s.description ? { description: s.description } : {}) };
    const { $ref, ...rest } = s;
    return gigachatSchema({ ...target, ...rest }, root, new Set([...seen, $ref]));
  }
  for (const key of ['anyOf', 'oneOf']) {
    if (Array.isArray(s[key])) {
      const branch = s[key].find((b) => b && b.type !== 'null') || { type: 'string' };
      const { [key]: _drop, ...rest } = s;
      s = { ...branch, ...rest };
    }
  }
  if (Array.isArray(s.allOf)) {
    const { allOf, ...rest } = s;
    s = Object.assign({}, ...allOf.filter((b) => b && typeof b === 'object'), rest);
  }
  if ('const' in s) {
    if (!Array.isArray(s.enum)) s.enum = [s.const];
    delete s.const;
  }
  if (Array.isArray(s.type)) s.type = s.type.find((t) => t !== 'null') || 'string';
  if (typeof s.type !== 'string' || s.type === 'null') s.type = inferType(s);
  if (s.format && !GIGACHAT_FORMATS.includes(s.format)) delete s.format;
  delete s.$schema;
  delete s.$defs;
  delete s.definitions;
  if (s.type === 'object') {
    const props = s.properties && typeof s.properties === 'object' ? s.properties : {};
    s.properties = Object.fromEntries(
      Object.entries(props).map(([k, v]) => [k, gigachatSchema(v, root, seen)]),
    );
    if (Array.isArray(s.required)) s.required = s.required.filter((k) => k in s.properties);
    if (s.additionalProperties && typeof s.additionalProperties === 'object') {
      s.additionalProperties = gigachatSchema(s.additionalProperties, root, seen);
    }
  }
  if (s.type === 'array' && s.items) s.items = gigachatSchema(s.items, root, seen);
  return s;
}

function gigachatFunction(fn) {
  const params = fn.parameters && typeof fn.parameters === 'object' ? fn.parameters : {};
  return { ...fn, parameters: gigachatSchema({ type: 'object', ...params }, params, new Set()) };
}

function toGigachatRequest(body) {
  if (!body || typeof body !== 'object') return { body, functions: false };
  const out = { ...body };
  let functions = false;
  if (Array.isArray(out.messages)) {
    functions = out.messages.some((m) => m && (m.role === 'tool' || Array.isArray(m.tool_calls)));
    out.messages = gigachatMessages(out.messages);
  }
  if (Array.isArray(out.tools)) {
    const fns = out.tools.filter((t) => t && t.type === 'function' && t.function).map((t) => t.function);
    if (fns.length > 0) {
      functions = true;
      out.functions = fns;
      const choice = out.tool_choice;
      if (choice === 'none') out.function_call = 'none';
      else if (choice && typeof choice === 'object' && choice.function && choice.function.name) {
        out.function_call = { name: choice.function.name };
      } else out.function_call = 'auto';
    }
  }
  if (Array.isArray(out.functions)) {
    functions = true;
    out.functions = out.functions.map(gigachatFunction);
  }
  // GigaChat-2 returns 500 for functions+reasoning_effort, and 422 for reasoning_effort "none".
  delete out.reasoning_effort;
  delete out.tools;
  delete out.tool_choice;
  delete out.parallel_tool_calls;
  return { body: out, functions };
}

function fromGigachatCompletion(body) {
  if (!body || !Array.isArray(body.choices)) return body;
  return {
    ...body,
    choices: body.choices.map((choice, index) => {
      const message = { ...(choice.message || {}) };
      const call = message.function_call;
      delete message.function_call;
      delete message.functions_state_id;
      if (!call) return { ...choice, message };
      message.tool_calls = [
        {
          id: call.id || 'call_' + index,
          type: 'function',
          function: {
            name: call.name,
            arguments: typeof call.arguments === 'string' ? call.arguments : JSON.stringify(call.arguments || {}),
          },
        },
      ];
      return { ...choice, message, finish_reason: 'tool_calls' };
    }),
  };
}

function sseFromCompletion(completion, includeUsage) {
  const base = {
    id: completion.id || 'chatcmpl-gigachat',
    object: 'chat.completion.chunk',
    created: completion.created || Math.floor(Date.now() / 1000),
    model: completion.model,
  };
  const frames = [];
  const push = (extra) => frames.push('data: ' + JSON.stringify({ ...base, ...extra }) + '\n\n');
  for (const [index, choice] of (completion.choices || []).entries()) {
    const message = choice.message || {};
    push({ choices: [{ index, delta: { role: 'assistant', content: message.content || '' }, finish_reason: null }] });
    if (Array.isArray(message.tool_calls)) {
      push({
        choices: [
          { index, delta: { tool_calls: message.tool_calls.map((t, i) => ({ index: i, ...t })) }, finish_reason: null },
        ],
      });
    }
    push({ choices: [{ index, delta: {}, finish_reason: choice.finish_reason || 'stop' }] });
  }
  if (includeUsage && completion.usage) push({ choices: [], usage: completion.usage });
  frames.push('data: [DONE]\n\n');
  return frames.join('');
}
`;

const PROXY_SOURCE = `import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
${GIGACHAT_TRANSLATE_SOURCE}
const upstream = (process.env.${GIGACHAT_PROXY_UPSTREAM_ENV} || '').replace(/\\/+$/, '');
const target = new URL(upstream);
const caPath = process.env.NODE_EXTRA_CA_CERTS || '';
const ca = caPath && fs.existsSync(caPath) ? fs.readFileSync(caPath) : undefined;
const port = ${GIGACHAT_CONTENT_PROXY_PORT};

http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    let body = Buffer.concat(chunks);
    let functions = false;
    let wantStream = false;
    let includeUsage = false;
    let fnNames = [];
    let model = '';
    const ctype = String(req.headers['content-type'] || '');
    if (ctype.includes('json') && body.length) {
      try {
        const translated = toGigachatRequest(JSON.parse(body.toString('utf8')));
        functions = translated.functions;
        const out = translated.body;
        fnNames = Array.isArray(out.functions) ? out.functions.map((f) => f.name) : [];
        model = out.model;
        if (functions && out.stream) {
          wantStream = true;
          includeUsage = Boolean(out.stream_options && out.stream_options.include_usage);
          out.stream = false;
          delete out.stream_options;
        }
        body = Buffer.from(JSON.stringify(out));
      } catch {
        /* forward raw */
      }
    }
    const headers = { ...req.headers, host: target.host };
    delete headers['content-length'];
    delete headers['transfer-encoding'];
    if (functions) delete headers['accept-encoding'];
    headers['content-length'] = String(body.length);
    const fwd = https.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || 443,
        path: req.url,
        method: req.method,
        headers,
        ca,
      },
      (up) => {
        if (up.statusCode !== 200) {
          const err = [];
          up.on('data', (c) => err.push(c));
          up.on('end', () => {
            const raw = Buffer.concat(err);
            fs.writeFileSync('/tmp/gigachat-last-error-request.json', body);
            console.error(new Date().toISOString(), req.method, req.url, up.statusCode, raw.toString('utf8').slice(0, 500), 'bytes=' + body.length, 'functions=' + fnNames.join(','));
            res.writeHead(up.statusCode || 502, up.headers);
            res.end(raw);
          });
          return;
        }
        if (!functions) {
          if (req.method === 'POST') console.error(new Date().toISOString(), model, req.url, 'functions=0');
          res.writeHead(up.statusCode, up.headers);
          up.pipe(res);
          return;
        }
        const parts = [];
        up.on('data', (c) => parts.push(c));
        up.on('end', () => {
          let completion;
          try {
            completion = fromGigachatCompletion(JSON.parse(Buffer.concat(parts).toString('utf8')));
            const call = completion.choices?.[0]?.message?.tool_calls?.[0]?.function?.name || '-';
            console.error(new Date().toISOString(), model, 'functions=' + fnNames.length, 'call=' + call, fnNames.join(',').slice(0, 400));
          } catch (err) {
            res.writeHead(502, { 'content-type': 'text/plain' });
            res.end('gigachat proxy: ' + String(err && err.message ? err.message : err));
            return;
          }
          if (wantStream) {
            res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
            res.end(sseFromCompletion(completion, includeUsage));
          } else {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify(completion));
          }
        });
      },
    );
    fwd.on('error', (err) => {
      if (!res.headersSent) res.writeHead(502);
      res.end(String(err && err.message ? err.message : err));
    });
    fwd.end(body);
  });
}).listen(port, '127.0.0.1');
`;

/** Shell that starts the proxy on the container loopback before the CLI. */
export function gigachatContentProxyShell(): string {
  return [
    `cat > /tmp/gigachat-openai-proxy.mjs << 'EOF'`,
    PROXY_SOURCE.trim(),
    `EOF`,
    `node /tmp/gigachat-openai-proxy.mjs >/tmp/gigachat-openai-proxy.log 2>&1 &`,
    `i=0; while [ "$i" -lt 50 ]; do node -e 'require("net").connect(${GIGACHAT_CONTENT_PROXY_PORT},"127.0.0.1",()=>process.exit(0)).on("error",()=>process.exit(1))' && break; i=$((i+1)); sleep 0.05; done`,
  ].join('\n');
}

export function installGigachatContentProxy(
  spec: { command: readonly string[]; env: Record<string, string> },
  upstream: string,
): { command: string[]; env: Record<string, string> } {
  const base = upstream.trim().replace(/\/+$/, '');
  const env = { ...spec.env };
  for (const key of Object.keys(env)) {
    const value = env[key] ?? '';
    if (key.endsWith('_B64')) {
      const decoded = Buffer.from(value, 'base64').toString('utf8');
      const rewritten = rewriteOpenAiBaseUrls(decoded, base);
      if (rewritten !== decoded) env[key] = Buffer.from(rewritten, 'utf8').toString('base64');
      continue;
    }
    env[key] = rewriteOpenAiBaseUrls(value, base);
  }
  env[GIGACHAT_PROXY_UPSTREAM_ENV] = base;
  let command = spec.command.map((part) => rewriteOpenAiBaseUrls(part, base));
  const prefix = gigachatContentProxyShell();
  if (command[0] === 'sh' && command[1] === '-c') {
    command[2] = `${prefix}\n${command[2] ?? ''}`;
  } else {
    command = ['sh', '-c', `${prefix}\nexec "$0" "$@"`, ...command];
  }
  return { command, env };
}
