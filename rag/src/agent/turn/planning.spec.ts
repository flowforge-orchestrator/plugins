import { normalizeStrategy, strategyPrompt } from './planning';

describe('planning strategies', () => {
  it('Zero: unknown strategy is cot', () => {
    expect(normalizeStrategy('')).toBe('cot');
    expect(normalizeStrategy(undefined)).toBe('cot');
    expect(normalizeStrategy('weird')).toBe('cot');
  });

  it('One: each strategy has its own prompt paragraph', () => {
    expect(strategyPrompt('react')).toContain('ReAct');
    expect(strategyPrompt('cot')).toContain('plan');
    expect(strategyPrompt('cog')).toContain('goals');
  });

  it('Interface: the strategy changes the text, not the contract', () => {
    for (const strategy of ['react', 'cot', 'cog'] as const) {
      expect(strategyPrompt(strategy)).toContain('actions');
    }
  });
});
