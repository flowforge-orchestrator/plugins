import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseRpcBody, unwrapToolPayload } from './mcp-cell.mjs';
import { buildQuestionPrompt } from './prompt.mjs';
import { planMatrix, resolveAgentRun } from './resolve-agent.mjs';
import { pickOption, scoreAnswer, scoreAnswerSemantic } from './score.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const matrix = JSON.parse(readFileSync(join(here, 'matrix.json'), 'utf8'));
const bank = JSON.parse(readFileSync(join(here, 'questions.json'), 'utf8'));
const semanticAccept = JSON.parse(
  readFileSync(join(here, 'semantic-accept.json'), 'utf8'),
);

describe('chuk-gek cell smoke', () => {
  it('keeps proprietary models off the opensource id', () => {
    const hermes = matrix.agents.find((agent) => agent.slug === 'hermes');
    const claude = matrix.agents.find((agent) => agent.slug === 'claude-code');
    const aider = matrix.agents.find((agent) => agent.slug === 'aider');
    assert.equal(
      resolveAgentRun(hermes, matrix.opensource, {}).model,
      'gemma4:12b-mlx',
    );
    assert.equal(resolveAgentRun(aider, matrix.opensource, {}).provider, 'custom');
    assert.equal(
      resolveAgentRun(aider, matrix.opensource, {}).model,
      'openai/gemma4:12b-mlx',
    );
    assert.throws(
      () => resolveAgentRun(claude, matrix.opensource, {}),
      /SMOKE_MODEL_CLAUDE_CODE/,
    );
    assert.throws(
      () =>
        resolveAgentRun(claude, matrix.opensource, {
          SMOKE_MODEL_CLAUDE_CODE: 'gemma4:12b-mlx',
        }),
      /must differ/,
    );
    assert.equal(
      resolveAgentRun(claude, matrix.opensource, {
        SMOKE_MODEL_CLAUDE_CODE: 'claude-sonnet-4-5',
      }).model,
      'claude-sonnet-4-5',
    );
  });

  it('lists proprietary slots without a model until the env is set', () => {
    const rows = planMatrix(matrix, {});
    const cursor = rows.find((row) => row.slug === 'cursor');
    assert.equal(cursor.model, null);
    assert.equal(cursor.modelEnv, 'SMOKE_MODEL_CURSOR');
    const hermes = rows.find((row) => row.slug === 'hermes');
    assert.equal(hermes.model, 'gemma4:12b-mlx');
  });

  it('asks one question and scores it against the gold option', () => {
    const first = bank.questions[0];
    const second = bank.questions[1];
    const prompt = buildQuestionPrompt(first, bank.collectionId);
    assert.match(prompt, /chuk_i_gek/);
    assert.match(prompt, /В каком городе/);
    assert.equal(prompt.includes(second.prompt), false);
    assert.equal(prompt.includes('эталон'), false);
    // Must not leak the gold or any MCQ option into the user question.
    assert.equal(prompt.includes(first.gold), false);
    for (const option of first.options) {
      assert.equal(prompt.includes(option), false);
    }
    assert.equal(
      scoreAnswer('думаю, что ответ: В Москве.', first).match,
      true,
    );
    assert.equal(scoreAnswer('В Казани', first).match, false);
    assert.equal(pickOption('В Москве и В Казани', first.options), null);
    // q14: «сторожку» must not count as MCQ gold «Сторож».
    const q14 = bank.questions.find((q) => q.id === 'q14');
    assert.equal(
      pickOption(
        'отправился проверить сторожку. Впоследствии он обнаружил',
        q14.options,
      ),
      null,
    );
    assert.equal(
      scoreAnswerSemantic(
        'отправился проверить сторожку. Впоследствии он обнаружил',
        q14,
        semanticAccept,
      ).match,
      false,
    );
    assert.equal(pickOption('Это был сторож у ворот.', q14.options), 'Сторож');
    assert.equal(
      scoreAnswerSemantic('Утром с охоты вернулся сторож.', q14, semanticAccept)
        .match,
      true,
    );
    assert.equal(bank.questions.length, 30);
    for (const question of bank.questions) {
      assert.equal(question.options.includes(question.gold), true);
      assert.equal(question.options.length, 3);
    }
  });

  it('scores q02 by sense: командировка and Синие горы both count', () => {
    const q02 = bank.questions.find((q) => q.id === 'q02');
    assert.equal(
      scoreAnswerSemantic('Отец уехал в командировку.', q02, semanticAccept)
        .match,
      true,
    );
    assert.equal(
      scoreAnswerSemantic(
        'Отец жил и работал в тайге у Синей горы.',
        q02,
        semanticAccept,
      ).match,
      true,
    );
    assert.equal(
      scoreAnswerSemantic('Он поехал в путешествие по Европе.', q02, semanticAccept)
        .match,
      false,
    );
    // Strict MCQ still requires the school option wording.
    assert.equal(scoreAnswer('в тайге у Синей горы', q02).match, false);
  });

  it('scores chain questions only when both halves are present', () => {
    const q21 = bank.questions.find((q) => q.id === 'q21');
    assert.equal(
      scoreAnswerSemantic(
        'Сторож бегал на лыжах к ущелью Алкараш.',
        q21,
        semanticAccept,
      ).match,
      false,
    );
    assert.equal(
      scoreAnswerSemantic(
        'Партия вернётся не раньше чем через десять дней.',
        q21,
        semanticAccept,
      ).match,
      false,
    );
    assert.equal(
      scoreAnswerSemantic(
        'К ущелью Алкараш, партия вернётся не раньше чем через десять дней.',
        q21,
        semanticAccept,
      ).match,
      true,
    );
    for (const question of bank.questions) {
      const prompt = buildQuestionPrompt(question, bank.collectionId);
      assert.equal(prompt.includes(question.gold), false);
      for (const option of question.options) {
        assert.equal(prompt.includes(option), false);
      }
    }
  });

  it('reads a cell result from JSON and from an event stream', () => {
    const json = JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      result: { structuredContent: { runId: 'r1', status: 'finished' } },
    });
    assert.equal(unwrapToolPayload(parseRpcBody(json, 'application/json')).runId, 'r1');
    const stream = `event: message\ndata: ${json}\n\n`;
    assert.equal(
      unwrapToolPayload(parseRpcBody(stream, 'text/event-stream')).status,
      'finished',
    );
  });
});
