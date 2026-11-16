import { IsOptional, IsString, MinLength } from 'class-validator';
import { FieldDecorator } from '@kosolapus/plugin-ts-sdk';

export class RulesInstanceInputDto {
  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Name',
    description: 'AGENTS / AGENTS.md → /tmp/pack/AGENTS.md; иначе rules/<name>',
    canBePort: true,
    isPort: true,
    default: 'AGENTS.md',
  })
  name?: string;

  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'textarea',
    label: 'Body',
    description: 'Текст правил (обычно AGENTS.md)',
    required: true,
    static: true,
    canBePort: true,
    isPort: true,
    isPrimary: false,
  })
  body!: string;
}

export class RulesInstanceOutputDto {
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Instance JSON',
    description: 'Opaque RulesInstance для RulesProvider',
  })
  instance!: string;

  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Status',
  })
  status!: string;
}
