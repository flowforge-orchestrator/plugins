import type { DocBlock, RagChunk } from '../contracts/types';
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

export function recursiveChunkBlocks(input: {
  blocks: DocBlock[];
  docId: string;
  maxTokens: number;
  overlapTokens: number;
  hardMaxTokens: number;
}): {
  chunks: RagChunk[];
  lengthHistogram: Record<string, number>;
  emptyShare: number;
  forcedCutShare: number;
} {
  const { blocks, docId, maxTokens, overlapTokens, hardMaxTokens } = input;
  const chunks: RagChunk[] = [];
  let forcedCuts = 0;
  let empty = 0;

  const sectionBlocks = new Map<string, DocBlock[]>();
  for (const block of blocks) {
    if (block.type === 'heading') continue;
    const key = block.headingPath.join(' > ') || '(root)';
    const list = sectionBlocks.get(key) ?? [];
    list.push(block);
    sectionBlocks.set(key, list);
  }

  let chunkIndex = 0;
  for (const [sectionKey, section] of sectionBlocks) {
    const headingPath =
      section[0]?.headingPath ??
      (sectionKey === '(root)' ? [] : sectionKey.split(' > '));
    const parentId = `parent:${docId}:${sectionKey}`;
    const fullText = section.map((b) => b.text).join('\n\n').trim();
    if (!fullText) {
      empty += 1;
      continue;
    }
    const fullTokens = estimateTokens(fullText);
    if (fullTokens <= maxTokens) {
      chunks.push({
        chunkId: `${docId}:c${chunkIndex++}`,
        docId,
        text: fullText,
        contentHash: contentHash(fullText, headingPath),
        headingPath,
        parentId,
        tokenEstimate: fullTokens,
      });
      continue;
    }

    const pieces: string[] = [];
    for (const block of section) {
      if (
        (block.type === 'table' ||
          block.type === 'code' ||
          block.type === 'list') &&
        estimateTokens(block.text) <= hardMaxTokens
      ) {
        pieces.push(block.text);
      } else if (estimateTokens(block.text) <= maxTokens) {
        pieces.push(block.text);
      } else {
        pieces.push(...splitBySentences(block.text));
      }
    }

    let current = '';
    for (const piece of pieces) {
      const candidate = current ? `${current}\n\n${piece}` : piece;
      if (estimateTokens(candidate) <= maxTokens) {
        current = candidate;
        continue;
      }
      if (current) {
        chunks.push({
          chunkId: `${docId}:c${chunkIndex++}`,
          docId,
          text: current,
          contentHash: contentHash(current, headingPath),
          headingPath,
          parentId,
          tokenEstimate: estimateTokens(current),
        });
      }
      if (estimateTokens(piece) > hardMaxTokens) {
        forcedCuts += 1;
        let start = 0;
        const chars = Math.max(1, hardMaxTokens * 4);
        while (start < piece.length) {
          const end = Math.min(piece.length, start + chars);
          const slice = piece.slice(start, end);
          const overlapChars = Math.min(overlapTokens * 4, slice.length);
          chunks.push({
            chunkId: `${docId}:c${chunkIndex++}`,
            docId,
            text: slice,
            contentHash: contentHash(slice, headingPath),
            headingPath,
            parentId,
            tokenEstimate: estimateTokens(slice),
          });
          start = end - overlapChars;
          if (start >= piece.length - overlapChars) break;
          if (end === piece.length) break;
        }
        current = '';
      } else {
        current = piece;
      }
    }
    if (current) {
      chunks.push({
        chunkId: `${docId}:c${chunkIndex++}`,
        docId,
        text: current,
        contentHash: contentHash(current, headingPath),
        headingPath,
        parentId,
        tokenEstimate: estimateTokens(current),
      });
    }
  }

  const lengthHistogram: Record<string, number> = {};
  for (const c of chunks) {
    const b = bucket(c.tokenEstimate);
    lengthHistogram[b] = (lengthHistogram[b] ?? 0) + 1;
  }
  const denom = Math.max(1, chunks.length);
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
  }) {
    const hardMaxTokens = input.hardMaxTokens ?? input.maxTokens * 2;
    // semantic strategy shares the same port contract; v1 uses recursive cuts.
    void input.strategy;
    return recursiveChunkBlocks({
      blocks: input.blocks,
      docId: input.docId,
      maxTokens: input.maxTokens,
      overlapTokens: input.overlapTokens,
      hardMaxTokens,
    });
  }
}
