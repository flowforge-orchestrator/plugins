import { defineComponent, h, type PropType } from 'vue';
import { PLANNING_STRATEGY_OPTIONS } from '../../../src/agent/plan/strategy-options';

type HostConfig = {
  name: string;
  value?: unknown;
  defaultValue?: unknown;
};

type PlanHost = {
  config?: HostConfig[];
  setConfig?: (name: string, value: string) => void;
};

function currentStrategy(host: PlanHost | undefined): string {
  const field = host?.config?.find((item) => item.name === 'strategy');
  const raw = field?.value ?? field?.defaultValue;
  const value = typeof raw === 'string' ? raw : 'cot';
  return PLANNING_STRATEGY_OPTIONS.some((item) => item.id === value)
    ? value
    : 'cot';
}

export default defineComponent({
  name: 'RagPlanWidget',
  props: {
    host: { type: Object as PropType<PlanHost | null>, default: null },
  },
  setup(props) {
    return () => {
      const selected = currentStrategy(props.host ?? undefined);
      return h(
        'label',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            font: '13px/1.3 ui-sans-serif, system-ui, sans-serif',
          },
        },
        [
          h(
            'span',
            { style: { fontSize: '12px', opacity: '0.7' } },
            'Стратегия',
          ),
          h(
            'select',
            {
              value: selected,
              style: {
                width: '100%',
                font: 'inherit',
                padding: '6px 8px',
                borderRadius: '8px',
                border: '1px solid #c9d4cf',
                background: '#fff',
                color: '#14201c',
              },
              onChange: (event: Event) => {
                const value = (event.target as HTMLSelectElement).value;
                props.host?.setConfig?.('strategy', value);
              },
            },
            PLANNING_STRATEGY_OPTIONS.map((item) =>
              h(
                'option',
                { value: item.id, key: item.id, selected: item.id === selected },
                item.label,
              ),
            ),
          ),
        ],
      );
    };
  },
});
