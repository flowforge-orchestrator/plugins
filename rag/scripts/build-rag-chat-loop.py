#!/usr/bin/env python3
"""Build rag-chat preset: system.loop whose body switches on mode into one output."""
import json
from pathlib import Path

RULES = json.dumps([], ensure_ascii=False)
SKILLS = json.dumps(
    [
        {
            "id": "verdict",
            "body": "Read observations.verdict before deciding. Each gap names what is missing: run the tool that supplies it, or mark the slot unknown in the answer. Every value in the answer names its docId. Do not invent values that observations do not contain.",
        },
    ],
    ensure_ascii=False,
)


def port(name, typ="textarea", primary=False, required=False, default=None, static=False):
    cfg = {
        "name": name,
        "type": typ,
        "isPort": not static,
        "canBePort": not static,
    }
    if static:
        cfg["static"] = True
    if primary:
        cfg["isPrimary"] = True
    if required:
        cfg["isRequired"] = True
    if default is not None:
        cfg["defaultValue"] = default
    return cfg


# pid, label, node type, config fields, needs collection id from the trigger
PROVIDERS = [
    ("search", "Поиск", "plugin.rag.provider.search", [
        port("collectionId", "string", primary=True, required=True),
        port("topK", "number", static=True, default=24),
    ], True),
    ("graph", "Граф", "plugin.rag.provider.graph", [
        port("collectionId", "string", primary=True, required=True),
    ], True),
    ("ontology", "Онтология", "plugin.rag.provider.ontology", [
        port("collectionId", "string", primary=True, required=True),
    ], True),
    ("aggregate", "Агрегация", "plugin.rag.provider.aggregate", [], False),
    ("calculate", "Вычисление", "plugin.rag.provider.calculate", [], False),
]


def widget(wid, label, node_type, node_label, x, y, config, outputs):
    return {
        "id": wid,
        "label": label,
        "position": {"x": x, "y": y},
        "source": {"nodeType": node_type, "label": node_label},
        "config": config,
        "outputs": outputs,
    }


def edge(eid, source, sh, target, th):
    return {
        "id": eid,
        "source": source,
        "sourceHandle": sh,
        "target": target,
        "targetHandle": th,
    }


def continue_output(wid, y):
    return widget(
        wid,
        "Continue",
        "system.output",
        "Выход процесса",
        900,
        y,
        [
            port("message"),
            port("history"),
            port("collectionId", "string"),
            port("query"),
            port("topK", "number"),
            port("observations"),
            port("continueLoop", "boolean", default=True, static=True),
        ],
        ["message", "history", "collectionId", "query", "topK", "observations", "continueLoop"],
    )


def wire_passthrough(edges, eid_prefix, output_id):
    edges.extend(
        [
            edge(eid_prefix + "m", "b-trigger", "message", output_id, "message"),
            edge(eid_prefix + "h", "b-trigger", "history", output_id, "history"),
            edge(eid_prefix + "c", "b-trigger", "collectionId", output_id, "collectionId"),
            edge(eid_prefix + "q", "b-trigger", "query", output_id, "query"),
            edge(eid_prefix + "k", "b-trigger", "topK", output_id, "topK"),
        ]
    )


