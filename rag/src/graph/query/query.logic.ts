export type GraphLink = {
  typeId: string;
  otherLabel: string;
  otherType: string;
  evidence: string;
  docId: string;
};

export type GraphNodeHit = {
  entityId: string;
  label: string;
  typeId: string;
  docIds: string[];
  excerpts: string[];
  links: GraphLink[];
};

/**
 * Parameterized read. `$needle` is the lower-cased name the policy asked for,
 * matched as a whole against label, type, and relation type.
 */
export const GRAPH_FOCUS_CYPHER = `
MATCH (e:RagEntity {collectionId: $collectionId})
OPTIONAL MATCH (e)-[rel:RAG_REL]-(:RagEntity {collectionId: $collectionId})
WITH e, collect(DISTINCT rel.typeId) AS relTypes
WHERE toLower(coalesce(e.label, '')) CONTAINS $needle
  OR toLower(coalesce(e.typeId, '')) CONTAINS $needle
  OR any(relType IN relTypes WHERE toLower(coalesce(relType, '')) CONTAINS $needle)
WITH e LIMIT 12
OPTIONAL MATCH (e)-[r:RAG_REL]-(other:RagEntity {collectionId: $collectionId})
OPTIONAL MATCH (e)-[:MENTIONED_IN]->(d:RagDoc {collectionId: $collectionId})
OPTIONAL MATCH (ch:RagChunk {collectionId: $collectionId})-[:FROM_DOC]->(d)
WHERE toLower(coalesce(ch.text, '')) CONTAINS $needle
WITH e,
     [id IN collect(DISTINCT CASE WHEN ch IS NOT NULL THEN d.id END) WHERE id IS NOT NULL][0..4] AS docIds,
     [text IN collect(DISTINCT substring(coalesce(ch.text, ''), 0, 400)) WHERE text <> ''][0..2] AS excerpts,
     [link IN collect(DISTINCT {
         typeId: r.typeId,
         otherLabel: other.label,
         otherType: other.typeId,
         evidence: r.evidence,
         docId: r.docId
       }) WHERE link.typeId IS NOT NULL OR link.otherLabel IS NOT NULL][0..8] AS links
RETURN e.entityId AS entityId,
       e.label AS label,
       e.typeId AS typeId,
       docIds,
       excerpts,
       links
`.trim();

export function formatGraphFocus(nodes: GraphNodeHit[]): string {
  if (nodes.length === 0) return '(нет узлов по запросу)';
  const blocks = nodes.map((node) => {
    const head = `[${node.typeId || 'node'}] ${node.label}`.trim();
    const docs = node.docIds.length
      ? `docs: ${node.docIds.join(', ')}`
      : 'docs: —';
    const links = node.links.map((link) => {
      const via = link.typeId || 'link';
      const other = link.otherLabel
        ? ` → [${link.otherType || 'node'}] ${link.otherLabel}`
        : '';
      const evidence = link.evidence ? ` «${link.evidence}»` : '';
      const doc = link.docId ? ` (${link.docId})` : '';
      return `- ${via}${other}${doc}${evidence}`;
    });
    const excerpts = node.excerpts
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text) => `«${text}»`);
    return [head, docs, ...links, ...excerpts].join('\n');
  });
  return blocks.join('\n\n').slice(0, 8000);
}
