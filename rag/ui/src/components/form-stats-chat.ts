import { defineComponent, h, ref, watch, type PropType } from 'vue';
import type { FormIslandHostApi } from '../host-api';
import {
  asRecord,
  css,
  injectStyle,
  runsOf,
  type RunSummaryLite,
} from '../lib/ui-kit';

type ChatMetrics = {
  question: string;
  turns: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  tools: number;
  vectorCalls: number;
  vectorHits: number;
  graphCalls: number;
  graphNodes: number;
  embedTokens: number;
};

type QuestionRow = {
  id: string;
  seconds: number | null;
  metrics: ChatMetrics | null;
};

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function secondsOf(run: RunSummaryLite): number | null {
  const start = Date.parse(String(run.createdAt ?? ''));
  const end = Date.parse(String(run.finishedAt ?? run.updatedAt ?? ''));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / 100) / 10;
}

function metricsOf(result: unknown): ChatMetrics | null {
  const root = asRecord(result);
  const inputs = asRecord(root.publicInputs ?? root.inputs ?? root);
  const raw = asRecord(inputs.metrics);
  if (!('turns' in raw) && !('tools' in raw) && !('promptTokens' in raw)) return null;
  return {
    question: String(raw.question ?? ''),
    turns: num(raw.turns),
    promptTokens: num(raw.promptTokens),
    completionTokens: num(raw.completionTokens),
    reasoningTokens: num(raw.reasoningTokens),
    tools: num(raw.tools),
    vectorCalls: num(raw.vectorCalls),
    vectorHits: num(raw.vectorHits),
    graphCalls: num(raw.graphCalls),
    graphNodes: num(raw.graphNodes),
    embedTokens: num(raw.embedTokens),
  };
}

function tokenTitle(m: ChatMetrics): string {
  return `вопрос ${m.promptTokens} · ответ ${m.completionTokens} · размышление ${m.reasoningTokens} · эмбеддинг ${m.embedTokens}`;
}

function cell(text: string, title?: string) {
  return h('td', { class: 'num', title }, text);
}

export default defineComponent({
  name: 'RagFormStatsChat',
  props: {
    host: { type: Object as PropType<FormIslandHostApi | null>, default: null },
  },
  setup(props) {
    injectStyle('rag-ui-shell', css());
    injectStyle(
      'rag-metrics-num',
      '.rag-shell table{background:#fff;border-radius:10px;overflow:hidden}.rag-shell th,.rag-shell td{color:#14201c}.rag-shell td.num,.rag-shell th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.rag-shell td.q{max-width:18rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    );
    const rows = ref<QuestionRow[]>([]);
    const error = ref('');

    async function load(): Promise<void> {
      const diagramId = props.host?.diagramId?.value ?? '';
      const runs = runsOf(props.host).slice(0, 8);
      if (!diagramId || runs.length === 0) {
        rows.value = [];
        return;
      }
      error.value = '';
      const next: QuestionRow[] = [];
      for (const run of runs) {
        if (!run.id) continue;
        let metrics: ChatMetrics | null = null;
        try {
          const headers: Record<string, string> = {};
          const token =
            typeof localStorage !== 'undefined'
              ? localStorage.getItem('auth_access_token')
              : null;
          if (token) headers.Authorization = `Bearer ${token}`;
          const res = await fetch(`/flow/${diagramId}/runs/${run.id}/result`, {
            credentials: 'include',
            headers,
          });
          if (res.ok) metrics = metricsOf(await res.json());
        } catch (e) {
          error.value = e instanceof Error ? e.message : 'результат недоступен';
        }
        next.push({ id: run.id, seconds: secondsOf(run), metrics });
      }
      rows.value = next;
    }

    watch(
      () =>
        `${props.host?.diagramId?.value ?? ''}:${runsOf(props.host)
          .map((r) => `${r.id}:${r.status}:${r.finishedAt ?? ''}`)
          .join('|')}`,
      () => {
        void load();
      },
      { immediate: true },
    );

    return () => {
      const latest = rows.value.find((r) => r.metrics) ?? rows.value[0];
      const m = latest?.metrics;
      const tokens = m
        ? m.promptTokens + m.completionTokens + m.reasoningTokens
        : null;
      return h('div', { class: 'rag-shell' }, [
        h('div', { class: 'metrics' }, [
          metric(latest?.seconds != null ? String(latest.seconds) : '—', 'с'),
          metric(m ? String(m.turns) : '—', 'терны'),
          metric(tokens != null ? String(tokens) : '—', 'токены', m ? tokenTitle(m) : undefined),
          metric(m ? String(m.tools) : '—', 'тулы'),
          metric(m ? String(m.vectorHits) : '—', 'вектор', m ? `вызовов ${m.vectorCalls}` : undefined),
          metric(m ? String(m.graphNodes) : '—', 'граф', m ? `вызовов ${m.graphCalls}` : undefined),
        ]),
        error.value ? h('p', { class: 'err' }, error.value) : null,
        rows.value.length
          ? h('table', {}, [
              h('thead', {}, [
                h('tr', {}, [
                  h('th', {}, 'вопрос'),
                  h('th', { class: 'num' }, 'с'),
                  h('th', { class: 'num' }, 'терны'),
                  h('th', { class: 'num' }, 'токены'),
                  h('th', { class: 'num' }, 'тулы'),
                  h('th', { class: 'num' }, 'вектор'),
                  h('th', { class: 'num' }, 'граф'),
                ]),
              ]),
              h(
                'tbody',
                {},
                rows.value.map((row) => {
                  const item = row.metrics;
                  const sum = item
                    ? item.promptTokens + item.completionTokens + item.reasoningTokens
                    : null;
                  return h('tr', { key: row.id }, [
                    h(
                      'td',
                      { class: 'q', title: item?.question || row.id },
                      item?.question || '—',
                    ),
                    cell(row.seconds != null ? String(row.seconds) : '—'),
                    cell(item ? String(item.turns) : '—'),
                    cell(sum != null ? String(sum) : '—', item ? tokenTitle(item) : undefined),
                    cell(item ? String(item.tools) : '—'),
                    cell(
                      item ? String(item.vectorHits) : '—',
                      item ? `вызовов ${item.vectorCalls}` : undefined,
                    ),
                    cell(
                      item ? String(item.graphNodes) : '—',
                      item ? `вызовов ${item.graphCalls}` : undefined,
                    ),
                  ]);
                }),
              ),
            ])
          : h('p', { class: 'muted' }, '—'),
      ]);
    };
  },
});

function metric(value: string, label: string, title?: string) {
  return h('div', { class: 'metric', title }, [
    h('b', {}, value),
    h('span', {}, label),
  ]);
}
