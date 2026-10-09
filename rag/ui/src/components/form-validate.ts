import { defineComponent, h, ref, watch, type PropType } from 'vue';
import type { FormIslandHostApi } from '../host-api';
import {
  extractFileToText,
  VALIDATE_FILE_ACCEPT,
} from '../lib/extract-file';
import { css, injectStyle } from '../lib/ui-kit';
import { resolveOwnedRunReply } from './form-ask-run';
import {
  formatKnowledgeDocSummary,
  parseKnowledgeDocResult,
  type KnowledgeDocResult,
} from './form-validate-result';
import { arxivPdfUrl, normalizeArxivUrl } from '../lib/arxiv-url';

const DEFAULT_COLLECTION = 'default';

function unwrapMaybeRef<T>(raw: unknown): T | undefined {
  if (raw == null) return undefined;
  if (typeof raw === 'object' && raw !== null && 'value' in raw) {
    return (raw as { value: T }).value;
  }
  return raw as T;
}

function hostValue<T>(raw: { value: T } | T | undefined | null): T | null {
  if (raw == null) return null;
  if (typeof raw === 'object' && raw !== null && 'value' in raw) {
    return (raw as { value: T }).value ?? null;
  }
  return raw as T;
}

function runHeadFromHost(
  host: FormIslandHostApi,
): { id: string; status?: string | null } | null {
  const rows = unwrapMaybeRef<unknown[]>(host.runSummaries as unknown);
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const head = rows[0] as { id?: unknown; status?: unknown };
  if (typeof head?.id !== 'string' || !head.id) return null;
  return {
    id: head.id,
    status: typeof head.status === 'string' ? head.status : null,
  };
}

