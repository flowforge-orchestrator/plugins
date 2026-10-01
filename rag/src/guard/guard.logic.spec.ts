import { decideGate, turnBudgetExhausted } from './guard.logic';
import type { Verdict } from '../agent/turn/agent.turn.logic';

const full: Verdict = {
  consistent: true,
  sufficient: true,
  complete: true,
  gaps: [],
  claims: [],
};

describe('gate', () => {
  it('Zero: no verdict keeps the loop open', () => {
    expect(decideGate({ turnLimited: false })).toEqual({
      breakLoop: false,
      reason: 'no_verdict',
    });
  });

  it('One: a full verdict closes the loop', () => {
    expect(decideGate({ verdict: full, turnLimited: false }).breakLoop).toBe(true);
  });

  it('Many: any open flag keeps the loop open', () => {
    expect(
      decideGate({ verdict: { ...full, sufficient: false }, turnLimited: false }),
    ).toEqual({ breakLoop: false, reason: 'open_gaps' });
    expect(
      decideGate({ verdict: { ...full, complete: false }, turnLimited: false }),
    ).toEqual({ breakLoop: false, reason: 'open_gaps' });
  });

  it('Boundary: turn budget is reached at maxTurns, not before', () => {
    expect(turnBudgetExhausted(5, 6)).toBe(false);
    expect(turnBudgetExhausted(6, 6)).toBe(true);
    expect(turnBudgetExhausted(99, 0)).toBe(false);
  });

  it('Interface: turn limit wins over an open verdict', () => {
    expect(
      decideGate({ verdict: { ...full, complete: false }, turnLimited: true }),
    ).toEqual({ breakLoop: true, reason: 'turn_limit' });
  });

  it('Exception: a conflict is terminal', () => {
    expect(
      decideGate({ verdict: { ...full, consistent: false }, turnLimited: false }),
    ).toEqual({ breakLoop: true, reason: 'conflict' });
  });

  it('Simple: retrieval stays open while a field is still missing', () => {
    expect(
      decideGate({
        mode: 'retrieval',
        verdict: { ...full, sufficient: true, complete: false },
        turnLimited: false,
      }),
    ).toEqual({ breakLoop: false, reason: 'open_gaps' });
  });

  it('Simple: retrieval closes once every field is filled or given up', () => {
    expect(
      decideGate({
        mode: 'retrieval',
        verdict: { ...full, sufficient: false, complete: true },
        turnLimited: false,
      }),
    ).toEqual({ breakLoop: true, reason: 'verdict' });
  });

  it('Simple: a message outside the corpus closes without a verdict', () => {
    expect(
      decideGate({
        frame: { population: 'none', slots: [], skipRetrieval: true },
        turnLimited: false,
      }),
    ).toEqual({ breakLoop: true, reason: 'skip_retrieval' });
  });
});
