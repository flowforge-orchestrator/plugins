import type { ExecContext } from '@kosolapus/plugin-ts-sdk';

export type ToolInvoker = {
  execute: (...args: unknown[]) => unknown;
};

export type ToolCallResult = {
  observations?: string;
  answer?: string;
  continueLoop?: boolean;
};

export async function invokeToolCard(input: {
  nodeType: string;
  runId: string;
  executionId?: string;
  nodeId?: string;
  payload: Record<string, unknown>;
  resolve: (
    nodeType: string,
  ) => { ctor: new (...args: unknown[]) => ToolInvoker } | undefined;
}): Promise<ToolCallResult> {
  const nodeType = input.nodeType.trim();
  if (!nodeType) {
    return {};
  }
  const entry = input.resolve(nodeType);
  if (!entry) {
    throw new Error(`Unknown tool provider: ${nodeType}`);
  }
  const raw = await new entry.ctor().execute({
    runId: input.runId,
    executionId: input.executionId,
    nodeId: input.nodeId,
    logger: {
      debug: () => undefined,
      info: () => undefined,
      error: () => undefined,
    },
    inputs: input.payload,
    outputs: ['observations', 'answer', 'continueLoop'],
  });
  const row = raw && typeof raw === 'object' ? (raw as ToolCallResult) : {};
  return {
    observations: typeof row.observations === 'string' ? row.observations : undefined,
    answer: typeof row.answer === 'string' ? row.answer : undefined,
    continueLoop: typeof row.continueLoop === 'boolean' ? row.continueLoop : undefined,
  };
}
