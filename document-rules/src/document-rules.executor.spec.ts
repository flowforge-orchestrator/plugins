import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { DocumentRulesExecutor } from './document-rules.executor';
import { applyDocumentRules } from './document-rules.logic';

describe('applyDocumentRules', () => {
  it('turns an empty file into an empty document.txt', () => {
    const out = applyDocumentRules(Buffer.alloc(0));
    assert.equal(out.filename, 'document.txt');
    assert.equal(out.bytes.length, 0);
  });

  it('turns one line into a new file with a single trailing newline', () => {
    const out = applyDocumentRules(Buffer.from('a', 'utf8'));
    assert.equal(out.filename, 'document.txt');
    assert.equal(out.bytes.toString('utf8'), 'a\n');
  });

  it('applies the fixed rules to many lines and renames the file', () => {
    const input = Buffer.from('a  \r\n\r\n\r\nb\t\r\n', 'utf8');
    const out = applyDocumentRules(input, 'notes.md');
    assert.equal(out.filename, 'notes.txt');
    assert.equal(out.bytes.toString('utf8'), 'a\n\nb\n');
    assert.notDeepEqual(out.bytes, input);
  });

  it('drops a leading BOM and blank edges', () => {
    const out = applyDocumentRules(Buffer.from('\uFEFF\n\na\n\n', 'utf8'));
    assert.equal(out.bytes.toString('utf8'), 'a\n');
  });

  it('strips a directory prefix from the source name', () => {
    const out = applyDocumentRules(Buffer.from('a', 'utf8'), '../secret.txt');
    assert.equal(out.filename, 'secret.txt');
  });
});

describe('DocumentRulesExecutor', () => {
  const executor = new DocumentRulesExecutor();

  it('returns a new file when the input is a file buffer', async () => {
    const result = await executor.execute({
      inputs: {
        file: Buffer.from('a  \r\n', 'utf8'),
        filename: 'note.md',
      },
      runId: 'r1',
      nodeId: 'n1',
    } as Parameters<DocumentRulesExecutor['execute']>[0]);
    assert.equal(result.filename, 'note.txt');
    assert.equal(result.content, 'a\n');
    assert.deepEqual(result.file, { filename: 'note.txt', content: 'a\n' });
  });

  it('accepts text when the file was already read', async () => {
    const result = await executor.execute({
      inputs: { text: 'a\r\nb' },
      runId: 'r1',
      nodeId: 'n1',
    } as Parameters<DocumentRulesExecutor['execute']>[0]);
    assert.equal(result.file.filename, 'document.txt');
    assert.equal(result.file.content, 'a\nb\n');
  });

  it('rejects a call with neither file nor text', async () => {
    await assert.rejects(
      () =>
        executor.execute({
          inputs: {},
          runId: 'r1',
          nodeId: 'n1',
        } as Parameters<DocumentRulesExecutor['execute']>[0]),
      /Файл не передан/,
    );
  });
});

describe('document-rules preset', () => {
  it('names the document processing preset and keeps a downloadable file on the result', () => {
    const raw = readFileSync(
      join(process.cwd(), 'presets/document-rules.json'),
      'utf8',
    );
    const doc = JSON.parse(raw) as {
      id: string;
      version: number;
      pluginId: string;
      metadata: { name: string };
      diagrams: Array<{
        widgets: Array<{
          id: string;
          source?: { nodeType?: string };
          outputs?: string[];
        }>;
        edges: Array<{ source: string; target: string }>;
      }>;
    };
    assert.equal(doc.id, 'document-rules');
    assert.equal(doc.pluginId, 'document-rules');
    assert.equal(typeof doc.version, 'number');
    assert.equal(doc.metadata.name, 'Обработка документа');
    assert.equal(doc.diagrams.length, 1);
    const diagram = doc.diagrams[0];
    const ids = new Set(diagram.widgets.map((widget) => widget.id));
    for (const edge of diagram.edges) {
      assert.equal(ids.has(edge.source), true);
      assert.equal(ids.has(edge.target), true);
    }
    const validation = diagram.widgets.find(
      (widget) => widget.source?.nodeType === 'user.validation',
    );
    assert.ok(validation);
    assert.equal(validation.outputs?.includes('confirm'), true);
    assert.equal(validation.outputs?.includes('confirmed'), false);
    assert.ok(
      diagram.widgets.some(
        (widget) => widget.source?.nodeType === 'plugin.document-rules.apply',
      ),
    );
    const output = diagram.widgets.find(
      (widget) => widget.source?.nodeType === 'system.output',
    );
    assert.ok(output);
  });
});
