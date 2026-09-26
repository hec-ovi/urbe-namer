# Naming contract

Version 0.6.1. Names selected world entities from a theme and produces grounded NPC types, personal name pools and business labels.

## Calls

Library entry: `src/index.ts`, compiled to `dist/index.js`. Public exports: the four calls below, `NamingError`, `OpenAICompatModel`, `WORLD_FILES` and the types re-exported from `src/index.ts`. CLI: see below; examples in [SKILL.md](SKILL.md).

| Call | Input schemas | Response schema |
| --- | --- | --- |
| `runNamingPass(world, params, model?, options?)` | [World](schema/world-state.schema.json), [params](schema/params.schema.json) | [Named world](schema/named-world.schema.json) |
| `runTypingPass(namedWorld, params, populationStats?, model?, options?)` | Named world, params, optional [population statistics](schema/population-stats.schema.json) | [NPC types](schema/npc-types.schema.json) |
| `exportBusinesses(namedWorld)` | Named world | [Businesses](schema/businesses.schema.json) |
| `runWorld(folder, params, populationStats?, model?, options?)` | Folder containing `blueprint.json`, params, optional demographics | `{named, types, businesses}`, the three schemas above |

Passes and folder calls return promises; business export is synchronous. An injected [ChatModel](src/llm/model.ts) supplies its ID and `completeJSON({system, user, schema?})`, returning parsed JSON or throwing `NamingError` with `LLM_ERROR`. Without one, environment settings select the provider. Naming options: `chunkSize` (30), `maxRepairRounds` (2), `progress`; typing options: `maxRepairRounds` (2), `progress`; `runWorld` options: `progress`. `progress(line)` receives one human-readable line per finished step; the text is not a stable format.

Provider requests set `stream: true`, assemble SSE content, accept ordinary JSON responses when streaming is ignored and carry no output-length cap. Blank environment values count as unset. A busy or dropped provider call (HTTP 408, 425, 429 or 5xx, a lost connection, a stream cut mid-answer or a 5xx error event inside the stream) is tried up to seven times with doubling waits from 2 s, each at most 30 s and honoring `Retry-After`, about 90 s in all, long enough for a local server to reload its model; a refused request and model discovery are not retried. An answer that is not JSON, or that the provider stopped at its length limit, is unreadable: it names nothing, and the repair rounds ask again. No sibling runtime is imported.

## CLI

Build once per checkout: `npm ci`, then `npm run build` writes `dist/`. Every script runs `dist/cli.js` and reads `prompts/` and `schema/` from the box root, so a read-only checkout with its dependencies and build serves every call.

`npm run world -- <dir> --theme <text> [--model <id>] [--ranges <json>] [--stats <file>]`

- `<dir>` holds `blueprint.json`, an Atlas blueprint or any [world](schema/world-state.schema.json) document. The CLI writes `blueprint.named.json` (compact), `npc-types.json` and `businesses.json` (indented) beside it, each as soon as its stage completes, and never writes `blueprint.json`.
- Relative paths resolve against the caller's directory (`INIT_CWD`, set by npm), so `npm --prefix <naming box> run world -- <dir> ...` works from anywhere.
- Model server: `LLM_BASE_URL` (default `http://localhost:8080/v1`, root or `/v1`), `LLM_MODEL` (default the first entry of `GET /v1/models`), `LLM_API_KEY` (optional bearer token). `--model` wins over `LLM_MODEL`. `LLM_PROVIDER=anthropic` selects `https://api.anthropic.com/v1`, `ANTHROPIC_API_KEY` and `claude-opus-5`; base URL and model overrides still apply.
- Exit 0: the last stdout line is `<dir>: blueprint.named.json, npc-types.json (<n> types), businesses.json (<m> businesses)` with `<dir>` absolute. Plain `npm run` first prints its own banner on stdout (an empty line, `> urbe-naming@<version> world`, the command, an empty line); `npm run --silent world ...` or `node dist/cli.js world ...` prints the result line alone.
- Stderr carries progress lines while it runs (`naming: batch 2/6, corporations (30) in 41.2s`, `typing: done, NPC types (11), given names (48), family names (30) in 88.0s`).
- Exit 1: after any progress lines, stderr ends with `usage error: <reason>` and the usage, or with `<CODE>: <message>` from the error table below and a JSON detail when the failure carries one (missing ids, a problem list).
- `--ranges` and `--stats` feed the typing pass as in the library. Every flag takes a value, as the next argument or as `--flag=<value>`; the argument after a flag is its value even when it starts with `-`, so a free-text theme passes as one argument. Flags may come in any order; an unknown or empty flag, a missing `--theme` or a second input path is a usage error.

Single-file commands: `npm run name -- <world.json> --theme <text> [--model <id>] [--out <file>]`, `npm run types -- <named-world.json> --theme <text> [--model <id>] [--ranges <json>] [--stats <file>] [--out <file>]`, `npm run businesses -- <named-world.json> [--out <file>]`. Default outputs replace `.json` with `-named.json`, `-npc-types.json` and `-businesses.json`; `name` writes compact JSON. They print `<what> written to <file>` as their last stdout line.

