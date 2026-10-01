import type { Inventory, InventoryDoc } from '../../agent/turn/agent.turn.logic';

export type { Inventory, InventoryDoc };

/**
 * Every document of the collection with the heading stored on its first chunk.
 * No text is parsed here: title is a stored field or empty.
 */
export const GRAPH_INVENTORY_CYPHER = `
MATCH (d:RagDoc {collectionId: $collectionId})
OPTIONAL MATCH (ch:RagChunk {collectionId: $collectionId})-[:FROM_DOC]->(d)
WITH d, ch
ORDER BY d.id, ch.chunkId
WITH d.id AS docId,
     [h IN collect(coalesce(ch.headingPath, '')) WHERE h <> ''][0] AS title
RETURN docId, coalesce(title, '') AS title
ORDER BY docId
`.trim();

export function buildInventory(
  rows: { docId: string; title?: string }[],
): Inventory {
  const seen = new Set<string>();
  const documents: InventoryDoc[] = [];
  for (const row of rows) {
    const docId = String(row.docId ?? '').trim();
    if (!docId || seen.has(docId)) continue;
    seen.add(docId);
    documents.push({ docId, title: String(row.title ?? '').trim().slice(0, 300) });
  }
  return { docCount: documents.length, documents };
}

export function formatInventory(inventory: Inventory): string {
  const lines = inventory.documents.map((doc) =>
    doc.title ? `${doc.docId} — ${doc.title}` : doc.docId,
  );
  return [`documents: ${inventory.docCount}`, ...lines].join('\n');
}