def build_body():
    widgets = [
        widget(
            "b-trigger",
            "Trigger",
            "system.trigger.input",
            "Входные данные триггера",
            0,
            0,
            [
                port("message", primary=True, required=True),
                port("query"),
                port("history"),
                port("collectionId", "string", required=True),
                port("topK", "number", default=24),
                port("researchMode", "string"),
                port("observations"),
            ],
            ["message", "query", "history", "collectionId", "topK", "researchMode", "observations", "trigger"],
        ),
        widget(
            "b-switch",
            "Mode",
            "system.control.switch",
            "Control: switch",
            280,
            0,
            [port("value", "string", primary=True)],
            ["direct", "retrieval", "analysis", "research"],
        ),
        widget(
            "b-direct",
            "Direct",
            "plugin.rag.evidence.merge",
            "RAG: объединить evidence",
            560,
            -200,
            [port("observations"), port("enabled", "boolean")],
            ["evidence", "observations"],
        ),
        widget(
            "b-plan",
            "Plan",
            "plugin.rag.agent.plan",
            "RAG: стратегия",
            820,
            -220,
            [
                port(
                    "strategy",
                    "select",
                    primary=True,
                    static=True,
                    default="cot",
                )
            ],
            ["strategy"],
        ),
        *[
            widget(
                f"b-prov-{pid}",
                label,
                node_type,
                label,
                280,
                -280 + index * 90,
                config,
                ["tool"],
            )
            for index, (pid, label, node_type, config, _corpus) in enumerate(PROVIDERS)
        ],
        widget(
            "b-router",
            "Tools",
            "plugin.rag.tool.router",
            "RAG: роутер инструментов",
            560,
            40,
            [port(pid) for pid, _label, _node_type, _config, _corpus in PROVIDERS],
            ["tools"],
        ),
        widget(
            "b-turn",
            "Agent turn",
            "plugin.rag.agent.turn",
            "RAG: ход агента",
            820,
            40,
            [
                port("userPrompt", primary=True, required=True),
                port("history"),
                port("rules", static=True, default=RULES),
                port("skills", static=True, default=SKILLS),
                port("tools"),
                port("strategy", "string"),
                port("observations"),
                port("mode", "string"),
                port("enabled", "boolean"),
                port("queryTool", "string", static=True, default="search"),
                port("systemPrompt", static=True),
                port("maxActions", "number", static=True, default=4),
                port("llmModel", "string", static=True),
                port("llmBaseUrl", "string", static=True),
                port("temperature", "number", static=True, default=0),
                port("maxTokens", "number", static=True),
            ],
            ["op", "query", "args", "actions", "answer", "observations", "metrics", "history"],
        ),
        widget(
            "b-search", "Search", "plugin.rag.search.query", "RAG: поиск", 820, 200,
            [port("query", primary=True, required=True), port("collectionId", "string", required=True),
             port("action"), port("observations"), port("topK", "number", static=True, default=24)],
            ["hits", "context", "hitCount", "observations"],
        ),
        widget(
            "b-graph", "Graph", "plugin.rag.graph.query", "RAG: обход графа", 820, 340,
            [port("query", primary=True, required=True), port("collectionId", "string", required=True),
             port("action"), port("observations")],
            ["graphContext", "observations"],
        ),
        widget(
            "b-ontology", "Ontology", "plugin.rag.ontology.lookup", "RAG: lookup онтологии", 820, 480,
            [port("query", primary=True, required=True), port("collectionId", "string", required=True),
             port("action"), port("observations")],
            ["ontologyContext", "observations"],
        ),
        widget(
            "b-hits", "Hits → evidence", "plugin.rag.evidence.hits", "RAG: evidence из поиска", 1100, 200,
            [port("hits"), port("source", "string", static=True, default="collection"), port("field", "string")],
            ["evidence"],
        ),
        widget(
            "b-gtext", "Graph → evidence", "plugin.rag.evidence.text", "RAG: evidence из текста", 1100, 340,
            [port("content"), port("id", "string", static=True, default="graph"),
             port("source", "string", static=True, default="graph"),
             port("extractionMethod", "string", static=True, default="graph")],
            ["evidence"],
        ),
        widget(
            "b-otext", "Ontology → evidence", "plugin.rag.evidence.text", "RAG: evidence из текста", 1100, 480,
            [port("content"), port("id", "string", static=True, default="ontology"),
             port("source", "string", static=True, default="ontology"),
             port("extractionMethod", "string", static=True, default="ontology")],
            ["evidence"],
        ),
        widget(
            "b-agg", "Aggregate", "plugin.rag.aggregate", "RAG: агрегировать", 1100, 620,
            [port("action"), port("args"), port("observations")],
            ["evidence"],
        ),
        widget(
            "b-calc", "Calculate", "plugin.rag.calculate", "RAG: вычислить", 1100, 760,
            [port("action"), port("args"), port("observations")],
            ["evidence"],
        ),
        widget(
            "b-merge", "Evidence", "plugin.rag.evidence.merge", "RAG: объединить evidence", 1380, 400,
            [port("observations"), port("a"), port("b"), port("c"), port("d"), port("e")],
            ["evidence", "observations"],
        ),
        widget(
            "b-propose", "Field values", "plugin.rag.slot.propose", "RAG: значения полей", 1600, 400,
            [port("message", primary=True, required=True), port("observations"),
             port("llmModel", "string", static=True), port("llmBaseUrl", "string", static=True)],
            ["observations"],
        ),
        widget(
            "b-claims", "Claims", "plugin.rag.claims", "RAG: claims из предложений", 1820, 400,
            [port("observations", primary=True)],
            ["claims", "observations"],
        ),
        widget(
            "b-critic", "Field critic", "plugin.rag.slot.critic", "RAG: критик полей", 2040, 400,
            [port("message", primary=True, required=True), port("observations"),
             port("llmModel", "string", static=True), port("llmBaseUrl", "string", static=True)],
            ["claims", "observations"],
        ),
        widget(
            "b-judge",
            "Judge",
            "plugin.rag.judge",
            "RAG: судья",
            1100,
            40,
            [
                port("message", primary=True),
                port("answer"),
                port("observations"),
                port("decision"),
                port("history"),
                port("llmModel", "string", static=True),
                port("llmBaseUrl", "string", static=True),
                port("temperature", "number", static=True, default=0),
                port("maxTokens", "number", static=True),
            ],
            ["verdict", "consistent", "sufficient", "complete", "observations", "history"],
        ),
        widget(
            "b-guard",
            "Gate",
            "plugin.rag.guard",
            "RAG: гард цикла",
            1380,
            40,
            [
                port("answer", primary=True),
                port("observations"),
                port("turnLimited", "boolean", default=False),
                port("maxTurns", "number", static=True, default=6),
            ],
            ["answer", "breakLoop", "continueLoop", "reason", "observations", "metrics"],
        ),
        widget(
            "b-out",
            "Turn result",
            "system.output",
            "Выход процесса",
            1660,
            40,
            [
                port("answer", primary=True),
                port("message"),
                port("history"),
                port("collectionId", "string"),
                port("query"),
                port("topK", "number"),
                port("continueLoop", "boolean"),
                port("metrics"),
                port("observations"),
                port("researchMode", "string"),
            ],
            [
                "answer",
                "message",
                "history",
                "collectionId",
                "query",
                "topK",
                "continueLoop",
                "metrics",
                "observations",
                "researchMode",
            ],
        ),
    ]
    edges = [
        edge("sw-value", "b-trigger", "researchMode", "b-switch", "value"),
        edge("sw-direct", "b-switch", "direct", "b-direct", "enabled"),
        edge("sw-direct-obs", "b-trigger", "observations", "b-direct", "observations"),
        edge("sw-ret", "b-switch", "retrieval", "b-turn", "enabled"),
        edge("sw-an", "b-switch", "analysis", "b-turn", "enabled"),
        edge("sw-re", "b-switch", "research", "b-turn", "enabled"),
        edge("e-msg", "b-trigger", "message", "b-turn", "userPrompt"),
        edge("e-hist", "b-trigger", "history", "b-turn", "history"),
        edge("e-obs", "b-trigger", "observations", "b-turn", "observations"),
        edge("e-mode", "b-trigger", "researchMode", "b-turn", "mode"),
        *[
            edge(f"e-col-{pid}", "b-trigger", "collectionId", f"b-prov-{pid}", "collectionId")
            for pid, _label, _node_type, _config, corpus in PROVIDERS
            if corpus
        ],
        edge("e-strat", "b-plan", "strategy", "b-turn", "strategy"),
        *[
            edge(f"e-tool-{pid}", f"b-prov-{pid}", "tool", "b-router", pid)
            for pid, _label, _node_type, _config, _corpus in PROVIDERS
        ],
        edge("e-tools", "b-router", "tools", "b-turn", "tools"),
        edge("s-act", "b-turn", "op", "b-search", "action"),
        edge("s-q", "b-turn", "query", "b-search", "query"),
        edge("s-col", "b-trigger", "collectionId", "b-search", "collectionId"),
        edge("s-obs", "b-trigger", "observations", "b-search", "observations"),
        edge("g-act", "b-turn", "op", "b-graph", "action"),
        edge("g-q", "b-turn", "query", "b-graph", "query"),
        edge("g-col", "b-trigger", "collectionId", "b-graph", "collectionId"),
        edge("g-obs", "b-trigger", "observations", "b-graph", "observations"),
        edge("o-act", "b-turn", "op", "b-ontology", "action"),
        edge("o-q", "b-turn", "query", "b-ontology", "query"),
        edge("o-col", "b-trigger", "collectionId", "b-ontology", "collectionId"),
        edge("o-obs", "b-trigger", "observations", "b-ontology", "observations"),
        edge("h-hits", "b-search", "hits", "b-hits", "hits"),
        edge("h-field", "b-turn", "query", "b-hits", "field"),
        edge("gt-c", "b-graph", "graphContext", "b-gtext", "content"),
        edge("ot-c", "b-ontology", "ontologyContext", "b-otext", "content"),
        edge("a-act", "b-turn", "op", "b-agg", "action"),
        edge("a-args", "b-turn", "args", "b-agg", "args"),
        edge("a-obs", "b-trigger", "observations", "b-agg", "observations"),
        edge("c-act", "b-turn", "op", "b-calc", "action"),
        edge("c-args", "b-turn", "args", "b-calc", "args"),
        edge("c-obs", "b-trigger", "observations", "b-calc", "observations"),
        edge("m-base", "b-trigger", "observations", "b-merge", "observations"),
        edge("m-a", "b-hits", "evidence", "b-merge", "a"),
        edge("m-b", "b-gtext", "evidence", "b-merge", "b"),
        edge("m-c", "b-otext", "evidence", "b-merge", "c"),
        edge("m-d", "b-agg", "evidence", "b-merge", "d"),
        edge("m-e", "b-calc", "evidence", "b-merge", "e"),
        edge("pr-msg", "b-trigger", "message", "b-propose", "message"),
        edge("pr-obs", "b-merge", "observations", "b-propose", "observations"),
        edge("cl-obs", "b-propose", "observations", "b-claims", "observations"),
        edge("cr-msg", "b-trigger", "message", "b-critic", "message"),
        edge("cr-obs", "b-claims", "observations", "b-critic", "observations"),
        edge("j-msg", "b-trigger", "message", "b-judge", "message"),
        # First produced value wins: a finished judge replaces the trigger history.
        edge("j-h-turn", "b-turn", "history", "b-judge", "history"),
        edge("j-h-trigger", "b-trigger", "history", "b-judge", "history"),
        edge("j-obs", "b-critic", "observations", "b-judge", "observations"),
        edge("j-decision", "b-turn", "observations", "b-judge", "decision"),
        edge("gd-judge", "b-judge", "observations", "b-guard", "observations"),
        edge("gd-direct", "b-direct", "observations", "b-guard", "observations"),
        edge("out-a", "b-guard", "answer", "b-out", "answer"),
        edge("out-cl", "b-guard", "continueLoop", "b-out", "continueLoop"),
        edge("out-metrics", "b-guard", "metrics", "b-out", "metrics"),
        edge("out-m", "b-trigger", "message", "b-out", "message"),
        edge("out-h-judge", "b-judge", "history", "b-out", "history"),
        edge("out-h-trigger", "b-trigger", "history", "b-out", "history"),
        edge("out-c", "b-trigger", "collectionId", "b-out", "collectionId"),
        edge("out-q-turn", "b-turn", "query", "b-out", "query"),
        edge("out-q-message", "b-trigger", "message", "b-out", "query"),
        edge("out-k", "b-trigger", "topK", "b-out", "topK"),
        edge("out-obs", "b-guard", "observations", "b-out", "observations"),
        edge("out-mode", "b-trigger", "researchMode", "b-out", "researchMode"),
    ]
    return {"widgets": widgets, "edges": edges}


