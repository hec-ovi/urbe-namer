# Naming box

| Box | Purpose | Input | Output | Dependencies |
| --- | --- | --- | --- | --- |
| [Naming](../CONTRACT.md) | Name entities and create NPC types/pools | [World](../schema/world-state.schema.json), [params](../schema/params.schema.json), optional [demographics](../schema/population-stats.schema.json) | [Named world](../schema/named-world.schema.json), [types](../schema/npc-types.schema.json), [businesses](../schema/businesses.schema.json) | Atlas data, optional Simulation data, Materials sign format, an author dir or injected model |

- [Agent skill](../SKILL.md): calls, defaults and example.
- [Authoring](../AUTHORING.md): answering an author dir until the world is named.
- [README](../README.md): setup and local verification.
- [Issues](ISSUES.md): open cross-box questions.
- [Changelog](../CHANGELOG.md): current package behavior.

One box. `src/index.ts` and `src/cli.ts` expose it, built to `dist/` for the CLI scripts; `passes/` coordinates creative work (charter, batches, name pools), `world/` selects and patches entities and handles folders, `validate/` enforces schemas, coverage and name variety, `llm/` holds the model port and the author dir, `export/` projects businesses; `json.ts` and `progress.ts` at the root read and write files and time progress lines. Prompts live in `prompts/`, public JSON schemas in `schema/`.

Tests build the box, then call the library and the CLI scripts with scripted models and answered author dirs. Test artifacts stay in `.test-work/`; no sibling runtime or model server is required.
