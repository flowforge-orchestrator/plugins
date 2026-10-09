import { normalizeEntityLabel } from '../entity/normalize-label';

export type EntitySynonymSeed = {
  canonical: string;
  aliases: string[];
};

export type PredicateSynonymSeed = {
  typeId: string;
  aliases: string[];
};

export type SynonymDictionary = {
  learnAlias: (canonical: string, alias: string) => void;
  entityAliases: (canonical: string) => string[];
  snapshot: () => {
    entities: EntitySynonymSeed[];
    predicates: PredicateSynonymSeed[];
  };
};

type DictState = {
  surfaceToCanonical: Map<string, string>;
  aliasesByCanonical: Map<string, Set<string>>;
  predicateToTypeId: Map<string, string>;
};

const INTERNAL = new WeakMap<SynonymDictionary, DictState>();

function norm(s: string): string {
  return normalizeEntityLabel(s);
}

export function createSynonymDictionary(seed?: {
  entities?: EntitySynonymSeed[];
  predicates?: PredicateSynonymSeed[];
}): SynonymDictionary {
  const state: DictState = {
    surfaceToCanonical: new Map(),
    aliasesByCanonical: new Map(),
    predicateToTypeId: new Map(),
  };

  const rememberEntity = (canonical: string, alias: string) => {
    const c = canonical.trim();
    const a = alias.trim();
    if (!c || !a) return;
    const cn = norm(c);
    const an = norm(a);
    if (!cn || !an) return;
    state.surfaceToCanonical.set(cn, c);
    state.surfaceToCanonical.set(an, c);
    if (!state.aliasesByCanonical.has(c)) {
      state.aliasesByCanonical.set(c, new Set());
    }
    if (cn !== an) state.aliasesByCanonical.get(c)!.add(a);
  };

  for (const row of seed?.entities ?? []) {
    rememberEntity(row.canonical, row.canonical);
    for (const alias of row.aliases) rememberEntity(row.canonical, alias);
  }
  for (const row of seed?.predicates ?? []) {
    const tid = row.typeId.trim();
    if (!tid) continue;
    state.predicateToTypeId.set(norm(tid), tid);
    for (const alias of row.aliases) {
      const a = norm(alias);
      if (a) state.predicateToTypeId.set(a, tid);
    }
  }

  const dict: SynonymDictionary = {
    learnAlias: (canonical, alias) => rememberEntity(canonical, alias),
    entityAliases: (canonical) => [
      ...(state.aliasesByCanonical.get(canonical.trim()) ?? []),
    ],
    snapshot: () => {
      const predicateIds = [...new Set(state.predicateToTypeId.values())];
      return {
        entities: [...state.aliasesByCanonical.entries()].map(
          ([canonical, aliases]) => ({
            canonical,
            aliases: [...aliases],
          }),
        ),
        predicates: predicateIds.map((typeId) => ({
          typeId,
          aliases: [...state.predicateToTypeId.entries()]
            .filter(([, id]) => id === typeId)
            .map(([surface]) => surface)
            .filter((s) => s !== norm(typeId)),
        })),
      };
    },
  };
  INTERNAL.set(dict, state);
  return dict;
}

export function resolveSurface(
  dict: SynonymDictionary,
  surface: string,
): { canonical: string; matched: boolean } {
  const raw = surface.trim();
  if (!raw) return { canonical: '', matched: false };
  const state = INTERNAL.get(dict);
  const n = norm(raw);
  if (!state || !n) return { canonical: raw, matched: false };
  const canonical = state.surfaceToCanonical.get(n);
  if (canonical) return { canonical, matched: true };
  return { canonical: raw, matched: false };
}

export function mapPredicate(
  dict: SynonymDictionary,
  predicateSurface: string,
  allowedTypeIds: string[],
): string | null {
  const allowed = new Set(allowedTypeIds);
  const n = norm(predicateSurface);
  if (!n) return null;
  const trimmed = predicateSurface.trim();
  if (allowed.has(trimmed)) return trimmed;
  for (const id of allowed) {
    if (norm(id) === n) return id;
  }
  const state = INTERNAL.get(dict);
  const mapped = state?.predicateToTypeId.get(n);
  if (mapped && allowed.has(mapped)) return mapped;
  return null;
}

/** Default Russian narrative seeds (morphology + common predicates). */
export const DEFAULT_NARRATIVE_SYNONYMS = {
  entities: [
    { canonical: 'мать', aliases: ['мама', 'маму', 'матери', 'мамой'] },
    { canonical: 'отец', aliases: ['папа', 'папу', 'отца', 'папой', 'отцом'] },
    { canonical: 'Чук', aliases: ['Чука', 'Чуку', 'Чуком'] },
    { canonical: 'Гек', aliases: ['Гека', 'Геку', 'Геком'] },
    { canonical: 'кошка', aliases: ['кошки', 'кошку', 'кошкой'] },
    { canonical: 'Синие горы', aliases: ['Синих гор', 'Синим горам'] },
  ],
  predicates: [
    { typeId: 'travels_with', aliases: ['поехал с', 'поехали с', 'ходили вместе', 'ехали с'] },
    { typeId: 'parent_child_relation', aliases: ['сын', 'сыновья', 'дети', 'мать для'] },
    { typeId: 'sibling_relation', aliases: ['брат', 'братья'] },
    { typeId: 'family_member', aliases: ['семья', 'родственник'] },
    { typeId: 'located_in', aliases: ['жил в', 'жил возле', 'в', 'возле', 'на'] },
    { typeId: 'interacts_with', aliases: ['сказал', 'спросил', 'толкнул', 'позвал'] },
    { typeId: 'coexists_with', aliases: ['вместе с', 'с'] },
  ],
};
