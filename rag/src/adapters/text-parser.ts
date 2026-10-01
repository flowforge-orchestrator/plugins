import { createHash } from 'crypto';
import type { DocBlock, DocBlockType } from '../contracts/types';
import type { DocumentParser } from '../internal/interfaces';

function blockId(docId: string, index: number): string {
  return `${docId}:b${index}`;
}

function classifyLine(line: string): DocBlockType {
  if (/^#{1,6}\s/.test(line)) return 'heading';
  if (/^```/.test(line)) return 'code';
  if (/^\|/.test(line)) return 'table';
  if (/^\s*[-*+]\s|^\s*\d+\.\s/.test(line)) return 'list';
  return 'paragraph';
}

export class TextDocumentParser implements DocumentParser {
  async parse(input: {
    documentText?: string;
    documentUrl?: string;
    docId: string;
  }): Promise<{ blocks: DocBlock[]; pageCoverage: number }> {
    let text = input.documentText?.trim() ?? '';
    if (!text && input.documentUrl) {
      const res = await fetch(input.documentUrl);
      if (!res.ok) {
        throw new Error(
          `Failed to fetch documentUrl: HTTP ${res.status}`,
        );
      }
      text = (await res.text()).trim();
    }
    if (!text) {
      throw new Error('documentText or documentUrl is required');
    }

    const lines = text.split(/\r?\n/);
    const blocks: DocBlock[] = [];
    const headingPath: string[] = [];
    let index = 0;
    let buf: string[] = [];
    let bufType: DocBlockType = 'paragraph';

    const flush = () => {
      const joined = buf.join('\n').trim();
      if (!joined) {
        buf = [];
        return;
      }
      blocks.push({
        id: blockId(input.docId, index++),
        type: bufType,
        text: joined,
        headingPath: [...headingPath],
      });
      buf = [];
    };

    for (const raw of lines) {
      const line = raw;
      const type = classifyLine(line);
      if (type === 'heading') {
        flush();
        const level = (line.match(/^#+/) ?? ['#'])[0].length;
        const title = line.replace(/^#{1,6}\s*/, '').trim();
        headingPath.length = Math.max(0, level - 1);
        headingPath[level - 1] = title;
        blocks.push({
          id: blockId(input.docId, index++),
          type: 'heading',
          text: title,
          headingPath: [...headingPath],
        });
        continue;
      }
      if (buf.length === 0) {
        bufType = type;
        buf.push(line);
        continue;
      }
      if (type !== bufType && line.trim() === '') {
        flush();
        continue;
      }
      if (type !== bufType) {
        flush();
        bufType = type;
      }
      buf.push(line);
    }
    flush();

    return { blocks, pageCoverage: blocks.length > 0 ? 1 : 0 };
  }
}

export function contentHash(text: string, headingPath: string[]): string {
  return createHash('sha256')
    .update(JSON.stringify({ text: text.trim(), headingPath }))
    .digest('hex')
    .slice(0, 32);
}
