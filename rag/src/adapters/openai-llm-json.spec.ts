import { extractJsonObject } from './openai-llm-json';

describe('extractJsonObject', () => {
  it('parses fenced json', () => {
    expect(
      extractJsonObject('```json\n{"entityTypes":[{"id":"A"}]}\n```'),
    ).toEqual({ entityTypes: [{ id: 'A' }] });
  });

  it('parses raw object amid prose', () => {
    expect(extractJsonObject('here: {"ok":true} done')).toEqual({ ok: true });
  });
});
