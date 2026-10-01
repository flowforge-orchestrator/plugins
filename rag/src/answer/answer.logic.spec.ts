import {
  buildAnswerSystemPrompt,
  buildAnswerUserPrompt,
  buildSearchQuery,
  normalizeHistory,
  parseAnswerPayload,
} from './answer.logic';

describe('answer.logic', () => {
  it('builds prompts with truncated context and history', () => {
    expect(buildAnswerSystemPrompt()).toContain('follow-ups');
    const user = buildAnswerUserPrompt({
      message: 'Сколько часов экзамен?',
      context: 'x'.repeat(20000),
      history: [{ role: 'user', text: 'ранее' }],
    });
    const parsed = JSON.parse(user) as {
      context: string;
      history: unknown[];
    };
    expect(parsed.context.length).toBe(12000);
    expect(parsed.history).toHaveLength(1);
  });

  it('parses answer object', () => {
    expect(parseAnswerPayload({ answer: '  четыре часа  ' })).toBe(
      'четыре часа',
    );
  });

  it('rejects empty payload', () => {
    expect(() => parseAnswerPayload({})).toThrow(/missing answer/);
  });

  it('normalizes history JSON string', () => {
    expect(
      normalizeHistory(
        JSON.stringify([
          { role: 'user', text: 'q1' },
          { role: 'assistant', text: 'a1' },
          { role: 'bot', text: '' },
        ]),
      ),
    ).toEqual([
      { role: 'user', text: 'q1' },
      { role: 'bot', text: 'a1' },
    ]);
  });

  it('enriches short follow-up search query', () => {
    const q = buildSearchQuery({
      message: 'дай примеры по конкретным автошколам',
      history: [
        {
          role: 'user',
          text: 'сколько длится теоретическое обучение?',
        },
        { role: 'bot', text: '95 часов теории в Олисе и Старте' },
      ],
    });
    expect(q).toContain('теоретическое');
    expect(q).toContain('автошколам');
    expect(q).not.toContain('Олисе');
  });

  it('mentions grounding and completeness in system prompt', () => {
    const p = buildAnswerSystemPrompt();
    expect(p).toMatch(/Ground|ground/i);
    expect(p).toMatch(/subset|catalog|полнот|retrieved/i);
  });
});
