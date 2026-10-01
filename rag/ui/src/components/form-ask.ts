import { defineComponent, h, nextTick, ref, watch, type PropType } from 'vue';
import type { FormIslandHostApi } from '../host-api';
import {
  asRecord,
  css,
  injectStyle,
} from '../lib/ui-kit';
import { resolveOwnedRunReply } from './form-ask-run';

type ChatMsg = { role: 'user' | 'bot'; text: string; at: number };

const GREETING =
  'Задайте вопрос — ответит модель по найденным фрагментам корпуса.';

function answerFromResult(result: unknown): string {
  if (typeof result === 'string' && result.trim()) return result.trim();
  const root = asRecord(result);
  const inputs = asRecord(root.publicInputs ?? root);
  const answer = inputs.answer;
  if (typeof answer === 'string' && answer.trim()) return answer.trim();
  const context = inputs.context;
  if (typeof context === 'string' && context.trim()) {
    return context.trim().slice(0, 800);
  }
  return 'Ответ модели пуст.';
}

function isGreetingBubble(text: string): boolean {
  return text === GREETING || text.startsWith('Задайте вопрос');
}

function historyPayload(messages: ChatMsg[], currentUserText: string) {
  return messages
    .filter((m) => !isGreetingBubble(m.text))
    .filter(
      (m) =>
        !(
          m.role === 'user' &&
          m.text === currentUserText &&
          m === messages[messages.length - 1]
        ),
    )
    .slice(-10)
    .map((m) => ({ role: m.role, text: m.text.slice(0, 800) }));
}

function searchQueryFromChat(
  current: string,
  history: { role: string; text: string }[],
): string {
  const priorUsers = history
    .filter((t) => t.role === 'user')
    .map((t) => t.text.trim())
    .filter(Boolean);
  const lastUser = [...priorUsers].reverse()[0];
  if (/^(привет|здравств|хай|hello|hi)\b/i.test(current.trim())) {
    return current;
  }
  const looksFollowUp =
    current.length < 80 ||
    /^(да|нет|ок|хорошо|а |и |еще|ещё|а что|какие|дай|примеры)/i.test(current);
  if (!looksFollowUp || !lastUser) return current;
  return [lastUser, current].filter(Boolean).join('\n');
}

function unwrapMaybeRef<T>(raw: unknown): T | undefined {
  if (raw == null) return undefined;
  if (typeof raw === 'object' && raw !== null && 'value' in raw) {
    return (raw as { value: T }).value;
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

function hostValue<T>(raw: { value: T } | T | undefined | null): T | null {
  if (raw == null) return null;
  if (typeof raw === 'object' && raw !== null && 'value' in raw) {
    return (raw as { value: T }).value ?? null;
  }
  return raw as T;
}

export default defineComponent({
  name: 'RagFormAsk',
  props: {
    host: { type: Object as PropType<FormIslandHostApi | null>, default: null },
  },
  setup(props) {
    injectStyle('rag-ui-shell', css());
    const collectionId = ref('');
    const draft = ref('');
    const error = ref<string | null>(null);
    const messages = ref<ChatMsg[]>([
      {
        role: 'bot',
        text: GREETING,
        at: Date.now(),
      },
    ]);
    const pendingUser = ref<string | null>(null);
    const lastHandledRun = ref<string | null>(null);
    const scroller = ref<HTMLElement | null>(null);
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    function clearPoll() {
      if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
    }

    async function applyBotReply(text: string) {
      messages.value = [
        ...messages.value,
        { role: 'bot', text, at: Date.now() },
      ];
      pendingUser.value = null;
      await nextTick();
      scroller.value?.scrollTo({ top: scroller.value.scrollHeight });
    }

    function tryConsumeHostResult(): boolean {
      const host = props.host;
      if (!host || !pendingUser.value) return false;
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
      const text = decision.failed
        ? 'Запрос завершился с ошибкой.'
        : decision.result == null
          ? 'Ответ пуст (проверьте проводку system.output).'
          : answerFromResult(decision.result);
      void applyBotReply(text);
      return true;
    }

    async function pollOwnedRun(runId: string) {
      clearPoll();
      const host = props.host;
      if (!host) return;
      for (let i = 0; i < 60; i++) {
        if (!pendingUser.value || lastHandledRun.value === runId) return;
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
      if (pendingUser.value && lastHandledRun.value !== runId) {
        lastHandledRun.value = runId;
        clearPoll();
        await applyBotReply(
          'Таймаут ожидания ответа. Обновите страницу и повторите вопрос.',
        );
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

    async function onSend() {
      error.value = null;
      const host = props.host;
      const text = draft.value.trim();
      if (!host?.hasBinding.value) {
        error.value = 'Нужен diagram-id / public portal процесса чата';
        return;
      }
      if (!text) return;
      const history = historyPayload(messages.value, text);
      messages.value = [
        ...messages.value,
        { role: 'user', text, at: Date.now() },
      ];
      draft.value = '';
      pendingUser.value = text;
      await nextTick();
      scroller.value?.scrollTo({ top: scroller.value.scrollHeight });
      const runId = await host.submitLaunch({
        collectionId: collectionId.value.trim(),
        query: searchQueryFromChat(text, history),
        message: text,
        history: JSON.stringify(history),
        topK: 24,
      });
      if (!runId) {
        error.value = 'Запуск не создан';
        pendingUser.value = null;
        messages.value = [
          ...messages.value,
          {
            role: 'bot',
            text: 'Не удалось отправить сообщение.',
            at: Date.now(),
          },
        ];
        return;
      }
      void pollOwnedRun(runId);
    }

    return () =>
      h('div', { class: 'rag-shell' }, [
        h('label', {}, [
          'Коллекция',
          h('input', {
            value: collectionId.value,
            onInput: (e: Event) => {
              collectionId.value = (e.target as HTMLInputElement).value;
            },
          }),
        ]),
        h(
          'div',
          {
            class: 'chat',
            ref: (el: unknown) => {
              scroller.value = el as HTMLElement | null;
            },
          },
          messages.value.map((m) =>
            h('div', { class: `bubble ${m.role}` }, m.text),
          ),
        ),
        error.value ? h('p', { class: 'err' }, error.value) : null,
        h('div', { class: 'composer' }, [
          h('textarea', {
            rows: 2,
            value: draft.value,
            placeholder: 'Вопрос по документам',
            onInput: (e: Event) => {
              draft.value = (e.target as HTMLTextAreaElement).value;
            },
            onKeydown: (e: KeyboardEvent) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void onSend();
              }
            },
          }),
          h(
            'button',
            {
              type: 'button',
              disabled: props.host?.isSubmitting.value || !!pendingUser.value,
              onClick: onSend,
            },
            props.host?.isSubmitting.value || pendingUser.value
              ? '…'
              : 'Отправить',
          ),
        ]),
      ]);
  },
});
