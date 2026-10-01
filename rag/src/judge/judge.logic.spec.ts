import {
  buildJudgeSystemPrompt,
  judgeVerdict,
  readJudgePayload,
  verdictForSkippedRetrieval,
  verdictWhenJudgeUnavailable,
} from './judge.logic';
import type { Inventory, QuestionFrame } from '../agent/turn/agent.turn.logic';

const named: QuestionFrame = {
  population: 'named',
  slots: ['duration', 'price'],
  entity: 'E',
  skipRetrieval: false,
};

const collection: QuestionFrame = {
  population: 'collection',
  slots: ['count'],
  skipRetrieval: false,
};

function inventoryOf(n: number): Inventory {
  return {
    docCount: n,
    documents: Array.from({ length: n }, (_, i) => ({
      docId: `doc-${i}`,
      title: '',
    })),
  };
}

describe('judge verdict', () => {
  it('Zero: empty draft is neither sufficient nor complete', () => {
    const v = judgeVerdict({
      reading: { claims: [], slotsUnknown: [] },
      frame: named,
      draft: '',
    });
    expect(v).toMatchObject({ consistent: true, sufficient: false, complete: false });
    expect(v.gaps).toMatchObject([{ kind: 'no_draft' }]);
  });

  it('Zero: zero support — every claim unsupported', () => {
    const v = judgeVerdict({
      reading: {
        claims: [{ docId: 'd', slot: 'duration', value: '10', supported: false }],
        slotsUnknown: ['price'],
      },
      frame: named,
      draft: 'x',
    });
    expect(v.sufficient).toBe(false);
    expect(v.complete).toBe(true);
    expect(v.gaps).toMatchObject([
      { kind: 'unsupported', slot: 'duration', docId: 'd', value: '10' },
    ]);
  });

  it('One: one supported claim closing one slot; the other slot is open', () => {
    const v = judgeVerdict({
      reading: {
        claims: [{ docId: 'd', slot: 'duration', value: '10', supported: true }],
        slotsUnknown: [],
      },
      frame: named,
      draft: 'x',
    });
    expect(v.sufficient).toBe(true);
    expect(v.complete).toBe(false);
    expect(v.gaps).toMatchObject([{ kind: 'missing_slot', slot: 'price' }]);
  });

  it('One: unknown closes a slot', () => {
    const v = judgeVerdict({
      reading: {
        claims: [{ docId: 'd', slot: 'duration', value: '10', supported: true }],
        slotsUnknown: ['price'],
      },
      frame: named,
      draft: 'x',
    });
    expect(v).toMatchObject({ consistent: true, sufficient: true, complete: true });
    expect(v.gaps).toMatchObject([]);
  });

  it('Many: collection population — every inventory document must be cited', () => {
    const inventory = inventoryOf(3);
    const v = judgeVerdict({
      reading: {
        claims: inventory.documents.map((doc) => ({
          docId: doc.docId,
          slot: 'listed',
          value: doc.docId,
          supported: true,
        })),
        slotsUnknown: [],
      },
      frame: collection,
      inventory,
      draft: 'x',
    });
    expect(v).toMatchObject({ consistent: true, sufficient: true, complete: true });
  });

  it('Boundary: covered = docCount - 1 is incomplete with exactly one missing_doc', () => {
    const inventory = inventoryOf(4);
    const v = judgeVerdict({
      reading: {
        claims: inventory.documents.slice(0, 3).map((doc) => ({
          docId: doc.docId,
          slot: 'listed',
          value: doc.docId,
          supported: true,
        })),
        slotsUnknown: [],
      },
      frame: collection,
      inventory,
      draft: 'x',
    });
    expect(v.complete).toBe(false);
    expect(v.gaps).toMatchObject([{ kind: 'missing_doc', docId: 'doc-3' }]);
  });

  it('Boundary: collection question without an inventory cannot be complete', () => {
    const v = judgeVerdict({
      reading: { claims: [], slotsUnknown: [] },
      frame: collection,
      draft: 'x',
    });
    expect(v.complete).toBe(false);
    expect(v.gaps).toMatchObject([{ kind: 'no_inventory' }]);
  });

  it('Interface: the model payload is read structurally; blanks are dropped', () => {
    const reading = readJudgePayload({
      claims: [
        { docId: ' d ', slot: ' s ', fact: '', value: ' v ', supported: 'true' },
        { slot: '', value: '' },
        null,
        { slot: 'only', value: 'x', supported: true },
      ],
      slotsUnknown: ['a', '', 2],
    });
    expect(reading.claims).toEqual([
      { docId: 'd', slot: 's', value: 'v', supported: false },
      { slot: 'only', value: 'x', supported: true },
    ]);
    expect(reading.slotsUnknown).toEqual(['a', '2']);
  });

  it('Exception: two values in one (docId, slot) is a conflict', () => {
    const v = judgeVerdict({
      reading: {
        claims: [
          { docId: 'd', slot: 'duration', value: '10', supported: true },
          { docId: 'd', slot: 'duration', value: '12', supported: true },
        ],
        slotsUnknown: ['price'],
      },
      frame: named,
      draft: 'x',
    });
    expect(v.consistent).toBe(false);
    expect(v.gaps).toMatchObject([
      { kind: 'conflict', slot: 'duration', docId: 'd', value: '10 | 12' },
    ]);
  });

  it('Exception: two provisions under one slot are distinct facts, not a conflict', () => {
    const v = judgeVerdict({
      reading: {
        claims: [
          { docId: 'd', slot: 'rules', fact: 'late by customer', value: 'A', supported: true },
          { docId: 'd', slot: 'rules', fact: 'missed with reason', value: 'B', supported: true },
        ],
        slotsUnknown: [],
      },
      frame: { population: 'named', slots: ['rules'], skipRetrieval: false },
      draft: 'x',
    });
    expect(v).toMatchObject({ consistent: true, sufficient: true, complete: true });
  });

  it('Exception: the same fact with two values is a conflict even under one slot', () => {
    const v = judgeVerdict({
      reading: {
        claims: [
          { docId: 'd', slot: 'rules', fact: 'refund after start', value: 'full', supported: true },
          { docId: 'd', slot: 'rules', fact: 'refund after start', value: 'none', supported: true },
        ],
        slotsUnknown: [],
      },
      frame: { population: 'named', slots: ['rules'], skipRetrieval: false },
      draft: 'x',
    });
    expect(v.consistent).toBe(false);
  });

  it('Exception: the same value twice is not a conflict; different docs are not a conflict', () => {
    const v = judgeVerdict({
      reading: {
        claims: [
          { docId: 'd', slot: 'duration', value: '10', supported: true },
          { docId: 'd', slot: 'duration', value: '10', supported: true },
          { docId: 'e', slot: 'duration', value: '12', supported: true },
        ],
        slotsUnknown: ['price'],
      },
      frame: named,
      draft: 'x',
    });
    expect(v.consistent).toBe(true);
  });

  it('Simple: skipRetrieval needs no inventory and is fully closed', () => {
    expect(verdictForSkippedRetrieval()).toMatchObject({
      consistent: true,
      sufficient: true,
      complete: true,
    });
  });

  it('Simple: an unavailable judge leaves the loop open with a named gap', () => {
    expect(verdictWhenJudgeUnavailable('draft').gaps).toMatchObject([
      { kind: 'judge_unavailable' },
    ]);
    expect(verdictWhenJudgeUnavailable('').gaps).toMatchObject([{ kind: 'no_draft' }]);
  });

  it('Simple: without a frame completeness is not certified', () => {
    const v = judgeVerdict({
      reading: {
        claims: [{ slot: 'value', value: 'x', supported: true }],
        slotsUnknown: [],
      },
      draft: 'x',
    });
    expect(v).toMatchObject({ consistent: true, sufficient: true, complete: false });
    expect(v.gaps).toMatchObject([{ kind: 'missing_frame' }]);
  });

  it('Simple: a frame with no slots and a supported draft is complete', () => {
    const v = judgeVerdict({
      reading: {
        claims: [{ slot: 'value', value: 'x', supported: true }],
        slotsUnknown: [],
      },
      frame: { population: 'none', slots: [], skipRetrieval: false },
      draft: 'x',
    });
    expect(v).toMatchObject({ consistent: true, sufficient: true, complete: true });
  });

  it('prompt asks for structure only and forbids rewriting', () => {
    const p = buildJudgeSystemPrompt();
    expect(p).toContain('"claims"');
    expect(p).toContain('"slotsUnknown"');
    expect(p).toContain('Do not rewrite the draft');
  });
});
