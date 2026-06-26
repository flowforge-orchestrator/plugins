# Echo executor

## Purpose

Returns the input text and its length (after trim) — reference for **multiple outputs** instead of a single `output` blob.

## Inputs

| Field | Type | Port | Required |
| --- | --- | --- | --- |
| text | string | yes | yes |

## Outputs

| Field | Description |
| --- | --- |
| text | Normalized string |
| length | Character count |

## Example

User input → `plugin.example.echo` → wire `text` and `length` to downstream nodes.
