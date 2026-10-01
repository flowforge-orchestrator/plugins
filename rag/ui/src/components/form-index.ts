import { defineComponent, h, ref, type PropType } from 'vue';
import type { FormIslandHostApi } from '../host-api';
import { ACCEPT_ATTR, extractFileToText } from '../lib/extract-file';
import { css, injectStyle } from '../lib/ui-kit';

export default defineComponent({
  name: 'RagFormIndex',
  props: {
    host: { type: Object as PropType<FormIslandHostApi | null>, default: null },
  },
  setup(props) {
    injectStyle('rag-ui-shell', css());
    const collectionId = ref('');
    const docId = ref('');
    const imageCaption = ref('');
    const fileName = ref<string | null>(null);
    const members = ref<string[]>([]);
    const preview = ref('');
    const busy = ref(false);
    const over = ref(false);
    const error = ref<string | null>(null);
    const status = ref<string | null>(null);

    function suggestDocId(name: string) {
      const stem = name.replace(/\.[^.]+$/, '');
      const clean = stem.replace(/[^\w.\-а-яА-ЯёЁ]+/g, '_').slice(0, 72);
      docId.value = clean || `doc-${Date.now()}`;
    }

    async function ingest(file: File) {
      error.value = null;
      status.value = null;
      busy.value = true;
      try {
        const extracted = await extractFileToText(file, {
          imageCaption: imageCaption.value,
        });
        preview.value = extracted.text.slice(0, 12000);
        fileName.value = extracted.label;
        members.value = extracted.members ?? [];
        suggestDocId(extracted.label);
        status.value = extracted.members?.length
          ? `${extracted.members.length} файлов из архива`
          : `${extracted.text.length.toLocaleString('ru-RU')} символов`;
      } catch (e) {
        error.value = e instanceof Error ? e.message : String(e);
        preview.value = '';
        fileName.value = null;
        members.value = [];
      } finally {
        busy.value = false;
      }
    }

    async function onSubmit() {
      error.value = null;
      const host = props.host;
      if (!host?.hasBinding.value) {
        error.value = 'Нужен diagram-id / public portal процесса индексации';
        return;
      }
      if (!preview.value.trim()) {
        error.value = 'Выберите файл';
        return;
      }
      if (!docId.value.trim()) {
        error.value = 'Укажите docId';
        return;
      }
      const runId = await host.submitLaunch({
        collectionId: collectionId.value.trim(),
        docId: docId.value.trim(),
        documentText: preview.value,
      });
      if (!runId) error.value = 'Запуск не создан';
      else {
        status.value = `run ${runId.slice(0, 8)}…`;
        await host.reloadRuns();
      }
    }

    function onPick(files: FileList | null) {
      const f = files?.[0];
      if (f) void ingest(f);
    }

    return () =>
      h('div', { class: 'rag-shell' }, [
        h('div', { class: 'row' }, [
          h('label', { style: 'flex:1' }, [
            'Коллекция',
            h('input', {
              value: collectionId.value,
              onInput: (e: Event) => {
                collectionId.value = (e.target as HTMLInputElement).value;
              },
            }),
          ]),
          h('label', { style: 'flex:1' }, [
            'docId',
            h('input', {
              value: docId.value,
              onInput: (e: Event) => {
                docId.value = (e.target as HTMLInputElement).value;
              },
            }),
          ]),
        ]),
        h('label', {}, [
          'Подпись к изображению',
          h('input', {
            placeholder: 'если загружаете картинку',
            value: imageCaption.value,
            onInput: (e: Event) => {
              imageCaption.value = (e.target as HTMLInputElement).value;
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
              input.accept = ACCEPT_ATTR;
              input.onchange = () => onPick(input.files);
              input.click();
            },
          },
          [
            h('div', {}, busy.value ? 'Читаю файл…' : 'DOC / PDF / изображение / ZIP'),
            h('p', { class: 'muted' }, 'Перетащите или выберите файл'),
            fileName.value
              ? h('div', { class: 'chip', style: 'margin-top:8px' }, fileName.value)
              : null,
          ],
        ),
        members.value.length
          ? h(
              'div',
              { class: 'row' },
              members.value.slice(0, 8).map((m) => h('span', { class: 'chip' }, m)),
            )
          : null,
        preview.value
          ? h('textarea', {
              rows: 6,
              value: preview.value,
              onInput: (e: Event) => {
                preview.value = (e.target as HTMLTextAreaElement).value;
              },
            })
          : null,
        error.value ? h('p', { class: 'err' }, error.value) : null,
        status.value ? h('p', { class: 'muted' }, status.value) : null,
        h(
          'button',
          {
            type: 'button',
            disabled: props.host?.isSubmitting.value || busy.value,
            onClick: onSubmit,
          },
          props.host?.isSubmitting.value ? 'Индексация…' : 'В индекс',
        ),
      ]);
  },
});
