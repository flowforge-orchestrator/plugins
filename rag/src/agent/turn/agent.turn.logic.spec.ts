import {
  buildAgentSystemPrompt,
  buildAgentUserPrompt,
  DEFAULT_AGENT_TOOLS,
  normalizeObservations,
  normalizeToolSchemas,
  parseAgentTurn,
} from './agent.turn.logic';

const SEARCH_ONLY = [
  { id: 'search', description: 's', nodeType: 'plugin.rag.search.query' },
];

describe('agent turn: actions contract', () => {
  it('Zero: no actions and no answer is an empty turn, not an error', () => {
    const parsed = parseAgentTurn({ payload: {}, observations: {} });
    expect(parsed.actions).toEqual([]);
    expect(parsed.answer).toBe('');
    expect(parsed.observations.turnNotes).toEqual(['actions:empty-turn']);
  });

  it('One: a single legacy action becomes a one-element set', () => {
    const parsed = parseAgentTurn({
      payload: { action: 'search', query: 'x' },
      observations: {},
    });
    expect(parsed.actions).toEqual([{ id: 'search', query: 'x' }]);
  });

  it('Many: the model orders the set; the runner keeps that order', () => {
    const parsed = parseAgentTurn({
      payload: {
        actions: [
          { id: 'topic' },
          { id: 'inventory' },
          { id: 'search', query: 'q' },
        ],
      },
      observations: {},
    });
    expect(parsed.actions.map((a) => a.id)).toEqual([
      'topic',
      'inventory',
      'search',
    ]);
    expect(parsed.observations.turnNotes).toEqual([
      'actions:topic,inventory,search',
    ]);
  });

  it('Boundary: maxActions truncates the tail, never the head', () => {
    const parsed = parseAgentTurn({
      payload: { actions: ['topic', 'inventory', 'search', 'graph', 'rerank'] },
      observations: {},
      maxActions: 2,
    });
    expect(parsed.actions.map((a) => a.id)).toEqual(['topic', 'inventory']);
  });

  it('Interface: ids outside the connected cards are dropped, not corrected', () => {
    const parsed = parseAgentTurn({
      payload: { actions: [{ id: 'graph', query: 'x' }, { id: 'search' }] },
      observations: {},
      allowedTools: SEARCH_ONLY,
    });
    expect(parsed.actions).toEqual([{ id: 'search', query: undefined }]);
  });

  it('Simple: an answer with citations from current hits', () => {
    const parsed = parseAgentTurn({
      payload: {
        answer: 'value from doc-a',
        citationChunkIds: ['c1', 'missing'],
      },
      observations: {
        hits: [
          { chunkId: 'c1', docId: 'doc-a', text: 'value', score: 1, headingPath: ['h'] },
        ],
      },
    });
    expect(parsed.actions).toEqual([]);
    expect(parsed.citations.map((c) => c.docId)).toEqual(['doc-a']);
    expect(parsed.observations.draftAnswer).toBe('value from doc-a');
  });

  it('Exception: an answer is never replaced by the code; actions and answer coexist', () => {
    const parsed = parseAgentTurn({
      payload: { actions: ['search'], answer: 'draft' },
      observations: {},
    });
    expect(parsed.actions.map((a) => a.id)).toEqual(['search']);
    expect(parsed.answer).toBe('draft');
  });
});

describe('agent turn: prompt is generic', () => {
  it('lists connected tools and the JSON schema; operator text is an addition', () => {
    const prompt = buildAgentSystemPrompt({
      tools: DEFAULT_AGENT_TOOLS,
      operatorPrompt: 'OPERATOR LINE',
      maxActions: 3,
    });
    expect(prompt).toContain('actions');
    expect(prompt).toContain('at most 3');
    expect(prompt).toContain('OPERATOR LINE');
    const toolsSection = prompt.slice(prompt.lastIndexOf('Tools:'));
    expect(toolsSection).toContain('- inventory:');
    expect(toolsSection).not.toContain('- answer:');
  });

  it('no tools: the model is told to return [] actions', () => {
    const prompt = buildAgentSystemPrompt({ tools: [] });
    expect(prompt).toContain('No tools are connected');
  });

  it('empty tools JSON is an empty tool set, not the defaults', () => {
    expect(normalizeToolSchemas('[]')).toEqual([]);
  });

  it('user prompt carries frame, inventory and verdict for the model', () => {
    const prompt = buildAgentUserPrompt({
      message: 'm',
      observations: {
        frame: { population: 'collection', slots: ['count'], skipRetrieval: false },
        inventory: { docCount: 1, documents: [{ docId: 'd', title: '' }] },
        verdict: {
          consistent: true,
          sufficient: false,
          complete: false,
          gaps: [{ kind: 'missing_doc', docId: 'd' }],
          claims: [],
        },
      },
    });
    const body = JSON.parse(prompt);
    expect(body.observations.frame.population).toBe('collection');
    expect(body.observations.inventory.docCount).toBe(1);
    expect(body.observations.verdict.gaps[0].kind).toBe('missing_doc');
  });
});

describe('observations round-trip', () => {
  it('keeps frame, inventory, verdict and draft through JSON', () => {
    const obs = normalizeObservations(
      JSON.stringify({
        frame: { population: 'named', slots: ['a'], entity: 'E', skipRetrieval: false },
        inventory: { docCount: 2, documents: [{ docId: 'x', title: 't' }] },
        verdict: { consistent: true, sufficient: true, complete: true, gaps: [], claims: [] },
        draftAnswer: 'd',
      }),
    );
    expect(obs.frame?.entity).toBe('E');
    expect(obs.inventory?.documents[0]).toEqual({ docId: 'x', title: 't' });
    expect(obs.verdict?.complete).toBe(true);
    expect(obs.draftAnswer).toBe('d');
  });
});
