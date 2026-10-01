import type {
  QuestionFrame,
  Verdict,
} from '../agent/turn/agent.turn.logic';
import type { ResearchMode } from '../research/model';

export type GateDecision = {
  breakLoop: boolean;
  reason:
    | 'verdict'
    | 'conflict'
    | 'skip_retrieval'
    | 'turn_limit'
    | 'open_gaps'
    | 'no_verdict'
    | 'mode';
};

/**
 * The gate decides only whether the loop ends. It never edits the answer.
 * Terminal: full verdict, a conflict the model must not paper over,
 * a message outside the corpus, or the static turn budget.
 */
export function decideGate(input: {
  verdict?: Verdict;
  frame?: QuestionFrame;
  mode?: ResearchMode;
  turnLimited: boolean;
}): GateDecision {
  if (input.turnLimited) return { breakLoop: true, reason: 'turn_limit' };
  if (input.frame?.skipRetrieval || input.mode === 'direct') {
    return { breakLoop: true, reason: 'skip_retrieval' };
  }
  if (input.mode === 'retrieval') {
    const verdict = input.verdict;
    if (!verdict) return { breakLoop: false, reason: 'no_verdict' };
    if (!verdict.consistent) return { breakLoop: true, reason: 'conflict' };
    if (verdict.complete) return { breakLoop: true, reason: 'verdict' };
    return { breakLoop: false, reason: 'open_gaps' };
  }
  const verdict = input.verdict;
  if (!verdict) return { breakLoop: false, reason: 'no_verdict' };
  if (!verdict.consistent) return { breakLoop: true, reason: 'conflict' };
  if (verdict.sufficient && verdict.complete) {
    return { breakLoop: true, reason: 'verdict' };
  }
  return { breakLoop: false, reason: 'open_gaps' };
}

export function turnBudgetExhausted(turns: number, maxTurns: number): boolean {
  if (!Number.isFinite(maxTurns) || maxTurns < 1) return false;
  return turns >= maxTurns;
}
