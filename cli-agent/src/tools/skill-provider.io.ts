import { IsString } from 'class-validator';
import { FieldDecorator } from '@kosolapus/plugin-ts-sdk';

export class SkillProviderOutputDto {
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Skill attach',
    description: 'Opaque skillAttach для CLI-агента',
  })
  skillAttach!: string;

  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Skill names',
    description: 'JSON-массив имён skills',
  })
  skillNames!: string;

  @IsString()
  @FieldDecorator({ type: 'string', label: 'Status' })
  status!: string;
}

export const SKILL_PROVIDER_STATIC_KEYS = new Set<string>([]);
