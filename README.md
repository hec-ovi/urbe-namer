# urbe-namer

The agentic pass that turns a generated world of placeholders into a named one. Give it a world state and a theme prompt in any era or tone; it names every district, station, line, route and business, and writes the themed NPC type set the population layer instantiates people from.

Two passes, both a library call and a CLI, run against a local llama.cpp server by default; any OpenAI-compatible endpoint or Claude works.

## Run

```
npm install
npm test
mkdir -p worlds/small
cp ../atlas/samples/city-urbe-small.json worlds/small/blueprint.json
npm run world -- worlds/small --theme "rain-soaked port city, 2140, corporate enclaves"
npm run build
```

A world folder holds one `blueprint.json`, an atlas blueprint as generated; point the command at the folder the engine assembles a world in instead, and it names that one. The run writes `blueprint.named.json`, `npc-types.json` and `businesses.json` beside it and never writes `blueprint.json`, so a rerun starts from the same placeholders. Hand `blueprint.named.json` to the engine's `assemble-city`; it carries `npc-types.json` along.

The steps also run one at a time on single files:

```
npm run name  -- world.json       --theme "rain-soaked port city, 2140, corporate enclaves"
npm run types -- named-world.json --theme "rain-soaked port city, 2140, corporate enclaves" --stats population.json
npm run businesses -- named-world.json
```

Flags: `--model <id>`, `--out <file>`, and for the typing pass `--ranges '<json>'` (min and max types per category) and `--stats <populationStats.json>`. Provider settings come from the environment: `LLM_BASE_URL` names the OpenAI-compatible endpoint (default `http://localhost:8080/v1`), `LLM_MODEL` the served model (default: the first one the server lists), and `LLM_API_KEY` is optional. `LLM_PROVIDER=anthropic` uses Claude through Anthropic's compatible endpoint with `ANTHROPIC_API_KEY`. Requests carry no output-token limit. Bundled fixtures let both passes run with no other layer present.

## In

- **A world state** (`schema/world-state.schema.json`): the projection of a city blueprint the naming pass reads. Nameables are selected by policy (every district, train and subway station, line, bus route, and every non-residential parcel), or a state can pre-label entities with an explicit `placeholder` field and the pass walks those instead, whatever the schema.
- **Params**: `theme` is the world description prompt and the only required one; plus optional model and, for the typing pass, count ranges per category.
- **Population stats** (optional): real demographics to ground the NPC types. Without them, the world's own statistics ground the pass.

## Out

- **A named world**: the input document untouched except that every nameable gains a `name`, with a `meta.naming` record of theme, model and timestamp. It is saved alongside the placeholder version, never over it. Names are unique case-insensitively inside their namespace, themed chains stay possible through branch-qualified names, and every name spells in the sign alphabet (letters, digits, space and a few marks, 32 characters at most) so signs and screens letter it verbatim.
- **A businesses list** (`schema/businesses.schema.json`): every named hotel, shop, mall, restaurant, coffee shop, corporation and clinic as `{ brandName, businessKind, tier }`, the request the materials rebrand lane spells onto its ad screens.
- **An NPC type set** (`schema/npc-types.schema.json`): each type has a machine string (`dock_smuggler`), a display label, a category (resident, worker, vendor, authority, transit, street), a prompt boilerplate consumers instantiate from, optional example sketches, a demographic weight, and grounding that references only districts, parcel types and tiers the world actually contains. The set also carries a themed name pool: at least 20 distinct given names, both as a flat list and tagged male, female or neutral so a consumer can match a name to a body, plus at least 20 family names.

## How it works

The model never regenerates the world document. It receives a charter, then chunks of nameables, and returns an id-keyed name map; the harness patches, validates and runs repair loops until coverage is complete, unique and signable. Anything outside the schema is discarded, so a hallucinated field cannot reach the world. The deterministic layers stay deterministic: naming adds `name` fields and one metadata block, nothing else.

Every prompt and few-shot set lives in its own `.md` file under `prompts/`, editable without touching code, and output length is never capped. `CONTRACT.md` carries the closed error set, including the coverage and range errors the repair loops raise when they cannot finish.

## In the urbe family

It names the world that [atlas](../atlas) generates and grounds its NPC types in [simulation](../simulation) demographics. The named world and the type set go to [simulation](../simulation), which instantiates people from them, [quests](../quests), which writes the story on top, and [engine](../engine), which shows the names in the world; the businesses list goes to [materials](../materials), which brands its ad screens with them. The full picture lives in [urbe](..).
