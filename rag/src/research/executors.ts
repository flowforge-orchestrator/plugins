import { Allow, IsOptional, IsString, MinLength } from 'class-validator';
import {
  ExecContext,
  Executor,
  FieldDecorator,
} from '@kosolapus/plugin-ts-sdk';
import { publicationPullEndpointFromEnv } from '../getUrlFromEnv';
import { fromJsonPort, toJsonPort } from '../internal/json-port';
import { normalizeObservations } from '../agent/turn/agent.turn.logic';
import {
  isEnabledFlag,
  mergeObservations,
  shouldRunForAction,
} from '../internal/observations-merge';
import { getRagServices } from '../adapters/services';
import type { SearchHit } from '../contracts/types';
import {
  evidenceFromHits,
  evidenceFromInventory,
  evidenceFromText,
} from './adapters';
import { aggregateEvidence } from './aggregate.logic';
import { calculateEvidence } from './calculate.logic';
import { claimsFromProposals } from './claims.logic';
import {
  normalizeEvidenceList,
  unionEvidence,
  type Evidence,
} from './model';
import { safetyCheck } from './safety.logic';
import {
  applyVerdicts,
  CRITIC_SYSTEM_PROMPT,
  criticUserPrompt,
  mergeProposals,
  normalizeVerdicts,
  openSlots,
  pendingReview,
  PROPOSE_SYSTEM_PROMPT,
  proposeUserPrompt,
  quotableEvidence,
} from './slot.logic';

const transport = {
  type: 'tcp' as const,
  params: publicationPullEndpointFromEnv(),
};

class HitsIn {
  @IsOptional()
  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Hits', canBePort: true, isPort: true })
  hits?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({ type: 'string', label: 'Source', static: true, default: 'collection' })
  source?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Поле',
    description: 'Поле контракта, для которого выполнен этот запрос',
    canBePort: true,
    isPort: true,
  })
  field?: string;
}

class EvidenceOut {
  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Evidence' })
  evidence!: string;
}

@Executor({
  nodeType: 'plugin.rag.evidence.hits',
  name: 'RAG: evidence из поиска',
  description: 'Превращает хиты поиска в observation evidence. Домен коллекции здесь заканчивается.',
  pluginId: 'rag',
  inputs: HitsIn,
  outputs: EvidenceOut,
  transport,
})
export class RagEvidenceHitsExecutor {
  execute(ctx: ExecContext<HitsIn>): EvidenceOut {
    const hits = fromJsonPort<SearchHit[]>(ctx.inputs.hits, []);
    return {
      evidence: toJsonPort(
        evidenceFromHits({
          hits,
          source: ctx.inputs.source || 'collection',
          field: ctx.inputs.field,
        }),
      ),
    };
  }
}

class InventoryIn {
  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Inventory',
    canBePort: true,
    isPort: true,
  })
  inventory?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({ type: 'string', label: 'Source', static: true, default: 'collection' })
  source?: string;
}

@Executor({
  nodeType: 'plugin.rag.evidence.inventory',
  name: 'RAG: evidence из схемы',
  description: 'Каждый документ инвентаря — observation evidence. Текст документа не читается.',
  pluginId: 'rag',
  inputs: InventoryIn,
  outputs: EvidenceOut,
  transport,
})
export class RagEvidenceInventoryExecutor {
  execute(ctx: ExecContext<InventoryIn>): EvidenceOut {
    const inventory = fromJsonPort(ctx.inputs.inventory, undefined);
    return {
      evidence: toJsonPort(
        evidenceFromInventory({
          inventory: inventory as { docCount: number; documents: { docId: string; title: string }[] } | undefined,
          source: ctx.inputs.source || 'collection',
        }),
      ),
    };
  }
}

class TextIn {
  @IsOptional()
  @IsString()
  @FieldDecorator({ type: 'textarea', label: 'Content', canBePort: true, isPort: true })
  content?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({ type: 'string', label: 'Id', canBePort: true, isPort: true })
  id?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({ type: 'string', label: 'Source', static: true, default: 'note' })
  source?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({ type: 'string', label: 'Location', canBePort: true, isPort: true })
  location?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Method',
    static: true,
    default: 'note',
  })
  extractionMethod?: string;
}

@Executor({
  nodeType: 'plugin.rag.evidence.text',
  name: 'RAG: evidence из текста',
  description: 'Один текст инструмента становится одной observation evidence.',
  pluginId: 'rag',
  inputs: TextIn,
  outputs: EvidenceOut,
  transport,
})
export class RagEvidenceTextExecutor {
  execute(ctx: ExecContext<TextIn>): EvidenceOut {
    return {
      evidence: toJsonPort(
        evidenceFromText({
          id: ctx.inputs.id || 'note',
          source: ctx.inputs.source || 'note',
          location: ctx.inputs.location || '',
          content: ctx.inputs.content || '',
          extractionMethod: ctx.inputs.extractionMethod || 'note',
        }),
      ),
    };
  }
}

