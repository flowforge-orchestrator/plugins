import {
  normalizeFrame,
  type QuestionFrame,
} from '../agent/turn/agent.turn.logic';

export type { QuestionFrame };

export function buildFrameSystemPrompt(): string {
  return [
    'You frame a user message for a document collection whose domain is unknown.',
    'Return JSON: {"population":"collection"|"named"|"none","slots":string[],"entity":string,"skipRetrieval":boolean,"mode":"direct"|"retrieval"|"analysis"|"research","reason":string}.',
    'mode: direct when the message is not about the documents; retrieval when one lookup can answer; analysis when the answer is a count, comparison, or other calculation over retrieved values; research when the question asks why and a lookup cannot establish a cause. When unsure, choose retrieval.',
    'population: collection when the answer must cover every document of the collection (counts, lists of all documents, comparisons across all of them); named when it is about one or several named documents or organizations; none when it is not about the documents.',
    'slots: 1-8 short labels, each one fact the answer must state or mark unknown. Take them from the message, not from a fixed list.',
    'entity: the name the message points at, empty when none.',
    'skipRetrieval: true only when the message is not about the documents (greeting, chit-chat, meta). Then slots is [].',
  ].join('\n');
}

export function buildFrameUserPrompt(input: {
  message: string;
  history?: unknown;
}): string {
  return JSON.stringify(
    { message: input.message, history: input.history ?? [] },
    null,
    2,
  );
}

export function parseFramePayload(payload: unknown): QuestionFrame {
  const frame = normalizeFrame(payload);
  if (!frame) return fallbackFrame('unusable payload');
  if (frame.skipRetrieval) frame.slots = [];
  return frame;
}

/** Used when the model is unavailable. Retrieval still runs; the judge sees no slots. */
export function fallbackFrame(message: string | null | undefined): QuestionFrame {
  const text = (message ?? '').trim();
  if (!text) {
    return {
      population: 'none',
      slots: [],
      skipRetrieval: true,
      reason: 'empty message',
    };
  }
  return {
    population: 'none',
    slots: [],
    skipRetrieval: false,
    reason: 'frame unavailable',
  };
}
