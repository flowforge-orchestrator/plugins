import type {
  CliAgentInput,
  CliAgentOutputDto,
} from '../contract/cli-agent.io';
import {
  isProprietaryAgentSlug,
  PROPRIETARY_DEFAULT_MODEL,
  PROPRIETARY_NATIVE_PROVIDER,
} from '../contract/proprietary-models';
import type { ContainerSpec } from '../runtime/docker-args';
import { clampTimeout } from '../runtime/limits';
import { defaultSpawnRunner, type SpawnRunner } from '../runtime/spawn';
import { parseLlmConfig } from '../tools/llm-config.types';
import { parseMcpAttach } from '../tools/mcp-attach';
import {
  GIGACHAT_CA_CONTAINER_PATH,
  isGigachatOpenAiBaseUrl,
} from '../tools/gigachat-oauth';
import { installGigachatContentProxy } from '../tools/gigachat-content-proxy';
import { materializeMergedTrustBundlePath } from '../tools/russian-trusted-ca';
import { parseRulesAttach, parseSkillAttach } from '../tools/skill-attach';
import { collectRunMetrics, metricsToJson } from './metrics';
import { parseJsonStringList } from './parse-json-list';
import { checkProvider } from './provider';
import type { CliAgentAdapter } from './types';

function unsupported(
  reason: string,
  workspaceMounted = false,
): CliAgentOutputDto {
  return {
    text: reason,
    stdout: '',
    stderr: reason,
    truncated: false,
    stdoutBytes: 0,
    stderrBytes: 0,
    exitCode: 0,
    status: 'unsupported',
    usageKnown: false,
    workspaceMounted,
    metricsJson: metricsToJson(
      collectRunMetrics({
        agentSlug: 'unknown',
        task: reason,
        text: reason,
        stdout: '',
        stderr: reason,
        status: 'unsupported',
        exitCode: 0,
        latencyMs: 0,
        usageKnown: false,
        workspaceMounted,
      }),
    ),
  };
}

function isLocalOrCompatBaseUrl(baseUrl: string): boolean {
  const u = baseUrl.trim().toLowerCase();
  if (!u) return false;
  if (isGigachatOpenAiBaseUrl(baseUrl)) return true;
  return (
    u.includes('11434') ||
    u.includes('localhost') ||
    u.includes('127.0.0.1') ||
    u.includes('host.docker.internal')
  );
}

