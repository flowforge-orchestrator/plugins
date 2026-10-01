#!/usr/bin/env python3
"""Index one doc per school via Conveyor rag-index-auto webhook; then search metrics."""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = Path("/Users/mihailsvedkov/PhpstormProjects/shift/auto-flow/plugins/rag/.rag-smoke-data")
SCHOOLS = BASE / "schools-15"
OUT = BASE / "conveyor-runs"
OUT.mkdir(exist_ok=True)

COLLECTION = "autoschool_conveyor_15"
API = "http://127.0.0.1:4001"
TOKEN = Path("/tmp/token.txt").read_text().strip()
IDX = Path("/tmp/index-diag.txt").read_text().strip()
SEARCH = Path("/tmp/search-diag.txt").read_text().strip()


def req(method: str, path: str, body=None, timeout=120):
    data = None if body is None else json.dumps(body).encode()
    r = urllib.request.Request(
        f"{API}{path}",
        data=data,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
        },
        method=method,
    )
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            parsed = json.loads(raw)
        except Exception:
            parsed = {"raw": raw[:500]}
        return e.code, parsed


def wait_run(diagram_id: str, run_id: str, timeout_s: int = 900) -> dict:
    t0 = time.time()
    last = {}
    while time.time() - t0 < timeout_s:
        code, payload = req("GET", f"/flow/{diagram_id}/runs/{run_id}")
        if code != 200:
            time.sleep(3)
            continue
        run = payload.get("run") or {}
        st = run.get("status")
        last = payload
        if st in {"finished", "failed", "stopped", "error", "completed", "success"}:
            return payload
        time.sleep(5)
    return last


def pick_docs() -> list[tuple[str, Path]]:
    picks = []
    for school in sorted(SCHOOLS.iterdir()):
        if not school.is_dir():
            continue
        texts = sorted((school / "text").glob("*.txt")) if (school / "text").exists() else []
        if not texts:
            continue
        # prefer medium-sized docs for speed: smallest that has >= 800 chars, else first
        ranked = sorted(texts, key=lambda p: p.stat().st_size)
        chosen = None
        for p in ranked:
            if p.stat().st_size >= 800:
                chosen = p
                break
        chosen = chosen or ranked[0]
        picks.append((school.name, chosen))
    return picks


