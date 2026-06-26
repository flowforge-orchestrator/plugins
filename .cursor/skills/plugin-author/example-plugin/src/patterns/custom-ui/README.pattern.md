# custom-ui

Forms, widgets, workspace islands (`:ff-plugin-form`). Islands are platform-owned; the plugin ships bundles + manifest.

Fragments: `ui-manifest`, `app.module`, `build-ui.script`, `form-host-api`, form/widget examples, `workspace-markdown.examples.md`.

Workflow: components → entries (`export default`) → `build-ui.mjs` → `*-ui-manifest.ts` → AppModule + manifest → `keepDistDirs: ["ui"]` → `publicationVersion` + container rebuild.
