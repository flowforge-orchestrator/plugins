import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runJavascript } from './javascript-sandbox';

describe('runJavascript', () => {
  it('rejects an empty source', () => {
    assert.throws(() => runJavascript('   ', null, 200), /source is required/);
  });

  it('adds two numbers from input', () => {
    const ran = runJavascript('return input.a + input.b', { a: 17, b: 25 }, 500);
    assert.equal(ran.value, 42);
    assert.equal(ran.stdout, '');
  });

  it('evaluates an expression and an arrow function', () => {
    assert.equal(runJavascript('input.left + input.right', { left: 2, right: 3 }, 500).value, 5);
    assert.equal(
      runJavascript('(input) => input.left + input.right', { left: 2, right: 3 }, 500).value,
      5,
    );
  });

  it('captures console.log', () => {
    const ran = runJavascript('console.log(input.a + input.b); return input.a', { a: 1, b: 2 }, 500);
    assert.equal(ran.value, 1);
    assert.equal(ran.stdout, '3');
  });

  it('stops a tight loop at the timeout', () => {
    assert.throws(() => runJavascript('() => { while (true) {} }', null, 100), /javascript failed/);
  });

  it('reports a syntax error', () => {
    assert.throws(() => runJavascript('return (', null, 200), /javascript failed/);
  });
});
