/**
 * Doc pack → Gherkin scenarios → ontology → entity/relation graph → chunk links.
 *
 *   tsx scripts/kg-chain-autoschool.ts
 *
 * Input: .rag-smoke-data/autoschool-packs/<school>/text/*.txt
 * Output: .rag-smoke-data/kg-chain-<run>/…
 */
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  existsSync,
} from 'fs';
import { join, basename } from 'path';
import { RagExtractExecutor } from '../src/extract/executor';
import { RagChunkExecutor } from '../src/chunk/executor';
import { RagOntologyMergeExecutor } from '../src/ontology/merge/executor';
import { RagEntityExtractExecutor } from '../src/entity/extract/executor';
import { RagEntityResolveExecutor } from '../src/entity/resolve/executor';
import { RagRelationExtractExecutor } from '../src/relation/extract/executor';
import { RagIndexWriteExecutor } from '../src/corpus-index/write/executor';
import { OpenAiCompatibleLlmJson } from '../src/adapters/openai-llm-json';
import type { ExecContext } from '@kosolapus/plugin-ts-sdk';
import {
  emptySchema,
  type CanonicalEntity,
  type EntityMention,
  type EntityRelation,
  type OntologySchema,
  type RagChunk,
} from '../src/contracts/types';

const API_KEY = process.env.OLLAMA_API_KEY || 'ollama';
const RUN_ID = `kg_chain_${Date.now()}`;
const PACKS_ROOT = join(
  __dirname,
  '../.rag-smoke-data/autoschool-packs',
);
/** Prefer schools with extracted text; override via SCHOOLS=a,b */
const SCHOOLS = (
  process.env.SCHOOLS || 'avtoshkola1,voditel,prof'
).split(',');
const MAX_DOCS_PER_SCHOOL = Number(process.env.MAX_DOCS || '12');
const GHERKIN_CHARS = Number(process.env.GHERKIN_CHARS || '9000');

type Actor = { id: string; role: string; description?: string };
type Scenario = {
  name: string;
  given: string[];
  when: string[];
  then: string[];
  relations?: Array<{ type: string; from: string; to: string }>;
};
type DocScenario = {
  schoolId: string;
  docId: string;
  title: string;
  feature: string;
  actors: Actor[];
  scenarios: Scenario[];
  gherkinText: string;
};

function ctx<I>(inputs: I): ExecContext<I> {
  return {
    runId: RUN_ID,
    inputs,
    outputs: [],
    logger: {
      debug: () => undefined,
      info: () => undefined,
      error: (...a: unknown[]) => console.error('[error]', ...a),
    },
  };
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 64);
}

function asStringList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  if (typeof v === 'string' && v.trim()) return [v.trim()];
  return [];
}

function toGherkinText(doc: DocScenario): string {
  const lines = [`Feature: ${doc.feature}`, ''];
  lines.push('# Actors:');
  for (const a of doc.actors) {
    lines.push(`# - ${a.id}: ${a.role}${a.description ? ` — ${a.description}` : ''}`);
  }
  lines.push('');
  for (const sc of doc.scenarios) {
    lines.push(`  Scenario: ${sc.name}`);
    for (const g of sc.given) lines.push(`    Given ${g}`);
    for (const w of sc.when) lines.push(`    When ${w}`);
    for (const t of sc.then) lines.push(`    Then ${t}`);
    lines.push('');
  }
  return lines.join('\n');
}