## Rules and outputs

- The input must match the world projection even with explicit placeholders. Objects carrying string `id` and `placeholder` select the explicit naming set; otherwise selection covers districts, non-residential parcels, train/subway stations and lines, and bus routes. Bus stops are outside the default policy. Selected IDs must be unique and the set nonempty.
- Naming copies the input, changes selected `name` values and sets `meta.naming = {theme, model, namedAt}` with canonical UTC timestamp. Other data, including Atlas version and geometry, pass through. LLM names and timestamps are not deterministic; reuse saved artifacts for stable names.
- Names are case-insensitively unique per namespace: all parcels share one, districts and each transit kind use their own. Names use ASCII letters, digits, spaces and `- . , ' ! ? : / & +`, up to 32 characters. Accent folding and whitespace normalization precede validation.
- One call writes the naming charter (voice, registers, local motifs, banned words and fragments) and names the districts; a reply without a charter is asked again whole, up to `maxRepairRounds` more times. A motif that contains one of the charter's banned words is dropped. The rest follows in batches of `chunkSize` within one namespace and topic (businesses, corporations, civic places, each transit kind), four requests in flight whatever the city's size, each carrying the charter, the district names and the names its namespace took most recently, two batches' worth. Every reply entry states the name's origin before the name; only the name is kept.
- Repair rounds, up to `maxRepairRounds` for the districts and again for the rest, rename entities that are missing, unsignable or duplicated, that contain a charter-banned word, whose parcel name shares a word with more than `max(3, ceil(parcels / 25))` earlier parcel names, or whose parcel name copies a district, station, line or route name whole. The last three are quality: a valid name is only replaced by a clean one and stays when none comes back. District names are final once the batches start; the later rounds rename only the rest. Missing, unsignable or duplicated names left after the rounds fail the pass.
- Every call that accepts or returns a named world checks it twice: [named world](schema/named-world.schema.json) for structure and the naming metadata block, then coverage in code against the worksheet, which is where the selected set, namespace uniqueness and sign spelling are decided. The schema file alone states structure and metadata; a document that passes it can still be rejected for coverage.
- Types have a unique machine ID, label, category, boilerplate, optional examples, positive relative weight and grounding in existing district names, parcel uses and tiers. Category counts follow ranges. Given and family pools have at least 20 distinct names each. `given` is the union of `givenByGender.male`, `female`, `neutral`, in that order, deduplicated case-insensitively. Pools allocate no people. A pool list with eight or more names in a row whose initials climb the alphabet by one to three letters (one step back of up to three letters forgiven), or a name under two letters or with no vowel, `y`, `w` or closing `ng`, earns a repair round; when the rounds run out, the latest answer without broken parts is returned.
- Businesses are `{brandName, businessKind, tier}` records in parcel order for named hotel, commerce, mall, restaurant, coffee_shop, corpo and clinic parcels. Empty output is valid. This is the `businesses` field of Materials' rebrand request; the caller supplies its material theme key.
- `runWorld` reads `blueprint.json` and writes `blueprint.named.json` compact, like the blueprint it carries, then `npc-types.json` and `businesses.json` indented. Reruns replace outputs from the original blueprint. Successful earlier writes remain after a later failure; the folder is not an atomic bundle.

## Errors

API failures throw `NamingError {code, message, detail?}` with this closed code set. Injected models must use that envelope. World-file read/write and JSON decoding failures use `INVALID_WORLD`; unreadable stats files and malformed ranges JSON use `INVALID_PARAMS`. Messages name the file, endpoint or cause.

| Code | Meaning |
| --- | --- |
| `INVALID_WORLD` | Invalid world/named-world schema or name coverage, empty selection, duplicate selected IDs, invalid businesses projection, or unreadable/unwritable world JSON files. |
| `INVALID_PARAMS` | Params or population statistics fail their schema, theme or model is blank, a range is reversed, or options are invalid (chunk size must be a positive integer, repair rounds a nonnegative integer, progress a function). |
| `LLM_ERROR` | Model discovery or HTTP/transport failure, a retried call included, or repair rounds that ran out after unreadable answers. |
| `COVERAGE_ERROR` | No charter, names still missing, unsignable or duplicated after repair, or malformed or ungrounded typing output. |
| `RANGE_ERROR` | Typing repair ends with category count problems only. |

## Dependencies

Data only: [Atlas](../atlas/CONTRACT.md) ([blueprint](../atlas/schema/blueprint.ts)), optional [Simulation](../simulation/CONTRACT.md) ([demographics](../simulation/src/schemas/population.ts)), [Materials](../materials/CONTRACT.md) ([rebrand](../materials/schema/rebrand-request.schema.json)). Runtime: Node.js 20 or later and Ajv; model access through the injected port or an OpenAI-compatible provider. Consumers: Simulation, Quests, Engine and Materials.

Naming producer-version metadata and story integration are coordinated proposals in [issues](docs/ISSUES.md); published output schemas retain their existing shapes.
