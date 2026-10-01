import neo4j, { type Driver } from 'neo4j-driver';
import type {
  CanonicalEntity,
  EntityRelation,
  OntologySchema,
  RagChunk,
  SearchHit,
} from '../contracts/types';
import type { KnowledgeGraph } from '../internal/interfaces';
import { loadRagRuntimeConfig } from '../internal/env-config';
import {
  formatGraphFocus,
  GRAPH_FOCUS_CYPHER,
  type GraphLink,
  type GraphNodeHit,
} from '../graph/query/query.logic';
import { GRAPH_INVENTORY_CYPHER } from '../graph/prepare/prepare.logic';

/** The whole query, lower-cased. No splitting, no stop words. */
function needleOf(query: string): string {
  return query.trim().toLowerCase();
}

function labelPrefix(collectionId: string): string {
  return `Rag_${collectionId.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40)}`;
}

export class Neo4jKnowledgeGraph implements KnowledgeGraph {
  private driver: Driver | null = null;

  private getDriver(): Driver {
    if (this.driver) return this.driver;
    const cfg = loadRagRuntimeConfig();
    this.driver = neo4j.driver(
      cfg.neo4jUri,
      neo4j.auth.basic(cfg.neo4jUser, cfg.neo4jPassword),
    );
    return this.driver;
  }

  async upsertGraph(input: {
    collectionId: string;
    docId: string;
    schema: OntologySchema;
    entities: CanonicalEntity[];
    relations: EntityRelation[];
    chunks: RagChunk[];
  }): Promise<{ entitiesWritten: number; relationsWritten: number }> {
    const driver = this.getDriver();
    const prefix = labelPrefix(input.collectionId);
    const session = driver.session();
    try {
      await session.executeWrite(async (tx) => {
        await tx.run(
          `
          MERGE (c:RagCollection {id: $collectionId})
          SET c.schemaVersion = $schemaVersion, c.updatedAt = datetime()
          `,
          {
            collectionId: input.collectionId,
            schemaVersion: input.schema.version,
          },
        );

        await tx.run(
          `
          MATCH (e:RagEntity {collectionId: $collectionId})-[:MENTIONED_IN]->(d:RagDoc {id: $docId})
          DETACH DELETE e
          `,
          { collectionId: input.collectionId, docId: input.docId },
        ).catch(() => undefined);

        await tx.run(
          `
          MERGE (d:RagDoc {id: $docId, collectionId: $collectionId})
          SET d.updatedAt = datetime()
          `,
          { docId: input.docId, collectionId: input.collectionId },
        );

        for (const entity of input.entities) {
          await tx.run(
            `
            MERGE (e:RagEntity {entityId: $entityId, collectionId: $collectionId})
            SET e.typeId = $typeId,
                e.label = $label,
                e.identityValues = $identityValues,
                e.prefix = $prefix
            WITH e
            MATCH (d:RagDoc {id: $docId, collectionId: $collectionId})
            MERGE (e)-[:MENTIONED_IN]->(d)
            `,
            {
              entityId: entity.entityId,
              collectionId: input.collectionId,
              typeId: entity.typeId,
              label: entity.label,
              identityValues: JSON.stringify(entity.identityValues ?? {}),
              prefix,
              docId: input.docId,
            },
          );
        }

        for (const rel of input.relations) {
          await tx.run(
            `
            MATCH (a:RagEntity {entityId: $fromId, collectionId: $collectionId})
            MATCH (b:RagEntity {entityId: $toId, collectionId: $collectionId})
            MERGE (a)-[r:RAG_REL {relationId: $relationId}]->(b)
            SET r.typeId = $typeId,
                r.chunkId = $chunkId,
                r.docId = $docId,
                r.evidence = $evidence
            `,
            {
              fromId: rel.fromEntityId,
              toId: rel.toEntityId,
              collectionId: input.collectionId,
              relationId: rel.relationId,
              typeId: rel.typeId,
              chunkId: rel.chunkId,
              docId: rel.docId,
              evidence: rel.evidence ?? '',
            },
          );
        }

        for (const chunk of input.chunks) {
          await tx.run(
            `
            MERGE (ch:RagChunk {chunkId: $chunkId, collectionId: $collectionId})
            SET ch.docId = $docId,
                ch.text = $text,
                ch.headingPath = $headingPath
            WITH ch
            MATCH (d:RagDoc {id: $docId, collectionId: $collectionId})
            MERGE (ch)-[:FROM_DOC]->(d)
            `,
            {
              chunkId: chunk.chunkId,
              collectionId: input.collectionId,
              docId: input.docId,
              text: chunk.text.slice(0, 2000),
              headingPath: chunk.headingPath.join(' > '),
            },
          );
        }
      });
      return {
        entitiesWritten: input.entities.length,
        relationsWritten: input.relations.length,
      };
    } finally {
      await session.close();
    }
  }