const BOOTSTRAP_SCHEMA: OntologySchema = {
  version: 1,
  entityTypes: [
    { id: 'EducationalOrg', description: 'Автошкола / образовательная организация', identity: ['name'] },
    { id: 'Learner', description: 'Обучающийся / курсант / слушатель', identity: ['role'] },
    { id: 'Instructor', description: 'Преподаватель / мастер производственного обучения', identity: ['role'] },
    { id: 'Director', description: 'Директор / руководитель', identity: ['role'] },
    { id: 'Parent', description: 'Родитель / законный представитель', identity: ['role'] },
    { id: 'Commission', description: 'Комиссия (экзаменационная, апелляционная, конфликтная)', identity: ['name'] },
    { id: 'Document', description: 'Локальный акт / договор / свидетельство', identity: ['title'] },
    { id: 'Program', description: 'Образовательная программа / учебный план', identity: ['title'] },
    { id: 'Exam', description: 'Экзамен / аттестация / зачёт', identity: ['name'] },
    { id: 'DrivingLesson', description: 'Занятие по вождению / практика', identity: ['kind'] },
    { id: 'Facility', description: 'Площадка / автодром / кабинет', identity: ['name'] },
    { id: 'Payment', description: 'Оплата / стоимость обучения', identity: ['kind'] },
  ],
  relationTypes: [
    { id: 'enrolls_in', from: ['Learner'], to: ['EducationalOrg', 'Program'] },
    { id: 'employs', from: ['EducationalOrg'], to: ['Instructor', 'Director'] },
    { id: 'teaches', from: ['Instructor'], to: ['Learner', 'Program'] },
    { id: 'governs', from: ['Document'], to: ['Learner', 'Instructor', 'EducationalOrg'] },
    { id: 'requires', from: ['Program', 'Exam'], to: ['Document', 'Payment'] },
    { id: 'conducts', from: ['Commission', 'Instructor'], to: ['Exam'] },
    { id: 'takes_place_at', from: ['DrivingLesson', 'Exam'], to: ['Facility'] },
    { id: 'expels', from: ['EducationalOrg', 'Director'], to: ['Learner'] },
    { id: 'restores', from: ['EducationalOrg'], to: ['Learner'] },
    { id: 'represents', from: ['Parent'], to: ['Learner'] },
  ],
};

async function docToScenario(
  llm: OpenAiCompatibleLlmJson,
  schoolId: string,
  docId: string,
  title: string,
  text: string,
): Promise<DocScenario> {
  const sample = text.slice(0, GHERKIN_CHARS);
  const payload = await llm.completeJson<{
    feature?: string;
    actors?: Actor[];
    scenarios?: Scenario[];
  }>({
    apiKey: API_KEY,
    systemPrompt: `You analyze Russian driving-school normative documents.
Return JSON only:
{"feature":"short feature title",
 "actors":[{"id":"snake_case","role":"Russian role","description":"..."}],
 "scenarios":[{"name":"...","given":["..."],"when":["..."],"then":["..."],
   "relations":[{"type":"snake_case","from":"actorId","to":"actorId_or_concept"}]}]}
Rules: 2-5 actors, 2-4 scenarios covering the main lifecycle in THIS document.
Actor ids: snake_case Latin. Prefer roles: learner, school, instructor, director, parent, commission.
Relations describe obligations/actions between actors (enrolls_in, expels, conducts, teaches, pays, issues_certificate, appeals, ...).
Write Given/When/Then in Russian, concise, factual from the document.`,
    userPrompt: JSON.stringify({ schoolId, docId, title, documentExcerpt: sample }),
  });

  const actors = Array.isArray(payload.actors) ? payload.actors.slice(0, 6) : [];
  const scenarios = (Array.isArray(payload.scenarios) ? payload.scenarios : [])
    .slice(0, 5)
    .map((sc) => ({
      name: String(sc?.name ?? 'scenario'),
      given: asStringList(sc?.given),
      when: asStringList(sc?.when),
      then: asStringList(sc?.then),
      relations: Array.isArray(sc?.relations) ? sc.relations : [],
    }));
  const feature = payload.feature || title;
  const doc: DocScenario = {
    schoolId,
    docId,
    title,
    feature,
    actors,
    scenarios,
    gherkinText: '',
  };
  doc.gherkinText = toGherkinText(doc);
  return doc;
}

