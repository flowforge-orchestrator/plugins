#!/usr/bin/env python3
"""Portable RAG helper for aider (urllib). Usage: rag-lib.py search|graph <query...>"""
from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request

BASE = __import__("os").environ.get("CONVEYOR_API_BASE", "http://host.docker.internal:18080")
IDS = {
    "search": __import__("os").environ.get(
        "CHUK_SEARCH_DIAGRAM_ID", "0ebb1a12-871c-4eb5-af51-47a7bb6ec450"
    ),
    "graph": __import__("os").environ.get(
        "CHUK_GRAPH_DIAGRAM_ID", "229933d8-e8d0-4b94-85ac-fc7c6af216e2"
    ),
}


def req(method: str, path: str, token: str | None = None, body=None):
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode()
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    with urllib.request.urlopen(r, timeout=120) as resp:
        raw = resp.read()
        return json.loads(raw) if raw else None


def poll_run(diagram_id: str, run_id: str, token: str):
    """GET run status; tolerate brief 404 right after start."""
    last_err: Exception | None = None
    for _ in range(90):
        try:
            body = req("GET", f"/flow/{diagram_id}/runs/{run_id}", token)
            status = (body or {}).get("run", {}).get("status")
            if status in ("finished", "failed", "canceled", "error"):
                return body
        except urllib.error.HTTPError as exc:
            last_err = exc
            if exc.code != 404:
                raise
        time.sleep(1)
    if last_err:
        raise last_err
    return None


def main() -> int:
    if len(sys.argv) < 3 or sys.argv[1] not in ("search", "graph"):
        print("usage: rag-lib.py search|graph <query>", file=sys.stderr)
        return 2
    kind = sys.argv[1]
    query = " ".join(sys.argv[2:]).strip()
    if not query:
        print("usage: rag-lib.py search|graph <query>", file=sys.stderr)
        return 2
    token = req("POST", "/auth/session", body={})["accessToken"]
    diagram_id = IDS[kind]
    started = req("POST", f"/flow/{diagram_id}/start", token, {"query": query})
    run_id = started["runId"]
    poll_run(diagram_id, run_id, token)
    result = req("GET", f"/flow/{diagram_id}/runs/{run_id}/result", token)
    pi = result.get("publicInputs") or result
    if kind == "search":
        text = pi.get("context") or pi.get("hits") or result
    else:
        text = pi.get("graphContext") or pi.get("observations") or result
    if not isinstance(text, str):
        text = json.dumps(text, ensure_ascii=False, indent=2)
    sys.stdout.write(text[:12000])
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
