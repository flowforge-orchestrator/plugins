export function normalizeAnswer(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Option / phrase as a token, not a substring inside a longer word.
 * «сторож» matches «сторож.» / «сторожа», but not «сторожку».
 */
export function containsOptionToken(normText, option) {
  const needle = normalizeAnswer(option);
  if (!needle) {
    return false;
  }
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Non-letter (incl. start/end) on both sides — Cyrillic-aware via Unicode property.
  return new RegExp(`(?:^|[^\\p{L}])${escaped}(?:$|[^\\p{L}])`, 'u').test(normText);
}

/**
 * Semantic cue / gold soft-match.
 * Stems use substring includes («москв», «командиров»).
 * Cues that equal an MCQ option/gold token use word boundaries («сторож» ≠ «сторожку»).
 */
export function containsCue(normText, cue, question) {
  const needle = normalizeAnswer(cue);
  if (!needle) return false;
  if (/\s/.test(needle)) {
    return normText.includes(needle);
  }
  const goldNorm = normalizeAnswer(question?.gold);
  const optionNorms = (question?.options || []).map((option) => normalizeAnswer(option));
  const isOptionOrGold =
    needle === goldNorm ||
    optionNorms.some(
      (option) =>
        option === needle || option.split(/\s+/).includes(needle),
    );
  if (isOptionOrGold) {
    return containsOptionToken(normText, cue);
  }
  return normText.includes(needle);
}

/** Longest matching option wins, so a shorter option cannot steal a longer hit. */
export function pickOption(text, options) {
  const norm = normalizeAnswer(text);
  if (!norm) {
    return null;
  }
  const hits = options.filter((option) => containsOptionToken(norm, option));
  if (hits.length === 0) {
    return null;
  }
  hits.sort((a, b) => normalizeAnswer(b).length - normalizeAnswer(a).length);
  const best = hits[0];
  const bestLen = normalizeAnswer(best).length;
  const tied = hits.filter((option) => normalizeAnswer(option).length === bestLen);
  if (tied.length !== 1) {
    return null;
  }
  const rest = hits.slice(1);
  const extra = rest.some(
    (option) => !normalizeAnswer(best).includes(normalizeAnswer(option)),
  );
  if (extra) {
    return null;
  }
  return best;
}

export function answerText(result) {
  if (!result || typeof result !== 'object') {
    return '';
  }
  const text = result.text;
  if (typeof text === 'string' && text.trim()) {
    return text;
  }
  const stdout = result.stdout;
  return typeof stdout === 'string' ? stdout : '';
}

export function scoreAnswer(text, question) {
  const picked = pickOption(text, question.options);
  const gold = question.gold;
  return {
    picked,
    gold,
    match: picked !== null && normalizeAnswer(picked) === normalizeAnswer(gold),
  };
}

/**
 * Sense-level match: MCQ gold hit, or any cue-group from semanticAccept.
 * Each cues[] entry is an AND of substrings (after normalizeAnswer).
 * Example q02: both «в командировку» and «к Синим горам» / «в тайге» count.
 *
 * @param {string} text
 * @param {{ id?: string, gold?: string, options?: string[] }} question
 * @param {Record<string, { cues?: string[][] }> | null | undefined} semanticAccept
 */
export function scoreAnswerSemantic(text, question, semanticAccept) {
  const mcq = scoreAnswer(text, question);
  const raw = String(text ?? '');
  const norm = normalizeAnswer(raw);
  if (!norm || /^(tokens?\s*:|выполнен|предоставьте|основе данных)/i.test(raw.trim())) {
    return {
      ...mcq,
      semanticMatch: false,
      matchedCue: null,
      match: false,
    };
  }
  if (mcq.match) {
    return { ...mcq, semanticMatch: true, matchedCue: ['mcq-gold'], match: true };
  }
  const entry =
    (question?.id && semanticAccept?.[question.id]) ||
    question?.semantic ||
    null;
  const groups = entry?.cues || [];
  for (const group of groups) {
    if (!Array.isArray(group) || group.length === 0) continue;
    const ok = group.every((cue) => containsCue(norm, cue, question));
    if (ok) {
      return {
        ...mcq,
        semanticMatch: true,
        matchedCue: group,
        match: true,
      };
    }
  }
  // Gold phrase itself as soft contains (non-option free answers).
  // Single-token gold uses word boundaries so «сторожку» ≠ «Сторож».
  if (question?.gold && containsCue(norm, question.gold, question)) {
    return {
      ...mcq,
      semanticMatch: true,
      matchedCue: ['gold-contains'],
      match: true,
    };
  }
  return { ...mcq, semanticMatch: false, matchedCue: null, match: false };
}
