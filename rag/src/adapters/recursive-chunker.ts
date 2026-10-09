import type { ChunkLevel, DocBlock, RagChunk } from '../contracts/types';
import type { Chunker, ChunkStrategy } from '../internal/interfaces';
import { contentHash } from './text-parser';

/** Rough token estimate: ~4 chars per token for Latin/Cyrillic mix. */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function bucket(tokens: number): string {
  if (tokens < 64) return '0-63';
  if (tokens < 128) return '64-127';
  if (tokens < 256) return '128-255';
  if (tokens < 512) return '256-511';
  return '512+';
}

function splitBySentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function pushUnit(
  chunks: RagChunk[],
  input: {
    chunkId: string;
    docId: string;
    text: string;
    headingPath: string[];
    parentId?: string;
    level: ChunkLevel;
  },
): void {
  const text = input.text.trim();
  if (!text && input.level === 'chunk') return;
  chunks.push({
    chunkId: input.chunkId,
    docId: input.docId,
    text: text || input.chunkId,
    contentHash: contentHash(text || input.chunkId, input.headingPath),
    headingPath: input.headingPath,
    parentId: input.parentId,
    level: input.level,
    tokenEstimate: estimateTokens(text || input.chunkId),
  });
}

/** Split text into leaves of about maxChars with overlap; force-cut over hardMax. */
export function splitToLeaves(
  text: string,
  maxChars: number,
  overlapChars: number,
  hardMaxChars: number,
): { pieces: string[]; forcedCuts: number } {
  const trimmed = text.trim();
  if (!trimmed) return { pieces: [], forcedCuts: 0 };
  if (trimmed.length <= maxChars) return { pieces: [trimmed], forcedCuts: 0 };

  const sentences = splitBySentences(trimmed);
  const pieces: string[] = [];
  let forcedCuts = 0;
  let current = '';

  const flush = () => {
    if (current) {
      pieces.push(current);
      current = '';
    }
  };

  const emitHard = (raw: string) => {
    forcedCuts += 1;
    let start = 0;
    while (start < raw.length) {
      const end = Math.min(raw.length, start + hardMaxChars);
      pieces.push(raw.slice(start, end));
      if (end >= raw.length) break;
      start = Math.max(end - overlapChars, start + 1);
    }
  };

  for (const sentence of sentences.length ? sentences : [trimmed]) {
    if (sentence.length > hardMaxChars) {
      flush();
      emitHard(sentence);
      continue;
    }
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    flush();
    if (sentence.length <= maxChars) {
      current = sentence;
    } else {
      emitHard(sentence);
    }
  }
  flush();
  return { pieces, forcedCuts };
}

/**
 * Hierarchical chunking: doc → section → paragraph → ~maxChars leaf.
 * Non-leaf units are graph nodes; only level=`chunk` is embedded.
 */
export function recursiveChunkBlocks(input: {
  blocks: DocBlock[];
  docId: string;
  maxTokens: number;
  overlapTokens: number;
  hardMaxTokens: number;
  /** Leaf target size in characters (default from maxTokens×4). */
  maxChars?: number;
  overlapChars?: number;
  hardMaxChars?: number;
}): {
  chunks: RagChunk[];
  lengthHistogram: Record<string, number>;
  emptyShare: number;
  forcedCutShare: number;
} {
  const { blocks, docId } = input;
  const maxChars = Math.max(
    32,
    input.maxChars ?? Math.max(32, input.maxTokens * 4),
  );
  const overlapChars = Math.max(
    0,
    input.overlapChars ?? Math.max(0, input.overlapTokens * 4),
  );
  const hardMaxChars = Math.max(
    maxChars,
    input.hardMaxChars ?? Math.max(maxChars, input.hardMaxTokens * 4),
  );

  const chunks: RagChunk[] = [];
  let forcedCuts = 0;
  let empty = 0;

  const title =
    blocks.find((b) => b.type === 'heading')?.text?.trim() ||
    blocks[0]?.text?.slice(0, 120) ||
    docId;
  const docIdNode = `${docId}:doc`;
  pushUnit(chunks, {
    chunkId: docIdNode,
    docId,
    text: title,
    headingPath: [],
    level: 'doc',
  });

  const sectionBlocks = new Map<string, DocBlock[]>();
  for (const block of blocks) {
    if (block.type === 'heading') continue;
    const key = block.headingPath.join(' > ') || '(root)';
    const list = sectionBlocks.get(key) ?? [];
    list.push(block);
    sectionBlocks.set(key, list);
  }

  if (sectionBlocks.size === 0) {
    return {
      chunks,
      lengthHistogram: {},
      emptyShare: 0,
      forcedCutShare: 0,
    };
  }

  let sectionIndex = 0;
  let paraIndex = 0;
  let leafIndex = 0;

  for (const [sectionKey, section] of sectionBlocks) {
    const headingPath =
      section[0]?.headingPath ??
      (sectionKey === '(root)' ? [] : sectionKey.split(' > '));
    const sectionId = `${docId}:sec${sectionIndex++}`;
    const sectionTitle =
      headingPath[headingPath.length - 1] || sectionKey || '(root)';
    pushUnit(chunks, {
      chunkId: sectionId,
      docId,
      text: sectionTitle,
      headingPath,
      parentId: docIdNode,
      level: 'section',
    });

    for (const block of section) {
      const body = block.text.trim();
      if (!body) {
        empty += 1;
        continue;
      }
      const paraId = `${docId}:p${paraIndex++}`;
      pushUnit(chunks, {
        chunkId: paraId,
        docId,
        text: body.length > 500 ? `${body.slice(0, 500)}…` : body,
        headingPath,
        parentId: sectionId,
        level: 'paragraph',
      });

      const { pieces, forcedCuts: cuts } = splitToLeaves(
        body,
        maxChars,
        overlapChars,
        hardMaxChars,
      );
      forcedCuts += cuts;
      for (const piece of pieces) {
        pushUnit(chunks, {
          chunkId: `${docId}:c${leafIndex++}`,
          docId,
          text: piece,
          headingPath,
          parentId: paraId,
          level: 'chunk',
        });
      }
    }
  }

  const leaves = chunks.filter((c) => c.level === 'chunk');
  const lengthHistogram: Record<string, number> = {};
  for (const c of leaves) {
    const b = bucket(c.tokenEstimate);
    lengthHistogram[b] = (lengthHistogram[b] ?? 0) + 1;
  }
  const denom = Math.max(1, leaves.length);
  return {
    chunks,
    lengthHistogram,
    emptyShare: empty / denom,
    forcedCutShare: forcedCuts / denom,
  };
}

export class RecursiveChunker implements Chunker {
  chunk(input: {
    blocks: DocBlock[];
    docId: string;
    strategy: ChunkStrategy;
    maxTokens: number;
    overlapTokens: number;
    hardMaxTokens?: number;
    maxChars?: number;
    overlapChars?: number;
    hardMaxChars?: number;
  }) {
    const hardMaxTokens = input.hardMaxTokens ?? input.maxTokens * 2;
    void input.strategy;
    return recursiveChunkBlocks({
      blocks: input.blocks,
      docId: input.docId,
      maxTokens: input.maxTokens,
      overlapTokens: input.overlapTokens,
      hardMaxTokens,
      maxChars: input.maxChars,
      overlapChars: input.overlapChars,
      hardMaxChars: input.hardMaxChars,
    });
  }
}
