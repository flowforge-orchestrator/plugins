#!/usr/bin/env node
/**
 * Generates rag-knowledge.json — Knowledge Engine layer + intake preset.
 * Run: node plugins/rag/presets/build-rag-knowledge.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const X = 280;

function port(name, type = 'string', extra = {}) {
  return { name, type, isPort: true, canBePort: true, ...extra };
}

function staticField(name, type, defaultValue, extra = {}) {
  return {
    name,
    type,
    isPort: false,
    canBePort: false,
    static: true,
    ...(defaultValue !== undefined ? { defaultValue } : {}),
    ...extra,
  };
}

function trigger(fields, x = 0, y = 0) {
  return {
    id: 'w-trigger',
    label: 'Trigger',
    position: { x, y },
    source: {
      nodeType: 'system.trigger.input',
      label: 'Входные данные триггера',
    },
    config: fields.map((f, i) => ({
      name: f.name,
      type: f.type || 'string',
      isPort: true,
      canBePort: true,
      ...(i === 0 ? { isPrimary: true } : {}),
      ...(f.required ? { isRequired: true } : {}),
    })),
    outputs: [...fields.map((f) => f.name), 'trigger'],
  };
}

function output(fields, x, y = 0) {
  return {
    id: 'w-output',
    label: 'Output',
    position: { x, y },
    source: {
      nodeType: 'system.output',
      label: 'Результат процесса',
    },
    config: fields.map((f, i) => ({
      name: f.name,
      type: f.type || 'string',
      isPort: true,
      canBePort: true,
      ...(i === 0 ? { isPrimary: true } : {}),
    })),
    outputs: [],
  };
}

function widget(id, label, nodeType, sourceLabel, config, outputs, x, y = 0) {
  return {
    id,
    label,
    position: { x, y },
    source: { nodeType, label: sourceLabel },
    config,
    outputs,
  };
}

function edge(id, source, sourceHandle, target, targetHandle) {
  return { id, source, sourceHandle, target, targetHandle };
}

function processCall(id, label, processName, inputPorts, outputNames, x, y = 0) {
  return {
    id,
    label,
    position: { x, y },
    source: {
      nodeType: 'system.process.call',
      label: `Вызов: ${processName}`,
    },
    config: [
      staticField('diagramId', 'string', `__BIND__:${processName}`, {
        isPrimary: true,
      }),
      staticField('diagramName', 'string', processName),
      ...inputPorts.map((p, i) =>
        port(p.name, p.type || 'string', {
          ...(i === 0 ? { isPrimary: true } : {}),
          ...(p.required ? { isRequired: true } : {}),
        }),
      ),
    ],
    outputs: outputNames,
  };
}

function settings(name, description) {
  return {
    name,
    description,
    triggers: [{ type: 'webhook' }, { type: 'manual' }],
    isActive: true,
  };
}

function diagram(name, description, widgets, edges) {
  return { settings: settings(name, description), widgets, edges };
}

function intakeOutputFields() {
  return [
    { name: 'documentText', type: 'textarea' },
    { name: 'docId' },
    { name: 'collectionId' },
    { name: 'observedAt' },
    { name: 'source' },
  ];
}

function interpretLayer() {
  const widgets = [
    trigger([
      { name: 'documentText', type: 'textarea', required: true },
      { name: 'docId', required: true },
      { name: 'collectionId', required: true },
      { name: 'observedAt' },
      { name: 'source' },
    ]),
    widget(
      'w-evidence',
      'Evidence commit',
      'plugin.rag.evidence.commit',
      'RAG: зафиксировать evidence',
      [
        port('text', 'textarea', { isPrimary: true, isRequired: true }),
        port('docId', 'string', { isRequired: true }),
        port('collectionId', 'string', { isRequired: true }),
        port('source'),
        port('observedAt'),
        port('existing', 'textarea'),
      ],
      ['evidence', 'duplicate'],
      X,
    ),
    widget(
      'w-extract',
      'Extract',
      'plugin.rag.extract',
      'RAG: извлечь документ',
      [port('documentText', 'textarea', { isPrimary: true }), port('docId')],
      ['blocks', 'pageCoverage', 'blockCount'],
      X * 2,
    ),
    widget(
      'w-chunk',
      'Chunk',
      'plugin.rag.chunk',
      'RAG: нарезать чанки',
      [
        port('blocks', 'textarea', { isPrimary: true }),
        port('docId'),
        staticField('strategy', 'select', 'recursive'),
        staticField('maxTokens', 'number', 400),
        staticField('overlapTokens', 'number', 40),
      ],
      ['chunks', 'lengthHistogram', 'chunkCount'],
      X * 3,
    ),
    widget(
      'w-interpret',
      'Interpret',
      'plugin.rag.interpret.observations',
      'RAG: интерпретировать наблюдения',
      [
        port('evidence', 'textarea', { isPrimary: true, isRequired: true }),
        port('chunks', 'textarea', { isRequired: true }),
        port('raw', 'textarea'),
        staticField('candidateLimit', 'number', 50),
      ],
      ['observations'],
      X * 4,
    ),
    widget(
      'w-evid-id',
      'Evidence id',
      'system.object.extract',
      'Извлечение полей',
      [
        staticField('map', 'keyvalue', '{"evidenceId":"id"}', {
          isPrimary: true,
        }),
        port('source', 'keyvalue'),
      ],
      ['evidenceId'],
      X * 4,
      160,
    ),
    output(
      [
        { name: 'observations', type: 'textarea' },
        { name: 'evidence', type: 'textarea' },
        { name: 'evidenceId' },
        { name: 'duplicate', type: 'boolean' },
        { name: 'chunks', type: 'textarea' },
      ],
      X * 5,
    ),
  ];
  const edges = [
    edge('e1', 'w-trigger', 'documentText', 'w-evidence', 'text'),
    edge('e2', 'w-trigger', 'docId', 'w-evidence', 'docId'),
    edge('e3', 'w-trigger', 'collectionId', 'w-evidence', 'collectionId'),
    edge('e4', 'w-trigger', 'source', 'w-evidence', 'source'),
    edge('e5', 'w-trigger', 'observedAt', 'w-evidence', 'observedAt'),
    edge('e6', 'w-trigger', 'documentText', 'w-extract', 'documentText'),
    edge('e7', 'w-trigger', 'docId', 'w-extract', 'docId'),
    edge('e8', 'w-extract', 'blocks', 'w-chunk', 'blocks'),
    edge('e9', 'w-trigger', 'docId', 'w-chunk', 'docId'),
    edge('e10', 'w-evidence', 'evidence', 'w-interpret', 'evidence'),
    edge('e11', 'w-chunk', 'chunks', 'w-interpret', 'chunks'),
    edge('e12', 'w-evidence', 'evidence', 'w-evid-id', 'source'),
    edge('e13', 'w-interpret', 'observations', 'w-output', 'observations'),
    edge('e14', 'w-evidence', 'evidence', 'w-output', 'evidence'),
    edge('e15', 'w-evid-id', 'evidenceId', 'w-output', 'evidenceId'),
    edge('e16', 'w-evidence', 'duplicate', 'w-output', 'duplicate'),
    edge('e17', 'w-chunk', 'chunks', 'w-output', 'chunks'),
  ];
  return diagram(
    'Интерпретация',
    'Evidence commit → extract → chunk → interpret.observations. Webhook. Выход: пакет S1.',
    widgets,
    edges,
  );
}

function resolveLayer() {
  const widgets = [
    trigger([
      { name: 'observations', type: 'textarea', required: true },
      { name: 'collectionId', required: true },
      { name: 'existingConcepts', type: 'textarea' },
      { name: 'existingClaims', type: 'textarea' },
      { name: 'conceptCandidate', type: 'textarea' },
      { name: 'claimCandidate', type: 'textarea' },
    ]),
    widget(
      'w-mentions',
      'Mentions',
      'system.object.extract',
      'Извлечение полей',
      [
        staticField(
          'map',
          'keyvalue',
          '{"mentions":"entityMentions","conceptMentions":"conceptMentions","claimCandidates":"claimCandidates"}',
          { isPrimary: true },
        ),
        port('source', 'keyvalue'),
      ],
      ['mentions', 'conceptMentions', 'claimCandidates'],
      X,
    ),
    widget(
      'w-entity',
      'Entity resolve',
      'plugin.rag.entity.resolve',
      'RAG: разрешить сущности',
      [
        port('mentions', 'textarea', { isPrimary: true }),
        port('collectionId'),
        staticField('ambiguityThreshold', 'number', 0.15),
      ],
      ['entities', 'decisions', 'merged', 'created', 'rebound'],
      X * 2,
    ),
    widget(
      'w-concept-first',
      'First concept',
      'system.array.first',
      'Array: первый',
      [port('items', 'keyvalue', { isPrimary: true })],
      ['item'],
      X * 2,
      180,
    ),
    widget(
      'w-cand-fb',
      'Concept candidate',
      'system.string.fallback',
      'String: fallback',
      [
        port('primary', 'textarea', { isPrimary: true }),
        port('fallback', 'textarea'),
      ],
      ['string'],
      X * 3,
      180,
    ),
    widget(
      'w-concept',
      'Concept resolve',
      'plugin.rag.concept.resolve',
      'RAG: разрешить понятие',
      [
        port('candidate', 'textarea', { isPrimary: true, isRequired: true }),
        port('existing', 'textarea', { isRequired: true }),
      ],
      ['decision', 'conceptId'],
      X * 4,
      180,
    ),
    widget(
      'w-claim-first',
      'First claim',
      'system.array.first',
      'Array: первый',
      [port('items', 'keyvalue', { isPrimary: true })],
      ['item'],
      X * 2,
      360,
    ),
    widget(
      'w-claim-fb',
      'Claim candidate',
      'system.string.fallback',
      'String: fallback',
      [
        port('primary', 'textarea', { isPrimary: true }),
        port('fallback', 'textarea'),
      ],
      ['string'],
      X * 3,
      360,
    ),
    widget(
      'w-claim',
      'Claim resolve',
      'plugin.rag.claim.resolve',
      'RAG: разрешить claim',
      [
        port('candidate', 'textarea', { isPrimary: true, isRequired: true }),
        port('existing', 'textarea', { isRequired: true }),
        staticField('windowToleranceDays', 'number', 0),
      ],
      ['decision'],
      X * 4,
      360,
    ),
    output(
      [
        { name: 'entityDecisions', type: 'textarea' },
        { name: 'entities', type: 'textarea' },
        { name: 'conceptDecision', type: 'textarea' },
        { name: 'conceptId' },
        { name: 'claimDecision', type: 'textarea' },
      ],
      X * 5,
    ),
  ];
  const edges = [
    edge('e1', 'w-trigger', 'observations', 'w-mentions', 'source'),
    edge('e2', 'w-mentions', 'mentions', 'w-entity', 'mentions'),
    edge('e3', 'w-trigger', 'collectionId', 'w-entity', 'collectionId'),
    edge('e4', 'w-mentions', 'conceptMentions', 'w-concept-first', 'items'),
    edge('e5', 'w-concept-first', 'item', 'w-cand-fb', 'fallback'),
    edge('e6', 'w-trigger', 'conceptCandidate', 'w-cand-fb', 'primary'),
    edge('e7', 'w-cand-fb', 'string', 'w-concept', 'candidate'),
    edge('e8', 'w-trigger', 'existingConcepts', 'w-concept', 'existing'),
    edge('e9', 'w-mentions', 'claimCandidates', 'w-claim-first', 'items'),
    edge('e10', 'w-claim-first', 'item', 'w-claim-fb', 'fallback'),
    edge('e11', 'w-trigger', 'claimCandidate', 'w-claim-fb', 'primary'),
    edge('e12', 'w-claim-fb', 'string', 'w-claim', 'candidate'),
    edge('e13', 'w-trigger', 'existingClaims', 'w-claim', 'existing'),
    edge('e14', 'w-entity', 'decisions', 'w-output', 'entityDecisions'),
    edge('e15', 'w-entity', 'entities', 'w-output', 'entities'),
    edge('e16', 'w-concept', 'decision', 'w-output', 'conceptDecision'),
    edge('e17', 'w-concept', 'conceptId', 'w-output', 'conceptId'),
    edge('e18', 'w-claim', 'decision', 'w-output', 'claimDecision'),
  ];
  return diagram(
    'Разрешение',
    'entity → concept → claim.resolve. Пакет S1; ambiguous на выходе. Webhook.',
    widgets,
    edges,
  );
}

function reconcileLayer() {
  const widgets = [
    trigger([
      { name: 'claimDecision', type: 'textarea', required: true },
      { name: 'left', type: 'textarea' },
      { name: 'right', type: 'textarea' },
      { name: 'candidate', type: 'textarea' },
    ]),
    widget(
      'w-kind',
      'Decision kind',
      'system.object.extract',
      'Извлечение полей',
      [
        staticField('map', 'keyvalue', '{"kind":"kind"}', { isPrimary: true }),
        port('source', 'keyvalue'),
      ],
      ['kind'],
      X,
    ),
    widget(
      'w-switch',
      'ClaimDecision',
      'system.control.switch',
      'Control: switch',
      [port('value', 'string', { isPrimary: true })],
      ['new', 'duplicate', 'conflict'],
      X * 2,
    ),
    widget(
      'w-policy',
      'Conflict policy',
      'plugin.rag.conflict.policy',
      'RAG: политика конфликта',
      [
        port('left', 'textarea', { isPrimary: true, isRequired: true }),
        port('right', 'textarea', { isRequired: true }),
        port('enabled', 'boolean'),
        staticField('sameDefinition', 'boolean', true),
        staticField('samePeriodRequiresOverlap', 'boolean', true),
      ],
      ['branch'],
      X * 3,
      160,
    ),
    widget(
      'w-pass-new',
      'Pass new',
      'system.control.pass',
      'Control: pass',
      [
        port('value', 'keyvalue', { isPrimary: true }),
        port('enabled', 'boolean'),
      ],
      ['value'],
      X * 3,
      -80,
    ),
    widget(
      'w-pass-dup',
      'Pass duplicate',
      'system.control.pass',
      'Control: pass',
      [
        port('value', 'keyvalue', { isPrimary: true }),
        port('enabled', 'boolean'),
      ],
      ['value'],
      X * 3,
      40,
    ),
    output(
      [
        { name: 'branch', type: 'textarea' },
        { name: 'claimDecision', type: 'textarea' },
        { name: 'candidate', type: 'textarea' },
        { name: 'reviewItem', type: 'textarea' },
      ],
      X * 4,
    ),
  ];
  const edges = [
    edge('e1', 'w-trigger', 'claimDecision', 'w-kind', 'source'),
    edge('e2', 'w-kind', 'kind', 'w-switch', 'value'),
    edge('e3', 'w-switch', 'conflict', 'w-policy', 'enabled'),
    edge('e4', 'w-trigger', 'left', 'w-policy', 'left'),
    edge('e5', 'w-trigger', 'right', 'w-policy', 'right'),
    edge('e6', 'w-switch', 'new', 'w-pass-new', 'enabled'),
    edge('e7', 'w-trigger', 'claimDecision', 'w-pass-new', 'value'),
    edge('e8', 'w-switch', 'duplicate', 'w-pass-dup', 'enabled'),
    edge('e9', 'w-trigger', 'claimDecision', 'w-pass-dup', 'value'),
    edge('e10', 'w-policy', 'branch', 'w-output', 'branch'),
    edge('e11', 'w-trigger', 'claimDecision', 'w-output', 'claimDecision'),
    edge('e12', 'w-trigger', 'candidate', 'w-output', 'candidate'),
    edge('e13', 'w-policy', 'branch', 'w-output', 'reviewItem'),
  ];
  return diagram(
    'Сверка',
    'switch по ClaimDecision.kind; conflict → conflict.policy. Webhook.',
    widgets,
    edges,
  );
}

function commitLayer() {
  const widgets = [
    trigger([
      { name: 'candidate', type: 'textarea', required: true },
      { name: 'decision', type: 'textarea', required: true },
      { name: 'branch', type: 'textarea' },
      { name: 'existing', type: 'textarea' },
      { name: 'source' },
      { name: 'assertedAt' },
      { name: 'ontologyDecision', type: 'textarea' },
      { name: 'evidenceId' },
      { name: 'currentSchemaVersion', type: 'number' },
    ]),
    widget(
      'w-commit',
      'Claim commit',
      'plugin.rag.claim.commit',
      'RAG: зафиксировать claim',
      [
        port('candidate', 'textarea', { isPrimary: true, isRequired: true }),
        port('decision', 'textarea', { isRequired: true }),
        port('branch', 'textarea'),
        port('existing', 'textarea'),
        port('source'),
        port('assertedAt'),
      ],
      ['claim', 'statusUpdates', 'reused'],
      X,
    ),
    widget(
      'w-claim-id',
      'Claim id',
      'system.object.extract',
      'Извлечение полей',
      [
        staticField('map', 'keyvalue', '{"claimId":"claimId","status":"status"}', {
          isPrimary: true,
        }),
        port('source', 'keyvalue'),
      ],
      ['claimId', 'status'],
      X * 2,
    ),
    widget(
      'w-evolve',
      'Ontology evolve',
      'plugin.rag.ontology.evolve',
      'RAG: эволюция онтологии',
      [
        port('decision', 'textarea', { isPrimary: true, isRequired: true }),
        port('evidenceId'),
        port('currentSchemaVersion', 'number', { isRequired: true }),
        port('assertedAt'),
      ],
      ['entry', 'schemaVersion'],
      X,
      200,
    ),
    output(
      [
        { name: 'claim', type: 'textarea' },
        { name: 'claimId' },
        { name: 'status' },
        { name: 'statusUpdates', type: 'textarea' },
        { name: 'reused', type: 'boolean' },
        { name: 'schemaVersion', type: 'number' },
        { name: 'ontologyEntry', type: 'textarea' },
      ],
      X * 3,
    ),
  ];
  const edges = [
    edge('e1', 'w-trigger', 'candidate', 'w-commit', 'candidate'),
    edge('e2', 'w-trigger', 'decision', 'w-commit', 'decision'),
    edge('e3', 'w-trigger', 'branch', 'w-commit', 'branch'),
    edge('e4', 'w-trigger', 'existing', 'w-commit', 'existing'),
    edge('e5', 'w-trigger', 'source', 'w-commit', 'source'),
    edge('e6', 'w-trigger', 'assertedAt', 'w-commit', 'assertedAt'),
    edge('e7', 'w-commit', 'claim', 'w-claim-id', 'source'),
    edge('e8', 'w-trigger', 'ontologyDecision', 'w-evolve', 'decision'),
    edge('e9', 'w-trigger', 'evidenceId', 'w-evolve', 'evidenceId'),
    edge('e10', 'w-trigger', 'currentSchemaVersion', 'w-evolve', 'currentSchemaVersion'),
    edge('e11', 'w-trigger', 'assertedAt', 'w-evolve', 'assertedAt'),
    edge('e12', 'w-commit', 'claim', 'w-output', 'claim'),
    edge('e13', 'w-claim-id', 'claimId', 'w-output', 'claimId'),
    edge('e14', 'w-claim-id', 'status', 'w-output', 'status'),
    edge('e15', 'w-commit', 'statusUpdates', 'w-output', 'statusUpdates'),
    edge('e16', 'w-commit', 'reused', 'w-output', 'reused'),
    edge('e17', 'w-evolve', 'schemaVersion', 'w-output', 'schemaVersion'),
    edge('e18', 'w-evolve', 'entry', 'w-output', 'ontologyEntry'),
  ];
  return diagram(
    'Фиксация',
    'claim.commit + ontology.evolve. Webhook.',
    widgets,
    edges,
  );
}

function projectLayer() {
  const widgets = [
    trigger([
      { name: 'subject', required: true },
      { name: 'predicate', required: true },
      { name: 'claims', type: 'textarea', required: true },
      { name: 'asOf', required: true },
      { name: 'affectedIds', type: 'textarea' },
    ]),
    widget(
      'w-current',
      'Derive current',
      'plugin.rag.derive.current',
      'RAG: текущее значение',
      [
        port('subject', 'string', { isPrimary: true, isRequired: true }),
        port('predicate', 'string', { isRequired: true }),
        port('claims', 'textarea', { isRequired: true }),
        port('asOf', 'string', { isRequired: true }),
      ],
      ['derived'],
      X,
    ),
    widget(
      'w-project',
      'Derive project',
      'plugin.rag.derive.project',
      'RAG: проекция',
      [
        port('affectedIds', 'textarea', { isPrimary: true, isRequired: true }),
        staticField('projection', 'select', 'all'),
      ],
      ['projection', 'requested', 'projected', 'skipped', 'ok', 'error'],
      X * 2,
    ),
    output(
      [
        { name: 'derived', type: 'textarea' },
        { name: 'projection' },
        { name: 'requested', type: 'number' },
        { name: 'projected', type: 'number' },
        { name: 'skipped', type: 'number' },
        { name: 'ok', type: 'boolean' },
      ],
      X * 3,
    ),
  ];
  const edges = [
    edge('e1', 'w-trigger', 'subject', 'w-current', 'subject'),
    edge('e2', 'w-trigger', 'predicate', 'w-current', 'predicate'),
    edge('e3', 'w-trigger', 'claims', 'w-current', 'claims'),
    edge('e4', 'w-trigger', 'asOf', 'w-current', 'asOf'),
    edge('e5', 'w-trigger', 'affectedIds', 'w-project', 'affectedIds'),
    edge('e6', 'w-current', 'derived', 'w-output', 'derived'),
    edge('e7', 'w-project', 'projection', 'w-output', 'projection'),
    edge('e8', 'w-project', 'requested', 'w-output', 'requested'),
    edge('e9', 'w-project', 'projected', 'w-output', 'projected'),
    edge('e10', 'w-project', 'skipped', 'w-output', 'skipped'),
    edge('e11', 'w-project', 'ok', 'w-output', 'ok'),
  ];
  return diagram(
    'Проекция',
    'derive.current → derive.project. Webhook.',
    widgets,
    edges,
  );
}

function workspaceLayer() {
  const widgets = [
    trigger([
      { name: 'question', type: 'textarea', required: true },
      { name: 'collectionId', required: true },
      { name: 'claims', type: 'textarea' },
      { name: 'entities', type: 'textarea' },
      { name: 'evidence', type: 'textarea' },
      { name: 'events', type: 'textarea' },
      { name: 'concepts', type: 'textarea' },
      { name: 'timeWindow', type: 'textarea' },
      { name: 'query' },
    ]),
    widget(
      'w-find-claims',
      'Find claims',
      'plugin.rag.find.claims',
      'RAG: найти claims',
      [
        port('collectionId', 'string', { isRequired: true }),
        port('claims', 'textarea', { isPrimary: true, isRequired: true }),
        port('subject'),
        port('predicate'),
        port('timeWindow', 'textarea'),
        staticField('limit', 'number', 50),
      ],
      ['records', 'evidenceIds'],
      X,
      -120,
    ),
    widget(
      'w-find-entities',
      'Find entities',
      'plugin.rag.find.entities',
      'RAG: найти сущности',
      [
        port('collectionId', 'string', { isRequired: true }),
        port('entities', 'textarea', { isPrimary: true, isRequired: true }),
        port('query'),
        staticField('limit', 'number', 50),
      ],
      ['records'],
      X,
      40,
    ),
    widget(
      'w-find-evidence',
      'Find evidence',
      'plugin.rag.find.evidence',
      'RAG: найти evidence',
      [
        port('collectionId', 'string', { isRequired: true }),
        port('evidence', 'textarea', { isPrimary: true, isRequired: true }),
        port('query'),
        port('timeWindow', 'textarea'),
        staticField('limit', 'number', 50),
      ],
      ['records'],
      X,
      200,
    ),
    widget(
      'w-build',
      'Workspace build',
      'plugin.rag.workspace.build',
      'RAG: собрать workspace',
      [
        port('question', 'textarea', { isPrimary: true, isRequired: true }),
        port('entities', 'textarea'),
        port('concepts', 'textarea'),
        port('claims', 'textarea'),
        port('evidence', 'textarea'),
        port('timeWindow', 'textarea'),
        staticField(
          'budget',
          'textarea',
          '{"maxEntities":100,"maxClaims":500,"maxEvidence":50,"maxConcepts":30}',
        ),
      ],
      ['workspace'],
      X * 2,
    ),
    output([{ name: 'workspace', type: 'textarea' }], X * 3),
  ];
  const edges = [
    edge('e1', 'w-trigger', 'collectionId', 'w-find-claims', 'collectionId'),
    edge('e2', 'w-trigger', 'claims', 'w-find-claims', 'claims'),
    edge('e3', 'w-trigger', 'timeWindow', 'w-find-claims', 'timeWindow'),
    edge('e4', 'w-trigger', 'collectionId', 'w-find-entities', 'collectionId'),
    edge('e5', 'w-trigger', 'entities', 'w-find-entities', 'entities'),
    edge('e6', 'w-trigger', 'query', 'w-find-entities', 'query'),
    edge('e7', 'w-trigger', 'collectionId', 'w-find-evidence', 'collectionId'),
    edge('e8', 'w-trigger', 'evidence', 'w-find-evidence', 'evidence'),
    edge('e9', 'w-trigger', 'query', 'w-find-evidence', 'query'),
    edge('e10', 'w-trigger', 'timeWindow', 'w-find-evidence', 'timeWindow'),
    edge('e11', 'w-trigger', 'question', 'w-build', 'question'),
    edge('e12', 'w-find-entities', 'records', 'w-build', 'entities'),
    edge('e13', 'w-find-claims', 'records', 'w-build', 'claims'),
    edge('e14', 'w-find-evidence', 'records', 'w-build', 'evidence'),
    edge('e15', 'w-trigger', 'concepts', 'w-build', 'concepts'),
    edge('e16', 'w-trigger', 'timeWindow', 'w-build', 'timeWindow'),
    edge('e17', 'w-build', 'workspace', 'w-output', 'workspace'),
  ];
  return diagram(
    'Сбор workspace',
    'find.claims/entities/evidence → workspace.build. Webhook.',
    widgets,
    edges,
  );
}

function knowledgeDocument() {
  const widgets = [
    trigger([
      { name: 'documentText', type: 'textarea', required: true },
      { name: 'docId', required: true },
      { name: 'collectionId', required: true },
      { name: 'observedAt' },
      { name: 'source' },
      { name: 'existingConcepts', type: 'textarea' },
      { name: 'existingClaims', type: 'textarea' },
      { name: 'subject' },
      { name: 'predicate' },
      { name: 'asOf' },
      { name: 'affectedIds', type: 'textarea' },
      { name: 'ontologyDecision', type: 'textarea' },
      { name: 'currentSchemaVersion', type: 'number' },
    ]),
    processCall(
      'w-call-interpret',
      'Интерпретация',
      'Интерпретация',
      [
        { name: 'documentText', type: 'textarea', required: true },
        { name: 'docId', required: true },
        { name: 'collectionId', required: true },
        { name: 'observedAt' },
        { name: 'source' },
      ],
      ['observations', 'evidence', 'evidenceId', 'duplicate', 'chunks'],
      X,
    ),
    processCall(
      'w-call-resolve',
      'Разрешение',
      'Разрешение',
      [
        { name: 'observations', type: 'textarea', required: true },
        { name: 'collectionId', required: true },
        { name: 'existingConcepts', type: 'textarea' },
        { name: 'existingClaims', type: 'textarea' },
      ],
      [
        'entityDecisions',
        'entities',
        'conceptDecision',
        'conceptId',
        'claimDecision',
      ],
      X * 2,
    ),
    processCall(
      'w-call-reconcile',
      'Сверка',
      'Сверка',
      [
        { name: 'claimDecision', type: 'textarea', required: true },
        { name: 'left', type: 'textarea' },
        { name: 'right', type: 'textarea' },
        { name: 'candidate', type: 'textarea' },
      ],
      ['branch', 'claimDecision', 'candidate', 'reviewItem'],
      X * 3,
    ),
    processCall(
      'w-call-commit',
      'Фиксация',
      'Фиксация',
      [
        { name: 'candidate', type: 'textarea', required: true },
        { name: 'decision', type: 'textarea', required: true },
        { name: 'branch', type: 'textarea' },
        { name: 'existing', type: 'textarea' },
        { name: 'source' },
        { name: 'assertedAt' },
        { name: 'ontologyDecision', type: 'textarea' },
        { name: 'evidenceId' },
        { name: 'currentSchemaVersion', type: 'number' },
      ],
      [
        'claim',
        'claimId',
        'status',
        'statusUpdates',
        'reused',
        'schemaVersion',
        'ontologyEntry',
      ],
      X * 4,
    ),
    processCall(
      'w-call-project',
      'Проекция',
      'Проекция',
      [
        { name: 'subject', required: true },
        { name: 'predicate', required: true },
        { name: 'claims', type: 'textarea', required: true },
        { name: 'asOf', required: true },
        { name: 'affectedIds', type: 'textarea' },
      ],
      ['derived', 'projection', 'requested', 'projected', 'skipped', 'ok'],
      X * 5,
    ),
    output(
      [
        { name: 'evidenceId' },
        { name: 'committedClaimIds', type: 'textarea' },
        { name: 'conflictIds', type: 'textarea' },
        { name: 'schemaVersion', type: 'number' },
        { name: 'claimId' },
        { name: 'branch', type: 'textarea' },
        { name: 'derived', type: 'textarea' },
      ],
      X * 6,
    ),
  ];
  const edges = [
    edge('e1', 'w-trigger', 'documentText', 'w-call-interpret', 'documentText'),
    edge('e2', 'w-trigger', 'docId', 'w-call-interpret', 'docId'),
    edge('e3', 'w-trigger', 'collectionId', 'w-call-interpret', 'collectionId'),
    edge('e4', 'w-trigger', 'observedAt', 'w-call-interpret', 'observedAt'),
    edge('e5', 'w-trigger', 'source', 'w-call-interpret', 'source'),
    edge('e6', 'w-call-interpret', 'observations', 'w-call-resolve', 'observations'),
    edge('e7', 'w-trigger', 'collectionId', 'w-call-resolve', 'collectionId'),
    edge('e8', 'w-trigger', 'existingConcepts', 'w-call-resolve', 'existingConcepts'),
    edge('e9', 'w-trigger', 'existingClaims', 'w-call-resolve', 'existingClaims'),
    edge('e10', 'w-call-resolve', 'claimDecision', 'w-call-reconcile', 'claimDecision'),
    edge('e11', 'w-call-reconcile', 'branch', 'w-call-commit', 'branch'),
    edge('e12', 'w-call-resolve', 'claimDecision', 'w-call-commit', 'decision'),
    edge('e13', 'w-trigger', 'existingClaims', 'w-call-commit', 'existing'),
    edge('e14', 'w-trigger', 'source', 'w-call-commit', 'source'),
    edge('e15', 'w-trigger', 'observedAt', 'w-call-commit', 'assertedAt'),
    edge('e16', 'w-call-interpret', 'evidenceId', 'w-call-commit', 'evidenceId'),
    edge('e17', 'w-trigger', 'ontologyDecision', 'w-call-commit', 'ontologyDecision'),
    edge('e18', 'w-trigger', 'currentSchemaVersion', 'w-call-commit', 'currentSchemaVersion'),
    edge('e19', 'w-trigger', 'subject', 'w-call-project', 'subject'),
    edge('e20', 'w-trigger', 'predicate', 'w-call-project', 'predicate'),
    edge('e21', 'w-trigger', 'existingClaims', 'w-call-project', 'claims'),
    edge('e22', 'w-trigger', 'asOf', 'w-call-project', 'asOf'),
    edge('e23', 'w-trigger', 'affectedIds', 'w-call-project', 'affectedIds'),
    // Output must not AND-join the claim pipeline: empty observations leave
    // resolve/reconcile/commit idle forever and process.call would return {}.
    edge('e24', 'w-call-interpret', 'evidenceId', 'w-output', 'evidenceId'),
    edge('e30', 'w-call-project', 'derived', 'w-output', 'derived'),
  ];
  return diagram(
    'Знание: документ',
    'Цепочка вызовов слоёв: Интерпретация → Разрешение → Сверка → Фиксация → Проекция. diagramId = __BIND__:<имя> — перепривязать после импорта.',
    widgets,
    edges,
  );
}

function knowledgeConflict() {
  const widgets = [
    trigger([
      { name: 'acceptedClaim', type: 'textarea', required: true },
      { name: 'candidate', type: 'textarea', required: true },
      { name: 'collectionId', required: true },
      { name: 'existingClaims', type: 'textarea' },
      { name: 'existingConcepts', type: 'textarea' },
      { name: 'observations', type: 'textarea' },
      { name: 'source' },
      { name: 'assertedAt' },
      { name: 'subject' },
      { name: 'predicate' },
      { name: 'asOf' },
      { name: 'affectedIds', type: 'textarea' },
      { name: 'ontologyDecision', type: 'textarea' },
      { name: 'evidenceId' },
      { name: 'currentSchemaVersion', type: 'number' },
    ]),
    processCall(
      'w-call-resolve',
      'Разрешение',
      'Разрешение',
      [
        { name: 'observations', type: 'textarea', required: true },
        { name: 'collectionId', required: true },
        { name: 'existingConcepts', type: 'textarea' },
        { name: 'existingClaims', type: 'textarea' },
        { name: 'claimCandidate', type: 'textarea' },
      ],
      [
        'entityDecisions',
        'entities',
        'conceptDecision',
        'conceptId',
        'claimDecision',
      ],
      X,
    ),
    processCall(
      'w-call-reconcile',
      'Сверка',
      'Сверка',
      [
        { name: 'claimDecision', type: 'textarea', required: true },
        { name: 'left', type: 'textarea' },
        { name: 'right', type: 'textarea' },
        { name: 'candidate', type: 'textarea' },
      ],
      ['branch', 'claimDecision', 'candidate', 'reviewItem'],
      X * 2,
    ),
    processCall(
      'w-call-commit',
      'Фиксация',
      'Фиксация',
      [
        { name: 'candidate', type: 'textarea', required: true },
        { name: 'decision', type: 'textarea', required: true },
        { name: 'branch', type: 'textarea' },
        { name: 'existing', type: 'textarea' },
        { name: 'source' },
        { name: 'assertedAt' },
        { name: 'ontologyDecision', type: 'textarea' },
        { name: 'evidenceId' },
        { name: 'currentSchemaVersion', type: 'number' },
      ],
      [
        'claim',
        'claimId',
        'status',
        'statusUpdates',
        'reused',
        'schemaVersion',
        'ontologyEntry',
      ],
      X * 3,
    ),
    processCall(
      'w-call-project',
      'Проекция',
      'Проекция',
      [
        { name: 'subject', required: true },
        { name: 'predicate', required: true },
        { name: 'claims', type: 'textarea', required: true },
        { name: 'asOf', required: true },
        { name: 'affectedIds', type: 'textarea' },
      ],
      ['derived', 'projection', 'requested', 'projected', 'skipped', 'ok'],
      X * 4,
    ),
    output(
      [
        { name: 'claimId' },
        { name: 'branch', type: 'textarea' },
        { name: 'conflictIds', type: 'textarea' },
        { name: 'schemaVersion', type: 'number' },
        { name: 'derived', type: 'textarea' },
      ],
      X * 5,
    ),
  ];
  const edges = [
    edge('e1', 'w-trigger', 'observations', 'w-call-resolve', 'observations'),
    edge('e2', 'w-trigger', 'collectionId', 'w-call-resolve', 'collectionId'),
    edge('e3', 'w-trigger', 'existingConcepts', 'w-call-resolve', 'existingConcepts'),
    edge('e4', 'w-trigger', 'existingClaims', 'w-call-resolve', 'existingClaims'),
    edge('e5', 'w-trigger', 'candidate', 'w-call-resolve', 'claimCandidate'),
    edge('e6', 'w-call-resolve', 'claimDecision', 'w-call-reconcile', 'claimDecision'),
    edge('e7', 'w-trigger', 'acceptedClaim', 'w-call-reconcile', 'left'),
    edge('e8', 'w-trigger', 'candidate', 'w-call-reconcile', 'candidate'),
    edge('e9', 'w-trigger', 'candidate', 'w-call-commit', 'candidate'),
    edge('e10', 'w-call-resolve', 'claimDecision', 'w-call-commit', 'decision'),
    edge('e11', 'w-call-reconcile', 'branch', 'w-call-commit', 'branch'),
    edge('e12', 'w-trigger', 'existingClaims', 'w-call-commit', 'existing'),
    edge('e13', 'w-trigger', 'source', 'w-call-commit', 'source'),
    edge('e14', 'w-trigger', 'assertedAt', 'w-call-commit', 'assertedAt'),
    edge('e15', 'w-trigger', 'ontologyDecision', 'w-call-commit', 'ontologyDecision'),
    edge('e16', 'w-trigger', 'evidenceId', 'w-call-commit', 'evidenceId'),
    edge('e17', 'w-trigger', 'currentSchemaVersion', 'w-call-commit', 'currentSchemaVersion'),
    edge('e18', 'w-trigger', 'subject', 'w-call-project', 'subject'),
    edge('e19', 'w-trigger', 'predicate', 'w-call-project', 'predicate'),
    edge('e20', 'w-trigger', 'existingClaims', 'w-call-project', 'claims'),
    edge('e21', 'w-trigger', 'asOf', 'w-call-project', 'asOf'),
    edge('e22', 'w-trigger', 'affectedIds', 'w-call-project', 'affectedIds'),
    edge('e23', 'w-call-commit', 'claimId', 'w-output', 'claimId'),
    edge('e24', 'w-call-reconcile', 'branch', 'w-output', 'branch'),
    edge('e25', 'w-call-reconcile', 'reviewItem', 'w-output', 'conflictIds'),
    edge('e26', 'w-call-commit', 'schemaVersion', 'w-output', 'schemaVersion'),
    edge('e27', 'w-call-project', 'derived', 'w-output', 'derived'),
  ];
  return diagram(
    'Знание: конфликт',
    'Поздний конфликт (190 vs 210): Разрешение → Сверка → Фиксация → Проекция. Без повторного разбора документа. __BIND__ после импорта.',
    widgets,
    edges,
  );
}

const READ_PROPOSE_TOOLS = JSON.stringify([
  {
    id: 'find_claims',
    description: 'Найти claims в каноне по субъекту/предикату/окну',
    nodeType: 'plugin.rag.find.claims',
  },
  {
    id: 'find_entities',
    description: 'Найти сущности',
    nodeType: 'plugin.rag.find.entities',
  },
  {
    id: 'find_evidence',
    description: 'Найти evidence',
    nodeType: 'plugin.rag.find.evidence',
  },
  {
    id: 'find_events',
    description: 'Найти события',
    nodeType: 'plugin.rag.find.events',
  },
  {
    id: 'inspect_history',
    description: 'История claim по субъекту и предикату',
    nodeType: 'plugin.rag.inspect.history',
  },
  {
    id: 'compare_periods',
    description: 'Сравнить claims в двух окнах',
    nodeType: 'plugin.rag.compare.periods',
  },
  {
    id: 'propose_claim',
    description: 'Предложить claim (не пишет S2)',
    nodeType: 'plugin.rag.propose.claim',
  },
  {
    id: 'propose_relation',
    description: 'Предложить relation (не пишет S2)',
    nodeType: 'plugin.rag.propose.relation',
  },
  {
    id: 'propose_concept',
    description: 'Предложить понятие (не пишет S2)',
    nodeType: 'plugin.rag.propose.concept',
  },
  {
    id: 'propose_alias',
    description: 'Предложить alias (не пишет S2)',
    nodeType: 'plugin.rag.propose.alias',
  },
]);

function answerProcess() {
  const widgets = [
    trigger([
      { name: 'question', type: 'textarea', required: true },
      { name: 'collectionId', required: true },
      { name: 'claims', type: 'textarea' },
      { name: 'entities', type: 'textarea' },
      { name: 'evidence', type: 'textarea' },
      { name: 'concepts', type: 'textarea' },
      { name: 'timeWindow', type: 'textarea' },
      { name: 'query' },
      { name: 'proposalCandidate', type: 'textarea' },
      { name: 'existingClaims', type: 'textarea' },
      { name: 'source' },
      { name: 'assertedAt' },
      { name: 'subject' },
      { name: 'predicate' },
      { name: 'asOf' },
      { name: 'affectedIds', type: 'textarea' },
      { name: 'ontologyDecision', type: 'textarea' },
      { name: 'evidenceId' },
      { name: 'currentSchemaVersion', type: 'number' },
    ]),
    processCall(
      'w-call-workspace',
      'Сбор workspace',
      'Сбор workspace',
      [
        { name: 'question', type: 'textarea', required: true },
        { name: 'collectionId', required: true },
        { name: 'claims', type: 'textarea' },
        { name: 'entities', type: 'textarea' },
        { name: 'evidence', type: 'textarea' },
        { name: 'concepts', type: 'textarea' },
        { name: 'timeWindow', type: 'textarea' },
        { name: 'query' },
      ],
      ['workspace'],
      X,
    ),
    widget(
      'w-loop',
      'Agent loop',
      'system.loop',
      'Loop',
      [
        port('items', 'keyvalue', { isPrimary: true }),
        staticField('maxIterations', 'number', 6),
      ],
      ['items'],
      X * 2,
    ),
    widget(
      'w-turn',
      'Agent turn',
      'plugin.rag.agent.turn',
      'RAG: ход агента',
      [
        port('userPrompt', 'textarea', { isPrimary: true, isRequired: true }),
        port('history', 'textarea'),
        port('observations', 'textarea'),
        {
          name: 'tools',
          type: 'textarea',
          isPort: false,
          canBePort: true,
          static: true,
          defaultValue: READ_PROPOSE_TOOLS,
        },
        staticField(
          'skills',
          'textarea',
          '[{"id":"knowledge","body":"Use only find.* to read canon and propose.* to suggest changes. Do not write S2 directly."}]',
        ),
        staticField('maxActions', 'number', 4),
        staticField('queryTool', 'string', 'find_claims'),
      ],
      [
        'op',
        'query',
        'args',
        'actions',
        'answer',
        'observations',
        'metrics',
        'history',
      ],
      X * 2,
      200,
    ),
    widget(
      'w-find-claims',
      'Find claims',
      'plugin.rag.find.claims',
      'RAG: найти claims',
      [
        port('collectionId'),
        port('claims', 'textarea', { isPrimary: true }),
        port('query'),
        staticField('limit', 'number', 50),
      ],
      ['records', 'evidenceIds'],
      X * 3,
      40,
    ),
    widget(
      'w-propose-claim',
      'Propose claim',
      'plugin.rag.propose.claim',
      'RAG: предложить claim',
      [
        port('subject', 'string', { isPrimary: true }),
        port('predicate'),
        port('object'),
        port('evidenceId'),
        port('span'),
        port('validFrom'),
        port('validTo'),
      ],
      ['proposal'],
      X * 3,
      200,
    ),
    widget(
      'w-synth',
      'Synthesize',
      'plugin.rag.synthesize',
      'RAG: синтез ответа',
      [
        port('message', 'textarea', { isPrimary: true, isRequired: true }),
        port('observations', 'textarea'),
      ],
      ['answer'],
      X * 4,
    ),
    widget(
      'w-safe',
      'Safety',
      'plugin.rag.safety',
      'RAG: safety',
      [port('answer', 'textarea', { isPrimary: true, isRequired: true })],
      ['answer', 'blocked'],
      X * 5,
    ),
    processCall(
      'w-call-reconcile',
      'Сверка (proposal)',
      'Сверка',
      [
        { name: 'claimDecision', type: 'textarea', required: true },
        { name: 'candidate', type: 'textarea' },
        { name: 'left', type: 'textarea' },
        { name: 'right', type: 'textarea' },
      ],
      ['branch', 'claimDecision', 'candidate', 'reviewItem'],
      X * 4,
      280,
    ),
    processCall(
      'w-call-commit',
      'Фиксация (proposal)',
      'Фиксация',
      [
        { name: 'candidate', type: 'textarea', required: true },
        { name: 'decision', type: 'textarea', required: true },
        { name: 'branch', type: 'textarea' },
        { name: 'existing', type: 'textarea' },
        { name: 'source' },
        { name: 'assertedAt' },
        { name: 'ontologyDecision', type: 'textarea' },
        { name: 'evidenceId' },
        { name: 'currentSchemaVersion', type: 'number' },
      ],
      [
        'claim',
        'claimId',
        'status',
        'statusUpdates',
        'reused',
        'schemaVersion',
        'ontologyEntry',
      ],
      X * 5,
      280,
    ),
    processCall(
      'w-call-project',
      'Проекция (proposal)',
      'Проекция',
      [
        { name: 'subject', required: true },
        { name: 'predicate', required: true },
        { name: 'claims', type: 'textarea', required: true },
        { name: 'asOf', required: true },
        { name: 'affectedIds', type: 'textarea' },
      ],
      ['derived', 'projection', 'requested', 'projected', 'skipped', 'ok'],
      X * 6,
      280,
    ),
    output(
      [
        { name: 'answer', type: 'textarea' },
        { name: 'workspace', type: 'textarea' },
        { name: 'proposal', type: 'textarea' },
        { name: 'blocked', type: 'boolean' },
      ],
      X * 6,
    ),
  ];
  // Nest turn/find/propose inside loop body for canvas fidelity (flat edges also keep import simple)
  const edges = [
    edge('e1', 'w-trigger', 'question', 'w-call-workspace', 'question'),
    edge('e2', 'w-trigger', 'collectionId', 'w-call-workspace', 'collectionId'),
    edge('e3', 'w-trigger', 'claims', 'w-call-workspace', 'claims'),
    edge('e4', 'w-trigger', 'entities', 'w-call-workspace', 'entities'),
    edge('e5', 'w-trigger', 'evidence', 'w-call-workspace', 'evidence'),
    edge('e6', 'w-trigger', 'concepts', 'w-call-workspace', 'concepts'),
    edge('e7', 'w-trigger', 'timeWindow', 'w-call-workspace', 'timeWindow'),
    edge('e8', 'w-trigger', 'query', 'w-call-workspace', 'query'),
    edge('e9', 'w-call-workspace', 'workspace', 'w-loop', 'items'),
    edge('e10', 'w-trigger', 'question', 'w-turn', 'userPrompt'),
    edge('e11', 'w-call-workspace', 'workspace', 'w-turn', 'observations'),
    edge('e12', 'w-trigger', 'collectionId', 'w-find-claims', 'collectionId'),
    edge('e13', 'w-trigger', 'claims', 'w-find-claims', 'claims'),
    edge('e14', 'w-turn', 'query', 'w-find-claims', 'query'),
    edge('e15', 'w-turn', 'answer', 'w-synth', 'message'),
    edge('e16', 'w-turn', 'observations', 'w-synth', 'observations'),
    edge('e17', 'w-synth', 'answer', 'w-safe', 'answer'),
    edge('e18', 'w-safe', 'answer', 'w-output', 'answer'),
    edge('e19', 'w-call-workspace', 'workspace', 'w-output', 'workspace'),
    edge('e20', 'w-propose-claim', 'proposal', 'w-output', 'proposal'),
    edge('e21', 'w-safe', 'blocked', 'w-output', 'blocked'),
    edge('e22', 'w-trigger', 'proposalCandidate', 'w-call-reconcile', 'candidate'),
    edge('e23', 'w-trigger', 'proposalCandidate', 'w-call-commit', 'candidate'),
    edge('e24', 'w-call-reconcile', 'claimDecision', 'w-call-commit', 'decision'),
    edge('e25', 'w-call-reconcile', 'branch', 'w-call-commit', 'branch'),
    edge('e26', 'w-trigger', 'existingClaims', 'w-call-commit', 'existing'),
    edge('e27', 'w-trigger', 'source', 'w-call-commit', 'source'),
    edge('e28', 'w-trigger', 'assertedAt', 'w-call-commit', 'assertedAt'),
    edge('e29', 'w-trigger', 'subject', 'w-call-project', 'subject'),
    edge('e30', 'w-trigger', 'predicate', 'w-call-project', 'predicate'),
    edge('e31', 'w-trigger', 'existingClaims', 'w-call-project', 'claims'),
    edge('e32', 'w-trigger', 'asOf', 'w-call-project', 'asOf'),
    edge('e33', 'w-trigger', 'affectedIds', 'w-call-project', 'affectedIds'),
  ];
  return diagram(
    'Ответ',
    'Сбор workspace → loop/agent.turn (только find.* + propose.*) → synthesize → safety. Proposal может уйти в Сверку/Фиксацию/Проекцию. __BIND__ после импорта. Не затрагивает RAG: чат.',
    widgets,
    edges,
  );
}

function transferProcess() {
  const widgets = [
    trigger([
      { name: 'candidate', type: 'textarea', required: true },
      { name: 'existing', type: 'textarea' },
      { name: 'source' },
      { name: 'assertedAt' },
      { name: 'collectionId' },
    ]),
    widget(
      'w-decision',
      'Accepted decision',
      'system.control.constant',
      'Constant',
      [
        staticField(
          'value',
          'textarea',
          '{"kind":"new"}',
          { isPrimary: true },
        ),
      ],
      ['value'],
      X,
    ),
    widget(
      'w-commit',
      'Claim commit',
      'plugin.rag.claim.commit',
      'RAG: зафиксировать claim',
      [
        port('candidate', 'textarea', { isPrimary: true, isRequired: true }),
        port('decision', 'textarea', { isRequired: true }),
        port('existing', 'textarea'),
        port('source'),
        port('assertedAt'),
        port('collectionId'),
      ],
      ['claim', 'statusUpdates', 'reused'],
      X * 2,
    ),
    output(
      [
        { name: 'claim', type: 'textarea' },
        { name: 'statusUpdates', type: 'textarea' },
        { name: 'reused', type: 'boolean' },
      ],
      X * 3,
    ),
  ];
  const edges = [
    edge('e1', 'w-trigger', 'candidate', 'w-commit', 'candidate'),
    edge('e2', 'w-decision', 'value', 'w-commit', 'decision'),
    edge('e3', 'w-trigger', 'existing', 'w-commit', 'existing'),
    edge('e4', 'w-trigger', 'source', 'w-commit', 'source'),
    edge('e5', 'w-trigger', 'assertedAt', 'w-commit', 'assertedAt'),
    edge('e6', 'w-trigger', 'collectionId', 'w-commit', 'collectionId'),
    edge('e7', 'w-commit', 'claim', 'w-output', 'claim'),
    edge('e8', 'w-commit', 'statusUpdates', 'w-output', 'statusUpdates'),
    edge('e9', 'w-commit', 'reused', 'w-output', 'reused'),
  ];
  return diagram(
    'Знание: перенос',
    'Ручной перенос RagEntity/RAG_REL → claim.commit (accepted). Повтор узнаёт перенесённые id. Webhook.',
    widgets,
    edges,
  );
}

function pdfIntake() {
  const widgets = [
    trigger([
      { name: 'pdfUrl', required: true },
      { name: 'docId', required: true },
      { name: 'collectionId', required: true },
      { name: 'observedAt' },
      { name: 'source' },
      { name: 'documentText', type: 'textarea' },
    ]),
    widget(
      'w-http',
      'GET PDF URL',
      'data.http.call',
      'HTTP Call',
      [
        port('url', 'string', { isPrimary: true, isRequired: true }),
        staticField('method', 'string', 'GET'),
      ],
      ['response', 'status', 'statusCode'],
      X,
    ),
    widget(
      'w-text-fb',
      'Text',
      'system.string.fallback',
      'String: fallback',
      [
        port('primary', 'textarea', { isPrimary: true }),
        port('fallback', 'textarea'),
      ],
      ['string'],
      X * 2,
    ),
    processCall(
      'w-call-doc',
      'Знание: документ',
      'Знание: документ',
      [
        { name: 'documentText', type: 'textarea', required: true },
        { name: 'docId', required: true },
        { name: 'collectionId', required: true },
        { name: 'observedAt' },
        { name: 'source' },
      ],
      [
        'evidenceId',
        'committedClaimIds',
        'conflictIds',
        'schemaVersion',
        'claimId',
        'branch',
        'derived',
      ],
      X * 3,
    ),
    output(
      [
        ...intakeOutputFields(),
        { name: 'evidenceId' },
        { name: 'committedClaimIds', type: 'textarea' },
        { name: 'conflictIds', type: 'textarea' },
      ],
      X * 4,
    ),
  ];
  const edges = [
    edge('e1', 'w-trigger', 'pdfUrl', 'w-http', 'url'),
    edge('e2', 'w-trigger', 'documentText', 'w-text-fb', 'primary'),
    edge('e3', 'w-http', 'response', 'w-text-fb', 'fallback'),
    edge('e4', 'w-text-fb', 'string', 'w-output', 'documentText'),
    edge('e5', 'w-trigger', 'docId', 'w-output', 'docId'),
    edge('e6', 'w-trigger', 'collectionId', 'w-output', 'collectionId'),
    edge('e7', 'w-trigger', 'observedAt', 'w-output', 'observedAt'),
    edge('e8', 'w-trigger', 'source', 'w-output', 'source'),
    edge('e9', 'w-text-fb', 'string', 'w-call-doc', 'documentText'),
    edge('e10', 'w-trigger', 'docId', 'w-call-doc', 'docId'),
    edge('e11', 'w-trigger', 'collectionId', 'w-call-doc', 'collectionId'),
    edge('e12', 'w-trigger', 'observedAt', 'w-call-doc', 'observedAt'),
    edge('e13', 'w-trigger', 'source', 'w-call-doc', 'source'),
    edge('e14', 'w-call-doc', 'evidenceId', 'w-output', 'evidenceId'),
    edge('e15', 'w-call-doc', 'committedClaimIds', 'w-output', 'committedClaimIds'),
    edge('e16', 'w-call-doc', 'conflictIds', 'w-output', 'conflictIds'),
  ];
  return diagram(
    'Разбор PDF',
    'Вход: pdfUrl (+ опционально готовый documentText от клиента). GET URL → текст → контракт для «Знание: документ». Бинарный PDF без серверного экстрактора — blocker (см. BINDING). Webhook.',
    widgets,
    edges,
  );
}

function docIntake() {
  const widgets = [
    trigger([
      { name: 'docUrl' },
      { name: 'path' },
      { name: 'docId', required: true },
      { name: 'collectionId', required: true },
      { name: 'observedAt' },
      { name: 'source' },
      { name: 'documentText', type: 'textarea' },
    ]),
    widget(
      'w-docx',
      'DOCX extract',
      'system.office.docx.extractText',
      'Office: docx extract text',
      [port('path', 'string', { isPrimary: true }), staticField('basePath', 'string', '')],
      ['text'],
      X,
    ),
    widget(
      'w-http',
      'GET DOC URL',
      'data.http.call',
      'HTTP Call',
      [
        port('url', 'string', { isPrimary: true }),
        staticField('method', 'string', 'GET'),
      ],
      ['response', 'status', 'statusCode'],
      X,
      200,
    ),
    widget(
      'w-text-fb',
      'Text',
      'system.string.fallback',
      'String: fallback',
      [
        port('primary', 'textarea', { isPrimary: true }),
        port('fallback', 'textarea'),
      ],
      ['string'],
      X * 2,
    ),
    widget(
      'w-text-fb2',
      'Text 2',
      'system.string.fallback',
      'String: fallback',
      [
        port('primary', 'textarea', { isPrimary: true }),
        port('fallback', 'textarea'),
      ],
      ['string'],
      X * 3,
    ),
    processCall(
      'w-call-doc',
      'Знание: документ',
      'Знание: документ',
      [
        { name: 'documentText', type: 'textarea', required: true },
        { name: 'docId', required: true },
        { name: 'collectionId', required: true },
        { name: 'observedAt' },
        { name: 'source' },
      ],
      [
        'evidenceId',
        'committedClaimIds',
        'conflictIds',
        'schemaVersion',
        'claimId',
        'branch',
        'derived',
      ],
      X * 4,
    ),
    output(
      [
        ...intakeOutputFields(),
        { name: 'evidenceId' },
        { name: 'committedClaimIds', type: 'textarea' },
        { name: 'conflictIds', type: 'textarea' },
      ],
      X * 5,
    ),
  ];

  const edges = [
    edge('e1', 'w-trigger', 'path', 'w-docx', 'path'),
    edge('e2', 'w-trigger', 'docUrl', 'w-http', 'url'),
    edge('e3', 'w-docx', 'text', 'w-text-fb', 'primary'),
    edge('e4', 'w-trigger', 'documentText', 'w-text-fb', 'fallback'),
    edge('e5', 'w-text-fb', 'string', 'w-text-fb2', 'primary'),
    edge('e6', 'w-http', 'response', 'w-text-fb2', 'fallback'),
    edge('e7', 'w-text-fb2', 'string', 'w-output', 'documentText'),
    edge('e8', 'w-trigger', 'docId', 'w-output', 'docId'),
    edge('e9', 'w-trigger', 'collectionId', 'w-output', 'collectionId'),
    edge('e10', 'w-trigger', 'observedAt', 'w-output', 'observedAt'),
    edge('e11', 'w-trigger', 'source', 'w-output', 'source'),
    edge('e12', 'w-text-fb2', 'string', 'w-call-doc', 'documentText'),
    edge('e13', 'w-trigger', 'docId', 'w-call-doc', 'docId'),
    edge('e14', 'w-trigger', 'collectionId', 'w-call-doc', 'collectionId'),
    edge('e15', 'w-trigger', 'observedAt', 'w-call-doc', 'observedAt'),
    edge('e16', 'w-trigger', 'source', 'w-call-doc', 'source'),
    edge('e17', 'w-call-doc', 'evidenceId', 'w-output', 'evidenceId'),
    edge('e18', 'w-call-doc', 'committedClaimIds', 'w-output', 'committedClaimIds'),
    edge('e19', 'w-call-doc', 'conflictIds', 'w-output', 'conflictIds'),
  ];
  return diagram(
    'Разбор DOC',
    'path (.docx) → office.docx.extractText; иначе documentText; иначе GET docUrl. Контракт для «Знание: документ». Legacy .doc без mammoth — blocker. Webhook.',
    widgets,
    edges,
  );
}

function excelIntake() {
  const widgets = [
    trigger([
      { name: 'path', required: true },
      { name: 'docId', required: true },
      { name: 'collectionId', required: true },
      { name: 'observedAt' },
      { name: 'source' },
    ]),
    widget(
      'w-xlsx',
      'XLSX read',
      'system.office.xlsx.read',
      'Office: xlsx read',
      [
        port('path', 'string', { isPrimary: true, isRequired: true }),
        staticField('sheetName', 'string', ''),
        staticField('basePath', 'string', ''),
      ],
      ['rows', 'sheetNames'],
      X,
    ),
    widget(
      'w-json',
      'Rows JSON',
      'system.json.stringify',
      'JSON: stringify',
      [port('source', 'keyvalue', { isPrimary: true })],
      ['string'],
      X * 2,
    ),
    processCall(
      'w-call-doc',
      'Знание: документ',
      'Знание: документ',
      [
        { name: 'documentText', type: 'textarea', required: true },
        { name: 'docId', required: true },
        { name: 'collectionId', required: true },
        { name: 'observedAt' },
        { name: 'source' },
      ],
      [
        'evidenceId',
        'committedClaimIds',
        'conflictIds',
        'schemaVersion',
        'claimId',
        'branch',
        'derived',
      ],
      X * 3,
    ),
    output(
      [
        ...intakeOutputFields(),
        { name: 'evidenceId' },
        { name: 'committedClaimIds', type: 'textarea' },
        { name: 'conflictIds', type: 'textarea' },
      ],
      X * 4,
    ),
  ];
  const edges = [
    edge('e1', 'w-trigger', 'path', 'w-xlsx', 'path'),
    edge('e2', 'w-xlsx', 'rows', 'w-json', 'source'),
    edge('e3', 'w-json', 'string', 'w-output', 'documentText'),
    edge('e4', 'w-trigger', 'docId', 'w-output', 'docId'),
    edge('e5', 'w-trigger', 'collectionId', 'w-output', 'collectionId'),
    edge('e6', 'w-trigger', 'observedAt', 'w-output', 'observedAt'),
    edge('e7', 'w-trigger', 'source', 'w-output', 'source'),
    edge('e8', 'w-json', 'string', 'w-call-doc', 'documentText'),
    edge('e9', 'w-trigger', 'docId', 'w-call-doc', 'docId'),
    edge('e10', 'w-trigger', 'collectionId', 'w-call-doc', 'collectionId'),
    edge('e11', 'w-trigger', 'observedAt', 'w-call-doc', 'observedAt'),
    edge('e12', 'w-trigger', 'source', 'w-call-doc', 'source'),
    edge('e13', 'w-call-doc', 'evidenceId', 'w-output', 'evidenceId'),
    edge('e14', 'w-call-doc', 'committedClaimIds', 'w-output', 'committedClaimIds'),
    edge('e15', 'w-call-doc', 'conflictIds', 'w-output', 'conflictIds'),
  ];
  return diagram(
    'Разбор Excel',
    'Загрузка .xlsx: office.xlsx.read → JSON-текст → контракт для «Знание: документ». Webhook.',
    widgets,
    edges,
  );
}

function arxivIntake() {
  const widgets = [
    trigger([
      { name: 'htmlUrl', required: true },
      { name: 'docId', required: true },
      { name: 'collectionId', required: true },
      { name: 'observedAt' },
      { name: 'source' },
    ]),
    widget(
      'w-html',
      'HTML body',
      'system.http.html.extractXpath',
      'HTTP HTML: XPath',
      [
        port('url', 'string', { isPrimary: true, isRequired: true }),
        staticField(
          'xpath',
          'string',
          "//*[@id='abs']//blockquote[contains(@class,'abstract')]",
        ),
        staticField('extractMode', 'string', 'text'),
      ],
      ['value'],
      X,
      -80,
    ),
    widget(
      'w-join',
      'Join HTML text',
      'system.string.join',
      'String: объединить',
      [
        port('items', 'keyvalue', { isPrimary: true }),
        staticField('separator', 'string', '\n'),
      ],
      ['string'],
      X * 2,
      -80,
    ),
    processCall(
      'w-call-html-doc',
      'Знание: документ (HTML)',
      'Знание: документ',
      [
        { name: 'documentText', type: 'textarea', required: true },
        { name: 'docId', required: true },
        { name: 'collectionId', required: true },
        { name: 'observedAt' },
        { name: 'source' },
      ],
      [
        'evidenceId',
        'committedClaimIds',
        'conflictIds',
        'schemaVersion',
        'claimId',
        'branch',
        'derived',
      ],
      X * 3,
      -80,
    ),
    output(
      [
        ...intakeOutputFields(),
        { name: 'htmlEvidenceId' },
        { name: 'committedClaimIds', type: 'textarea' },
        { name: 'conflictIds', type: 'textarea' },
      ],
      X * 4,
    ),
  ];
  const edges = [
    edge('e1', 'w-trigger', 'htmlUrl', 'w-html', 'url'),
    edge('e3', 'w-html', 'value', 'w-join', 'items'),
    edge('e7', 'w-join', 'string', 'w-call-html-doc', 'documentText'),
    edge('e8', 'w-trigger', 'docId', 'w-call-html-doc', 'docId'),
    edge('e9', 'w-trigger', 'collectionId', 'w-call-html-doc', 'collectionId'),
    edge('e10', 'w-trigger', 'observedAt', 'w-call-html-doc', 'observedAt'),
    edge('e11', 'w-trigger', 'source', 'w-call-html-doc', 'source'),
    edge('e17', 'w-join', 'string', 'w-output', 'documentText'),
    edge('e18', 'w-trigger', 'docId', 'w-output', 'docId'),
    edge('e19', 'w-trigger', 'collectionId', 'w-output', 'collectionId'),
    edge('e20', 'w-trigger', 'observedAt', 'w-output', 'observedAt'),
    edge('e21', 'w-trigger', 'source', 'w-output', 'source'),
    edge('e22', 'w-call-html-doc', 'evidenceId', 'w-output', 'htmlEvidenceId'),
  ];
  return diagram(
    'Приём arXiv',
    'Прямой GET abs HTML (без arXiv API) → abstract xpath → «Знание: документ». Отдельный PDF — процесс «Разбор PDF». Webhook. __BIND__ после импорта.',
    widgets,
    edges,
  );
}

const preset = {
  id: 'rag-knowledge',
  version: 1,
  pluginId: 'rag',
  metadata: {
    name: 'RAG Knowledge',
    description:
      'Knowledge engine: слои (Интерпретация…Сбор workspace), пайплайны (документ/конфликт/ответ/перенос), приём (PDF/DOC/Excel/arXiv). После импорта перепривяжите system.process.call: diagramId __BIND__:<имя процесса> → реальный id процесса с тем же settings.name. См. plugins/rag/presets/rag-knowledge-BINDING.md',
  },
  diagrams: [
    interpretLayer(),
    resolveLayer(),
    reconcileLayer(),
    commitLayer(),
    projectLayer(),
    workspaceLayer(),
    knowledgeDocument(),
    knowledgeConflict(),
    answerProcess(),
    transferProcess(),
    pdfIntake(),
    docIntake(),
    excelIntake(),
    arxivIntake(),
  ],
};

const outJson = path.join(__dirname, 'rag-knowledge.json');
fs.writeFileSync(outJson, JSON.stringify(preset, null, 2) + '\n');
console.log(
  `Wrote ${outJson} (${preset.diagrams.length} diagrams, ${fs.statSync(outJson).size} bytes)`,
);
