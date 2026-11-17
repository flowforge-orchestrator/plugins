import {
  Allow,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { FieldDecorator } from '@kosolapus/plugin-ts-sdk';
import { CLI_AGENT_ADAPTERS } from '../agents/registry';
import type { CliAgentAdapter } from '../agents/types';

/** Team members talk through MCP; adapters that reject an MCP attach cannot join. */
function acceptsMcp(adapter: CliAgentAdapter): boolean {
  const plan = adapter.plan({
    task: 'probe',
    provider: 'openai',
    model: 'probe',
    baseUrl: '',
    apiKey: 'probe',
    tools: [],
    skills: [],
    workspaceMounted: false,
    mcpAttach: {
      version: 1,
      servers: [{ id: 'a2a', transport: 'stdio', command: 'node', args: ['/tmp/probe.mjs'] }],
    },
    skillAttach: null,
    rulesAttach: null,
  });
  return plan.ok || !/\bMCP\b/i.test(plan.reason);
}

export const FACTORY_AGENT_SLUGS = CLI_AGENT_ADAPTERS.filter(acceptsMcp).map(
  (a) => a.slug,
);
export const FACTORY_DEFAULT_ORCHESTRATOR = 'opencode';

export class AgentFactoryInputDto {
  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'string',
    label: 'Задача',
    description: 'Задание для агента-оркестратора',
    required: true,
    canBePort: true,
    isPort: true,
  })
  task!: string;

  @IsIn(FACTORY_AGENT_SLUGS)
  @FieldDecorator({
    type: 'select',
    label: 'Оркестратор',
    description: `Корневой агент: ${FACTORY_AGENT_SLUGS.join(' | ')}`,
    required: true,
    static: true,
    canBePort: false,
    isPort: false,
    isPrimary: true,
    default: FACTORY_DEFAULT_ORCHESTRATOR,
  })
  orchestrator!: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'string',
    label: 'Ростер',
    description:
      'JSON-массив slug, которых агенты могут запускать с attach фабрики. Пусто и без профилей — только оркестратор',
    static: true,
    canBePort: true,
    isPort: false,
  })
  roster?: string | string[];

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'string',
    label: 'Профили',
    description:
      'Роли от plugin.cli-agent.agent-profile: у каждой свой агент, описание, инструменты, скиллы и правила',
    canBePort: true,
    isPort: true,
  })
  profiles?: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'string',
    label: 'Модели',
    description:
      'JSON-объект slug → модель для Cursor / Codex / Claude Code. OSS-агенты берут модель из llmConfig',
    static: true,
    canBePort: false,
    isPort: false,
  })
  models?: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'string',
    label: 'LLM config',
    description: 'Opaque llmConfig для всех OSS-агентов команды',
    canBePort: true,
    isPort: true,
  })
  llmConfig?: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'string',
    label: 'MCP attach',
    description: 'Opaque mcpAttach от tool-provider: оркестратор и агенты из ростера',
    canBePort: true,
    isPort: true,
  })
  mcpAttach?: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'string',
    label: 'Skill attach',
    description: 'Opaque skillAttach: оркестратор и агенты из ростера',
    canBePort: true,
    isPort: true,
  })
  skillAttach?: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'string',
    label: 'Rules attach',
    description: 'Opaque rulesAttach: оркестратор и агенты из ростера',
    canBePort: true,
    isPort: true,
  })
  rulesAttach?: string;

  @IsOptional()
  @IsNumber()
  @FieldDecorator({
    type: 'number',
    label: 'Макс. агентов',
    description: 'Всего в команде, включая оркестратора. По умолчанию 6, потолок 32',
    static: true,
    canBePort: true,
    isPort: false,
  })
  maxAgents?: number;

  @IsOptional()
  @IsNumber()
  @FieldDecorator({
    type: 'number',
    label: 'Макс. глубина',
    description: 'Уровней делегирования под оркестратором. По умолчанию 2, потолок 5',
    static: true,
    canBePort: true,
    isPort: false,
  })
  maxDepth?: number;

  @IsOptional()
  @IsNumber()
  @FieldDecorator({
    type: 'number',
    label: 'Таймаут агента, мс',
    description: 'На один контейнер. По умолчанию 10 мин, потолок 30 мин',
    static: true,
    canBePort: true,
    isPort: false,
  })
  agentTimeoutMs?: number;

  @IsOptional()
  @IsNumber()
  @FieldDecorator({
    type: 'number',
    label: 'Бюджет, мс',
    description: 'На всю команду. По умолчанию 30 мин, потолок 2 ч',
    canBePort: true,
    isPort: true,
  })
  budgetMs?: number;

  @IsOptional()
  @IsNumber()
  @FieldDecorator({
    type: 'number',
    label: 'Окно ожидания, мс',
    description:
      'Сколько держится один вызов a2a_wait / a2a_ask_parent. По умолчанию 45 с, 5–110 с',
    static: true,
    canBePort: false,
    isPort: false,
  })
  waitSliceMs?: number;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'ref',
    label: 'API ключ',
    description: 'Секрет провайдера, если не задан в llmConfig',
    static: true,
    secretKind: 'CLI_AGENT_API_KEY',
  })
  apiKey?: string;
}

export class AgentFactoryOutputDto {
  @IsString()
  @FieldDecorator({ type: 'string', label: 'Ответ', description: 'Итог оркестратора' })
  text!: string;

  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Статус',
    description: 'ok | error | unsupported',
  })
  status!: 'ok' | 'error' | 'unsupported';

  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Meta',
    description:
      'JSON: агенты, граф вызовов, лента событий, лимиты, токены и метрики каждого агента',
  })
  meta!: string;
}
