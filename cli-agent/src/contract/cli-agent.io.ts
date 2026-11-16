import {
  Allow,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { FieldDecorator } from '@kosolapus/plugin-ts-sdk';
import { inheritExecutorFields } from './inherit-fields';
import {
  CLAUDE_CODE_MODELS,
  CODEX_MODELS,
  CURSOR_MODELS,
  PROPRIETARY_DEFAULT_MODEL,
} from './proprietary-models';

export const NAMED_PROVIDERS = [
  'openrouter',
  'anthropic',
  'openai',
  'zai',
  'nous',
  'google',
  'ollama',
  'custom',
] as const;

export type NamedProvider = (typeof NAMED_PROVIDERS)[number];

export type CliAgentStatus = 'ok' | 'error' | 'unsupported';

/** Shared agent ports; model is declared per OSS vs proprietary InputDto. */
export class CliAgentSharedInputDto {
  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'string',
    label: 'Задача',
    description: 'Текст задания для CLI-агента',
    required: true,
    canBePort: true,
    isPort: true,
  })
  task!: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Провайдер',
    description:
      'Устарело при llmConfig: openrouter | anthropic | openai | ollama | custom | …',
    canBePort: true,
    isPort: false,
    static: true,
  })
  provider?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Base URL',
    description: 'Устарело при llmConfig',
    canBePort: true,
    isPort: false,
    static: true,
  })
  baseUrl?: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'string',
    label: 'LLM config',
    description:
      'Opaque llmConfig от plugin.cli-agent.llm-config или llm-config.gigachat (OSS). Для Cursor/Codex/Claude Code — только credentials; модель с ноды.',
    canBePort: true,
    isPort: true,
  })
  llmConfig?: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'string',
    label: 'Tools',
    description:
      'JSON-массив имён или уже разобранный массив; пусто — набор CLI по умолчанию',
    canBePort: true,
    isPort: false,
  })
  tools?: string | string[];

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'string',
    label: 'Skills',
    description:
      'Устарело: имена skills приходят из skillAttach. Оставьте пустым.',
    canBePort: false,
    isPort: false,
    static: true,
  })
  skills?: string | string[];

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'string',
    label: 'MCP attach',
    description: 'Opaque mcpAttach от tool-provider',
    canBePort: true,
    isPort: true,
  })
  mcpAttach?: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'string',
    label: 'Skill attach',
    description: 'Opaque skillAttach от skill-provider',
    canBePort: true,
    isPort: true,
  })
  skillAttach?: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'string',
    label: 'Rules attach',
    description: 'Opaque rulesAttach от rules-provider',
    canBePort: true,
    isPort: true,
  })
  rulesAttach?: string;

  @IsOptional()
  @IsNumber()
  @FieldDecorator({
    type: 'number',
    label: 'Таймаут, мс',
    description: 'По умолчанию 10 мин, потолок 30 мин, минимум 1 с',
    canBePort: true,
    isPort: true,
  })
  timeoutMs?: number;

  /**
   * Barrier port for sequential graphs: wire previous agent's metrics (or any
   * always-produced value). Runtime starts this node only after the edge delivers;
   * the value is ignored by the executor.
   */
  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'string',
    label: 'Awaiter',
    description: 'Барьер: старт после предыдущего агента',
    canBePort: true,
    isPort: false,
  })
  awaiter?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'ref',
    label: 'API ключ',
    description: 'Устарело при llmConfig: секрет провайдера',
    static: true,
    secretKind: 'CLI_AGENT_API_KEY',
  })
  apiKey?: string;
}

/** OSS agents: model comes from llmConfig (or legacy static field). */
export class CliAgentInputDto extends CliAgentSharedInputDto {
  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Модель',
    description: 'Устарело при llmConfig',
    canBePort: true,
    isPort: false,
    static: true,
  })
  model?: string;
}
inheritExecutorFields(CliAgentSharedInputDto, CliAgentInputDto);

function proprietaryModelDecorator(
  models: readonly string[],
  defaultModel: string,
  cliFlag: string,
) {
  return FieldDecorator({
    type: 'select',
    label: 'Модель',
    description: `${cliFlag}: ${models.join(' | ')}`,
    required: true,
    static: true,
    canBePort: false,
    isPort: false,
    isPrimary: true,
    default: defaultModel,
  });
}

