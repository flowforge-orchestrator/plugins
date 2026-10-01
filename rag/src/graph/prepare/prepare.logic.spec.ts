import {
  buildInventory,
  formatInventory,
  GRAPH_INVENTORY_CYPHER,
} from './prepare.logic';

describe('inventory', () => {
  it('Zero: no rows is an empty inventory', () => {
    expect(buildInventory([])).toEqual({ docCount: 0, documents: [] });
  });

  it('One: a row is one document with its stored title', () => {
    expect(buildInventory([{ docId: 'a', title: 'Title A' }])).toEqual({
      docCount: 1,
      documents: [{ docId: 'a', title: 'Title A' }],
    });
  });

  it('Many: duplicates collapse, order is kept', () => {
    const inv = buildInventory([
      { docId: 'b' },
      { docId: 'a', title: 't' },
      { docId: 'b', title: 'late' },
    ]);
    expect(inv.docCount).toBe(2);
    expect(inv.documents.map((d) => d.docId)).toEqual(['b', 'a']);
  });

  it('Boundary: blank docId rows are dropped; title is capped', () => {
    const inv = buildInventory([
      { docId: ' ' },
      { docId: 'x', title: 'y'.repeat(500) },
    ]);
    expect(inv.docCount).toBe(1);
    expect(inv.documents[0].title.length).toBe(300);
  });

  it('Interface: cypher is parameterized by collection only', () => {
    expect(GRAPH_INVENTORY_CYPHER).toContain('$collectionId');
    expect(GRAPH_INVENTORY_CYPHER).not.toContain('$tokens');
    expect(GRAPH_INVENTORY_CYPHER).not.toContain('${');
  });

  it('Simple: text form lists count then documents', () => {
    const text = formatInventory({
      docCount: 2,
      documents: [
        { docId: 'a', title: 'A' },
        { docId: 'b', title: '' },
      ],
    });
    expect(text.split('\n')).toEqual(['documents: 2', 'a — A', 'b']);
  });
});
