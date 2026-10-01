/** Pure helpers for workspace ask-form run/result matching. */

export type RunHead = {
  id: string
  status?: string | null
}

const TERMINAL = new Set([
  'finished',
  'completed',
  'success',
  'failed',
  'error',
])

/**
 * Apply host latestResult only when it belongs to the run we just launched.
 * Otherwise the island paints a stale finished run (e.g. previous "привет").
 *
 * If the owned run is finished but result is still null, wait — reloadRuns sets
 * summaries before loadDetail finishes (Vue can flush watches in between).
 */
export function resolveOwnedRunReply(input: {
  pending: boolean
  launchedRunId: string | null
  alreadyHandledRunId: string | null
  runHead: RunHead | null
  result: unknown
  emptyResultConfirmed?: boolean
}):
  | { action: 'wait' }
  | { action: 'ignore' }
  | { action: 'apply'; runId: string; failed: boolean; result: unknown } {
  if (!input.pending) return { action: 'ignore' }
  const runId = input.launchedRunId
  if (!runId) return { action: 'wait' }
  if (runId === input.alreadyHandledRunId) return { action: 'ignore' }
  const head = input.runHead
  if (!head || head.id !== runId) return { action: 'wait' }
  const status = String(head.status ?? '')
  if (!TERMINAL.has(status)) return { action: 'wait' }
  const failed = status === 'failed' || status === 'error'
  if (failed) {
    return { action: 'apply', runId, failed: true, result: input.result }
  }
  if (input.result == null) {
    if (input.emptyResultConfirmed) {
      return { action: 'apply', runId, failed: false, result: null }
    }
    return { action: 'wait' }
  }
  return {
    action: 'apply',
    runId,
    failed: false,
    result: input.result,
  }
}