/** Claude Code: native Anthropic models via `claude --model`. */
export class ClaudeCodeInputDto extends CliAgentSharedInputDto {
  @IsIn(CLAUDE_CODE_MODELS as unknown as string[])
  @proprietaryModelDecorator(
    CLAUDE_CODE_MODELS,
    PROPRIETARY_DEFAULT_MODEL['claude-code'],
    'claude --model',
  )
  model!: string;
}
inheritExecutorFields(CliAgentSharedInputDto, ClaudeCodeInputDto);

/** Codex: native OpenAI Codex models via `codex -m`. */
export class CodexInputDto extends CliAgentSharedInputDto {
  @IsIn(CODEX_MODELS as unknown as string[])
  @proprietaryModelDecorator(
    CODEX_MODELS,
    PROPRIETARY_DEFAULT_MODEL.codex,
    'codex -m',
  )
  model!: string;
}
inheritExecutorFields(CliAgentSharedInputDto, CodexInputDto);

/** Cursor Agent: native Cursor cloud models via `agent --model`. */
export class CursorInputDto extends CliAgentSharedInputDto {
  @IsIn(CURSOR_MODELS as unknown as string[])
  @proprietaryModelDecorator(
    CURSOR_MODELS,
    PROPRIETARY_DEFAULT_MODEL.cursor,
    'agent --model',
  )
  model!: string;
}
inheritExecutorFields(CliAgentSharedInputDto, CursorInputDto);

export class CliAgentOutputDto {
  @IsString()
  @FieldDecorator({ type: 'string', label: 'Текст ответа' })
  text!: string;

  @IsString()
  @FieldDecorator({ type: 'string', label: 'stdout' })
  stdout!: string;

  @IsString()
  @FieldDecorator({ type: 'string', label: 'stderr' })
  stderr!: string;

  @IsBoolean()
  @FieldDecorator({ type: 'boolean', label: 'Усечено' })
  truncated!: boolean;

  @IsNumber()
  @FieldDecorator({ type: 'number', label: 'Байты stdout' })
  stdoutBytes!: number;

  @IsNumber()
  @FieldDecorator({ type: 'number', label: 'Байты stderr' })
  stderrBytes!: number;

  @IsNumber()
  @FieldDecorator({ type: 'number', label: 'Код выхода' })
  exitCode!: number;

  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Статус',
    description: 'ok | error | unsupported',
  })
  status!: CliAgentStatus;

  @IsBoolean()
  @FieldDecorator({ type: 'boolean', label: 'Usage известен' })
  usageKnown!: boolean;

  @IsOptional()
  @IsNumber()
  @FieldDecorator({ type: 'number', label: 'Input tokens' })
  inputTokens?: number;

  @IsOptional()
  @IsNumber()
  @FieldDecorator({ type: 'number', label: 'Output tokens' })
  outputTokens?: number;

  @IsOptional()
  @IsNumber()
  @FieldDecorator({ type: 'number', label: 'Total tokens' })
  totalTokens?: number;

  @IsBoolean()
  @FieldDecorator({
    type: 'boolean',
    label: 'Host workspace mounted',
    description: 'Always false: skills/tools use ephemeral /tmp/pack + mcpAttach',
    isPrimary: false,
  })
  workspaceMounted!: boolean;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Metrics JSON',
    description:
      'Top-30 run metrics (+extras) as JSON; null fields = not observed in this run',
  })
  metricsJson?: string;
}

export type CliAgentInput = {
  task: string;
  provider?: string;
  model?: string;
  baseUrl?: string;
  tools?: string | string[];
  skills?: string | string[];
  /** Opaque JSON from ToolProvider. */
  mcpAttach?: string;
  /** Opaque JSON from SkillProvider. */
  skillAttach?: string;
  /** Opaque JSON from RulesProvider. */
  rulesAttach?: string;
  /** Opaque JSON from LlmConfig. */
  llmConfig?: string;
  timeoutMs?: number;
  /** Barrier only; ignored by executeCliAgent. */
  awaiter?: string;
  apiKey?: string;
};
