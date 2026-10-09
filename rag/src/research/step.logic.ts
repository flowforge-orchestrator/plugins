import type { ResearchMode, StepRequest } from './model';
import { normalizeMode } from './model';

export type FieldLedger = {
  required: string[];
  filled: string[];
  asked: string[];
  unresolved: string[];
};

export type PlannedStep = {
  op: string;
  query: string;
  args: Record<string, string>;
  queue: StepRequest[];
  callModel: boolean;
  /** Required fields this turn gives up. The grounder does not choose them. */
  giveUp: string[];
};

/**
 * One diagram iteration runs one op. A model may name several; the rest wait
 * in the queue and run on later iterations without another model call.
 * direct and retrieval never ask the model to plan a research loop.
 * Retrieval with a field ledger either queries the next open field or gives
 * the remaining fields up. That choice belongs to this turn.
 */
export function planStep(input: {
  mode: unknown;
  evidenceCount: number;
  queue: StepRequest[];
  allowed: string[];
  queryTool: string;
  question: string;
  modelSteps?: StepRequest[] | null;
  fields?: FieldLedger;
}): PlannedStep {
  const mode: ResearchMode = normalizeMode(input.mode);
  const allowed = new Set(input.allowed);
  const known = (step: StepRequest) => allowed.size === 0 || allowed.has(step.id);

  if (mode === 'direct') {
    return { op: 'none', query: input.question, args: {}, queue: [], callModel: false, giveUp: [] };
  }

  if (input.modelSteps) {
    const steps = input.modelSteps.filter(known);
    const [head, ...rest] = steps;
    return {
      op: head?.id ?? 'none',
      query: head?.query ?? input.question,
      args: head?.args ?? {},
      queue: rest,
      callModel: false,
      giveUp: [],
    };
  }

  if (input.queue.length > 0) {
    const [head, ...rest] = input.queue.filter(known);
    if (head) {
      return {
        op: head.id,
        query: head.query ?? input.question,
        args: head.args ?? {},
        queue: rest,
        callModel: false,
        giveUp: [],
      };
    }
  }

  if (mode === 'retrieval') {
    const fields = input.fields;
    if (fields && fields.required.length > 0) {
      const filled = new Set(fields.filled);
      const asked = new Set(fields.asked);
      const unresolved = new Set(fields.unresolved);
      const open = fields.required.filter((slot) => !filled.has(slot) && !unresolved.has(slot));
      const pending = open.filter((slot) => !asked.has(slot));
      const tool = input.queryTool.trim();
      if (pending.length > 0) {
        const slotQuery = pending[0] ?? input.question;
        const seed: StepRequest[] = [];
        // First open slot: walk the graph before dense search.
        if (!asked.size && known({ id: 'graph' })) {
          seed.push({ id: 'graph', query: slotQuery });
        }
        if (tool && known({ id: tool }) && tool !== 'graph') {
          seed.push({ id: tool, query: slotQuery });
        }
        if (seed.length > 0) {
          const [head, ...rest] = seed;
          return {
            op: head!.id,
            query: head!.query ?? slotQuery,
            args: head!.args ?? {},
            queue: rest,
            callModel: false,
            giveUp: [],
          };
        }
      }
      return {
        op: 'none',
        query: input.question,
        args: {},
        queue: [],
        callModel: false,
        giveUp: pending.length > 0 ? [] : open,
      };
    }
    if (input.evidenceCount > 0) {
      return { op: 'none', query: input.question, args: {}, queue: [], callModel: false, giveUp: [] };
    }
    // Graph-first: entity neighborhood before dense search when both are wired.
    const seed: StepRequest[] = [];
    if (known({ id: 'graph' })) {
      seed.push({ id: 'graph', query: input.question });
    }
    const tool = input.queryTool.trim();
    if (tool && known({ id: tool }) && tool !== 'graph') {
      seed.push({ id: tool, query: input.question });
    }
    if (seed.length > 0) {
      const [head, ...rest] = seed;
      return {
        op: head!.id,
        query: head!.query ?? input.question,
        args: head!.args ?? {},
        queue: rest,
        callModel: false,
        giveUp: [],
      };
    }
    return { op: 'none', query: input.question, args: {}, queue: [], callModel: false, giveUp: [] };
  }
  return { op: 'none', query: input.question, args: {}, queue: input.queue, callModel: true, giveUp: [] };
}