export async function executeCliAgent(
  adapter: CliAgentAdapter,
  input: CliAgentInput,
  runner: SpawnRunner = defaultSpawnRunner,
): Promise<CliAgentOutputDto> {
  const llm = parseLlmConfig(input.llmConfig);
  const proprietary = isProprietaryAgentSlug(adapter.slug);

  let provider: string;
  let model: string;
  let baseUrl: string;
  let apiKey: string;

  if (isProprietaryAgentSlug(adapter.slug)) {
    // Node model dropdown wins; llmConfig may supply apiKey only.
    model =
      (input.model ?? '').trim() || PROPRIETARY_DEFAULT_MODEL[adapter.slug];
    provider = PROPRIETARY_NATIVE_PROVIDER[adapter.slug];
    apiKey = (input.apiKey || llm?.apiKey || '').trim();
    const nodeBase = (input.baseUrl ?? '').trim();
    baseUrl =
      nodeBase && !isLocalOrCompatBaseUrl(nodeBase) ? nodeBase : '';
  } else {
    provider = (llm?.provider || input.provider || '').trim();
    model = (llm?.model ?? input.model ?? '').trim();
    baseUrl = (llm?.baseUrl ?? input.baseUrl ?? '').trim();
    apiKey = (llm?.apiKey || input.apiKey || '').trim();
  }

  if (!provider) {
    return unsupported('provider missing (wire llmConfig or set provider)');
  }
  if (!apiKey) {
    return unsupported('apiKey missing (wire llmConfig or set apiKey)');
  }
  if (proprietary && !model) {
    return unsupported('model missing (select a native CLI model on the node)');
  }

  const providerCheck = checkProvider(provider, baseUrl);
  if (!providerCheck.ok) {
    return unsupported(providerCheck.reason);
  }

  const tools = parseJsonStringList(input.tools, 'tools');
  if (!tools.ok) {
    return unsupported(tools.reason);
  }
  const skills = parseJsonStringList(input.skills, 'skills');
  if (!skills.ok) {
    return unsupported(skills.reason);
  }

  // Tools/skills/rules: mcpAttach + skillAttach + rulesAttach → ephemeral /tmp/pack.
  const plan = adapter.plan({
    task: input.task,
    provider: providerCheck.provider,
    model,
    baseUrl: providerCheck.baseUrl,
    apiKey,
    tools: tools.items,
    skills: skills.items,
    workspaceMounted: false,
    mcpAttach: parseMcpAttach(input.mcpAttach),
    skillAttach: parseSkillAttach(input.skillAttach),
    rulesAttach: parseRulesAttach(input.rulesAttach),
  });
  if (!plan.ok) {
    return unsupported(plan.reason, false);
  }

  const spec: ContainerSpec = {
    image: plan.image,
    command: plan.command,
    env: { ...plan.env },
    workspaceHostPath: null,
    workingDir: plan.workingDir,
  };

  // GigaChat (and similar) need НУЦ Минцифры inside the agent container.
  // Adapters stay unaware — only opaque AdapterRequest fields.
  // Proprietary agents never use GigaChat/ollama bases.
  if (!proprietary && isGigachatOpenAiBaseUrl(providerCheck.baseUrl)) {
    const hostCa = materializeMergedTrustBundlePath();
    spec.extraBinds = [`${hostCa}:${GIGACHAT_CA_CONTAINER_PATH}:ro`];
    spec.env = {
      ...spec.env,
      NODE_EXTRA_CA_CERTS: GIGACHAT_CA_CONTAINER_PATH,
      SSL_CERT_FILE: GIGACHAT_CA_CONTAINER_PATH,
      REQUESTS_CA_BUNDLE: GIGACHAT_CA_CONTAINER_PATH,
      CURL_CA_BUNDLE: GIGACHAT_CA_CONTAINER_PATH,
    };
    // CLIs that send content-part arrays get 400 from GigaChat. The proxy
    // flattens those arrays; adapters still only see baseUrl and apiKey.
    const proxied = installGigachatContentProxy(
      { command: spec.command, env: spec.env },
      providerCheck.baseUrl,
    );
    spec.command = proxied.command;
    spec.env = proxied.env;
  }

  const started = Date.now();
  try {
    const result = await runner(spec, clampTimeout(input.timeoutMs));
    const latencyMs = Date.now() - started;
    const usage = adapter.parseUsage(result.stdout, result.stderr);
    const status =
      result.timedOut || result.exitCode !== 0 ? 'error' : 'ok';
    let text = adapter.extractText(result.stdout, result.stderr);
    if (!text.trim() && status === 'error') {
      text = `${result.stderr}\n${result.stdout}`.trim().slice(0, 500);
    }
    const metrics = collectRunMetrics({
      agentSlug: adapter.slug,
      task: input.task,
      text,
      stdout: result.stdout,
      stderr: result.stderr,
      status,
      exitCode: result.exitCode,
      latencyMs,
      usageKnown: usage.usageKnown,
      ...(usage.usageKnown
        ? {
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            totalTokens: usage.totalTokens,
          }
        : {}),
      workspaceMounted: false,
    });
    return {
      text,
      stdout: result.stdout,
      stderr: result.stderr,
      truncated: result.truncated,
      stdoutBytes: result.stdoutBytes,
      stderrBytes: result.stderrBytes,
      exitCode: result.exitCode,
      status,
      usageKnown: usage.usageKnown,
      ...(usage.usageKnown
        ? {
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            totalTokens: usage.totalTokens,
          }
        : {}),
      workspaceMounted: false,
      metricsJson: metricsToJson(metrics),
    };
  } catch (error) {
    const latencyMs = Date.now() - started;
    const message = error instanceof Error ? error.message : String(error);
    return {
      text: message,
      stdout: '',
      stderr: message,
      truncated: false,
      stdoutBytes: 0,
      stderrBytes: 0,
      exitCode: 1,
      status: 'error',
      usageKnown: false,
      workspaceMounted: false,
      metricsJson: metricsToJson(
        collectRunMetrics({
          agentSlug: adapter.slug,
          task: input.task,
          text: message,
          stdout: '',
          stderr: message,
          status: 'error',
          exitCode: 1,
          latencyMs,
          usageKnown: false,
          workspaceMounted: false,
        }),
      ),
    };
  }
}
