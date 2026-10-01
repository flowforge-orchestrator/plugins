import type { FormIslandHostApi } from '../host-api';

export type RunSummaryLite = {
  id?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  finishedAt?: string;
};

export function css(): string {
  return `
.rag-shell{font:13px/1.45 ui-sans-serif,system-ui,sans-serif;color:#14201c;display:flex;flex-direction:column;gap:10px;min-width:0}
.rag-shell *{box-sizing:border-box}
.rag-shell input,.rag-shell textarea,.rag-shell button,.rag-shell select{font:inherit}
.rag-shell input,.rag-shell textarea,.rag-shell select{width:100%;border:1px solid #c9d4cf;border-radius:8px;padding:8px 10px;background:#fff}
.rag-shell textarea{resize:vertical}
.rag-shell button{border:0;border-radius:8px;padding:8px 12px;background:#1f6b4f;color:#fff;cursor:pointer}
.rag-shell button:disabled{opacity:.55;cursor:default}
.rag-shell button.ghost{background:#e8efeb;color:#143028}
.rag-shell .err{color:#b42318;margin:0}
.rag-shell .muted{color:#5b6b64;margin:0}
.rag-shell .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.rag-shell .field{display:flex;flex-direction:column;align-items:stretch;gap:4px;width:100%}
.rag-shell .field>span{font-size:12px;color:#5b6b64}
.rag-shell .drop{border:1.5px dashed #9aafa5;border-radius:12px;padding:18px;background:linear-gradient(180deg,#f4faf7,#eef5f1);text-align:center;cursor:pointer}
.rag-shell .drop.over{border-color:#1f6b4f;background:#e5f3ec}
.rag-shell .chip{display:inline-flex;gap:6px;align-items:center;padding:4px 8px;border-radius:999px;background:#e8efeb;font-size:12px}
.rag-shell .metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(7.5rem,1fr));gap:8px}
.rag-shell .metric{border:1px solid #d5e0db;border-radius:10px;padding:10px;background:#fff}
.rag-shell .metric b{display:block;font-size:1.25rem;letter-spacing:-.02em}
.rag-shell .metric span{color:#5b6b64;font-size:11px}
.rag-shell .chat{display:flex;flex-direction:column;gap:8px;min-height:18rem;max-height:28rem;overflow:auto;padding:8px;border:1px solid #d5e0db;border-radius:12px;background:#f7fbf9}
.rag-shell .bubble{max-width:92%;padding:8px 10px;border-radius:12px;white-space:pre-wrap;word-break:break-word}
.rag-shell .bubble.user{align-self:flex-end;background:#1f6b4f;color:#fff}
.rag-shell .bubble.bot{align-self:flex-start;background:#fff;border:1px solid #d5e0db}
.rag-shell .composer{display:flex;gap:8px}
.rag-shell .composer textarea{flex:1;min-height:2.75rem}
.rag-shell table{width:100%;border-collapse:collapse;font-size:12px}
.rag-shell th,.rag-shell td{border-bottom:1px solid #e4ece8;padding:6px 4px;text-align:left}
`;
}

export function injectStyle(id: string, cssText: string): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(id)) return;
  const el = document.createElement('style');
  el.id = id;
  el.textContent = cssText;
  document.head.appendChild(el);
}

export function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function asRecord(value: unknown): Record<string, unknown> {
  const v = parseMaybeJson(value);
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

export function runsOf(host: FormIslandHostApi | null | undefined): RunSummaryLite[] {
  const raw = host?.runSummaries?.value;
  return Array.isArray(raw) ? (raw as RunSummaryLite[]) : [];
}

export function countByStatus(runs: RunSummaryLite[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of runs) {
    const s = String(r.status ?? 'unknown');
    out[s] = (out[s] ?? 0) + 1;
  }
  return out;
}
