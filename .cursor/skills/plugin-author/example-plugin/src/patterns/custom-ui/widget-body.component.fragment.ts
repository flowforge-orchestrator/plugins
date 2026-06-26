/**
 * Minimal executor canvas widget — copy to ui/src/components/widget-body.ts
 * Entry: ui/src/entries/widget-myplugin.ts → export default
 */
import { defineComponent, h, computed, type PropType } from 'vue';
import type { PluginWidgetHostContext } from './form-host-api.fragment';

export default defineComponent({
  name: 'MyPluginWidget',
  props: {
    host: {
      type: Object as PropType<PluginWidgetHostContext | undefined>,
      default: undefined,
    },
  },
  setup(props) {
    const preview = computed(() => {
      const cfg = props.host?.config ?? [];
      const field = cfg.find((c) => c.name === 'message');
      const raw = field?.value ?? field?.defaultValue;
      return typeof raw === 'string' && raw.trim()
        ? raw.trim().slice(0, 120)
        : 'Connect message input or set a value on the node.';
    });

    return () =>
      h('div', { class: 'myplugin-widget' }, [
        h('div', { class: 'myplugin-widget__title' }, props.host?.label ?? 'My node'),
        h('pre', { class: 'myplugin-widget__preview' }, preview.value),
      ]);
  },
});
