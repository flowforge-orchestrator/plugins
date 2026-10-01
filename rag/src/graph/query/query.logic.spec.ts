import { formatGraphFocus, GRAPH_FOCUS_CYPHER } from './query.logic';

describe('graph query.logic', () => {
  it('Zero: empty neighborhood', () => {
    expect(formatGraphFocus([])).toBe('(нет узлов по запросу)');
  });

  it('One: entity, link and excerpt', () => {
    const text = formatGraphFocus([
      {
        entityId: 'e1',
        label: 'Alpha',
        typeId: 'Org',
        docIds: ['doc-a'],
        excerpts: ['excerpt text'],
        links: [
          {
            typeId: 'runs',
            otherLabel: 'Program X',
            otherType: 'Program',
            evidence: 'evidence line',
            docId: 'doc-a',
          },
        ],
      },
    ]);
    expect(text).toContain('[Org] Alpha');
    expect(text).toContain('runs');
    expect(text).toContain('Program X');
    expect(text).toContain('excerpt text');
  });

  it('Cypher is parameterized by collection and the whole needle', () => {
    expect(GRAPH_FOCUS_CYPHER).toContain('$collectionId');
    expect(GRAPH_FOCUS_CYPHER).toContain('$needle');
    expect(GRAPH_FOCUS_CYPHER).not.toContain('$tokens');
    expect(GRAPH_FOCUS_CYPHER).not.toContain('${');
  });
});
