# CONTRACT: naming

Purpose: agentic pass that names every placeholder in a generated world (districts, stations, lines, businesses, civic buildings) against a theme prompt, and creates the themed dynamic NPC type strings with a prompt boilerplate each.

Status: v0.4. NPC type shape is stable, simulation consumes it. World-state view tracks atlas blueprint v0.5: everything naming does not name (street and rail `level`, station platforms and shafts, all geometry) passes through untouched.

## In
Two passes plus one export, also exposed as a CLI (`npm run name`, `npm run types`, `npm run businesses`), and the world folder run that chains them (`npm run world`).

`runNamingPass(world, params) -> named world`
`runTypingPass(namedWorld, params, populationStats?) -> NPC type set`
`exportBusinesses(namedWorld) -> businesses list`
`runWorld(folder, params, populationStats?) -> { named, types, businesses }`

- `world`: a world state matching [schema/world-state.schema.json](schema/world-state.schema.json), naming's projection of the atlas `CityBlueprint` (../atlas/schema/blueprint.ts). Only the fields naming reads are validated; geometry passes through untouched. Nameables are selected by policy: every district, train/subway station and line, bus route, and every non-residential parcel. A state may instead pre-label entities with an explicit `placeholder` field; those are taken as-is (schema-agnostic walk).
- `params`: [schema/params.schema.json](schema/params.schema.json). `theme` (required): the world description prompt, any era or tone. `model` optional. `ranges` (typing pass): min and max NPC types per category; never exact quotas.
- `populationStats` (typing pass, optional): simulation's PopulationStats (../simulation/src/schemas/population.ts) for demographics grounding; absent, atlas `stats` ground the pass.
- `folder` (world run): a world folder holding `blueprint.json`, an atlas blueprint as generated (copy a sample there, or point at the folder the engine assembles a world in). The run reads it, never writes it, and writes `blueprint.named.json`, `npc-types.json` and `businesses.json` beside it, the names the engine's assembly carries into a game world (`npc-types.json` is picked up beside the blueprint it is given). A rerun reads `blueprint.json` again and replaces the three; a failure midway keeps what was written before it. CLI: `npm run world -- <folder> --theme "..." [--ranges '<json>'] [--stats <file>] [--model <id>]`.
- Provider, from the environment: an OpenAI-compatible chat endpoint at `LLM_BASE_URL` (default `http://localhost:8080/v1`, a local llama.cpp server), model `LLM_MODEL` (default: the first model the server lists at `/v1/models`), `LLM_API_KEY` optional; `params.model` overrides the model per run. `LLM_PROVIDER=anthropic` uses Claude instead (`ANTHROPIC_API_KEY`, model `claude-opus-5` unless `params.model` says otherwise).

## Out
- Named world: the input state, untouched except every nameable gains `name` and `meta.naming` records `{theme, model, namedAt}`. Saved alongside the placeholder version, never over it. Names are unique case-insensitively within their namespace: all parcels share one namespace, districts and each transit kind keep their own (an interchange may reuse a station name across modes); themed chains stay possible through branch-qualified names. Every name spells in the sign alphabet (the materials letter atlas: letters, digits, space and `- . , ' ! ? : / & +`, 32 characters at most), so signs and screens letter it verbatim; accented letters the model returns fold onto their base letter, anything else goes through repair.
- NPC type set: [schema/npc-types.schema.json](schema/npc-types.schema.json). Each type:
  - `type`: unique machine string (`^[a-z][a-z0-9_]*$`), e.g. `dock_smuggler`.
  - `label`: display name.
  - `category`: one of `resident | worker | vendor | authority | transit | street`.
  - `boilerplate`: prompt boilerplate consumers use to instantiate an NPC of this type.
  - `examples`: optional short themed instantiation sketches for downstream few-shot use.
  - `grounding`: what the type is anchored to in the named world: `districts` (names), `parcelTypes` (atlas parcel types), `tiers` (atlas wealth tiers).
  - `weight`: relative demographic weight within its category (positive number, consumers normalize).
  Type counts per category respect `params.ranges`; grounding only references things the world actually contains.
  The set also carries `namePool`: themed personal names, repeating across NPCs by design.
  - `given`: flat array of every given name, at least 20 distinct. Shape mirrored by simulation's NamePool.
  - `givenByGender`: `{ male, female, neutral }` string arrays holding those same names tagged, so a consumer can match a name to a body. Each name sits in exactly one list; `neutral` carries names anyone in the world bears, and a theme with no gendered names puts every given name there (individual lists may be empty). `given` is the union of the three in male, female, neutral order, derived by the harness, so tags and flat list always agree.
  - `family`: at least 20 distinct; entries may be epithets or patronymics when the theme has no family names.

- Businesses list: [schema/businesses.schema.json](schema/businesses.schema.json), the request shape of the materials rebrand lane (../materials/CONTRACT.md): every named parcel of an advertising type (hotel, commerce, mall, restaurant, coffee_shop, corpo, clinic) as `{ brandName, businessKind, tier }` in blueprint order. A world with no such parcel exports an empty list.

## Errors
Closed set, thrown as `NamingError { code, message, detail? }`:
- `INVALID_WORLD`: input fails the world-state schema, exposes nothing nameable, or has duplicate nameable ids; for the export, a world without names or with a business name outside the sign alphabet; for the world run, a folder without `blueprint.json`.
- `INVALID_PARAMS`: missing or empty theme, malformed ranges.
- `LLM_ERROR`: provider failure after retries.
- `COVERAGE_ERROR`: repair loop exhausted; naming still incomplete, duplicated or outside the sign alphabet, or typing output stays ungrounded (references the world lacks, name pool below minimum).
- `RANGE_ERROR`: typing pass produced type counts outside `[min, max]` after repair.

## Invariants
- The LLM never regenerates the world document: it returns an id-keyed name map, the harness patches and validates. Nothing outside the schema is invented; the placeholder version is never mutated.
- Deterministic layers stay deterministic: naming adds `name` fields and a `meta.naming` block, nothing else changes.
- Standalone: runs against the fixtures in [fixtures/](fixtures/) with no other layer present; `atlas-city-urbe-tiny.json` is the atlas tiny sample verbatim (blueprint 0.5.0), the two `blueprint-*.json` are naming-shaped projections.
- Every prompt and few-shot set lives in its own .md file under [prompts/](prompts/); output length is never capped.

## Depends on
- ../atlas/CONTRACT.md (blueprint v0.5: district kinds, wealth tiers, parcel types, transit collections, stats)
- ../simulation/CONTRACT.md (demographics; until its stats surface lands, typing grounds on atlas `stats`)
- ../materials/CONTRACT.md (rebrand request shape, letter atlas charset)

## Consumers
- ../simulation (NPC type set), ../quests (named world, NPC type set), ../engine (named world), ../materials (businesses list)
