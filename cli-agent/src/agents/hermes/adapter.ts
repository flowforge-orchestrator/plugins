import {
  cliToolAllowlist,
  hasMcpAttach,
  hasSkillPack,
  hermesMcpServersYaml,
  HERMES_MCP_SEED_SHELL,
  isolateEmptyPackContext,
  okPlan,
  rejectUnsupportedFilters,
  resolveBaseUrl,
  withPackTaskPrefix,
} from '../adapter-common';
import type { AdapterRequest, CliAgentAdapter } from '../types';
import { parseOpenAiStyleUsage } from '../usage';
import {
  EPHEMERAL_MATERIALIZE_SHELL,
  EPHEMERAL_ROOT,
  ephemeralEnvForRequest,
  joinShellSteps,
  mcpAttachForEphemeral,
  needsEphemeralMaterialize,
  resolvedSkillNames,
} from '../../tools/runtime/ephemeral-pack';

const IMAGE = 'cli-agent-hermes:0.1.0';

export const hermesAdapter: CliAgentAdapter = {
  slug: 'hermes',
  displayName: 'Hermes',
  description: 'Запускает Hermes CLI в одноразовом контейнере.',
  image: IMAGE,
  supportsToolsFilter: true,
  supportsSkillsFilter: true,
  plan(request: AdapterRequest) {
    const blocked = rejectUnsupportedFilters(hermesAdapter, request);
    if (blocked) {
      return blocked;
    }
    const skillNames = resolvedSkillNames(request);
    const useEphemeralSkills = hasSkillPack(request);
    const mcp = hasMcpAttach(request);
    const ephemeral = needsEphemeralMaterialize(request);
    const hermesArgs = [
      'chat',
      '--oneshot',
      '-q',
      withPackTaskPrefix(request),
    ];
    if (request.model) {
      hermesArgs.push('--model', request.model);
    }
    if (request.provider) {
      hermesArgs.push('--provider', request.provider);
    }
    if (!mcp) {
      const allow = cliToolAllowlist(request.tools, 'hermes');
      if (allow != null && allow.length > 0) {
        hermesArgs.push('-t', allow.join(','));
      }
    }
    if (!useEphemeralSkills && skillNames.length > 0) {
      hermesArgs.push('-s', skillNames.join(','));
    }

    const baseUrl = resolveBaseUrl(request);
    const env: Record<string, string> = {
      HOME: '/home',
      HERMES_API_KEY: request.apiKey,
      OPENAI_API_KEY: request.apiKey,
    };
    if (mcp && request.mcpAttach) {
      env.HERMES_MCP_YAML_B64 = Buffer.from(
        hermesMcpServersYaml(mcpAttachForEphemeral(request.mcpAttach)),
        'utf8',
      ).toString('base64');
      const apiFromAttach = request.mcpAttach.servers[0]?.env?.CONVEYOR_API_BASE;
      if (apiFromAttach) {
        env.CONVEYOR_API_BASE = apiFromAttach;
      }
    }
    if (ephemeral) {
      Object.assign(env, ephemeralEnvForRequest(request));
    }
    if (baseUrl) {
      env.HERMES_BASE_URL = baseUrl;
      env.OPENAI_BASE_URL = baseUrl;
    }
    if (request.provider) {
      env.HERMES_PROVIDER = request.provider;
    }

    if (mcp || useEphemeralSkills || ephemeral) {
      const parts: string[] = [];
      if (ephemeral) {
        parts.push(EPHEMERAL_MATERIALIZE_SHELL);
      }
      if (mcp) {
        parts.push(HERMES_MCP_SEED_SHELL);
      }
      if (useEphemeralSkills) {
        parts.push(
          `hermes skills trust ${EPHEMERAL_ROOT} >/dev/null 2>&1 || true`,
        );
      }
      parts.push('exec hermes "$@"');
      const command = [
        'sh',
        '-c',
        joinShellSteps(...parts),
        'hermes',
        ...hermesArgs,
      ];
      return isolateEmptyPackContext(
        okPlan(IMAGE, command, env, request),
        request,
      );
    }

    return isolateEmptyPackContext(
      okPlan(IMAGE, ['hermes', ...hermesArgs], env, request),
      request,
    );
  },
  parseUsage(stdout, stderr) {
    return parseOpenAiStyleUsage(`${stdout}\n${stderr}`);
  },
  extractText(stdout) {
    const blob = stdout.trim();
    const box = blob.match(
      /╭─[^\n]*Hermes[^\n]*╮\r?\n([\s\S]*?)\r?\n╰─/,
    );
    if (box?.[1] != null) {
      const body = box[1]
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .join('\n')
        .trim();
      if (body) return body;
    }
    const lines = blob.split(/\r?\n/).map((l) => l.trim());
    const chrome =
      /^(?:Query:|Initializing |─+|┌─|└─|╭─|╰─|Resume this session|Session:|Title:|Duration:|Messages:|hermes --resume|hermes -c )/i;
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i];
      if (!line || chrome.test(line)) continue;
      return line;
    }
    return blob;
  },
};
