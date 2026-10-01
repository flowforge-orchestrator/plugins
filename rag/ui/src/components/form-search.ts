import { defineComponent, h, ref, type PropType } from 'vue';
import type { FormIslandHostApi } from '../host-api';
import { css, injectStyle } from '../lib/ui-kit';

function field(
  caption: string,
  control: ReturnType<typeof h>,
): ReturnType<typeof h> {
  return h('div', { class: 'field' }, [h('span', {}, caption), control]);
}

export default defineComponent({
  name: 'RagFormSearch',
  props: {
    host: { type: Object as PropType<FormIslandHostApi | null>, default: null },
  },
  setup(props) {
    injectStyle('rag-ui-shell', css());
    const collectionId = ref('');
    const query = ref('');
    const topK = ref('8');
    const error = ref<string | null>(null);

    async function onSubmit() {
      error.value = null;
      const host = props.host;
      if (!host?.hasBinding.value) {
        error.value = 'Укажите diagram-id процесса поиска';
        return;
      }
      if (!query.value.trim()) {
        error.value = 'Введите запрос';
        return;
      }
      const runId = await host.submitLaunch({
        collectionId: collectionId.value.trim(),
        query: query.value.trim(),
        topK: Number(topK.value) || 8,
      });
      if (!runId) error.value = 'Не удалось создать запуск';
      else await host.reloadRuns();
    }

    return () =>
      h('div', { class: 'rag-shell' }, [
        field(
          'Коллекция',
          h('input', {
            value: collectionId.value,
            onInput: (e: Event) => {
              collectionId.value = (e.target as HTMLInputElement).value;
            },
          }),
        ),
        field(
          'Запрос',
          h('textarea', {
            rows: 3,
            value: query.value,
            onInput: (e: Event) => {
              query.value = (e.target as HTMLTextAreaElement).value;
            },
          }),
        ),
        field(
          'topK',
          h('input', {
            value: topK.value,
            onInput: (e: Event) => {
              topK.value = (e.target as HTMLInputElement).value;
            },
          }),
        ),
        error.value ? h('p', { class: 'err' }, error.value) : null,
        h(
          'button',
          {
            type: 'button',
            disabled: props.host?.isSubmitting.value,
            onClick: onSubmit,
          },
          'Искать',
        ),
        props.host?.latestResult.value
          ? h(
              'pre',
              {
                style:
                  'margin:0;max-height:16rem;overflow:auto;white-space:pre-wrap;font-size:12px',
              },
              JSON.stringify(props.host.latestResult.value, null, 2),
            )
          : null,
      ]);
  },
});