  async expand(input: {
    collectionId: string;
    query: string;
    depth: number;
  }): Promise<SearchHit[]> {
    const driver = this.getDriver();
    const session = driver.session();
    const depth = Math.min(3, Math.max(1, input.depth));
    const needle = needleOf(input.query);
    if (!needle) {
      await session.close();
      return [];
    }
    try {
      const result = await session.executeRead(async (tx) => {
        return tx.run(
          `
          MATCH (e:RagEntity {collectionId: $collectionId})
          WHERE toLower(coalesce(e.label, '')) CONTAINS $needle
          OPTIONAL MATCH (e)-[:RAG_REL*1..${depth}]-(other:RagEntity)
          OPTIONAL MATCH (other)-[:MENTIONED_IN]->(d:RagDoc)
          OPTIONAL MATCH (ch:RagChunk {collectionId: $collectionId})-[:FROM_DOC]->(d)
          WHERE ch.chunkId IS NOT NULL
          RETURN DISTINCT ch.chunkId AS chunkId,
                 ch.docId AS docId,
                 ch.text AS text,
                 ch.headingPath AS headingPath
          LIMIT 20
          `,
          { collectionId: input.collectionId, needle },
        );
      });
      return result.records
        .filter((r) => r.get('chunkId'))
        .map((r) => ({
          chunkId: String(r.get('chunkId')),
          docId: String(r.get('docId') ?? ''),
          text: String(r.get('text') ?? ''),
          score: 1,
          headingPath: String(r.get('headingPath') ?? '')
            .split(' > ')
            .filter(Boolean),
          source: 'graph' as const,
        }));
    } catch {
      return [];
    } finally {
      await session.close();
    }
  }

  async focus(input: {
    collectionId: string;
    query: string;
  }): Promise<{ nodes: GraphNodeHit[]; context: string }> {
    const needle = needleOf(input.query);
    if (!needle) {
      return { nodes: [], context: '' };
    }
    const driver = this.getDriver();
    const session = driver.session();
    try {
      const result = await session.executeRead(async (tx) => {
        return tx.run(GRAPH_FOCUS_CYPHER, {
          collectionId: input.collectionId,
          needle,
        });
      });
      const nodes = result.records
        .map((record) => readGraphNode(record))
        .filter((node) => node.entityId || node.label);
      return { nodes, context: formatGraphFocus(nodes) };
    } catch {
      return { nodes: [], context: '(нет узлов по запросу)' };
    } finally {
      await session.close();
    }
  }

  async listDocuments(input: {
    collectionId: string;
  }): Promise<{ docId: string; title: string }[]> {
    const driver = this.getDriver();
    const session = driver.session();
    try {
      const result = await session.executeRead(async (tx) => {
        return tx.run(GRAPH_INVENTORY_CYPHER, {
          collectionId: input.collectionId,
        });
      });
      return result.records.map((record) => ({
        docId: asText(record.get('docId')),
        title: asText(record.get('title')),
      }));
    } catch {
      return [];
    } finally {
      await session.close();
    }
  }
}

function asText(value: unknown): string {
  if (value == null) return '';
  return String(value);
}

function asTextList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asText(item).trim()).filter(Boolean);
}

function readLinks(value: unknown): GraphLink[] {
  if (!Array.isArray(value)) return [];
  const links: GraphLink[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const typeId = asText(row.typeId).trim();
    const otherLabel = asText(row.otherLabel).trim();
    if (!typeId && !otherLabel) continue;
    links.push({
      typeId,
      otherLabel,
      otherType: asText(row.otherType).trim(),
      evidence: asText(row.evidence).trim().slice(0, 240),
      docId: asText(row.docId).trim(),
    });
  }
  return links;
}

function readGraphNode(record: {
  get: (key: string) => unknown;
}): GraphNodeHit {
  return {
    entityId: asText(record.get('entityId')),
    label: asText(record.get('label')),
    typeId: asText(record.get('typeId')),
    docIds: asTextList(record.get('docIds')),
    excerpts: asTextList(record.get('excerpts')).map((text) => text.slice(0, 400)),
    links: readLinks(record.get('links')),
  };
}
