import { planStep } from './step.logic';

describe('planStep retrieval graph-first', () => {
  it('Zero evidence: seeds graph then search when both allowed', () => {
    const planned = planStep({
      mode: 'retrieval',
      evidenceCount: 0,
      queue: [],
      allowed: ['graph', 'search', 'ontology'],
      queryTool: 'search',
      question: 'What are evidence gates?',
    });
    expect(planned.op).toBe('graph');
    expect(planned.queue.map((s) => s.id)).toEqual(['search']);
    expect(planned.callModel).toBe(false);
  });

  it('One: with evidence already, stops without tools', () => {
    const planned = planStep({
      mode: 'retrieval',
      evidenceCount: 2,
      queue: [],
      allowed: ['graph', 'search'],
      queryTool: 'search',
      question: 'q',
    });
    expect(planned.op).toBe('none');
    expect(planned.queue).toEqual([]);
  });

  it('Many: open slots seed graph then search for the first slot', () => {
    const planned = planStep({
      mode: 'retrieval',
      evidenceCount: 0,
      queue: [],
      allowed: ['graph', 'search'],
      queryTool: 'search',
      question: 'full question',
      fields: {
        required: ['методы детекции', 'недавние статьи'],
        filled: [],
        asked: [],
        unresolved: [],
      },
    });
    expect(planned.op).toBe('graph');
    expect(planned.query).toBe('методы детекции');
    expect(planned.queue.map((s) => s.id)).toEqual(['search']);
  });
});