def build_preset():
    body = build_body()
    return {
        "id": "rag-chat",
        "version": 19,
        "pluginId": "rag",
        "metadata": {
            "name": "RAG: чат по корпусу",
            "description": "Схема: схема источника → рамка и режим → switch в цикле → значения полей → claims → критик → судья → синтез. Хит поиска — кандидат, поле заполняет фрагмент записи. Незакрытое поле следующий ход либо запрашивает, либо сдаёт.",
        },
        "diagrams": [
            {
                "settings": {
                    "name": "RAG chat",
                    "description": "Switch по режиму внутри цикла. direct останавливается. retrieval, analysis и research идут через ход: незакрытое поле ход запрашивает или сдаёт, цикл закрывается когда поля заполнены или сданы.",
                    "triggers": [{"type": "webhook"}, {"type": "manual"}],
                    "isActive": True,
                },
                "widgets": [
                    widget(
                        "w-trigger",
                        "Trigger",
                        "system.trigger.input",
                        "Входные данные триггера",
                        -480,
                        40,
                        [
                            port("message", primary=True, required=True),
                            port("query"),
                            port("history"),
                            port("collectionId", "string", required=True),
                            port("topK", "number", default=24),
                        ],
                        ["message", "query", "history", "collectionId", "topK", "trigger"],
                    ),
                    widget(
                        "w-schema",
                        "Schema",
                        "plugin.rag.graph.prepare",
                        "RAG: инвентарь коллекции",
                        -160,
                        -160,
                        [port("collectionId", "string", primary=True, required=True)],
                        ["inventory", "docCount", "observations"],
                    ),
                    widget(
                        "w-schema-ev",
                        "Schema evidence",
                        "plugin.rag.evidence.inventory",
                        "RAG: evidence из схемы",
                        160,
                        -160,
                        [port("inventory"), port("source", "string", static=True, default="collection")],
                        ["evidence"],
                    ),
                    widget(
                        "w-task",
                        "Task",
                        "plugin.rag.topic",
                        "RAG: рамка вопроса",
                        -160,
                        160,
                        [port("message", primary=True, required=True), port("history")],
                        ["frame", "skipRetrieval", "population", "mode", "observations"],
                    ),
                    widget(
                        "w-seed",
                        "Seed evidence",
                        "plugin.rag.evidence.merge",
                        "RAG: объединить evidence",
                        160,
                        40,
                        [port("observations"), port("a")],
                        ["evidence", "observations"],
                    ),
                    widget(
                        "w-loop",
                        "Turns",
                        "system.loop",
                        "Цикл",
                        480,
                        40,
                        [
                            port("iterator", "keyvalue", static=True, default=[]),
                            port("body", "keyvalue", static=True, default=body),
                            port("mode", "string", static=True, default="sequential"),
                            port("message"),
                            port("query"),
                            port("history"),
                            port("collectionId", "string"),
                            port("topK", "number"),
                            port("observations"),
                            port("researchMode", "string"),
                        ],
                        ["items"],
                    ),
                    widget(
                        "w-extract",
                        "Last turn",
                        "system.object.extract",
                        "Извлечение полей",
                        760,
                        40,
                        [
                            port(
                                "map",
                                "keyvalue",
                                static=True,
                                primary=True,
                                default='{"observations":"[-1].observations","message":"[-1].message","metrics":"[-1].metrics"}',
                            ),
                            port("source", "keyvalue"),
                        ],
                        ["observations", "message", "metrics"],
                    ),
                    widget(
                        "w-synth",
                        "Synthesize",
                        "plugin.rag.synthesize",
                        "RAG: синтез ответа",
                        1000,
                        40,
                        [port("message", primary=True, required=True), port("observations")],
                        ["answer"],
                    ),
                    widget(
                        "w-safe",
                        "Safety",
                        "plugin.rag.safety",
                        "RAG: проверка перед выдачей",
                        1240,
                        40,
                        [port("answer", primary=True), port("observations")],
                        ["answer"],
                    ),
                    widget(
                        "w-output",
                        "Output",
                        "system.output",
                        "Выход процесса",
                        1480,
                        40,
                        [port("answer", primary=True), port("metrics")],
                        ["answer", "metrics"],
                    ),
                ],
                "edges": [
                    edge("o1", "w-trigger", "message", "w-task", "message"),
                    edge("o2", "w-trigger", "history", "w-task", "history"),
                    edge("o3", "w-trigger", "collectionId", "w-schema", "collectionId"),
                    edge("o4", "w-schema", "inventory", "w-schema-ev", "inventory"),
                    edge("o5", "w-task", "observations", "w-seed", "observations"),
                    edge("o6", "w-schema-ev", "evidence", "w-seed", "a"),
                    edge("o7", "w-trigger", "message", "w-loop", "message"),
                    edge("o8", "w-trigger", "query", "w-loop", "query"),
                    edge("o9", "w-trigger", "history", "w-loop", "history"),
                    edge("o10", "w-trigger", "collectionId", "w-loop", "collectionId"),
                    edge("o11", "w-trigger", "topK", "w-loop", "topK"),
                    edge("o12", "w-seed", "observations", "w-loop", "observations"),
                    edge("o13", "w-task", "mode", "w-loop", "researchMode"),
                    edge("o14", "w-loop", "items", "w-extract", "source"),
                    edge("o15", "w-extract", "message", "w-synth", "message"),
                    edge("o16", "w-extract", "observations", "w-synth", "observations"),
                    edge("o17", "w-synth", "answer", "w-safe", "answer"),
                    edge("o18", "w-extract", "observations", "w-safe", "observations"),
                    edge("o19", "w-safe", "answer", "w-output", "answer"),
                    edge("o20", "w-extract", "metrics", "w-output", "metrics"),
                ],
            }
        ],
    }


