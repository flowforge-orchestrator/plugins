import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildContainerArgs, buildLanguageSpec, parseCommand } from './docker-args';

describe('buildContainerArgs', () => {
  it('starts from an empty command with hardening flags', () => {
    const args = buildContainerArgs({ image: 'alpine:3.20', command: [] });
    assert.equal(args.at(-1), 'alpine:3.20');
    assert.ok(args.includes('--rm'));
    assert.ok(args.includes('--network'));
    assert.equal(args[args.indexOf('--network') + 1], 'none');
    assert.ok(!args.includes('--privileged'));
  });

  it('appends one command and an env pair', () => {
    const args = buildContainerArgs({
      image: 'alpine:3.20',
      command: ['echo', 'hi'],
      env: { GREETING: 'hi' },
    });
    assert.deepEqual(args.slice(-2), ['echo', 'hi']);
    assert.ok(args.includes('GREETING=hi'));
  });

  it('rejects an image with a shell metacharacter', () => {
    assert.throws(
      () => buildContainerArgs({ image: 'alpine;id', command: [] }),
      /image must be/,
    );
  });

  it('rejects a newline in an env value', () => {
    assert.throws(
      () => buildContainerArgs({ image: 'alpine:3.20', command: [], env: { A: 'x\ny' } }),
      /not allowed/,
    );
  });
});

describe('parseCommand', () => {
  it('parses a JSON array', () => {
    assert.deepEqual(parseCommand('["echo","42"]'), ['echo', '42']);
  });

  it('rejects a bare string', () => {
    assert.throws(() => parseCommand('echo hi'), /JSON array/);
  });
});

describe('buildLanguageSpec', () => {
  it('runs python inside the locked image', () => {
    const spec = buildLanguageSpec('python', 'print(input)', 'null');
    assert.equal(spec.image, 'python:3.12-alpine');
    assert.equal(spec.command[0], 'python');
    assert.equal(spec.command[1], '-c');
    assert.match(String(spec.command[2]), /print\(input\)/);
    const args = buildContainerArgs(spec);
    assert.ok(args.includes('--network'));
    assert.equal(args[args.indexOf('--network') + 1], 'none');
  });
});
