#!/usr/bin/env python3
"""Entrypoint wrapper: seed ollama providers + optional MCP servers, then exec hermes.real."""
from __future__ import annotations

import base64
import os
import sys


def main() -> None:
    home = os.environ.get("HOME", "/tmp")
    hermes_dir = os.path.join(home, ".hermes")
    os.makedirs(hermes_dir, exist_ok=True)
    base = (
        os.environ.get("HERMES_BASE_URL")
        or os.environ.get("OPENAI_BASE_URL")
        or "http://host.docker.internal:11434/v1"
    )
    key = (
        os.environ.get("HERMES_API_KEY")
        or os.environ.get("OPENAI_API_KEY")
        or "ollama"
    )
    parts = [
        # Required so Hermes does not treat the file as pre-v12 and skip MCP merge.
        "_config_version: 12",
        "providers:",
        "  ollama:",
        f"    base_url: {base}",
        f"    api_key: {key}",
        "  custom:",
        f"    base_url: {base}",
        f"    api_key: {key}",
        "model:",
        f"  base_url: {base}",
    ]
    # Executor seeds MCP via HERMES_MCP_YAML_B64 (base64 of a `mcp_servers:` YAML block).
    # Older wrappers wiped config.yaml every invoke and dropped mcp_servers.
    b64 = (os.environ.get("HERMES_MCP_YAML_B64") or "").strip()
    has_mcp = False
    if b64:
        try:
            block = base64.b64decode(b64).decode("utf-8").strip()
        except Exception:
            block = ""
        if block:
            has_mcp = True
            if not block.startswith("mcp_servers:"):
                block = "mcp_servers:\n" + block
            parts.append("")
            parts.append(block)
    if has_mcp:
        # Defaults are ~1.5s / ~15s — too short for cold stdio node bridge + tool list.
        parts.extend(
            [
                "",
                "mcp_discovery_timeout: 60",
                "mcp_single_query_discovery_timeout: 90",
            ]
        )
    cfg_path = os.path.join(hermes_dir, "config.yaml")
    with open(cfg_path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(parts) + "\n")

    args = sys.argv[1:]
    out: list[str] = []
    i = 0
    while i < len(args):
        if args[i] == "--message" and i + 1 < len(args):
            out.extend(["--oneshot", "-q", args[i + 1]])
            i += 2
            continue
        out.append(args[i])
        i += 1
    os.execv("/usr/local/bin/hermes.real", ["/usr/local/bin/hermes.real", *out])


if __name__ == "__main__":
    main()
