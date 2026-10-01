export const PLANNING_STRATEGIES = ['react', 'cot', 'cog'] as const;
export type PlanningStrategy = (typeof PLANNING_STRATEGIES)[number];

export function normalizeStrategy(raw: unknown): PlanningStrategy {
  const value = String(raw ?? '').trim().toLowerCase();
  if (value === 'cot' || value === 'cog' || value === 'react') return value;
  return 'cot';
}

/** Changes how the model writes its turn. The runtime contract is the same for all three. */
export function strategyPrompt(strategy: PlanningStrategy): string {
  if (strategy === 'cot') {
    return [
      'Planning strategy: Chain-of-Thought.',
      'Write plan as ordered steps toward the answer and keep it across turns.',
      'actions are the steps that can run now, in order. Steps that need the result of an earlier step wait for the next turn.',
    ].join(' ');
  }
  if (strategy === 'cog') {
    return [
      'Planning strategy: Chain of Goals.',
      'goals is one line per fact the answer needs. actions close the open goals whose evidence a tool can supply now.',
      'Answer when every goal is closed by evidence or marked unknown.',
    ].join(' ');
  }
  return [
    'Planning strategy: ReAct.',
    'One thought, then the smallest set of actions that supplies the missing evidence. Observe the result before deciding more.',
  ].join(' ');
}
