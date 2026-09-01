# naming: agentic naming and NPC typing pass

You own this box. You build only what lives in this repo.

## Context (general, do not expand it)
This repo is one isolated layer of a larger build: a seeded, deterministic city world that ends as a playable 3D game (map, buildings, transit, NPCs, quests). Nine layers are built in parallel by separate sessions, each locked to its own repo, coupled only through CONTRACT.md files. Never read another layer's code or tests, only its CONTRACT.md. Your raw requirements are in docs/REQUIREMENTS.md, in the user's own words: they win over any summary here.

## Scope
- In: the placeholder world state plus the world description prompt (dystopian, modern, 1950 industrial, egyptian, medieval, anything).
- Out: the same state, saved as a new version, with every placeholder named: districts (west bay, downtown, sea view port, suburbs, favela), stations, businesses, restaurants, coffee shops, corporations, whatever the schema exposes.
- Second pass: create the dynamic NPC type strings with a prompt boilerplate each (cop, poor resident, coffee worker, corpo worker, CEO, bartender, homeless, bus driver). Types match the theme: a residence type can be an ancient greek barrack or a sci-fi tower, a vendor can be a modern coffee shop or a medieval blacksmith. Provide themed few-shot examples per topic.
- Statistics aware: types are grounded in what the world actually contains (zones, tiers, demographics).
- Ranges, never quotas: give the agent minimums and maximums, never an exact count to fill. If it has 55 slots and needs 2, 2 is correct. Forcing counts makes the agent overfit the format and lose the creativity that is the whole point.
- This is a small, deeply focused skill: name and type things based on this world, nothing else. It can run as a skill or as an agentic workflow step with a local harness.

## Out of scope
No geometry, no simulation logic, no quest writing, no dialog. Naming and type creation only.

## Depends on
../atlas/CONTRACT.md (world state schema), ../simulation/CONTRACT.md (demographics, once available)

## Consumers
../quests, ../simulation, ../engine

## Working order
1. Deep research first: 2026 state of the art on structured LLM output over large object sets, naming consistency techniques. Compact conclusions to docs/RESEARCH.md.
2. Draft CONTRACT.md before code.
3. Implement against fixture world states.
4. Keep CONTRACT.md and docs/INDEX.md current.

## Hard requirements
- Every prompt, instruction and few-shot set lives in its own .md file, never inline in code.
- Never cap LLM output length in params or prompt wording: steer by describing the content.
- Standalone: runs on a fixture world state with no other layer present.
- Output validates against the world schema: every placeholder named, nothing invented outside the schema.

## Coordination
- Read docs/FEEDBACK.md at the start of every session.
- Write blockers and cross-layer questions to docs/ISSUES.md.

## Master requirements (background only)
docs/FULL-REQUIREMENTS.md holds the user's complete raw requirements for the whole project, so you see your surroundings. Read it once for awareness. It never widens your scope: what you build is defined by this file and docs/REQUIREMENTS.md only.
