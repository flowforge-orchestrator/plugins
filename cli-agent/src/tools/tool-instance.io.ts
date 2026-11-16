import { Allow, IsOptional, IsString, MinLength } from 'class-validator';
import { FieldDecorator } from '@kosolapus/plugin-ts-sdk';

export class ToolInstanceInputDto {
  @Allow()
  @FieldDecorator({
    type: 'keyvalue',
    label: 'Meta',
    description: '{ name, description, inputSchema }',
    required: true,
    canBePort: true,
    isPort: true,
    isPrimary: false,
  })
  meta!: unknown;

  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'textarea',
    label: 'Source',
    description: 'javascript: async (input) => …',
    required: true,
    static: true,
    canBePort: true,
    isPort: true,
    isPrimary: false,
  })
  source!: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Language',
    description: 'Пока только javascript',
    static: true,
    default: 'javascript',
  })
  language?: string;
}

export class ToolInstanceOutputDto {
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Instance JSON',
    description: 'Opaque ToolInstance (meta + source) для ToolProvider',
  })
  instance!: string;

  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Status',
    description: 'ok | error',
  })
  status!: string;
}
