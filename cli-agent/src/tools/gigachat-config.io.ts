import { IsOptional, IsString, MinLength } from 'class-validator';
import { FieldDecorator } from '@kosolapus/plugin-ts-sdk';
import {
  GIGACHAT_DEFAULT_MODEL,
  GIGACHAT_DEFAULT_SCOPE,
} from './gigachat-oauth';

export class GigachatConfigInputDto {
  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'ref',
    label: 'API ключ',
    description:
      'Имя секрета с Authorization key из кабинета GigaChat (Basic). На запуске резолвится и обменивается на access token.',
    static: true,
    secretKind: 'GIGACHAT_AUTH_KEY',
  })
  apiKey!: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Scope',
    description:
      'GIGACHAT_API_PERS | GIGACHAT_API_B2B | GIGACHAT_API_CORP',
    static: true,
    canBePort: true,
    isPort: false,
    default: GIGACHAT_DEFAULT_SCOPE,
  })
  scope?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Модель',
    description: 'Имя модели в OpenAI-совместимом API (по умолчанию GigaChat-2)',
    static: true,
    canBePort: true,
    isPort: false,
    default: GIGACHAT_DEFAULT_MODEL,
  })
  model?: string;
}
