import { IsString } from 'class-validator';
import { FieldDecorator } from '@kosolapus/plugin-ts-sdk';

/** Fixed outputs only — tool instance inputs are dynamic (`inputs: null`). */
export class ToolProviderOutputDto {
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'MCP attach',
    description: 'Opaque mcpAttach для агента',
  })
  mcpAttach!: string;

  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Tool names',
    description: 'JSON-массив имён tools',
  })
  toolNames!: string;

  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Session id',
  })
  sessionId!: string;

  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Status',
  })
  status!: string;
}

/** Optional static config keys (widget fields, not catalog ports). */
export const TOOL_PROVIDER_STATIC_KEYS = new Set([
  'apiBase',
  'mcpBridgePath',
  'serverId',
]);
