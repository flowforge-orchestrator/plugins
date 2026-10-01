import { Allow, IsString, MinLength } from 'class-validator';
import {
  ExecContext,
  Executor,
  FieldDecorator,
} from '@kosolapus/plugin-ts-sdk';
import help from './help.md';
import { publicationPullEndpointFromEnv } from '../../getUrlFromEnv';
import { getRagServices } from '../../adapters/services';
import type {
  EntityTypeDecl,
  RagChunk,
  RelationTypeDecl,
} from '../../contracts/types';
import { fromJsonPort, toJsonPort } from '../../internal/json-port';

class InputDto {
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Чанки',
    canBePort: true,
    isPort: true,
    required: true,
  })
  chunks!: RagChunk[];

  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Кандидаты типов',
    canBePort: true,
    isPort: true,
    isPrimary: true,
    required: true,
  })
  candidateTypes!: EntityTypeDecl[];

  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'string',
    label: 'ID коллекции',
    canBePort: true,
    isPort: true,
    required: true,
  })
  collectionId!: string;

  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'ref',
    label: 'API ключ LLM',
    static: true,
    secretKind: 'OPENAI_API_KEY',
    required: true,
  })
  apiKey!: string;
}

class OutputDto {
  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Кандидаты связей' })
  candidateRelations!: RelationTypeDecl[];

  @FieldDecorator({ type: 'number', label: 'Отброшено domain/range' })
  rejectedDomainRange!: number;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.rag.ontology.propose.relations',
  name: 'RAG: предложить типы связей',
  description: 'LLM предлагает типы связей относительно принятых типов сущностей.',
  help,
  pluginId: 'rag',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class RagOntologyProposeRelationsExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const services = getRagServices();
    const types = fromJsonPort<EntityTypeDecl[]>(ctx.inputs.candidateTypes, []);
    const typeIds = new Set(types.map((t) => t.id));
    const chunks = fromJsonPort<RagChunk[]>(ctx.inputs.chunks, []);
    const sample = chunks
      .slice(0, 12)
      .map((c) => ({ headingPath: c.headingPath, text: c.text.slice(0, 500) }));
    const payload = await services.llm.completeJson<{
      relationTypes?: RelationTypeDecl[];
    }>({
      apiKey: ctx.inputs.apiKey,
      systemPrompt:
        'Propose relation types. Return JSON {"relationTypes":[{"id","from":[],"to":[],"description"}]}. from/to must use provided entity type ids only.',
      userPrompt: JSON.stringify(
        { entityTypes: types, sample, collectionId: ctx.inputs.collectionId },
        null,
        2,
      ),
    });
    const raw = payload.relationTypes ?? [];
    const candidateRelations: RelationTypeDecl[] = [];
    let rejectedDomainRange = 0;
    for (const rel of raw) {
      const ok =
        (rel.from ?? []).every((id) => typeIds.has(id)) &&
        (rel.to ?? []).every((id) => typeIds.has(id));
      if (!ok) {
        rejectedDomainRange += 1;
        continue;
      }
      candidateRelations.push(rel);
    }
    return { candidateRelations: toJsonPort(candidateRelations) as never, rejectedDomainRange };
  }
}
