/** Shared domain DTOs for RAG executor ports. */

export type DocBlockType =
  | 'heading'
  | 'paragraph'
  | 'table'
  | 'list'
  | 'code'
  | 'figure';

export type DocBlock = {
  id: string;
  type: DocBlockType;
  text: string;
  headingPath: string[];
  page?: number;
};

export type ChunkSpan = {
  start: number;
  end: number;
};

export type RagChunk = {
  chunkId: string;
  docId: string;
  text: string;
  contentHash: string;
  headingPath: string[];
  parentId?: string;
  span?: ChunkSpan;
  tokenEstimate: number;
};

export type EntityTypeDecl = {
  id: string;
  parent?: string | null;
  description?: string;
  identity?: string[];
};

export type RelationTypeDecl = {
  id: string;
  from: string[];
  to: string[];
  description?: string;
};

export type OntologySchema = {
  version: number;
  entityTypes: EntityTypeDecl[];
  relationTypes: RelationTypeDecl[];
};

export type SchemaDeltaOp =
  | { op: 'ADD'; kind: 'entity' | 'relation'; id: string; payload: EntityTypeDecl | RelationTypeDecl }
  | { op: 'ALIAS'; kind: 'entity' | 'relation'; fromId: string; toId: string }
  | { op: 'MERGE'; kind: 'entity' | 'relation'; fromIds: string[]; intoId: string }
  | { op: 'RETIRE'; kind: 'entity' | 'relation'; id: string };

export type SchemaDelta = {
  fromVersion: number;
  toVersion: number;
  operations: SchemaDeltaOp[];
};

export type EntityMention = {
  mentionId: string;
  surface: string;
  typeId: string;
  chunkId: string;
  docId: string;
  span?: ChunkSpan;
  identityValues?: Record<string, string>;
};

export type CanonicalEntity = {
  entityId: string;
  typeId: string;
  label: string;
  identityValues?: Record<string, string>;
  mentionIds: string[];
};

export type EntityRelation = {
  relationId: string;
  typeId: string;
  fromEntityId: string;
  toEntityId: string;
  chunkId: string;
  docId: string;
  evidence?: string;
};

export type SearchHit = {
  chunkId: string;
  docId: string;
  text: string;
  score: number;
  headingPath?: string[];
  source?: 'dense' | 'sparse' | 'graph' | 'hybrid' | 'rerank';
};

export type Citation = {
  chunkId: string;
  docId: string;
  headingPath?: string[];
  excerpt: string;
};

export type AgentAction =
  | 'search'
  | 'answer'
  | 'topic'
  | 'ontology'
  | 'graph'
  | 'prepare'
  | 'rerank'
  | 'ground'
  | 'guard';

export type AgentTurnResult = {
  action: AgentAction;
  query?: string;
  answer?: string;
  citations?: Citation[];
};

export function emptySchema(version = 0): OntologySchema {
  return { version, entityTypes: [], relationTypes: [] };
}
