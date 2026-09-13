# Naming contract

Version 0.4.9. Names selected world entities from a theme and produces grounded NPC types, personal name pools and business labels.

## Calls

Library entry: `src/index.ts`, compiled to `dist/index.js`. CLI: `npm run name|types|businesses|world -- ...`; examples and defaults in [SKILL.md](SKILL.md).

| Call | Input schemas | Response schema |
| --- | --- | --- |
| `runNamingPass(world, params, model?, options?)` | [World](schema/world-state.schema.json), [params](schema/params.schema.json) | [Named world](schema/named-world.schema.json) |
| `runTypingPass(namedWorld, params, populationStats?, model?, options?)` | Named world, params, optional [PopulationStats](../simulation/src/schemas/population.ts) projection in [typing](src/passes/typing.ts) | [NPC types](schema/npc-types.schema.json) |
| `exportBusinesses(namedWorld)` | Named world | [Businesses](schema/businesses.schema.json) |
| `runWorld(folder, params, populationStats?, model?)` | Folder containing `blueprint.json`, params, optional demographics | `{named, types, businesses}`, the three schemas above |

Passes and folder calls return promises; business export is synchronous. An injected [ChatModel](src/llm/model.ts) supplies its ID and `completeJSON({system, user, schema?})`, returning parsed JSON or throwing `NamingError` with `LLM_ERROR`. Without one, environment settings select the provider. Naming options: `chunkSize` (30), `maxRepairRounds` (2); typing options: `maxRepairRounds` (2). No sibling runtime is imported.

## Rules and outputs

- The input must match the world projection even with explicit placeholders. Objects carrying string `id` and `placeholder` select the explicit naming set; otherwise selection covers districts, non-residential parcels, train/subway stations and lines, and bus routes. Bus stops are outside the default policy. Selected IDs must be unique and the set nonempty.
- Naming copies the input, changes selected `name` values and sets `meta.naming = {theme, model, namedAt}` with canonical UTC timestamp. Other data, including Atlas version and geometry, pass through. LLM names and timestamps are not deterministic; reuse saved artifacts for stable names.
- Names are case-insensitively unique per namespace: all parcels share one, districts and each transit kind use their own. Names use ASCII letters, digits, spaces and `- . , ' ! ? : / & +`, up to 32 characters. Accent folding and whitespace normalization precede validation; invalid names require repair. District/charter failure rejects immediately; other names receive the configured repair rounds.
- Types have a unique machine ID, label, category, boilerplate, optional examples, positive relative weight and grounding in existing district names, parcel uses and tiers. Category counts follow ranges. Given and family pools have at least 20 distinct names each. `given` is the union of `givenByGender.male`, `female`, `neutral`, in that order, deduplicated case-insensitively. Pools allocate no people.
- Businesses are `{brandName, businessKind, tier}` records in parcel order for named hotel, commerce, mall, restaurant, coffee_shop, corpo and clinic parcels. Empty output is valid. This is the `businesses` field of Materials' rebrand request; the caller supplies its material theme key.
- `runWorld` reads `blueprint.json` and writes `blueprint.named.json`, `npc-types.json`, then `businesses.json`. Reruns replace outputs from the original blueprint. Successful earlier writes remain after a later failure; the folder is not an atomic bundle.

## Errors

Domain failures throw `NamingError {code, message, detail?}` with this closed code set. Injected models must use that envelope. CLI usage, filesystem and JSON decoding failures exit with status 1; filesystem/JSON errors currently retain their native error type.

| Code | Meaning |
| --- | --- |
| `INVALID_WORLD` | Invalid world/named-world schema or name coverage, empty selection, duplicate selected IDs, invalid businesses projection, or missing folder blueprint. |
| `INVALID_PARAMS` | Missing/blank theme or reversed typing range. |
| `LLM_ERROR` | Model discovery, HTTP/transport failure or malformed provider JSON. Provider calls are not retried. |
| `COVERAGE_ERROR` | Invalid district/charter response, failed naming repair/metadata, malformed types/pools or ungrounded typing output. |
| `RANGE_ERROR` | Typing repair ends with category count problems only. |

## Dependencies

Data only: [Atlas](../atlas/CONTRACT.md) ([blueprint](../atlas/schema/blueprint.ts)), optional [Simulation](../simulation/CONTRACT.md) ([demographics](../simulation/src/schemas/population.ts)), [Materials](../materials/CONTRACT.md) ([rebrand](../materials/schema/rebrand-request.schema.json)). Runtime: Node.js and Ajv; model access through the injected port or OpenAI-compatible provider. Consumers: Simulation, Quests, Engine and Materials.

Naming producer-version metadata and story integration are coordinated proposals in [issues](docs/ISSUES.md); published output schemas retain their existing shapes.
