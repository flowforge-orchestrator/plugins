import {
  formatKnowledgeDocSummary,
  parseKnowledgeDocResult,
} from './form-validate-result';

describe('parseKnowledgeDocResult', () => {
  it('reads nested publicInputs', () => {
    expect(
      parseKnowledgeDocResult({
        publicInputs: {
          evidenceId: 'ev-1',
          committedClaimIds: ['c1', 'c2'],
          conflictIds: '["x"]',
          schemaVersion: 3,
        },
      }),
    ).toEqual({
      evidenceId: 'ev-1',
      committedClaimIds: ['c1', 'c2'],
      conflictIds: ['x'],
      schemaVersion: 3,
    });
  });

  it('reads flat result and comma-separated ids', () => {
    expect(
      parseKnowledgeDocResult({
        evidenceId: 'ev-2',
        committedClaimIds: 'a, b; c',
        conflictIds: '',
      }),
    ).toEqual({
      evidenceId: 'ev-2',
      committedClaimIds: ['a', 'b', 'c'],
      conflictIds: [],
      schemaVersion: null,
    });
  });

  it('returns empty when result is missing', () => {
    expect(parseKnowledgeDocResult(null)).toEqual({
      evidenceId: null,
      committedClaimIds: [],
      conflictIds: [],
      schemaVersion: null,
    });
  });
});

describe('formatKnowledgeDocSummary', () => {
  it('formats known fields', () => {
    expect(
      formatKnowledgeDocSummary({
        evidenceId: 'e',
        committedClaimIds: ['a'],
        conflictIds: [],
        schemaVersion: 1,
      }),
    ).toContain('evidenceId: e');
  });
});
