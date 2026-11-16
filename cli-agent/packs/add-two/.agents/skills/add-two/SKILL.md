---
name: add-two
description: Add two numbers by calling the add tool. Mental arithmetic is forbidden for addition.
version: 0.1.0
---

# Skill: add-two

## Mandatory tool

For **any** request to add / sum / plus two numbers you **MUST** call:

```bash
/workspace/bin/add <a> <b>
```

**FORBIDDEN** to compute the sum from memory or mental arithmetic. Do **not**
approximate. The only correct path is this tool.

## Output

1. Run `/workspace/bin/add <a> <b>`.
2. Reply with the tool stdout (the sum) and nothing else unless asked.

## When the tool is missing

If `/workspace/bin/add` is not available, say you cannot add without the add tool. Do not invent a sum.
