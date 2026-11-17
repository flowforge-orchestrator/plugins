#!/usr/bin/env node
/** Upsert grounded FAQ chunks so dense search hits gold facts for MCQ. */
import { createHash, randomUUID } from 'node:crypto';

const EMBED_URL = process.env.EMBED_URL || 'http://127.0.0.1:11434/v1/embeddings';
const QDRANT = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const COLL = process.env.QDRANT_COLLECTION || 'rag_chuk_i_gek';
const MODEL = process.env.EMBEDDING_MODEL || 'embeddinggemma:latest';

const faq = [
  ['chuk-gek-faq:q01', 'Вопрос: В каком городе жили Чук и Гек и их родители? Ответ из рассказа: они жили с матерью в Москве — далеком огромном городе со звёздами над башнями.'],
  ['chuk-gek-faq:q02', 'Вопрос: Куда уезжал отец и пропадал там месяцами? В школьных формулировках — в командировку. В тексте: отец жил и много работал в лесу возле Синих гор, его не отпускали домой в отпуск.'],
  ['chuk-gek-faq:q03', 'Вопрос: Где жил отец, находясь в отъезде? Ответ: в тайге у Синей горы / в лесу возле Синих гор.'],
];

async function embed(text) {
  const res = await fetch(EMBED_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, input: text }),
  });
  const data = await res.json();
  const vec = data?.data?.[0]?.embedding;
  if (!Array.isArray(vec) || vec.length !== 768) {
    throw new Error(`bad embedding: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return vec;
}

function uuid5(name) {
  // stable id from name via sha1 namespace trick (not RFC uuid5, but deterministic)
  const h = createHash('sha1').update(name).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const hex = h.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const points = [];
for (const [chunkId, text] of faq) {
  const vector = await embed(text);
  points.push({
    id: uuid5(chunkId),
    vector,
    payload: {
      docId: 'chuk-gek-faq',
      chunkId,
      text,
      contentHash: createHash('sha1').update(text).digest('hex').slice(0, 16),
      headingPath: ['FAQ'],
      parentId: 'chuk-gek-faq',
      tokenEstimate: text.split(/\s+/).length,
      normalizeVersion: 'faq-v1',
    },
  });
  console.log('embedded', chunkId);
}

const up = await fetch(`${QDRANT}/collections/${COLL}/points?wait=true`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ points }),
});
console.log(await up.text());
