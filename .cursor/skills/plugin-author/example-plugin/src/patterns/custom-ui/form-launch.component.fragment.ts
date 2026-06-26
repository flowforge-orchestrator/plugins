/**
 * Minimal launch form — copy to ui/src/components/form-launch.ts
 * Entry: ui/src/entries/form-launch.ts → export default from '../components/form-launch'
 */
import { defineComponent, h, ref, type PropType } from 'vue';
import type { FormIslandHostApi } from './form-host-api.fragment';

export default defineComponent({
  name: 'MyPluginFormLaunch',
  props: {
    host: {
      type: Object as PropType<FormIslandHostApi | null>,
      default: null,
    },
  },
  setup(props) {
    const text = ref('');
    const error = ref<string | null>(null);

    async function onSubmit() {
      error.value = null;
      const host = props.host;
      if (!host) {
        error.value = 'Form host unavailable.';
        return;
      }
      if (!host.hasBinding.value) {
        error.value = 'Set diagram-id or public-portal-slug in markdown.';
        return;
      }
      const value = text.value.trim();
      if (!value) {
        error.value = 'Field is required.';
        return;
      }
      const runId = await host.submitLaunch({ message: value });
      if (!runId) error.value = 'Failed to create run.';
    }

    return () => {
      const host = props.host;
      if (!host?.portalEnabled.value && host?.hasBinding.value) {
        return h('p', 'Process public portal is unavailable.');
      }
      return h('div', { class: 'myplugin-form' }, [
        h('textarea', {
          value: text.value,
          rows: 4,
          onInput: (e: Event) => {
            text.value = (e.target as HTMLTextAreaElement).value;
          },
        }),
        h(
          'button',
          {
            type: 'button',
            disabled: host?.isSubmitting.value,
            onClick: () => void onSubmit(),
          },
          host?.isSubmitting.value ? 'Submitting…' : 'Launch',
        ),
        error.value ? h('p', { class: 'myplugin-form__error' }, error.value) : null,
        host?.lastLaunchRunId.value
          ? h('p', `Run: ${host.lastLaunchRunId.value}`)
          : null,
      ]);
    };
  },
});
