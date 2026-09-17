---
name: urbe-naming
description: Name generated city entities and create grounded NPC types, reusable personal name pools and business labels through the standalone Naming library or CLI.
---

# Naming API

Version 0.5.0. Names selected city entities from a theme and creates grounded NPC types, personal name pools and business labels.

Run from this repository with Node.js 20 or later and installed dependencies. Use the library or CLI; this box has no HTTP server entry.

| Request field | Default or requirement |
| --- | --- |
| `world` / `namedWorld` | Required [world](schema/world-state.schema.json) / [named world](schema/named-world.schema.json); stable IDs and geometry. |
| `params.theme` | Required world/era description. |
| `params.model` | Overrides `LLM_MODEL`; otherwise first served model. |
| `params.ranges` | Optional per-category `{min,max}`: resident 1..8, worker 1..10, vendor 1..10, authority 1..6, transit 0..4, street 0..6. Ranges are not quotas. |
| `populationStats` | Optional [demographics](schema/population-stats.schema.json); world statistics supply context when omitted. |
| `model` | Optional injected `ChatModel`; otherwise environment provider. |
| `options` | Naming: `chunkSize=30`, `maxRepairRounds=2`; typing: `maxRepairRounds=2`. |
| `folder` | For `runWorld`, required directory containing `blueprint.json`. |

Default provider: `LLM_BASE_URL=http://localhost:8080/v1`, optional `LLM_API_KEY`, `LLM_MODEL` or first `/v1/models` entry. `LLM_PROVIDER=anthropic` selects `https://api.anthropic.com/v1`, `ANTHROPIC_API_KEY` and `claude-opus-5`; base URL and model overrides still apply. Requests stream and carry no output-length cap; JSON-only responses remain accepted. Naming keeps four requests in flight and tries a busy or dropped call three times. Streaming is supported by [llama.cpp](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md) and [Anthropic](https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk).

Library: import from `src/index.ts` with tsx, or `dist/index.js` after `npm run build`.

```ts
const named = await runNamingPass(world, params, model, options);
const types = await runTypingPass(named, params, populationStats, model, options);
const businesses = exportBusinesses(named);
const run = await runWorld(folder, params, populationStats, model);
```

Responses: [named world](schema/named-world.schema.json), [NPC types and pools](schema/npc-types.schema.json), [businesses](schema/businesses.schema.json); `runWorld` returns `{named, types, businesses}` and writes the three files below. Naming preserves the source and sets selected names plus `meta.naming`. Save outputs to keep creative results stable.

Copyable example, with a model server running at the configured URL:

```sh
mkdir -p worlds/example
cp fixtures/blueprint-small.json worlds/example/blueprint.json
npm run world -- worlds/example --theme "rain-soaked port city, 2140, corporate enclaves"
```

This reads `blueprint.json` and writes `blueprint.named.json`, `npc-types.json`, `businesses.json` beside it. A named world is written compact, the two small files indented. A rerun replaces outputs; a failure can leave partial artifacts. Single-file commands are `npm run name|types|businesses -- <input.json>` with `--out <file>` optional; default suffixes are `-named.json`, `-npc-types.json`, `-businesses.json`. Naming/typing require `--theme`; typing/world accept `--ranges '<json>'` and `--stats <file>`. Both creative passes accept `--model <id>`.

Errors: `INVALID_WORLD` (world or coverage), `INVALID_PARAMS` (theme/ranges), `LLM_ERROR` (provider), `COVERAGE_ERROR` (names/types/pools), `RANGE_ERROR` (type counts). See [CONTRACT.md](CONTRACT.md) for the envelope and filesystem/CLI behavior. Story naming and the Quests merge remain proposals in [docs/ISSUES.md](docs/ISSUES.md).