class MergeIn {
  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Observations',
    canBePort: true,
    isPort: true,
  })
  observations?: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'boolean',
    label: 'Enabled',
    description: 'Ветка switch. Пока значение не записано, узел не стартует.',
    canBePort: true,
    isPort: true,
  })
  enabled?: boolean | string;

  @IsOptional()
  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'a', canBePort: true, isPort: true })
  a?: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'b', canBePort: true, isPort: true })
  b?: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'c', canBePort: true, isPort: true })
  c?: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'd', canBePort: true, isPort: true })
  d?: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'e', canBePort: true, isPort: true })
  e?: string;
}

class MergeOut {
  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Evidence' })
  evidence!: string;

  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Observations' })
  observations!: string;
}

@Executor({
  nodeType: 'plugin.rag.evidence.merge',
  name: 'RAG: объединить evidence',
  description: 'Складывает evidence адаптеров в одно хранилище. Одинаковый id не дублируется.',
  pluginId: 'rag',
  inputs: MergeIn,
  outputs: MergeOut,
  transport,
})
export class RagEvidenceMergeExecutor {
  execute(ctx: ExecContext<MergeIn>): MergeOut {
    const base = normalizeObservations(ctx.inputs.observations);
    if (!isEnabledFlag(ctx.inputs.enabled)) {
      const { observationsJson } = mergeObservations(base, {});
      return {
        evidence: toJsonPort(base.evidence ?? []),
        observations: observationsJson,
      };
    }
    const lists = [ctx.inputs.a, ctx.inputs.b, ctx.inputs.c, ctx.inputs.d, ctx.inputs.e]
      .map((raw) => normalizeEvidenceList(fromJsonPort(raw, [])));
    const evidence = unionEvidence([base.evidence ?? [], ...lists]);
    const { observationsJson } = mergeObservations(base, { evidence });
    return { evidence: toJsonPort(evidence), observations: observationsJson };
  }
}

class OpIn {
  @IsOptional()
  @Allow()
  @FieldDecorator({ type: 'string', label: 'Action', canBePort: true, isPort: true })
  action?: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Evidence',
    canBePort: true,
    isPort: true,
  })
  evidence?: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Args', canBePort: true, isPort: true })
  args?: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Observations',
    canBePort: true,
    isPort: true,
  })
  observations?: string;
}

function evidenceInput(ctx: ExecContext<OpIn>): Evidence[] {
  const direct = normalizeEvidenceList(fromJsonPort(ctx.inputs.evidence, []));
  if (direct.length) return direct;
  return normalizeObservations(ctx.inputs.observations).evidence ?? [];
}

function argsOf(raw: unknown): Record<string, string> {
  const value = fromJsonPort<Record<string, string>>(raw, {});
  return value && typeof value === 'object' ? value : {};
}

@Executor({
  nodeType: 'plugin.rag.aggregate',
  name: 'RAG: агрегировать',
  description: 'count, sum, min, max по числовому value evidence. Считает код.',
  pluginId: 'rag',
  inputs: OpIn,
  outputs: EvidenceOut,
  transport,
})
export class RagAggregateExecutor {
  execute(ctx: ExecContext<OpIn>): EvidenceOut {
    if (!shouldRunForAction(ctx.inputs.action, 'aggregate')) {
      return { evidence: toJsonPort([]) };
    }
    const args = argsOf(ctx.inputs.args);
    const result = aggregateEvidence({
      evidence: evidenceInput(ctx),
      op: args.op || 'count',
    });
    return { evidence: toJsonPort(result.evidence) };
  }
}

@Executor({
  nodeType: 'plugin.rag.calculate',
  name: 'RAG: вычислить',
  description: 'add, sub, mul, div двух evidence с числовым value. Считает код.',
  pluginId: 'rag',
  inputs: OpIn,
  outputs: EvidenceOut,
  transport,
})
export class RagCalculateExecutor {
  execute(ctx: ExecContext<OpIn>): EvidenceOut {
    if (!shouldRunForAction(ctx.inputs.action, 'calculate')) {
      return { evidence: toJsonPort([]) };
    }
    const args = argsOf(ctx.inputs.args);
    const result = calculateEvidence({
      evidence: evidenceInput(ctx),
      op: args.op || '',
      leftId: args.leftId || '',
      rightId: args.rightId || '',
    });
    return { evidence: toJsonPort(result.evidence) };
  }
}

