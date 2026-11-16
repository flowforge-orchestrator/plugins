import { IsOptional, IsString, MinLength } from 'class-validator';
import { FieldDecorator } from '@kosolapus/plugin-ts-sdk';

export class LlmConfigInputDto {
  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'string',
    label: 'Провайдер',
    description:
      'openrouter | anthropic | openai | zai | nous | google | ollama | custom',
    required: true,
    static: true,
    canBePort: true,
    isPort: false,
  })
  provider!: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Модель',
    static: true,
    canBePort: true,
    isPort: false,
  })
  model?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Base URL',
    description: 'Обязателен при provider=custom / ollama',
    static: true,
    canBePort: true,
    isPort: false,
  })
  baseUrl?: string;

  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'ref',
    label: 'API ключ',
    description: 'Секрет провайдера (общий для всех агентов)',
    static: true,
    secretKind: 'CLI_AGENT_API_KEY',
  })
  apiKey!: string;
}

export class LlmConfigOutputDto {
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'LLM config',
    description: 'Opaque llmConfig для порта llmConfig CLI-агента',
  })
  llmConfig!: string;

  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Status',
  })
  status!: string;
}
