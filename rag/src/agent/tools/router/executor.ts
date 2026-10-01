import { IsString } from 'class-validator';
import {
  ExecContext,
  Executor,
  FieldDecorator,
} from '@kosolapus/plugin-ts-sdk';
import help from './help.md';
import { publicationPullEndpointFromEnv } from '../../../getUrlFromEnv';
import { toJsonPort } from '../../../internal/json-port';
import { collectToolCards } from '../tool-card';

class OutputDto {
  @IsString()
  @FieldDecorator({ type: 'textarea', label: 'Tools' })
  tools!: string;
}

@Executor<Record<string, unknown>, OutputDto>({
  nodeType: 'plugin.rag.tool.router',
  name: 'RAG: роутер инструментов',
  description:
    'Собирает карточки провайдеров во вход tools хода агента.',
  help,
  pluginId: 'rag',
  inputs: null,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class RagToolRouterExecutor {
  execute(ctx: ExecContext<Record<string, unknown>>): OutputDto {
    return { tools: toJsonPort(collectToolCards(ctx.inputs)) };
  }
}
