import {
  executorsFromClasses,
  type ExecutorClass,
  type ExecutorEntry,
} from '@kosolapus/plugin-ts-sdk';
import { RagExtractExecutor } from './extract/executor';
import { RagChunkExecutor } from './chunk/executor';
import { RagOntologyProposeEntitiesExecutor } from './ontology/propose-entities/executor';
import { RagOntologyProposeRelationsExecutor } from './ontology/propose-relations/executor';
import { RagOntologyMergeExecutor } from './ontology/merge/executor';
import { RagEntityExtractExecutor } from './entity/extract/executor';
import { RagEntityResolveExecutor } from './entity/resolve/executor';
import { RagRelationExtractExecutor } from './relation/extract/executor';
import { RagIndexWriteExecutor } from './corpus-index/write/executor';
import { RagSearchQueryExecutor } from './search/query/executor';
import { RagRerankExecutor } from './search/rerank/executor';
import { RagTopicExecutor } from './topic/executor';
import { RagOntologyLookupExecutor } from './ontology/lookup/executor';
import { RagAgentPlanExecutor } from './agent/plan/executor';
import { RagAgentTurnExecutor } from './agent/turn/executor';
import {
  RagGraphProviderExecutor,
  RagOntologyProviderExecutor,
  RagPrepareProviderExecutor,
  RagAggregateProviderExecutor,
  RagCalculateProviderExecutor,
  RagRerankProviderExecutor,
  RagSearchProviderExecutor,
  RagTopicProviderExecutor,
} from './agent/providers/executors';
import { RagToolRouterExecutor } from './agent/tools/router/executor';
import { RagJudgeExecutor } from './judge/executor';
import { RagGuardExecutor } from './guard/executor';
import { RagAnswerExecutor } from './answer/executor';
import { RagGraphQueryExecutor } from './graph/query/executor';
import { RagGraphPrepareExecutor } from './graph/prepare/executor';
import {
  RagAggregateExecutor,
  RagCalculateExecutor,
  RagClaimsExecutor,
  RagEvidenceHitsExecutor,
  RagEvidenceInventoryExecutor,
  RagEvidenceMergeExecutor,
  RagEvidenceTextExecutor,
  RagSafetyExecutor,
  RagSlotCriticExecutor,
  RagSlotProposeExecutor,
  RagSynthesizeExecutor,
} from './research/executors';

const EXECUTOR_CLASSES = [
  RagExtractExecutor,
  RagChunkExecutor,
  RagOntologyProposeEntitiesExecutor,
  RagOntologyProposeRelationsExecutor,
  RagOntologyMergeExecutor,
  RagEntityExtractExecutor,
  RagEntityResolveExecutor,
  RagRelationExtractExecutor,
  RagIndexWriteExecutor,
  RagSearchQueryExecutor,
  RagRerankExecutor,
  RagTopicExecutor,
  RagOntologyLookupExecutor,
  RagGraphQueryExecutor,
  RagGraphPrepareExecutor,
  RagAgentPlanExecutor,
  RagAgentTurnExecutor,
  RagSearchProviderExecutor,
  RagGraphProviderExecutor,
  RagOntologyProviderExecutor,
  RagPrepareProviderExecutor,
  RagTopicProviderExecutor,
  RagRerankProviderExecutor,
  RagAggregateProviderExecutor,
  RagCalculateProviderExecutor,
  RagToolRouterExecutor,
  RagJudgeExecutor,
  RagGuardExecutor,
  RagAnswerExecutor,
  RagEvidenceHitsExecutor,
  RagEvidenceInventoryExecutor,
  RagEvidenceTextExecutor,
  RagEvidenceMergeExecutor,
  RagAggregateExecutor,
  RagCalculateExecutor,
  RagSlotProposeExecutor,
  RagClaimsExecutor,
  RagSlotCriticExecutor,
  RagSynthesizeExecutor,
  RagSafetyExecutor,
] as const;

export function getRagExecutors(): ExecutorEntry[] {
  return executorsFromClasses(
    EXECUTOR_CLASSES as unknown as readonly ExecutorClass[],
  );
}
