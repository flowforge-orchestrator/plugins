import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { executeCode } from './code.logic';
import { executeEdge } from './edge.logic';
import { executeContainer } from './container.logic';

describe('executeCode', () => {
  it('returns the javascript sum without calling docker', async () => {
    let called = false;
    const result = await executeCode(
      { source: 'return input.a + input.b', input: { a: 17, b: 25 } },
      async () => {
        called = true;
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    );
    assert.equal(called, false);
    assert.equal(result.value, 42);
    assert.equal(result.exitCode, 0);
  });

  it('sends python to the container runner', async () => {
    const result = await executeCode(
      { language: 'python', source: 'print(1)', timeoutMs: 500 },
      async (spec) => {
        assert.equal(spec.image, 'python:3.12-alpine');
        return { exitCode: 0, stdout: '1\n', stderr: '' };
      },
    );
    assert.equal(result.stdout, '1\n');
    assert.equal(result.value, 1);
  });
});

describe('executeEdge', () => {
  it('transforms one object', () => {
    assert.deepEqual(
      executeEdge({ source: 'input.left + input.right', input: { left: 20, right: 22 } }),
      { value: 42 },
    );
  });
});

describe('executeContainer', () => {
  it('builds a locked run and returns the runner output', async () => {
    const result = await executeContainer(
      { image: 'alpine:3.20', command: '["echo","hi"]' },
      async (spec) => {
        assert.equal(spec.image, 'alpine:3.20');
        assert.deepEqual(spec.command, ['echo', 'hi']);
        return { exitCode: 0, stdout: 'hi\n', stderr: '' };
      },
    );
    assert.equal(result.stdout, 'hi\n');
  });

  it('accepts a command that is already an array', async () => {
    const result = await executeContainer(
      { image: 'alpine:3.20', command: ['echo', 'hi'] },
      async (spec) => {
        assert.deepEqual(spec.command, ['echo', 'hi']);
        return { exitCode: 0, stdout: 'hi\n', stderr: '' };
      },
    );
    assert.equal(result.stdout, 'hi\n');
  });
});
