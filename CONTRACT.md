# Naming contract

Version 0.8.0. Names selected world entities from a theme and produces grounded NPC types, personal name pools and business labels. An author outside the box, an agent or a person, writes every creative answer through an [author dir](#author-dir); the box calls no model itself.

## Calls

Library entry: `src/index.ts`, compiled to `dist/index.js`. Public exports: the four calls below, `AuthorDir`, `AuthorPending`, `NamingError`, `WORLD_FILES` and the types re-exported from `src/index.ts`. CLI: see below; examples in [SKILL.md](SKILL.md), the author's guide in [AUTHORING.md](AUTHORING.md).

| Call | Input schemas | Response schema |
| --- | --- | --- |
| `runNamingPass(world, params, model, options?)` | [World](schema/world-state.schema.json), [params](schema/params.schema.json) | [Named world](schema/named-world.schema.json) |
| `runTypingPass(namedWorld, params, populationStats, model, options?)` | Named world, params, [population statistics](schema/population-stats.schema.json) or `undefined` | [NPC types](schema/npc-types.schema.json) |
| `exportBusinesses(namedWorld)` | Named world | [Businesses](schema/businesses.schema.json) |
| `runWorld(folder, params, populationStats, model, options?)` | Folder containing `blueprint.json`, params, demographics or `undefined` | `{named, types, businesses}`, the three schemas above |

Passes and folder calls return promises; business export is synchronous. The [ChatModel](src/llm/model.ts) supplies its ID and `completeJSON({key, basis, system, user, schema})`, returning parsed JSON or throwing `NamingError`: `LLM_ERROR` when it fails, `AuthorPending` when no answer exists yet. `key` names the request within its run; the same world and the same earlier answers give every request the same key. `basis` is what the answer is written for ([author dir](#author-dir)). The CLI's model is `new AuthorDir(dir, id)`; tests inject scripted models. Naming options: `chunkSize` (30), `maxRepairRounds` (2), `progress`; typing options: `maxRepairRounds` (2), `progress`; `runWorld` options: `progress`. `progress(line)` receives one human-readable line per finished step; the text is not a stable format.

An answer that is not JSON is unreadable: it names nothing, and the repair rounds ask again. Requests are asked one at a time, in the order below. No sibling runtime is imported.

## Author dir

`AuthorDir(dir, id = "author")` answers each request from a folder laid out like Quests' [external author](../quests/creation/CONTRACT.md#external-author). `id` names the author in `meta.naming.model` and in the type set's `meta.model`.

```
<author-dir>/
  <key>.json             the author writes each answer: one JSON document, a fenced code block around it accepted
  requests/<key>.md      the run writes each request
  stale/<key>.<n>.json   answers set aside, numbered from 1, never overwritten
```

A request file reads `Request: <key>`, `Answer: <key>.json` and `Basis: <fingerprint>`, then the system prompt, the prompt and the answer's JSON schema under `======== SYSTEM ========`, `======== PROMPT ========` and `======== ANSWER SCHEMA ========` lines, exactly as the passes render them. An answer goes through the passes' own parsers, checks and repair rounds, like a model's: whatever they reject comes back as a repair request.

A request without an answer is written and stops the run with `AuthorPending`, whose `requests` are the request files. A stage runs all of its calls before it stops, so one stop writes every request of the stage. A rerun reads each answer back by key, runs through every answered stage and stops at the first stage with unanswered requests; with every answer on disk it finishes. Keys in run order:

| Key | Request |
| --- | --- |
| `naming-districts-<n>` | The charter and the district names; `n` above 1 only when the answer before it carried no charter. |
| `naming-districts-repair-<round>-<batch>` | District renames. |
| `naming-batch-<batch>` | The first names of everything else, one topic per batch. |
| `naming-repair-<round>-<batch>` | Renames of everything else. |
| `typing-<round>` | The NPC types and the name pool; round 1 is the task, later rounds repair it. |

Batch numbers start at 1 and are zero-padded to the width of the stage's batch count.

The fingerprint hashes the request's basis and answer schema. A naming basis is the theme, the world's seed and the entities the request names (ID, placeholder, group and attributes; for a rename also the current name, the problem and its word). A typing basis is the seed, the theme, the world summary and the ranges, and in a repair the problems and the previous answer. The charter, the district names and the names taken so far, shown beside the entities, are context: a change there keeps the answer, and the checks hold it to the new charter and names.

An answer stands while its request file carries the same fingerprint. An answer without a request file, as in a copied author dir, is adopted and its request written. An answer whose request file carries another fingerprint was written for another theme, world or earlier answer: it moves to `stale/` and its request is written again. One author dir holds the answers of one world and theme at a time.

## CLI

Build once per checkout: `npm ci`, then `npm run build` writes `dist/`. Every script runs `dist/cli.js` and reads `prompts/` and `schema/` from the box root, so a read-only checkout with its dependencies and build serves every call.

`npm run world -- <dir> --theme <text> --external <author-dir> [--model <label>] [--ranges <json>] [--stats <file>]`

- `<dir>` holds `blueprint.json`, an Atlas blueprint or any [world](schema/world-state.schema.json) document. The CLI writes `blueprint.named.json` (compact), `npc-types.json` and `businesses.json` (indented) beside it, each as soon as its stage completes, and never writes `blueprint.json`.
- Relative paths resolve against the caller's directory (`INIT_CWD`, set by npm), so `npm --prefix <naming box> run world -- <dir> ...` works from anywhere.
- `--external` is the [author dir](#author-dir), as in Quests' `npm run author`; `--model` names the author (default `author`).
- Exit 0: the last stdout line is `<dir>: blueprint.named.json, npc-types.json (<n> types), businesses.json (<m> businesses)` with `<dir>` absolute. Plain `npm run` first prints its own banner on stdout (an empty line, `> urbe-naming@<version> world`, the command, an empty line); `npm run --silent world ...` or `node dist/cli.js world ...` prints the result line alone.
- Exit 2: the run waits for its author. After npm's banner, when it prints one, stdout lists the absolute paths of the unanswered request files, one per line; stderr ends with `AUTHOR_PENDING: <n> requests await completions in <author dir>`. Stages that completed have written their outputs. Answer the requests and run the same command again.
- Stderr carries progress lines while it runs (`naming: batch 2/6, corporations (30) in 41.2s`, `typing: done, NPC types (11), given names (48), family names (30) in 88.0s`).
- Exit 1: after any progress lines, stderr ends with `usage error: <reason>` and the usage, or with `<CODE>: <message>` from the error table below and a JSON detail when the failure carries one (missing ids, a problem list).
- `--ranges` and `--stats` feed the typing pass as in the library. Every flag takes a value, as the next argument or as `--flag=<value>`; the argument after a flag is its value even when it starts with `-`, so a free-text theme passes as one argument. Flags may come in any order; an unknown or empty flag, a missing `--theme` or `--external` or a second input path is a usage error.

Single-file commands: `npm run name -- <world.json> --theme <text> --external <author-dir> [--model <label>] [--out <file>]`, `npm run types -- <named-world.json> --theme <text> --external <author-dir> [--model <label>] [--ranges <json>] [--stats <file>] [--out <file>]`, `npm run businesses -- <named-world.json> [--out <file>]`. Default outputs replace `.json` with `-named.json`, `-npc-types.json` and `-businesses.json`; `name` writes compact JSON. They print `<what> written to <file>` as their last stdout line, or exit 2 as above.

## Rules and outputs

- The input must match the world projection even with explicit placeholders. Objects carrying string `id` and `placeholder` select the explicit naming set; otherwise selection covers districts, non-residential parcels, train/subway stations and lines, and bus routes. Bus stops are outside the default policy. Selected IDs must be unique and the set nonempty.
- Naming copies the input, changes selected `name` values and sets `meta.naming = {theme, model, namedAt}` with canonical UTC timestamp. Other data, including Atlas version and geometry, pass through. Names are the author's answers: the same author dir names the same world the same way, and only the timestamps change between runs.
- Names are case-insensitively unique per namespace: all parcels share one, districts and each transit kind use their own. Names use ASCII letters, digits, spaces and `- . , ' ! ? : / & +`, up to 32 characters. Accent folding and whitespace normalization precede validation.
- One call writes the naming charter (voice, registers, local motifs, banned words and fragments) and names the districts; a reply without a charter is asked again whole, up to `maxRepairRounds` more times. A motif that contains one of the charter's banned words is dropped. The rest follows in batches of `chunkSize` within one namespace and topic (businesses, corporations, civic places, each transit kind), each carrying the charter, the district names and the names its namespace took most recently, two batches' worth. Every reply entry states the name's origin before the name; only the name is kept.
- Repair rounds, up to `maxRepairRounds` for the districts and again for the rest, rename entities that are missing, unsignable or duplicated, that contain a charter-banned word, whose parcel name shares a word with more than `max(3, ceil(parcels / 25))` earlier parcel names, or whose parcel name copies a district, station, line or route name whole. The last three are quality: a valid name is only replaced by a clean one and stays when none comes back. District names are final once the batches start; the later rounds rename only the rest. Missing, unsignable or duplicated names left after the rounds fail the pass.
- Every call that accepts or returns a named world checks it twice: [named world](schema/named-world.schema.json) for structure and the naming metadata block, then coverage in code against the worksheet, which is where the selected set, namespace uniqueness and sign spelling are decided. The schema file alone states structure and metadata; a document that passes it can still be rejected for coverage.
- Types have a unique machine ID, label, category, boilerplate, optional examples, positive relative weight and grounding in existing district names, parcel uses and tiers. Category counts follow ranges. Given and family pools have at least 20 distinct names each. `given` is the union of `givenByGender.male`, `female`, `neutral`, in that order, deduplicated case-insensitively. Pools allocate no people. A pool list with eight or more names in a row whose initials climb the alphabet by one to three letters (one step back of up to three letters forgiven), or a name under two letters or with no vowel, `y`, `w` or closing `ng`, earns a repair round; when the rounds run out, the latest answer without broken parts is returned.
- Businesses are `{brandName, businessKind, tier}` records in parcel order for named hotel, commerce, mall, restaurant, coffee_shop, corpo and clinic parcels. Empty output is valid. This is the `businesses` field of Materials' rebrand request; the caller supplies its material theme key.
- `runWorld` reads `blueprint.json` and writes `blueprint.named.json` compact, like the blueprint it carries, then `npc-types.json` and `businesses.json` indented. Reruns replace outputs from the original blueprint. Successful earlier writes remain after a later failure; the folder is not an atomic bundle.

## Errors

API failures throw `NamingError {code, message, detail?}` with this closed code set. Injected models must use that envelope. World-file read/write and JSON decoding failures use `INVALID_WORLD`; unreadable stats files, malformed ranges JSON and an author dir that cannot be read or written use `INVALID_PARAMS`. Messages name the file or cause.

| Code | Meaning |
| --- | --- |
| `INVALID_WORLD` | Invalid world/named-world schema or name coverage, empty selection, duplicate selected IDs, invalid businesses projection, or unreadable/unwritable world JSON files. |
| `INVALID_PARAMS` | Params or population statistics fail their schema, the theme is blank, a range is reversed, options are invalid (chunk size must be a positive integer, repair rounds a nonnegative integer, progress a function), or the author dir cannot be read or written. |
| `LLM_ERROR` | The model failed, or repair rounds ran out after unreadable answers. |
| `COVERAGE_ERROR` | No charter, names still missing, unsignable or duplicated after repair, or malformed or ungrounded typing output. |
| `RANGE_ERROR` | Typing repair ends with category count problems only. |
| `AUTHOR_PENDING` | Not a failure: the run stopped at requests its author dir has no answers for. Thrown as `AuthorPending`, detail `{requests}`, the request files. |

## Dependencies

Data only: [Atlas](../atlas/CONTRACT.md) ([blueprint](../atlas/schema/blueprint.ts)), optional [Simulation](../simulation/CONTRACT.md) ([demographics](../simulation/src/schemas/population.ts)), [Materials](../materials/CONTRACT.md) ([rebrand](../materials/schema/rebrand-request.schema.json)). Runtime: Node.js 20 or later and Ajv; answers come from an author dir or an injected model, and no model server is needed. Consumers: Simulation, Quests, Engine and Materials.

Naming producer-version metadata and story integration are coordinated proposals in [issues](docs/ISSUES.md); published output schemas retain their existing shapes.
