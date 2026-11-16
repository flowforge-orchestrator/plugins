import { IsString, MinLength } from 'class-validator';
import { FieldDecorator } from '@kosolapus/plugin-ts-sdk';

export class SkillInstanceInputDto {
  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'string',
    label: 'Name',
    description: 'Имя skill (каталог /tmp/pack/skills/<name>)',
    required: true,
    canBePort: true,
    isPort: true,
  })
  name!: string;

  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'textarea',
    label: 'Body',
    description: 'Содержимое SKILL.md',
    required: true,
    static: true,
    canBePort: true,
    isPort: true,
    isPrimary: false,
  })
  body!: string;
}

export class SkillInstanceOutputDto {
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Instance JSON',
    description: 'Opaque SkillInstance для SkillProvider',
  })
  instance!: string;

  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Status',
  })
  status!: string;
}
