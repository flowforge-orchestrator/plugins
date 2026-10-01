import { invokeToolCard } from './invoke-tool';

describe('invokeToolCard', () => {
  it('Zero: blank nodeType calls nothing', async () => {
    const resolve = jest.fn();
    await expect(
      invokeToolCard({
        nodeType: '  ',
        runId: 'r',
        payload: {},
        resolve,
      }),
    ).resolves.toEqual({});
    expect(resolve).not.toHaveBeenCalled();
  });

  it('One: the card nodeType is the only executor', async () => {
    const execute = jest.fn(async () => ({ observations: '{"hits":1}' }));
    const result = await invokeToolCard({
      nodeType: 'plugin.rag.search.query',
      runId: 'r',
      payload: { query: 'срок' },
      resolve: () => ({ ctor: class { execute = execute; } }),
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.observations).toBe('{"hits":1}');
  });

  it('Exception: a nodeType that is not registered fails', async () => {
    await expect(
      invokeToolCard({
        nodeType: 'plugin.rag.missing',
        runId: 'r',
        payload: {},
        resolve: () => undefined,
      }),
    ).rejects.toThrow('plugin.rag.missing');
  });
});
