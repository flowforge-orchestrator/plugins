export type ProjectionKind = 'embeddings' | 'neighborhood' | 'all';

export type DeriveProjectInput = {
  affectedIds: string[];
  projection?: ProjectionKind;
};

export type DeriveProjectResult = {
  projection: ProjectionKind;
  requested: number;
  projected: number;
  skipped: number;
  /** Projection failure must not roll back S2 — reported here only. */
  ok: boolean;
  error?: string;
};

/**
 * Counts for an S3 projection rebuild. Adapters (Qdrant/Neo4j) sit behind interfaces.
 */
export function deriveProject(input: DeriveProjectInput): DeriveProjectResult {
  const ids = [...new Set(input.affectedIds.map((id) => id.trim()).filter(Boolean))];
  const projection = input.projection ?? 'all';
  return {
    projection,
    requested: ids.length,
    projected: ids.length,
    skipped: 0,
    ok: true,
  };
}
