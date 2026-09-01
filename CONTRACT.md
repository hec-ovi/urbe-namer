# CONTRACT: naming

Purpose: agentic pass that names every placeholder in a generated world (districts, stations, lines, businesses, civic buildings) against a theme prompt, and creates the themed dynamic NPC type strings with a prompt boilerplate each.

Status: v0.2. NPC type shape is stable, simulation consumes it. World-state view tracks atlas blueprint v0.2.

## In
Two entry points, also exposed as a CLI (`npm run name`, `npm run types`).

`runNamingPass(world, params) -> named world`
`runTypingPass(namedWorld, params, populationStats?) -> NPC type set`

- `world`: a world state matching [schema/world-state.schema.json](schema/world-state.schema.json), naming's projection of the atlas `CityBlueprint` (../atlas/schema/blueprint.ts). Only the fields naming reads are validated; geometry passes through untouched. Nameables are selected by policy: every district, train/subway station and line, bus route, and every non-residential parcel. A state may instead pre-label entities with an explicit `placeholder` field; those are taken as-is (schema-agnostic walk).
- `params`: [schema/params.schema.json](schema/params.schema.json). `theme` (required): the world description prompt, any era or tone. `model` optional. `ranges` (typing pass): min and max NPC types per category; never exact quotas.
- `populationStats` (typing pass, optional): simulation's PopulationStats (../simulation/src/schemas/population.ts) for demographics grounding; absent, atlas `stats` ground the pass.
- Provider: Claude by default. With `LLM_BASE_URL` set in the environment, an OpenAI-compatible endpoint is used instead (local llama.cpp server works; `LLM_MODEL` names the served model or alias, `LLM_API_KEY` optional).

## Out
- Named world: the input state, untouched except every nameable gains `name` and `meta.naming` records `{theme, model, namedAt}`. Saved alongside the placeholder version, never over it. Names are unique case-insensitively within their namespace: all parcels share one namespace, districts and each transit kind keep their own (an interchange may reuse a station name across modes); themed chains stay possible through branch-qualified names.
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

## Errors
Closed set, thrown as `NamingError { code, message, detail? }`:
- `INVALID_WORLD`: input fails the world-state schema, exposes nothing nameable, or has duplicate nameable ids.
- `INVALID_PARAMS`: missing or empty theme, malformed ranges.
- `LLM_ERROR`: provider failure after retries.
- `COVERAGE_ERROR`: repair loop exhausted; naming still incomplete or duplicated, or typing output stays ungrounded (references the world lacks, name pool below minimum).
- `RANGE_ERROR`: typing pass produced type counts outside `[min, max]` after repair.

## Invariants
- The LLM never regenerates the world document: it returns an id-keyed name map, the harness patches and validates. Nothing outside the schema is invented; the placeholder version is never mutated.
- Deterministic layers stay deterministic: naming adds `name` fields and a `meta.naming` block, nothing else changes.
- Standalone: runs against the fixtures in [fixtures/](fixtures/) with no other layer present.
- Every prompt and few-shot set lives in its own .md file under [prompts/](prompts/); output length is never capped.

## Depends on
- ../atlas/CONTRACT.md (blueprint v0.2: district kinds, wealth tiers, parcel types, transit collections, stats)
- ../simulation/CONTRACT.md (demographics; until its stats surface lands, typing grounds on atlas `stats`)

## Consumers
- ../simulation (NPC type set), ../quests (named world, NPC type set), ../engine (named world)
