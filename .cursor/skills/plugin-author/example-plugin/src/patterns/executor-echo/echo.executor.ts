import { IsString, MinLength } from 'class-validator';
import {
  ExecContext,
  Executor,
  FieldDecorator,
  loadHelpFromFile,
} from '@kosolapus/plugin-ts-sdk';
import { publicationPullEndpointFromEnv } from '../../getUrlFromEnv';
import { echoMetrics } from './echo.logic';

class InputDto {
  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'string',
    label: 'Text',
    description: 'String to echo',
    isPrimary: true,
    canBePort: true,
    isPort: true,
  })
  text!: string;
}

class OutputDto {
  @FieldDecorator({ type: 'string', label: 'Text' })
  text!: string;

  @FieldDecorator({ type: 'number', label: 'Length' })
  length!: number;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.example.echo',
  name: 'Example: echo',
  description: 'Reference executor — returns text and length (plugin-author skill).',
  help: loadHelpFromFile(__dirname),
  pluginId: 'example',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class ExampleEchoExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    return echoMetrics(ctx.inputs.text);
  }
}
