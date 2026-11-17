# CLI agent: Crush

Runs `crush run` in a one-shot container.

| Field | Type | Mode | Required |
| --- | --- | --- | --- |
| task | string | port | yes |
| provider | string | port | yes |
| model | string | port | no |
| baseUrl | string | port | no |
| tools | string | static | no |
| skills | string | static | no |
| workspace | string | static | no |
| timeoutMs | number | port | no |
| apiKey | ref (`CLI_AGENT_API_KEY`) | static | yes |

Enable the `cli-agent` plugin. Wire process ports identically across Wave agents so `system.process.call` can swap `diagramId`.
