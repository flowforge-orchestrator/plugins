import { resolveOwnedRunReply } from './form-ask-run'

describe('resolveOwnedRunReply', () => {
  it('waits until launched run is the head', () => {
    expect(
      resolveOwnedRunReply({
        pending: true,
        launchedRunId: 'new',
        alreadyHandledRunId: null,
        runHead: { id: 'old', status: 'finished' },
        result: 'привет',
      }),
    ).toEqual({ action: 'wait' })
  })

  it('waits while owned run is still running', () => {
    expect(
      resolveOwnedRunReply({
        pending: true,
        launchedRunId: 'new',
        alreadyHandledRunId: null,
        runHead: { id: 'new', status: 'running' },
        result: null,
      }),
    ).toEqual({ action: 'wait' })
  })

  it('waits when finished but result not loaded yet', () => {
    expect(
      resolveOwnedRunReply({
        pending: true,
        launchedRunId: 'new',
        alreadyHandledRunId: null,
        runHead: { id: 'new', status: 'finished' },
        result: null,
      }),
    ).toEqual({ action: 'wait' })
  })

  it('applies empty only when confirmed', () => {
    expect(
      resolveOwnedRunReply({
        pending: true,
        launchedRunId: 'new',
        alreadyHandledRunId: null,
        runHead: { id: 'new', status: 'finished' },
        result: null,
        emptyResultConfirmed: true,
      }),
    ).toEqual({
      action: 'apply',
      runId: 'new',
      failed: false,
      result: null,
    })
  })

  it('applies only when head id matches launched run', () => {
    expect(
      resolveOwnedRunReply({
        pending: true,
        launchedRunId: 'new',
        alreadyHandledRunId: null,
        runHead: { id: 'new', status: 'finished' },
        result: '4 часа',
      }),
    ).toEqual({
      action: 'apply',
      runId: 'new',
      failed: false,
      result: '4 часа',
    })
  })

  it('ignores when not pending or already handled', () => {
    expect(
      resolveOwnedRunReply({
        pending: false,
        launchedRunId: 'new',
        alreadyHandledRunId: null,
        runHead: { id: 'new', status: 'finished' },
        result: 'x',
      }),
    ).toEqual({ action: 'ignore' })
    expect(
      resolveOwnedRunReply({
        pending: true,
        launchedRunId: 'new',
        alreadyHandledRunId: 'new',
        runHead: { id: 'new', status: 'finished' },
        result: 'x',
      }),
    ).toEqual({ action: 'ignore' })
  })
})
