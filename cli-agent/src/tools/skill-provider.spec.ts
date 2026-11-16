import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SkillInstanceExecutor } from './skill-instance.executor';
import { SkillProviderExecutor } from './skill-provider.executor';
import { RulesInstanceExecutor } from './rules-instance.executor';
import { RulesProviderExecutor } from './rules-provider.executor';
import { parseRulesAttach, parseSkillAttach } from './skill-attach';

describe('skill/rules instance → provider', () => {
  it('binds skills into skillAttach', async () => {
    const si = new SkillInstanceExecutor();
    const a = await si.execute({
      inputs: { name: 'graph-kg', body: '# Graph\n' },
    } as never);
    assert.equal(a.status, 'ok');
    const b = await si.execute({
      inputs: { name: 'vector-search', body: '# Vec\n' },
    } as never);
    assert.equal(b.status, 'ok');

    const provider = new SkillProviderExecutor();
    const out = await provider.execute({
      inputs: {
        graph_kg: a.instance,
        vector_search: b.instance,
      },
    } as never);
    assert.equal(out.status, 'ok');
    const attach = parseSkillAttach(out.skillAttach);
    assert.ok(attach);
    assert.equal(attach!.skills.length, 2);
    assert.equal(attach!.skills[0].name, 'graph-kg');
    assert.deepEqual(JSON.parse(out.skillNames), ['graph-kg', 'vector-search']);
  });

  it('binds rules into rulesAttach', async () => {
    const ri = new RulesInstanceExecutor();
    const a = await ri.execute({
      inputs: { name: 'AGENTS.md', body: '# Pack rules\n' },
    } as never);
    assert.equal(a.status, 'ok');

    const provider = new RulesProviderExecutor();
    const out = await provider.execute({
      inputs: { agents: a.instance },
    } as never);
    assert.equal(out.status, 'ok');
    const attach = parseRulesAttach(out.rulesAttach);
    assert.ok(attach);
    assert.equal(attach!.rules[0].name, 'AGENTS.md');
    assert.match(attach!.rules[0].body, /Pack rules/);
  });

  it('rejects empty skill provider', async () => {
    const provider = new SkillProviderExecutor();
    const out = await provider.execute({ inputs: {} } as never);
    assert.match(out.status, /^error:/);
  });
});