function suggestDocId(seed: string): string {
  const stem = seed
    .replace(/^https?:\/\//i, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
    .split('/')
    .filter(Boolean)
    .slice(-2)
    .join('_')
    .replace(/\.[^.]+$/, '');
  const clean = stem.replace(/[^\w.\-а-яА-ЯёЁ]+/g, '_').slice(0, 72);
  return clean || `doc-${Date.now()}`;
}

export default defineComponent({
  name: 'RagFormValidate',
  props: {
    host: { type: Object as PropType<FormIslandHostApi | null>, default: null },
  },
  setup(props) {
    injectStyle('rag-ui-shell', css());

    const linkUrl = ref('');
    const fileName = ref<string | null>(null);
    const documentText = ref('');
    const busy = ref(false);
    const over = ref(false);
    const waiting = ref(false);
    const error = ref<string | null>(null);
    const status = ref<string | null>(null);
    const lastResult = ref<KnowledgeDocResult | null>(null);
    const lastHandledRun = ref<string | null>(null);
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    function clearPoll() {
      if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
    }

    function applyResult(result: unknown, failed: boolean) {
      waiting.value = false;
      if (failed) {
        error.value = 'Прогон завершился с ошибкой — откройте run в редакторе.';
        lastResult.value = null;
        status.value = 'failed';
        return;
      }
      const parsed = parseKnowledgeDocResult(result);
      lastResult.value = parsed;
      status.value = formatKnowledgeDocSummary(parsed);
      if (!parsed.evidenceId && !parsed.committedClaimIds.length) {
        error.value =
          'В результате нет evidenceId / claims — проверьте wiring процесса.';
      }
    }

    function tryConsumeHostResult(): boolean {
      const host = props.host;
      if (!host || !waiting.value) return false;
      const decision = resolveOwnedRunReply({
        pending: true,
        launchedRunId: hostValue<string | null>(host.lastLaunchRunId),
        alreadyHandledRunId: lastHandledRun.value,
        runHead: runHeadFromHost(host),
        result: hostValue(host.latestResult),
        emptyResultConfirmed: /пуст|empty/i.test(
          String(hostValue(host.detailHint) ?? ''),
        ),
      });
      if (decision.action !== 'apply') return false;
      lastHandledRun.value = decision.runId;
      clearPoll();
      applyResult(decision.result, decision.failed);
      return true;
    }

    async function pollOwnedRun(runId: string) {
      clearPoll();
      const host = props.host;
      if (!host) return;
      for (let i = 0; i < 90; i++) {
        if (!waiting.value || lastHandledRun.value === runId) return;
        try {
          await host.reloadRuns();
        } catch {
          // keep polling
        }
        if (tryConsumeHostResult()) return;
        await new Promise<void>((resolve) => {
          pollTimer = setTimeout(() => resolve(), 2000);
        });
      }
      if (waiting.value && lastHandledRun.value !== runId) {
        lastHandledRun.value = runId;
        clearPoll();
        waiting.value = false;
        error.value =
          'Таймаут ожидания результата. Обновите страницу или откройте run в редакторе.';
      }
    }

    watch(
      () => [
        hostValue(props.host?.latestResult),
        hostValue(props.host?.lastLaunchRunId),
        hostValue(props.host?.latestRunStatus),
        unwrapMaybeRef(props.host?.runSummaries as unknown),
      ],
      () => {
        tryConsumeHostResult();
      },
    );

    function bindingProblem(): string | null {
      const host = props.host;
      if (!host?.hasBinding.value) {
        return 'Нет diagram-id у острова формы.';
      }
      if (hostValue(host.needsAuthForDiagramPortal)) {
        return 'Нужна сессия, чтобы открыть публичную форму процесса.';
      }
      const portalErr = hostValue(host.portalError);
      if (portalErr) return portalErr;
      if (hostValue(host.portalPending)) {
        return 'Загрузка портала…';
      }
      if (!hostValue(host.portalEnabled)) {
        return 'У процесса выключена публичная форма (Settings → Public form). Без неё запуск из воркспейса не создаётся.';
      }
      return null;
    }

    async function launch(payload: Record<string, unknown>) {
      error.value = null;
      lastResult.value = null;
      const host = props.host;
      const problem = bindingProblem();
      if (problem) {
        error.value = problem;
        return;
      }
      waiting.value = true;
      status.value = 'Запуск…';
      const runId = await host!.submitLaunch(payload);
      if (!runId) {
        waiting.value = false;
        error.value =
          bindingProblem() ||
          'Запуск не создан — проверьте публичную форму процесса и поля триггера.';
        status.value = null;
        return;
      }
      status.value = `run ${runId.slice(0, 8)}…`;
      await host!.reloadRuns();
      void pollOwnedRun(runId);
    }

    async function onSubmit() {
      const collectionId = DEFAULT_COLLECTION;
      const observedAt = new Date().toISOString();

      if (documentText.value.trim()) {
        const docId = suggestDocId(fileName.value || 'upload');
        await launch({
          documentText: documentText.value,
          docId,
          collectionId,
          source: fileName.value ? `file:${fileName.value}` : 'file-upload',
          observedAt,
        });
        return;
      }

      const raw = linkUrl.value.trim();
      if (!raw) {
        error.value = 'Вставьте ссылку или выберите файл';
        return;
      }

      const lower = raw.toLowerCase();
      const docId = suggestDocId(raw);
      const base = { docId, collectionId, observedAt };

      if (lower.includes('arxiv.org')) {
        const htmlUrl = normalizeArxivUrl(raw);
        const pdfUrl = arxivPdfUrl(htmlUrl);
        await launch({
          ...base,
          htmlUrl,
          // Absolute PDF so intake does not fall back to relative /pdf/… from abs HTML.
          ...(pdfUrl ? { pdfUrl } : {}),
          source: 'arxiv',
        });
        return;
      }
      if (lower.includes('.pdf') || lower.endsWith('/pdf')) {
        await launch({ ...base, pdfUrl: raw, source: 'pdf-url' });
        return;
      }
      if (lower.includes('.doc')) {
        await launch({ ...base, docUrl: raw, source: 'doc-url' });
        return;
      }
      // Generic page URL → html intake (arxiv process / html extract path)
      await launch({
        ...base,
        htmlUrl: raw,
        source: 'url',
      });
    }

    async function ingest(file: File) {
      error.value = null;
      status.value = null;
      busy.value = true;
      try {
        const extracted = await extractFileToText(file);
        documentText.value = extracted.text;
        fileName.value = extracted.label;
        linkUrl.value = '';
        status.value = `${extracted.text.length.toLocaleString('ru-RU')} символов`;
      } catch (e) {
        error.value = e instanceof Error ? e.message : String(e);
        documentText.value = '';
        fileName.value = null;
      } finally {
        busy.value = false;
      }
    }

    function onPick(files: FileList | null) {
      const f = files?.[0];
      if (f) void ingest(f);
    }

    return () =>
      h('div', { class: 'rag-shell' }, [
        h('p', { class: 'muted' }, [
          'Ссылка (arXiv abs/html/pdf или страница) либо файл. Коллекция — ',
          h('code', {}, DEFAULT_COLLECTION),
          ', docId выводится из URL/имени файла.',
        ]),
        h('label', { class: 'field' }, [
          h('span', {}, 'Ссылка'),
          h('input', {
            value: linkUrl.value,
            placeholder: 'https://arxiv.org/abs/…',
            disabled: waiting.value || busy.value,
            onInput: (e: Event) => {
              linkUrl.value = (e.target as HTMLInputElement).value;
              if (linkUrl.value.trim()) {
                documentText.value = '';
                fileName.value = null;
              }
            },
          }),
        ]),
        h(
          'div',
          {
            class: over.value ? 'drop over' : 'drop',
            onDragover: (e: DragEvent) => {
              e.preventDefault();
              over.value = true;
            },
            onDragleave: () => {
              over.value = false;
            },
            onDrop: (e: DragEvent) => {
              e.preventDefault();
              over.value = false;
              onPick(e.dataTransfer?.files ?? null);
            },
            onClick: () => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = VALIDATE_FILE_ACCEPT;
              input.onchange = () => onPick(input.files);
              input.click();
            },
          },
          [
            h('div', {}, busy.value ? 'Читаю файл…' : 'Или файл docx / xlsx'),
            fileName.value
              ? h('div', { class: 'chip', style: 'margin-top:8px' }, fileName.value)
              : null,
          ],
        ),
        error.value ? h('p', { class: 'err' }, error.value) : null,
        status.value ? h('p', { class: 'muted' }, status.value) : null,
        lastResult.value
          ? h('div', { class: 'result' }, [
              lastResult.value.evidenceId
                ? h('div', {}, [
                    h('b', {}, 'evidenceId: '),
                    lastResult.value.evidenceId,
                  ])
                : h('div', { class: 'muted' }, 'evidenceId: —'),
              h(
                'div',
                {},
                `claims: ${
                  lastResult.value.committedClaimIds.length
                    ? lastResult.value.committedClaimIds.join(', ')
                    : '—'
                }`,
              ),
              h(
                'div',
                {},
                `conflicts: ${
                  lastResult.value.conflictIds.length
                    ? lastResult.value.conflictIds.join(', ')
                    : '—'
                }`,
              ),
            ])
          : null,
        h(
          'button',
          {
            type: 'button',
            disabled:
              props.host?.isSubmitting.value || busy.value || waiting.value,
            onClick: () => void onSubmit(),
          },
          waiting.value || props.host?.isSubmitting.value
            ? 'Ожидание…'
            : 'В коллекцию',
        ),
      ]);
  },
});