def index_all():
    picks = pick_docs()
    print(f"schools={len(picks)}")
    results = []
    for school, path in picks:
        text = path.read_text(encoding="utf-8", errors="replace")
        # cap very large docs to keep LLM steps bounded
        if len(text) > 12000:
            text = text[:12000]
        doc_id = f"{school}__{path.stem}"[:96]
        print(f"INDEX {doc_id} chars={len(text)}")
        code, body = req(
            "POST",
            f"/flow/{IDX}/webhook",
            {
                "documentText": text,
                "docId": doc_id,
                "collectionId": COLLECTION,
            },
        )
        if code not in (200, 201) or not body.get("runId"):
            print("  start fail", code, body)
            results.append({"school": school, "docId": doc_id, "ok": False, "error": body})
            continue
        run_id = body["runId"]
        payload = wait_run(IDX, run_id, timeout_s=1200)
        st = (payload.get("run") or {}).get("status")
        result_code, result = req("GET", f"/flow/{IDX}/runs/{run_id}/result")
        entry = {
            "school": school,
            "docId": doc_id,
            "runId": run_id,
            "status": st,
            "resultHttp": result_code,
            "result": result,
        }
        print(f"  -> {st} result={result_code}")
        results.append(entry)
        (OUT / f"index-{school}.json").write_text(
            json.dumps(entry, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    (OUT / "index-summary.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    ok = sum(1 for r in results if r.get("status") == "finished")
    print(f"INDEX DONE ok={ok}/{len(results)}")
    return results


GOLD = [
    {
        "q": "порядок приема и отчисления обучающихся в автошколе",
        "schools": ["asbest", "leader", "pdd177", "avtoshkola1", "rusavto"],
    },
    {
        "q": "права и обязанности обучающихся автошколы",
        "schools": ["signal", "sokol", "olisa", "perekrestok"],
    },
    {
        "q": "примерная программа подготовки водителей категории B",
        "schools": ["fortuna", "chelatt", "argoclass", "start", "tomich"],
    },
    {
        "q": "режим занятий и учебный процесс автошколы",
        "schools": ["olisa", "sokol", "signal"],
    },
    {
        "q": "договор об оказании образовательных услуг автошколы",
        "schools": ["avtoshkola1", "leader", "pdd177", "voaengels"],
    },
    {
        "q": "положение о платных образовательных услугах",
        "schools": ["rusavto", "perekrestok", "asbest"],
    },
    {
        "q": "аттестация и итоговая проверка знаний по ПДД",
        "schools": ["pdd177", "avtoshkola1", "leader"],
    },
    {
        "q": "внутренний распорядок и дисциплина курсантов",
        "schools": ["asbest", "signal", "sokol"],
    },
]


def metrics():
    rows = []
    for i, g in enumerate(GOLD):
        code, body = req(
            "POST",
            f"/flow/{SEARCH}/webhook",
            {"query": g["q"], "collectionId": COLLECTION, "topK": 8},
        )
        if code not in (200, 201) or not body.get("runId"):
            rows.append({"q": g["q"], "ok": False, "error": body})
            continue
        run_id = body["runId"]
        payload = wait_run(SEARCH, run_id, timeout_s=300)
        st = (payload.get("run") or {}).get("status")
        _, result = req("GET", f"/flow/{SEARCH}/runs/{run_id}/result")
        inputs = (result or {}).get("publicInputs") or {}
        hits_raw = inputs.get("hits")
        try:
            hits = json.loads(hits_raw) if isinstance(hits_raw, str) else (hits_raw or [])
        except Exception:
            hits = []
        doc_ids = []
        for h in hits:
            if isinstance(h, dict):
                doc_ids.append(str(h.get("docId") or h.get("payload", {}).get("docId") or ""))
        hit_schools = []
        for d in doc_ids:
            if "__" in d:
                hit_schools.append(d.split("__", 1)[0])
        expected = set(g["schools"])
        ranks = []
        for rank, s in enumerate(hit_schools, 1):
            if s in expected:
                ranks.append(rank)
        hit_at_1 = 1.0 if ranks and ranks[0] == 1 else 0.0
        hit_at_5 = 1.0 if any(r <= 5 for r in ranks) else 0.0
        mrr = 1.0 / ranks[0] if ranks else 0.0
        row = {
            "q": g["q"],
            "status": st,
            "hitCount": inputs.get("hitCount"),
            "docIds": doc_ids[:8],
            "hitSchools": hit_schools[:8],
            "expected": sorted(expected),
            "Hit@1": hit_at_1,
            "Hit@5": hit_at_5,
            "MRR": mrr,
        }
        print(
            f"Q{i+1} Hit@1={hit_at_1} Hit@5={hit_at_5} MRR={mrr:.2f} schools={hit_schools[:5]}"
        )
        rows.append(row)
        time.sleep(1)
    summary = {
        "n": len(rows),
        "Hit@1": sum(r.get("Hit@1", 0) for r in rows) / max(1, len(rows)),
        "Hit@5": sum(r.get("Hit@5", 0) for r in rows) / max(1, len(rows)),
        "MRR": sum(r.get("MRR", 0) for r in rows) / max(1, len(rows)),
        "rows": rows,
    }
    (OUT / "metrics-summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        f"METRICS Hit@1={summary['Hit@1']:.2f} Hit@5={summary['Hit@5']:.2f} MRR={summary['MRR']:.2f}"
    )
    return summary


if __name__ == "__main__":
    index_all()
    metrics()