class SlotModelIn {
  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'textarea',
    label: 'Вопрос',
    canBePort: true,
    isPort: true,
    isPrimary: true,
    required: true,
  })
  message!: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Observations',
    canBePort: true,
    isPort: true,
  })
  observations?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({ type: 'ref', label: 'API ключ LLM', static: true, secretKind: 'OPENAI_API_KEY' })
  apiKey?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({ type: 'string', label: 'LLM model', static: true })
  llmModel?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({ type: 'string', label: 'LLM base URL', static: true })
  llmBaseUrl?: string;
}

class ObservationsOut {
  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Observations' })
  observations!: string;
}

@Executor({
  nodeType: 'plugin.rag.slot.propose',
  name: 'RAG: значения полей',
  description:
    'Для каждого открытого поля модель копирует один фрагмент из одной записи evidence или оставляет поле пустым. Поле не сдаёт, цикл не закрывает.',
  pluginId: 'rag',
  inputs: SlotModelIn,
  outputs: ObservationsOut,
  transport,
})
export class RagSlotProposeExecutor {
  async execute(ctx: ExecContext<SlotModelIn>): Promise<ObservationsOut> {
    const obs = normalizeObservations(ctx.inputs.observations);
    const fields = openSlots({
      required: obs.task?.requiredInformation ?? [],
      claims: obs.researchClaims ?? [],
      unresolved: obs.task?.unresolvedQuestions ?? [],
    });
    const records = quotableEvidence(obs.evidence ?? []);
    if (fields.length === 0 || records.length === 0) {
      return { observations: mergeObservations(obs, {}, 'propose:skip').observationsJson };
    }
    const services = getRagServices();
    let incoming: unknown = [];
    try {
      const payload = await services.llm.completeJson<{ proposals?: unknown }>({
        apiKey: ctx.inputs.apiKey ?? '',
        model: ctx.inputs.llmModel,
        baseUrl: ctx.inputs.llmBaseUrl,
        runId: ctx.runId,
        systemPrompt: PROPOSE_SYSTEM_PROMPT,
        userPrompt: proposeUserPrompt({
          question: ctx.inputs.message,
          fields,
          evidence: records,
        }),
      });
      incoming = payload?.proposals ?? [];
    } catch {
      incoming = [];
    }
    const proposals = mergeProposals({
      existing: obs.proposals ?? [],
      incoming,
      openFields: fields,
    });
    return { observations: mergeObservations(obs, { proposals }, 'propose').observationsJson };
  }
}

class ClaimsIn {
  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Observations',
    canBePort: true,
    isPort: true,
    isPrimary: true,
  })
  observations?: string;
}

class ClaimsOut {
  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Claims' })
  claims!: string;

  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Observations' })
  observations!: string;
}

@Executor({
  nodeType: 'plugin.rag.claims',
  name: 'RAG: claims из предложений',
  description:
    'Claim строится из предложения, чей фрагмент лежит внутри названной записи evidence. Хиты поиска и схема сами по себе claim не становятся.',
  pluginId: 'rag',
  inputs: ClaimsIn,
  outputs: ClaimsOut,
  transport,
})
export class RagClaimsExecutor {
  execute(ctx: ExecContext<ClaimsIn>): ClaimsOut {
    const obs = normalizeObservations(ctx.inputs.observations);
    const claims = claimsFromProposals({
      evidence: obs.evidence ?? [],
      proposals: obs.proposals ?? [],
    });
    const { observationsJson } = mergeObservations(obs, { researchClaims: claims }, 'claims');
    return { claims: toJsonPort(claims), observations: observationsJson };
  }
}

@Executor({
  nodeType: 'plugin.rag.slot.critic',
  name: 'RAG: критик полей',
  description:
    'Модель решает, называет ли фрагмент значение своего поля. Отказ снимает claim и оставляет поле открытым. Продолжение цикла не решает.',
  pluginId: 'rag',
  inputs: SlotModelIn,
  outputs: ClaimsOut,
  transport,
})
export class RagSlotCriticExecutor {
  async execute(ctx: ExecContext<SlotModelIn>): Promise<ClaimsOut> {
    const obs = normalizeObservations(ctx.inputs.observations);
    const claims = obs.researchClaims ?? [];
    const proposals = obs.proposals ?? [];
    const reviewed = pendingReview({ proposals, claims });
    if (reviewed.length === 0) {
      const { observationsJson } = mergeObservations(obs, {}, 'critic:skip');
      return { claims: toJsonPort(claims), observations: observationsJson };
    }
    const services = getRagServices();
    try {
      const payload = await services.llm.completeJson<{ verdicts?: unknown }>({
        apiKey: ctx.inputs.apiKey ?? '',
        model: ctx.inputs.llmModel,
        baseUrl: ctx.inputs.llmBaseUrl,
        runId: ctx.runId,
        systemPrompt: CRITIC_SYSTEM_PROMPT,
        userPrompt: criticUserPrompt({
          question: ctx.inputs.message,
          proposals: reviewed,
          evidence: obs.evidence ?? [],
        }),
      });
      const applied = applyVerdicts({
        proposals,
        claims,
        verdicts: normalizeVerdicts(payload?.verdicts),
        reviewed,
      });
      const { observationsJson } = mergeObservations(
        obs,
        { proposals: applied.proposals, researchClaims: applied.claims },
        'critic',
      );
      return { claims: toJsonPort(applied.claims), observations: observationsJson };
    } catch {
      const { observationsJson } = mergeObservations(obs, {}, 'critic:unavailable');
      return { claims: toJsonPort(claims), observations: observationsJson };
    }
  }
}

