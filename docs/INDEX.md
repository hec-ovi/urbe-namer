# Naming box

| Box | Purpose | Input | Output | Dependencies |
| --- | --- | --- | --- | --- |
| [Naming](../CONTRACT.md) | Name entities and create NPC types/pools | [World](../schema/world-state.schema.json), [params](../schema/params.schema.json), optional [demographics](../schema/population-stats.schema.json) | [Named world](../schema/named-world.schema.json), [types](../schema/npc-types.schema.json), [businesses](../schema/businesses.schema.json) | Atlas data, optional Simulation data, Materials sign format, injected model |

- [Agent skill](../SKILL.md): calls, defaults and example.
- [README](../README.md): setup and local verification.
- [Issues](ISSUES.md): open cross-box questions.
- [Changelog](../CHANGELOG.md): current package behavior.

One box. `src/index.ts` and `src/cli.ts` expose it; `passes/` coordinates creative work and normalizes name pools, `world/` selects and patches entities and handles folders, `validate/` enforces schemas and coverage, `llm/` handles transport and its retries, `export/` projects businesses; `json.ts` and `pool.ts` at the root read and write files and bound the requests in flight. Prompts live in `prompts/`, public JSON schemas in `schema/`.

Tests call the library and CLI entry points with injected model responses. Test artifacts stay in `.test-work/`; no sibling runtime or model server is required.
