import { IsString } from 'class-validator';
import { FieldDecorator } from '@kosolapus/plugin-ts-sdk';

export class RulesProviderOutputDto {
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Rules attach',
    description: 'Opaque rulesAttach для CLI-агента',
  })
  rulesAttach!: string;

  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Rule names',
    description: 'JSON-массив имён rules',
  })
  ruleNames!: string;

  @IsString()
  @FieldDecorator({ type: 'string', label: 'Status' })
  status!: string;
}

export const RULES_PROVIDER_STATIC_KEYS = new Set<string>([]);
