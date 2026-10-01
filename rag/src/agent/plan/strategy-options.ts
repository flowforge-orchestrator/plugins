/** Strategies the plan node publishes. The canvas widget and agent.turn share this list. */
export const PLANNING_STRATEGY_OPTIONS = [
  { id: 'cot', label: 'CoT' },
  { id: 'react', label: 'ReAct' },
  { id: 'cog', label: 'CoG' },
] as const;

export type PlanningStrategyId =
  (typeof PLANNING_STRATEGY_OPTIONS)[number]['id'];
