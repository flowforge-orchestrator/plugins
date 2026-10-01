import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The chat turn path decides from structured fields the model returns, never
 * from regexes or stemmers over the user text or the draft. This test keeps
 * that contract across the executors that run inside a chat turn.
 */
const TURN_PATH_DIRS = [
  'agent',
  'topic',
  'judge',
  'guard',
  'graph/prepare',
  'graph/query',
  'ontology/lookup',
  'search/query',
  'search/rerank',
  'internal',
  'research',
];

const FORBIDDEN_SYMBOLS = [
  'queryTokens',
  'FACET_HITS',
  'GRAPH_NEED',
  'extractHourValues',
  'detectComparison',
  'needsCatalog',
  'officialSchoolName',
  'reviseForGroundingGaps',
  'coercePrepareBeforeRetrieval',
  'coerceGraphBeforeAnswer',
  'inferTopicHeuristic',
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
      continue;
    }
    if (full.endsWith('.ts') && !full.endsWith('.spec.ts')) out.push(full);
  }
  return out;
}

/** Trailing-slash trim of base URLs; not a decision over text. */
const URL_CONFIG_FILES = new Set([join(__dirname, 'internal', 'env-config.ts')]);

const files = TURN_PATH_DIRS.flatMap((dir) =>
  sourceFiles(join(__dirname, dir)),
).filter((file) => !URL_CONFIG_FILES.has(file));

describe('turn path contract', () => {
  it('covers the executors', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files)('%s has no regex literal and no RegExp constructor', (file) => {
    const text = readFileSync(file, 'utf8');
    expect(text).not.toContain('new RegExp(');
    expect(text).not.toMatch(/\.(test|match|matchAll|replace|split|search)\(\s*\//);
    expect(text).not.toMatch(/[=(,:]\s*\/[^/*\n][^\n]*\/[gimsuy]*\s*[;,)\n]/);
  });

  it.each(files)('%s imports none of the removed heuristics', (file) => {
    const text = readFileSync(file, 'utf8');
    for (const symbol of FORBIDDEN_SYMBOLS) {
      expect(text).not.toContain(symbol);
    }
  });
});