class SynthIn {
  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'textarea',
    label: 'Вопрос',
    canBePort: true,
    isPort: true,
    isPrimary: true,
    required: true,
  })
  message!: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Observations',
    canBePort: true,
    isPort: true,
  })
  observations?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({ type: 'ref', label: 'API ключ LLM', static: true, secretKind: 'OPENAI_API_KEY' })
  apiKey?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({ type: 'string', label: 'LLM model', static: true })
  llmModel?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({ type: 'string', label: 'LLM base URL', static: true })
  llmBaseUrl?: string;
}

class AnswerOut {
  @Allow()
  @IsString()
  @FieldDecorator({ type: 'textarea', label: 'Ответ' })
  answer!: string;
}

@Executor({
  nodeType: 'plugin.rag.synthesize',
  name: 'RAG: синтез ответа',
  description:
    'Пишет ответ только из поддержанных claims, гипотез и ограничений. Исходный корпус в промпт не входит.',
  pluginId: 'rag',
  inputs: SynthIn,
  outputs: AnswerOut,
  transport,
})
export class RagSynthesizeExecutor {
  async execute(ctx: ExecContext<SynthIn>): Promise<AnswerOut> {
    const obs = normalizeObservations(ctx.inputs.observations);
    const direct = obs.task?.mode === 'direct';
    const supported = (obs.researchClaims ?? []).filter((claim) => claim.status === 'supported');
    const services = getRagServices();
    try {
      const payload = await services.llm.completeJson<{ answer?: string }>({
        apiKey: ctx.inputs.apiKey ?? '',
        model: ctx.inputs.llmModel,
        baseUrl: ctx.inputs.llmBaseUrl,
        runId: ctx.runId,
        systemPrompt: direct
          ? [
              'The message is not about the documents.',
              'Answer it briefly.',
              'Return JSON: {"answer":string}.',
              'Do not cite documents or add corpus facts.',
            ].join('\n')
          : [
              'Write the user-facing answer from the supplied records only.',
              'Return JSON: {"answer":string}.',
              'A supported claim may be stated as a fact and must keep its evidence id.',
              'A hypothesis must be labelled as a hypothesis and must not be stated as a cause.',
              'Limitations are stated as unknown. Do not add facts that are not in the records.',
            ].join('\n'),
        userPrompt: JSON.stringify(
          direct
            ? { question: ctx.inputs.message }
            : {
                question: ctx.inputs.message,
                supportedClaims: supported.map((claim) => ({
                  text: claim.text,
                  evidence: claim.evidence,
                  kind: claim.kind,
                })),
                hypotheses: obs.hypotheses ?? [],
                limitations: obs.limitations ?? [],
              },
          null,
          2,
        ),
      });
      return { answer: String(payload?.answer ?? '').trim() };
    } catch {
      return {
        answer: (obs.limitations ?? []).join('\n') || 'insufficient evidence',
      };
    }
  }
}

class SafetyIn {
  @IsOptional()
  @IsString()
  @FieldDecorator({ type: 'textarea', label: 'Ответ', canBePort: true, isPort: true, isPrimary: true })
  answer?: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Observations',
    canBePort: true,
    isPort: true,
  })
  observations?: string;
}

@Executor({
  nodeType: 'plugin.rag.safety',
  name: 'RAG: проверка перед выдачей',
  description:
    'Пропускает ответ, если каждый supported claim ссылается на evidence и ни одна гипотеза не помечена фактом.',
  pluginId: 'rag',
  inputs: SafetyIn,
  outputs: AnswerOut,
  transport,
})
export class RagSafetyExecutor {
  execute(ctx: ExecContext<SafetyIn>): AnswerOut {
    const obs = normalizeObservations(ctx.inputs.observations);
    const checked = safetyCheck({
      answer: ctx.inputs.answer ?? '',
      claims: obs.researchClaims ?? [],
      hypotheses: obs.hypotheses ?? [],
      limitations: obs.limitations ?? [],
    });
    return { answer: checked.answer };
  }
}

export type { Evidence };
