# Changelog

0.4.8: the named-world output schema covers both explicit-placeholder and Atlas policy selection, requires every selected name, and carries a canonical UTC naming timestamp. Named-world consumers enforce that schema before use.

0.4.7: named worlds have a dedicated output schema with required theme, model and timestamp metadata. Public naming, typing and business entry points validate the structure and exact selected-name coverage.

0.4.6: naming prompts ask for compact sign-ready names. Deterministic sign validation enforces the published field bound and routes invalid names through repair.

0.4.5: Claude uses Anthropic's OpenAI-compatible endpoint. Every provider request omits output-token limit fields and relies on prompt shape plus validation and repair.

0.4.4: the verbatim Atlas fixture is blueprint 0.14.0. The naming projection accepts the additive 0.15.0 hydrology document and preserves it with all geometry while patching names only.

0.4.3: the naming-shaped fixture carries the blueprint 0.5.0 station shape (position, platform, entrances, shafts), so the pass-through check covers a world with transit in it.

0.4.2: the CLI prints an error's report only when it has one, so a run against a server that is down ends on the one line that says so.

0.4.1: runs on atlas blueprint 0.5.0; station platforms and shafts pass through with the rest of the geometry, and the pass is held to naming exactly its policy set and touching nothing else in the document.

0.4.0: `npm run world -- <folder> --theme ...` names a world folder in one command: reads `blueprint.json`, writes `blueprint.named.json`, `npc-types.json` and `businesses.json` beside it, the files the engine's assembly carries into a game world.

0.3.3: every name spells in the sign alphabet (the materials letter atlas, 32 characters at most; accents fold, anything else repairs); `exportBusinesses` / `npm run businesses` writes the materials rebrand request for every named advertising parcel.

0.3.2: the local OpenAI-compatible server is the default provider: `LLM_BASE_URL` defaults to `http://localhost:8080/v1`, `LLM_MODEL` to the first model it serves; `LLM_PROVIDER=anthropic` selects Claude.

0.3.1: runs on atlas blueprint 0.4.0; street and rail `level` fields pass through untouched, and the atlas tiny sample ships as a fixture.

0.3: NPC name pool tags given names male, female or neutral in `namePool.givenByGender`; `namePool.given` stays the flat union of the three.

0.2: provider layer accepts OpenAI-compatible endpoints via LLM_BASE_URL / LLM_MODEL / LLM_API_KEY; all parcel names share one uniqueness namespace.

0.1: naming and typing passes against atlas blueprints. Charter-first chunked naming with constrained id-keyed outputs, repair loops, themed NPC type set with prompt boilerplates and personal name pool, fixtures and contract-surface tests.
