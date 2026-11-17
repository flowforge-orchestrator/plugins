import type {
  OntologyEvolveDecision,
  OntologyEvolveLogEntry,
} from '../../contracts/knowledge';
import { shortId } from '../hash';

export type OntologyEvolveInput = {
  decision: OntologyEvolveDecision;
  evidenceId?: string;
  currentSchemaVersion: number;
  assertedAt?: string;
};

export type OntologyEvolveResult = {
  entry: OntologyEvolveLogEntry;
  schemaVersion: number;
};

export function evolveOntology(input: OntologyEvolveInput): OntologyEvolveResult {
  const schemaVersion = input.currentSchemaVersion + 1;
  const assertedAt = input.assertedAt?.trim() || new Date().toISOString();
  const entry: OntologyEvolveLogEntry = {
    entryId: shortId(`onto:${input.decision.op}:${schemaVersion}:${assertedAt}`),
    decision: input.decision,
    evidenceId: input.evidenceId,
    schemaVersion,
    assertedAt,
  };
  return { entry, schemaVersion };
}
