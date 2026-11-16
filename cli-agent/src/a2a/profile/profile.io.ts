import { Allow, IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { FieldDecorator } from '@kosolapus/plugin-ts-sdk';
import { FACTORY_AGENT_SLUGS, FACTORY_DEFAULT_ORCHESTRATOR } from '../factory.io';
import { PROFILE_NAME } from '../profile.types';

export class AgentProfileInputDto {
  @IsString()
  @Matches(PROFILE_NAME)
  @FieldDecorator({
    type: 'string',
    label: 'Роль',
    description: 'Имя для a2a_spawn: строчные латинские буквы, цифры, _ и -',
    required: true,
    static: true,
    canBePort: false,
    isPort: false,
    isPrimary: true,
  })
  name!: string;

  @IsIn(FACTORY_AGENT_SLUGS)
  @FieldDecorator({
    type: 'select',
    label: 'Агент',
    description: `CLI-агент роли: ${FACTORY_AGENT_SLUGS.join(' | ')}`,
    required: true,
    static: true,
    canBePort: false,
    isPort: false,
    default: FACTORY_DEFAULT_ORCHESTRATOR,
  })
  agent!: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Описание',
    description: 'Специализация роли; её видят оркестратор и сам агент',
    static: true,
    canBePort: true,
    isPort: false,
  })
  description?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Модель',
    description: 'Для Cursor / Codex / Claude Code; OSS-агенты берут модель из llmConfig',
    static: true,
    canBePort: false,
    isPort: false,
  })
  model?: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'string',
    label: 'LLM config',
    description: 'Opaque llmConfig роли; пусто — llmConfig фабрики',
    canBePort: true,
    isPort: true,
  })
  llmConfig?: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'string',
    label: 'MCP attach',
    description: 'Инструменты роли (tool-provider)',
    canBePort: true,
    isPort: true,
  })
  mcpAttach?: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'string',
    label: 'Skill attach',
    description: 'Скиллы роли (skill-provider)',
    canBePort: true,
    isPort: true,
  })
  skillAttach?: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'string',
    label: 'Rules attach',
    description: 'Правила роли (rules-provider)',
    canBePort: true,
    isPort: true,
  })
  rulesAttach?: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'string',
    label: 'Профили',
    description: 'Выход profiles предыдущего профиля; этот профиль дописывается в конец',
    canBePort: true,
    isPort: true,
  })
  profiles?: string;
}

export class AgentProfileOutputDto {
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Профили',
    description: 'JSON-массив профилей для порта profiles фабрики или следующего профиля',
  })
  profiles!: string;

  @IsString()
  @FieldDecorator({ type: 'string', label: 'Статус', description: 'ok или error: …' })
  status!: string;
}
