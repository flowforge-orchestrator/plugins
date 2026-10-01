import {
  historyWithToolResult,
  observationsFromHistory,
} from './history-state';

describe('tool results in history', () => {
  it('Zero: empty history has no tool state', () => {
    expect(observationsFromHistory(undefined)).toEqual({});
    expect(observationsFromHistory('')).toEqual({});
    expect(observationsFromHistory('[]')).toEqual({});
  });

  it('One: the tool entry restores observations', () => {
    const history = historyWithToolResult(null, 'search', {
      context: 'Срок — 30 дней',
    });
    expect(observationsFromHistory(history).context).toBe('Срок — 30 дней');
  });

  it('Many: a later tool replaces the previous state and keeps the dialogue', () => {
    const first = historyWithToolResult(
      [{ role: 'user', text: 'раньше' }],
      'search',
      { context: 'первый' },
    );
    const second = historyWithToolResult(first, 'graph', { graphContext: 'граф' });
    const parsed = JSON.parse(second) as Array<{ role: string; name?: string; text: string }>;
    expect(parsed.map((turn) => turn.role)).toEqual(['user', 'tool']);
    expect(parsed[1].name).toBe('graph');
    expect(observationsFromHistory(second).graphContext).toBe('граф');
    expect(observationsFromHistory(second).context).toBeUndefined();
  });

  it('Boundary: a tool entry without text does not invent state', () => {
    expect(observationsFromHistory([{ role: 'tool', text: '  ' }])).toEqual({});
  });

  it('Exception: broken history JSON is empty state', () => {
    expect(observationsFromHistory('{')).toEqual({});
  });
});