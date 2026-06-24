import { IsString, MinLength } from 'class-validator';
import { FieldDecorator } from '@kosolapus/plugin-ts-sdk';

/** Reference: static fields + secret ref (not used by echo). */
export class ExampleConnectionDto {
  @FieldDecorator({
    label: 'Base URL',
    description: 'API base URL on the node',
    type: 'string',
    required: true,
    static: true,
  })
  @IsString()
  @MinLength(1)
  baseUrl!: string;

  @FieldDecorator({
    label: 'API token',
    description: 'Secret ref — never a TCP port',
    type: 'ref',
    required: true,
    static: true,
    secretKind: 'API_TOKEN',
  })
  @IsString()
  token!: string;
}
