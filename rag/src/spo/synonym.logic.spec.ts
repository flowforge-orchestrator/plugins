import {
  createSynonymDictionary,
  mapPredicate,
  resolveSurface,
} from './synonym.logic';

describe('SynonymDictionary', () => {
  it('Zero: empty dict returns surface as own canonical', () => {
    const dict = createSynonymDictionary();
    expect(resolveSurface(dict, 'Чук')).toEqual({
      canonical: 'Чук',
      matched: false,
    });
  });

  it('One: alias resolves to canonical', () => {
    const dict = createSynonymDictionary({
      entities: [{ canonical: 'мать', aliases: ['мама', 'маму'] }],
    });
    expect(resolveSurface(dict, 'Маму').canonical).toBe('мать');
    expect(resolveSurface(dict, 'мама').matched).toBe(true);
  });

  it('Many: learnAlias grows the bag', () => {
    const dict = createSynonymDictionary({
      entities: [{ canonical: 'мать', aliases: ['мама'] }],
    });
    dict.learnAlias('мать', 'матери');
    expect(resolveSurface(dict, 'Матери').canonical).toBe('мать');
    expect(dict.entityAliases('мать')).toEqual(
      expect.arrayContaining(['мама', 'матери']),
    );
  });

  it('Boundary: blank surface ignored', () => {
    const dict = createSynonymDictionary();
    dict.learnAlias('Чук', '  ');
    expect(dict.entityAliases('Чук')).toEqual([]);
  });

  it('mapPredicate: synonym → typeId', () => {
    const dict = createSynonymDictionary({
      predicates: [
        { typeId: 'travels_with', aliases: ['поехал с', 'ходили вместе'] },
      ],
    });
    expect(mapPredicate(dict, 'Поехал с', ['travels_with', 'located_in'])).toBe(
      'travels_with',
    );
  });

  it('mapPredicate: exact typeId passthrough', () => {
    const dict = createSynonymDictionary();
    expect(mapPredicate(dict, 'located_in', ['located_in'])).toBe('located_in');
  });

  it('mapPredicate: unknown stays null when not in allowed', () => {
    const dict = createSynonymDictionary();
    expect(mapPredicate(dict, 'посмотрел на', ['located_in'])).toBeNull();
  });
});
