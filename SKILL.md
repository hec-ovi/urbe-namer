---
name: urbe-naming
description: Name generated city entities and create grounded NPC types, reusable personal name pools and business labels through the standalone Naming library or CLI, with an external author answering each request.
---

# Naming API

Version 0.7.0. Names selected city entities from a theme and creates grounded NPC types, personal name pools and business labels. An external author answers every creative request through an author dir; the box calls no model.

Run from this repository with Node.js 20 or later, installed dependencies and a build (`npm ci && npm run build`). Use the library or CLI; this box has no HTTP server entry.

| Request field | Default or requirement |
| --- | --- |
| `world` / `namedWorld` | Required [world](schema/world-state.schema.json) / [named world](schema/named-world.schema.json); stable IDs and geometry. |
| `params.theme` | Required world/era description. |
| `params.ranges` | Optional per-category `{min,max}`: resident 1..8, worker 1..10, vendor 1..10, authority 1..6, transit 0..4, street 0..6. Ranges are not quotas. |
| `populationStats` | [Demographics](schema/population-stats.schema.json) or `undefined`; world statistics supply context when omitted. |
| `model` | Required `ChatModel`: `new AuthorDir(dir, id)` or an injected model. |
| `options` | Naming: `chunkSize=30`, `maxRepairRounds=2`, `progress`; typing: `maxRepairRounds=2`, `progress`; `runWorld`: `progress`. |
| `folder` | For `runWorld`, required directory containing `blueprint.json`. |

Library: import from `src/index.ts` with tsx, or `dist/index.js` after `npm run build`.

```ts
const author = new AuthorDir("worlds/example/author", "claude-opus");
const named = await runNamingPass(world, params, author, options);
const types = await runTypingPass(named, params, populationStats, author, options);
const businesses = exportBusinesses(named);
const run = await runWorld(folder, params, populationStats, author, { progress: console.error });
```

A request the author dir cannot answer yet is written as `<key>.md` and the call rejects with `AuthorPending` (`code: "AUTHOR_PENDING"`, `requests`: the request files). Write each `<key>.json` and call again; answers on disk are replayed. The loop is in [AUTHORING.md](AUTHORING.md).

Responses: [named world](schema/named-world.schema.json), [NPC types and pools](schema/npc-types.schema.json), [businesses](schema/businesses.schema.json); `runWorld` returns `{named, types, businesses}` and writes the three files below. Naming preserves the source and sets selected names plus `meta.naming`.

Copyable example:

```sh
mkdir -p worlds/example
cp fixtures/blueprint-small.json worlds/example/blueprint.json
npm run --silent world -- worlds/example --theme "rain-soaked port city, 2140, corporate enclaves" --model claude-opus
# exit 2: answer each listed worlds/example/author/<key>.md as <key>.json, then run it again
```

In a throwaway container:

```sh
docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$PWD":/work/naming:ro -v "$PWD/worlds/example":/out -w /work/naming \
  node:22 npm run --silent world -- /out --theme "dark cyberpunk port city"
```

This reads `blueprint.json` and writes `blueprint.named.json`, `npc-types.json`, `businesses.json` beside it, with the requests and answers in `author/`; the result is the last stdout line (the only one with `--silent`), stderr gets the progress lines. Exit 2 means answers are missing and stdout lists the request files. `--author <dir>` moves the author dir; `--model <id>` names the author in the outputs. Every flag takes a value, so a theme starting with `-` passes as one argument. Relative paths resolve against the caller's directory. A rerun replaces outputs; a failure can leave partial artifacts. Single-file commands are `npm run name|types|businesses -- <input.json>` with `--out <file>` optional; default suffixes are `-named.json`, `-npc-types.json`, `-businesses.json`. `world`, `name` and `types` require `--theme` and accept `--author` and `--model`; `world` and `types` accept `--ranges '<json>'` and `--stats <file>`. The exact CLI contract is in [CONTRACT.md](CONTRACT.md#cli).

Errors: `INVALID_WORLD`, `INVALID_PARAMS`, `LLM_ERROR`, `COVERAGE_ERROR`, `RANGE_ERROR`; the CLI prints `usage error: ...` or `<CODE>: <message>` on stderr and exits 1. `AUTHOR_PENDING` exits 2. Story naming and the Quests merge remain proposals in [docs/ISSUES.md](docs/ISSUES.md).
