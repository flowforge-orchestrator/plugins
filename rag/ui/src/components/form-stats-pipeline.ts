import { computed, defineComponent, h, type PropType } from 'vue';
import type { FormIslandHostApi } from '../host-api';
import {
  asRecord,
  countByStatus,
  css,
  injectStyle,
  parseMaybeJson,
  runsOf,
} from '../lib/ui-kit';

function collectionOf(host: FormIslandHostApi | null): string {
  const latest = asRecord(host?.latestResult?.value);
  const inputs = asRecord(latest.publicInputs ?? latest);
  const id = inputs.collectionId ?? latest.collectionId;
  return typeof id === 'string' ? id : '';
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function sumField(host: FormIslandHostApi | null, key: string): number {
  const latest = asRecord(host?.latestResult?.value);
  const inputs = asRecord(latest.publicInputs ?? latest);
  const direct = num(inputs[key]);
  if (direct != null) return direct;
  // scan runSummaries payloads are not always present; use latest only
  return 0;
}

export default defineComponent({
  name: 'RagFormStatsPipeline',
  props: {
    host: { type: Object as PropType<FormIslandHostApi | null>, default: null },
  },
  setup(props) {
    injectStyle('rag-ui-shell', css());

    const model = computed(() => {
      const runs = runsOf(props.host);
      const by = countByStatus(runs);
      const finished = by.finished ?? by.completed ?? by.success ?? 0;
      const failed = by.failed ?? by.error ?? 0;
      const running = by.running ?? by.dispatched ?? 0;
      const vectors = sumField(props.host, 'vectorsWritten');
      const chunks = sumField(props.host, 'chunkCount');
      const entities = sumField(props.host, 'entitiesWritten');
      const relations = sumField(props.host, 'relationsWritten');
      return {
        runs: runs.length,
        finished,
        failed,
        running,
        vectors,
        chunks,
        entities,
        relations,
        collection: collectionOf(props.host),
      };
    });

    return () => {
      const m = model.value;
      return h('div', { class: 'rag-shell' }, [
        h('div', { class: 'metrics' }, [
          h('div', { class: 'metric' }, [
            h('b', {}, String(m.vectors || '—')),
            h('span', {}, 'векторов (последний run)'),
          ]),
          h('div', { class: 'metric' }, [
            h('b', {}, String(m.finished)),
            h('span', {}, 'индексаций ok'),
          ]),
          h('div', { class: 'metric' }, [
            h('b', {}, String(m.failed)),
            h('span', {}, 'ошибок'),
          ]),
          h('div', { class: 'metric' }, [
            h('b', {}, String(m.chunks || '—')),
            h('span', {}, 'чанков (last)'),
          ]),
          h('div', { class: 'metric' }, [
            h('b', {}, String(m.entities || '—')),
            h('span', {}, 'сущностей (last)'),
          ]),
          h('div', { class: 'metric' }, [
            h('b', {}, String(m.relations || '—')),
            h('span', {}, 'связей (last)'),
          ]),
          h('div', { class: 'metric' }, [
            h('b', {}, String(m.running)),
            h('span', {}, 'в работе'),
          ]),
        ]),
        m.collection
          ? h('p', { class: 'muted' }, `коллекция · ${m.collection}`)
          : null,
        runsOf(props.host).length
          ? h('table', {}, [
              h('thead', {}, [
                h('tr', {}, [
                  h('th', {}, 'run'),
                  h('th', {}, 'status'),
                  h('th', {}, 'at'),
                ]),
              ]),
              h(
                'tbody',
                {},
                runsOf(props.host)
                  .slice(0, 8)
                  .map((r) =>
                    h('tr', {}, [
                      h('td', {}, String(r.id ?? '').slice(0, 8)),
                      h('td', {}, String(r.status ?? '')),
                      h(
                        'td',
                        {},
                        String(r.finishedAt ?? r.updatedAt ?? r.createdAt ?? '').slice(
                          0,
                          19,
                        ),
                      ),
                    ]),
                  ),
              ),
            ])
          : h('p', { class: 'muted' }, 'Привяжите diagram-id индексации — появятся прогоны'),
        props.host?.latestResult?.value
          ? h(
              'pre',
              {
                style:
                  'margin:0;max-height:8rem;overflow:auto;font-size:11px;white-space:pre-wrap',
              },
              JSON.stringify(
                parseMaybeJson(
                  asRecord(props.host.latestResult.value).publicInputs ??
                    props.host.latestResult.value,
                ),
                null,
                2,
              ).slice(0, 1200),
            )
          : null,
      ]);
    };
  },
});
