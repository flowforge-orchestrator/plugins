# Workspace markdown — :ff-plugin-form examples

Paste into executor `help.md` (replace IDs).

## Launch + status (two forms, one process)

```markdown
:ff-plugin-form{plugin-id="myplugin" form-id="launch" diagram-id="550e8400-e29b-41d4-a716-446655440000"}

:ff-plugin-form{plugin-id="myplugin" form-id="status" diagram-id="550e8400-e29b-41d4-a716-446655440000" refresh-interval="5"}
```

## Guest portal by slug (no diagram UUID in doc)

```markdown
:ff-plugin-form{plugin-id="myplugin" form-id="launch" public-portal-slug="demo-my-flow"}
```

## Preconditions (document for authors)

1. Plugin enabled in workspace settings.
2. Process has **public portal** enabled (for launch).
3. For status/download form: executor outputs wired to **`system.output`** so `latestResult` contains structured fields.
4. Use **inline** syntax `:ff-plugin-form{…}` — not `::ff-plugin-form` block.
