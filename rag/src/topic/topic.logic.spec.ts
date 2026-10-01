import {
  buildFrameSystemPrompt,
  fallbackFrame,
  parseFramePayload,
} from './topic.logic';

describe('question frame', () => {
  it('Zero: empty message skips retrieval without a model', () => {
    expect(fallbackFrame('')).toMatchObject({
      population: 'none',
      slots: [],
      skipRetrieval: true,
    });
    expect(fallbackFrame(null)).toMatchObject({ skipRetrieval: true });
  });

  it('One: a model payload is the frame', () => {
    expect(
      parseFramePayload({
        population: 'named',
        slots: ['duration'],
        entity: 'X',
        skipRetrieval: false,
      }),
    ).toEqual({
      population: 'named',
      slots: ['duration'],
      entity: 'X',
      skipRetrieval: false,
    });
  });

  it('Many: slots come from the payload as given', () => {
    const frame = parseFramePayload({
      population: 'collection',
      slots: ['a', 'b', 'c'],
      skipRetrieval: false,
    });
    expect(frame.slots).toEqual(['a', 'b', 'c']);
  });

  it('Boundary: skipRetrieval empties the slots', () => {
    const frame = parseFramePayload({
      population: 'none',
      slots: ['x'],
      skipRetrieval: true,
    });
    expect(frame.slots).toEqual([]);
  });

  it('Exception: unusable payload falls back; retrieval still runs', () => {
    expect(parseFramePayload(null)).toMatchObject({
      population: 'none',
      skipRetrieval: false,
    });
    expect(parseFramePayload({ population: 'weird' })).toMatchObject({
      population: 'none',
    });
  });

  it('Interface: the prompt names the three populations and no domain', () => {
    const prompt = buildFrameSystemPrompt();
    expect(prompt).toContain('"collection"');
    expect(prompt).toContain('"named"');
    expect(prompt).toContain('"none"');
    expect(prompt).toContain('domain is unknown');
  });
});
