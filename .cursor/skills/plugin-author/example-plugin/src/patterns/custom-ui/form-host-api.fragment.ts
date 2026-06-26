/**
 * Platform contract for :ff-plugin-form bundles (prop `host`).
 * Provided by the app shell — do not reimplement in plugin.
 *
 * In form component: props: { host: { type: Object, default: null } }
 * Access refs as host.fieldName.value inside setup().
 */
import type { ComputedRef, Ref } from 'vue';

export type FormIslandHostApi = {
  diagramId: ComputedRef<string>;
  publicPortalSlug: ComputedRef<string>;
  /** diagram-id or public-portal-slug present */
  hasBinding: ComputedRef<boolean>;

  portalPending: Ref<boolean>;
  portalError: Ref<string | null>;
  portalEnabled: Ref<boolean>;
  needsAuthForDiagramPortal: Ref<boolean>;

  formPending: Ref<boolean>;
  formLoadError: Ref<string | null>;
  formTitle: Ref<string | null>;

  isSubmitting: Ref<boolean>;
  lastLaunchRunId: Ref<string | null>;
  /** Payload keys = executor input port names */
  submitLaunch: (payload: Record<string, unknown>) => Promise<string | null>;

  canLoadRuns: ComputedRef<boolean>;
  runsPending: Ref<boolean>;
  runsError: Ref<string | null>;
  detailPending: Ref<boolean>;
  detailError: Ref<string | null>;
  detailHint: Ref<string | null>;
  latestResult: ComputedRef<unknown>;
  latestResultAt: ComputedRef<string | null>;
  latestRunStatus: ComputedRef<
    'running' | 'finished' | 'failed' | 'canceled' | null
  >;
  reloadRuns: () => Promise<void>;
};

/** Canvas widget — prop `host` from diagram node shell */
export type PluginWidgetHostContext = {
  label?: string;
  config?: Array<{ name: string; value?: unknown; defaultValue?: unknown }>;
  outputs?: Array<string | { name?: string }>;
};
