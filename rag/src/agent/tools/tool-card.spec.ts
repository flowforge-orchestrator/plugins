import { collectToolCards, parseToolCard } from './tool-card';

describe('tool cards', () => {
  it('Zero: empty router has no tools', () => {
    expect(collectToolCards({})).toEqual([]);
    expect(collectToolCards(undefined)).toEqual([]);
    expect(parseToolCard('')).toBeNull();
    expect(parseToolCard('not-json')).toBeNull();
  });

  it('One: a provider payload becomes one card', () => {
    expect(
      parseToolCard({
        id: 'search',
        description: 'поиск',
        nodeType: 'plugin.rag.search.query',
      }),
    ).toEqual({
      id: 'search',
      description: 'поиск',
      nodeType: 'plugin.rag.search.query',
      args: undefined,
    });
  });

  it('Many: each wired port is a card, arrays flatten', () => {
    const cards = collectToolCards({
      search: { id: 'search', description: 's', nodeType: 'plugin.rag.search.query' },
      graph: JSON.stringify({
        id: 'graph',
        description: 'g',
        nodeType: 'plugin.rag.graph.query',
      }),
      extra: [
        { id: 'topic', description: 't', nodeType: 'plugin.rag.topic' },
      ],
    });
    expect(cards.map((card) => card.id).sort()).toEqual(['graph', 'search', 'topic']);
  });

  it('Boundary: a card without nodeType is dropped', () => {
    expect(parseToolCard({ id: 'search', description: 's' })).toBeNull();
    expect(collectToolCards({ bare: { id: 'search' } })).toEqual([]);
  });

  it('Exception: a broken port does not drop the others', () => {
    const cards = collectToolCards({
      bad: '{',
      search: { id: 'search', description: 's', nodeType: 'plugin.rag.search.query' },
    });
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe('search');
  });
});