function ontologyFromScenarios(docs: DocScenario[]): OntologySchema {
  const entityMap = new Map(
    BOOTSTRAP_SCHEMA.entityTypes.map((t) => [t.id, { ...t }]),
  );
  const relationMap = new Map(
    BOOTSTRAP_SCHEMA.relationTypes.map((t) => [t.id, { ...t }]),
  );

  const roleToType: Record<string, string> = {
    learner: 'Learner',
    student: 'Learner',
    kursant: 'Learner',
    trainee: 'Learner',
    school: 'EducationalOrg',
    org: 'EducationalOrg',
    instructor: 'Instructor',
    teacher: 'Instructor',
    master: 'Instructor',
    director: 'Director',
    parent: 'Parent',
    commission: 'Commission',
    exam_commission: 'Commission',
  };

  for (const d of docs) {
    for (const a of d.actors) {
      const mapped =
        roleToType[a.id] ||
        roleToType[slug(a.role)] ||
        (entityMap.has(a.id) ? a.id : null);
      if (mapped && entityMap.has(mapped)) continue;
      const id = mapped && /^[A-Z]/.test(mapped)
        ? mapped
        : a.id
            .split('_')
            .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
            .join('')
            .replace(/[^A-Za-z0-9]/g, '')
            .slice(0, 40) || 'Actor';
      if (!entityMap.has(id)) {
        entityMap.set(id, {
          id,
          description: a.description || a.role,
          identity: ['name', 'role'],
        });
      }
    }
    for (const sc of d.scenarios) {
      for (const rel of sc.relations ?? []) {
        const id = slug(rel.type).replace(/[^a-z0-9_]/gi, '_') || 'related_to';
        if (!relationMap.has(id)) {
          relationMap.set(id, {
            id,
            from: ['Learner', 'EducationalOrg', 'Instructor', 'Director', 'Commission', 'Document'],
            to: ['Learner', 'EducationalOrg', 'Program', 'Exam', 'Facility', 'Document', 'Payment'],
            description: `from scenario ${sc.name}`,
          });
        }
      }
    }
    // document itself
    if (!entityMap.has('Document')) {
      entityMap.set('Document', {
        id: 'Document',
        description: 'Нормативный документ',
        identity: ['title'],
      });
    }
  }

  return {
    version: 1,
    entityTypes: [...entityMap.values()],
    relationTypes: [...relationMap.values()],
  };
}

function loadSchoolDocs(schoolId: string): Array<{
  schoolId: string;
  docId: string;
  title: string;
  text: string;
}> {
  const textDir = join(PACKS_ROOT, schoolId, 'text');
  if (!existsSync(textDir)) return [];
  const files = readdirSync(textDir)
    .filter((f) => f.endsWith('.txt'))
    .map((f) => {
      const text = readFileSync(join(textDir, f), 'utf8');
      return {
        schoolId,
        docId: `${schoolId}__${basename(f, '.txt')}`.replace(/[^\w.\-а-яА-ЯёЁ]+/gi, '_').slice(0, 96),
        title: basename(f, '.txt'),
        text,
      };
    })
    .filter((d) => d.text.trim().length > 400)
    .sort((a, b) => b.text.length - a.text.length)
    .slice(0, MAX_DOCS_PER_SCHOOL);
  return files;
}