def sync_pack(path: Path, chat: dict) -> None:
    pack = json.loads(path.read_text(encoding="utf-8"))
    replaced = False
    for diagram in pack["diagrams"]:
        if diagram.get("settings", {}).get("name") != "RAG: чат":
            continue
        diagram["widgets"] = chat["diagrams"][0]["widgets"]
        diagram["edges"] = chat["diagrams"][0]["edges"]
        replaced = True
    if not replaced:
        raise SystemExit(f"RAG: чат not found in {path}")
    if int(pack.get("version", 0)) < 5:
        pack["version"] = 5
    path.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("synced", path)


def main():
    preset = build_preset()
    out = Path(__file__).resolve().parents[1] / "presets" / "rag-chat.json"
    out.write_text(json.dumps(preset, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("wrote", out, "widgets", len(preset["diagrams"][0]["widgets"]))
    loop = next(
        w
        for w in preset["diagrams"][0]["widgets"]
        if w["source"]["nodeType"] == "system.loop"
    )
    body = next(c["defaultValue"] for c in loop["config"] if c["name"] == "body")
    print("body widgets", len(body["widgets"]), "edges", len(body["edges"]))
    root = Path(__file__).resolve().parents[3]
    sync_pack(root / "plugins" / "rag" / "presets" / "rag.json", preset)
    sync_pack(
        root / "backend" / "apps" / "preset-service" / "catalog" / "presets" / "rag.json",
        preset,
    )


if __name__ == "__main__":
    main()
