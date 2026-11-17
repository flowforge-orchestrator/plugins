/**
 * One question per cell run. The prompt names the indexed collection and
 * does not include other questions, gold, or multiple-choice options
 * (options would leak the answer).
 */
export function buildQuestionPrompt(question, collectionId) {
  return [
    `Коллекция знаний: ${collectionId}.`,
    'Ответь на один вопрос по рассказу «Чук и Гек» из этой коллекции.',
    'Сначала вызови MCP-инструменты rag_search и/или rag_graph, затем ответь коротко по-русски только из их результатов.',
    '',
    question.prompt,
  ].join('\n');
}