async function main() {
  const outRoot = join(__dirname, '../.rag-smoke-data', RUN_ID);
  const scenariosDir = join(outRoot, 'scenarios');
  mkdirSync(scenariosDir, { recursive: true });

  process.env.EMBEDDING_BASE_URL =
    process.env.EMBEDDING_BASE_URL || 'http://127.0.0.1:11434/v1';
  process.env.EMBEDDING_MODEL =
    process.env.EMBEDDING_MODEL || 'embeddinggemma:latest';
  process.env.LLM_BASE_URL =
    process.env.LLM_BASE_URL || 'http://127.0.0.1:11434/v1';
  process.env.LLM_MODEL = process.env.LLM_MODEL || 'gemma4:12b-mlx';
  process.env.QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:16333';
  process.env.NEO4J_URI = process.env.NEO4J_URI || 'bolt://127.0.0.1:17687';
  process.env.NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
  process.env.NEO4J_PASSWORD =
    process.env.NEO4J_PASSWORD || 'rag-neo4j-local';
  process.env.RAG_DATA_DIR = join(outRoot, 'rag-data');
  mkdirSync(process.env.RAG_DATA_DIR, { recursive: true });

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { setRagServicesForTests } = require('../src/adapters/services') as {
    setRagServicesForTests: (s: null) => void;
  };
  setRagServicesForTests(null);

  const llm = new OpenAiCompatibleLlmJson();
  const resumeDir = process.env.RESUME_DIR?.trim() || '';
  const collectionId =
    process.env.COLLECTION_ID?.trim() || `autoschool_kg_${Date.now()}`;

  const docs = SCHOOLS.flatMap(loadSchoolDocs);
  if (!docs.length) {
    throw new Error(`No texts under ${PACKS_ROOT} for schools ${SCHOOLS.join(',')}`);
  }
  console.log(`docs=${docs.length} schools=${SCHOOLS.join(',')}`);
  for (const d of docs) {
    console.log(`  ${d.docId}: ${d.text.length} chars`);
  }

  // 1) Doc → Gherkin scenarios
  let scenarios: DocScenario[] = [];
  if (resumeDir && existsSync(join(resumeDir, 'scenarios.json'))) {
    scenarios = JSON.parse(
      readFileSync(join(resumeDir, 'scenarios.json'), 'utf8'),
    ) as DocScenario[];
    console.log(`\n## resume scenarios from ${resumeDir} (${scenarios.length})`);
    writeFileSync(
      join(outRoot, 'scenarios.json'),
      JSON.stringify(scenarios, null, 2),
      'utf8',
    );
  } else {
    for (const d of docs) {
      console.log(`\n## gherkin ${d.docId}`);
      try {
        const sc = await docToScenario(
          llm,
          d.schoolId,
          d.docId,
          d.title,
          d.text,
        );
        scenarios.push(sc);
        writeFileSync(
          join(scenariosDir, `${d.docId}.feature`),
          sc.gherkinText,
          'utf8',
        );
        writeFileSync(
          join(scenariosDir, `${d.docId}.json`),
          JSON.stringify(sc, null, 2),
          'utf8',
        );
        console.log(
          `  feature=${sc.feature} actors=${sc.actors.length} scenarios=${sc.scenarios.length}`,
        );
      } catch (err) {
        console.error('  gherkin FAIL', err);
      }
    }
    writeFileSync(
      join(outRoot, 'scenarios.json'),
      JSON.stringify(scenarios, null, 2),
      'utf8',
    );
  }

  // 2) Scenarios → ontology (+ merge through executor for versioning)
  let schema: OntologySchema;
  if (resumeDir && existsSync(join(resumeDir, 'ontology.json'))) {
    schema = JSON.parse(
      readFileSync(join(resumeDir, 'ontology.json'), 'utf8'),
    ) as OntologySchema;
    writeFileSync(join(outRoot, 'ontology.json'), JSON.stringify(schema, null, 2));
    console.log(
      `\n## resume ontology v=${schema.version} entityTypes=${schema.entityTypes.length}`,
    );
  } else {
    schema = ontologyFromScenarios(scenarios);
    writeFileSync(
      join(outRoot, 'ontology.seed.json'),
      JSON.stringify(schema, null, 2),
    );
    const merged = await new RagOntologyMergeExecutor().execute(
      ctx({
        collectionId,
        schema: emptySchema(),
        candidateTypes: schema.entityTypes,
        candidateRelations: schema.relationTypes,
      }),
    );
    schema = merged.schema;
    writeFileSync(join(outRoot, 'ontology.json'), JSON.stringify(schema, null, 2));
    console.log(
      `\nontology entityTypes=${schema.entityTypes.length} relationTypes=${schema.relationTypes.length} v=${schema.version}`,
    );
  }

  // 3) Chunk → extract mentions/relations → resolve → index (entity↔chunk)
  const allChunks: RagChunk[] = [];
  const allMentions: EntityMention[] = [];
  let allEntities: CanonicalEntity[] = [];
  const allRelations: EntityRelation[] = [];
  const chunkEntityLinks: Array<{
    chunkId: string;
    docId: string;
    entityIds: string[];
    mentionSurfaces: string[];
  }> = [];

  for (const d of docs) {
    console.log(`\n## index chain ${d.docId}`);
    const extracted = await new RagExtractExecutor().execute(
      ctx({ documentText: d.text, docId: d.docId }),
    );
    const chunked = await new RagChunkExecutor().execute(
      ctx({
        blocks: extracted.blocks,
        docId: d.docId,
        strategy: 'recursive' as const,
        maxTokens: 400,
        overlapTokens: 40,
      }),
    );
    allChunks.push(...chunked.chunks);
    console.log(`  chunks=${chunked.chunks.length}`);

    let mentions: EntityMention[] = [];
    try {
      const ent = await new RagEntityExtractExecutor().execute(
        ctx({
          chunks: chunked.chunks,
          schema,
          collectionId,
          docId: d.docId,
          apiKey: API_KEY,
        }),
      );
      mentions = ent.mentions ?? [];
      allMentions.push(...mentions);
      console.log(`  mentions=${mentions.length}`);
    } catch (err) {
      console.warn('  entity.extract FAIL', err);
    }

    try {
      const resolved = await new RagEntityResolveExecutor().execute(
        ctx({
          mentions,
          collectionId,
        }),
      );
      allEntities = resolved.entities;
      console.log(`  entities=${resolved.entities.length}`);
    } catch (err) {
      console.warn('  entity.resolve FAIL', err);
    }

    let relations: EntityRelation[] = [];
    try {
      const rel = await new RagRelationExtractExecutor().execute(
        ctx({
          chunks: chunked.chunks,
          entities: allEntities,
          schema,
          apiKey: API_KEY,
        }),
      );
      relations = rel.relations ?? [];
      allRelations.push(...relations);
      console.log(`  relations=${relations.length}`);
    } catch (err) {
      console.warn('  relation.extract FAIL', err);
    }

    // bind chunks ↔ entities via mentions
    const byChunk = new Map<string, EntityMention[]>();
    for (const m of mentions) {
      const arr = byChunk.get(m.chunkId) ?? [];
      arr.push(m);
      byChunk.set(m.chunkId, arr);
    }
    for (const [chunkId, ms] of byChunk) {
      const entityIds = [
        ...new Set(
          allEntities
            .filter((e) => ms.some((m) => e.mentionIds.includes(m.mentionId)))
            .map((e) => e.entityId),
        ),
      ];
      chunkEntityLinks.push({
        chunkId,
        docId: d.docId,
        entityIds,
        mentionSurfaces: ms.map((m) => m.surface),
      });
    }

    try {
      const written = await new RagIndexWriteExecutor().execute(
        ctx({
          chunks: chunked.chunks,
          entities: allEntities,
          relations,
          schema,
          collectionId,
          docId: d.docId,
          embeddingApiKey: API_KEY,
        }),
      );
      console.log(
        `  vectors=${written.vectorsWritten} graphEntities=${written.entitiesWritten} graphRels=${written.relationsWritten}`,
      );
    } catch (err) {
      console.warn('  index.write FAIL', err);
    }
  }

  const report = {
    runId: RUN_ID,
    collectionId,
    generatedAt: new Date().toISOString(),
    schools: SCHOOLS,
    docs: docs.map((d) => ({
      docId: d.docId,
      schoolId: d.schoolId,
      title: d.title,
      chars: d.text.length,
    })),
    scenarioCount: scenarios.length,
    ontology: {
      version: schema.version,
      entityTypeCount: schema.entityTypes.length,
      relationTypeCount: schema.relationTypes.length,
      entityTypes: schema.entityTypes.map((t) => t.id),
      relationTypes: schema.relationTypes.map((t) => t.id),
    },
    graph: {
      chunkCount: allChunks.length,
      mentionCount: allMentions.length,
      entityCount: allEntities.length,
      relationCount: allRelations.length,
      chunkEntityLinkCount: chunkEntityLinks.length,
    },
    sampleScenario: scenarios[0]
      ? {
          docId: scenarios[0].docId,
          feature: scenarios[0].feature,
          actors: scenarios[0].actors,
          scenarioNames: scenarios[0].scenarios.map((s) => s.name),
        }
      : null,
  };

  writeFileSync(join(outRoot, 'entities.json'), JSON.stringify(allEntities, null, 2));
  writeFileSync(join(outRoot, 'mentions.json'), JSON.stringify(allMentions, null, 2));
  writeFileSync(join(outRoot, 'relations.json'), JSON.stringify(allRelations, null, 2));
  writeFileSync(
    join(outRoot, 'chunk-entity-links.json'),
    JSON.stringify(chunkEntityLinks, null, 2),
  );
  writeFileSync(join(outRoot, 'report.json'), JSON.stringify(report, null, 2));
  writeFileSync(
    join(__dirname, '../.rag-smoke-data/kg-chain-latest.json'),
    JSON.stringify(report, null, 2),
  );

  console.log('\n=== DONE ===');
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
