#!/usr/bin/env node
/**
 * Scaffold Wave B agent adapter/executor/help/Dockerfile from catalog/waves.json
 * for entries with status=scaffold and a known headless command.
 *
 *   node scripts/scaffold-wave-b.mjs
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const catalog = JSON.parse(
  readFileSync(join(root, 'catalog/waves.json'), 'utf8'),
);

const SPECS = {
  kilo: {
    npm: '@kilocode/cli',
    bin: 'kilo',
    command: (task, modelRef) => {
      const cmd = ['kilo', 'run', task];
      if (modelRef) cmd.push('--model', modelRef);
      return cmd;
    },
    modelStyle: 'openai-compat',
  },
  cline: {
    npm: 'cline',
    bin: 'cline',
    command: (task, modelRef) => {
      const cmd = ['cline', '-y', task];
      if (modelRef) cmd.push('--model', modelRef);
      return cmd;
    },
    modelStyle: 'openai-compat',
  },
  pi: {
    npm: '@mariozechner/pi-coding-agent',
    npmFallback: 'pi',
    bin: 'pi',
    command: (task) => ['pi', '-p', task],
    modelStyle: 'openai-compat',
  },
  qwen: {
    npm: '@qwen-code/qwen-code',
    npmFallback: '@qwenlm/qwen-code',
    bin: 'qwen',
    command: (task, modelRef) => {
      const cmd = ['qwen', '-p', task];
      if (modelRef) cmd.push('--model', modelRef);
      return cmd;
    },
    modelStyle: 'openai-compat',
  },
};

function adapterTs(slug, displayName, spec) {
  const npmLine = spec.npmFallback
    ? `npm install -g ${spec.npm} || npm install -g ${spec.npmFallback}`
    : `npm install -g ${spec.npm}`;
  return `import {
  bareModelId,
  okPlan,
  openAiCompatibleBaseUrl,
  rejectUnsupportedFilters,
  resolveBaseUrl,
  usesLocalOpenAiCompat,
} from '../adapter-common';
import type { AdapterRequest, CliAgentAdapter } from '../types';
import { parseOpenAiStyleUsage } from '../usage';

const IMAGE = 'cli-agent-${slug}:0.1.0';

export const ${camel(slug)}Adapter: CliAgentAdapter = {
  slug: '${slug}',
  displayName: '${displayName}',
  description: 'Запускает ${displayName} в одноразовом контейнере.',
  image: IMAGE,
  supportsToolsFilter: false,
  supportsSkillsFilter: false,
  plan(request: AdapterRequest) {
    const blocked = rejectUnsupportedFilters(${camel(slug)}Adapter, request);
    if (blocked) {
      return blocked;
    }
    const baseUrl = resolveBaseUrl(request);
    const providerId = usesLocalOpenAiCompat(request)
      ? request.provider === 'custom'
        ? 'custom'
        : 'ollama'
      : request.provider;
    const modelId = bareModelId(request.model, providerId);
    const modelRef = modelId ? \`\${providerId}/\${modelId}\` : '';
    const command = ${commandExpr(slug, spec)};
    const env: Record<string, string> = {
      HOME: '/home',
      OPENAI_API_KEY: request.apiKey,
      ANTHROPIC_API_KEY: request.apiKey,
    };
    if (baseUrl) {
      const openAiBase = openAiCompatibleBaseUrl(baseUrl);
      env.OPENAI_BASE_URL = openAiBase;
      env.OPENAI_API_BASE = openAiBase;
    }
    return okPlan(IMAGE, command, env, request);
  },
  parseUsage(stdout, stderr) {
    return parseOpenAiStyleUsage(\`\${stdout}\\n\${stderr}\`);
  },
  extractText(stdout) {
    return stdout.trim();
  },
};

// install hint: ${npmLine}
`;
}

function commandExpr(slug, spec) {
  if (slug === 'kilo') {
    return `(() => {
      const cmd = ['kilo', 'run', request.task];
      if (modelRef) cmd.push('--model', modelRef);
      return cmd;
    })()`;
  }
  if (slug === 'cline') {
    return `(() => {
      const cmd = ['cline', '-y', request.task];
      if (modelRef) cmd.push('--model', modelRef);
      return cmd;
    })()`;
  }
  if (slug === 'pi') {
    return `['pi', '-p', request.task]`;
  }
  if (slug === 'qwen') {
    return `(() => {
      const cmd = ['qwen', '-p', request.task];
      if (modelId) cmd.push('--model', modelId);
      return cmd;
    })()`;
  }
  return `['${spec.bin}', request.task]`;
}

function executorTs(slug, displayName) {
  const cls = pascal(slug) + 'CliAgentExecutor';
  const adapter = camel(slug) + 'Adapter';
  return `import { ExecContext, Executor, loadHelpFromFile } from '@kosolapus/plugin-ts-sdk';
import {
  CliAgentInputDto,
  CliAgentOutputDto,
} from '../../contract/cli-agent.io';
import { publicationPullEndpointFromEnv } from '../../getUrlFromEnv';
import { executeCliAgent } from '../execute';
import { ${adapter} } from './adapter';

@Executor<CliAgentInputDto, CliAgentOutputDto>({
  nodeType: 'plugin.cli-agent.${slug}',
  name: 'CLI agent: ${displayName}',
  description: ${adapter}.description,
  tags: ['cli-agent'],
  help: loadHelpFromFile(__dirname),
  pluginId: 'cli-agent',
  inputs: CliAgentInputDto,
  outputs: CliAgentOutputDto,
  transport: { type: 'tcp', params: publicationPullEndpointFromEnv() },
})
export class ${cls} {
  execute(ctx: ExecContext<CliAgentInputDto>): Promise<CliAgentOutputDto> {
    return executeCliAgent(${adapter}, ctx.inputs);
  }
}
`;
}

function helpMd(displayName, headless) {
  return `# CLI agent: ${displayName}

Runs \`${headless}\` in a one-shot container.

| Field | Type | Mode | Required |
| --- | --- | --- | --- |
| task | string | port | yes |
| provider | string | port | yes |
| model | string | port | no |
| baseUrl | string | port | no |
| tools | string | static | no |
| skills | string | static | no |
| workspace | string | static | no |
| timeoutMs | number | port | no |
| apiKey | ref (\`CLI_AGENT_API_KEY\`) | static | yes |

Enable the \`cli-agent\` plugin. Wire process ports identically across Wave agents so \`system.process.call\` can swap \`diagramId\`.
`;
}

function dockerfile(spec) {
  const install = spec.npmFallback
    ? `npm install -g ${spec.npm} || npm install -g ${spec.npmFallback} || true`
    : `npm install -g ${spec.npm}`;
  return `FROM node:22-bookworm-slim
RUN apt-get update \\
  && apt-get install -y --no-install-recommends ca-certificates git curl \\
  && rm -rf /var/lib/apt/lists/* \\
  && ${install}
WORKDIR /workspace
ENTRYPOINT []
CMD ["${spec.bin}"]
`;
}

function camel(slug) {
  return slug.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}
function pascal(slug) {
  const c = camel(slug);
  return c[0].toUpperCase() + c.slice(1);
}

const waveB = catalog.waves.B.agents.filter(
  (a) => a.status === 'scaffold' && SPECS[a.slug],
);

for (const agent of waveB) {
  const spec = SPECS[agent.slug];
  const srcDir = join(root, 'src/agents', agent.slug);
  const imgDir = join(root, 'images', agent.slug);
  mkdirSync(srcDir, { recursive: true });
  mkdirSync(imgDir, { recursive: true });
  const adapterPath = join(srcDir, 'adapter.ts');
  const executorPath = join(srcDir, 'executor.ts');
  const helpPath = join(srcDir, 'help.md');
  const dockerPath = join(imgDir, 'Dockerfile');
  if (!existsSync(adapterPath)) {
    writeFileSync(
      adapterPath,
      adapterTs(agent.slug, agent.displayName, spec),
    );
  }
  if (!existsSync(executorPath)) {
    writeFileSync(
      executorPath,
      executorTs(agent.slug, agent.displayName),
    );
  }
  if (!existsSync(helpPath)) {
    writeFileSync(
      helpPath,
      helpMd(agent.displayName, agent.headless || agent.slug),
    );
  }
  if (!existsSync(dockerPath)) {
    writeFileSync(dockerPath, dockerfile(spec));
  }
  console.log('scaffolded', agent.slug);
}

console.log(
  JSON.stringify(
    { scaffolded: waveB.map((a) => a.slug), next: 'wire registry + build images' },
    null,
    2,
  ),
);
