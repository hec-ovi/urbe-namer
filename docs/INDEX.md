# Box map

- root box: the naming and typing passes. Contract in CONTRACT.md; entry points `runNamingPass` / `runTypingPass` / `exportBusinesses` / `runWorld` (src/index.ts) plus the CLI (src/cli.ts).
  - src/world: worksheet extraction (generic placeholder walk + atlas blueprint policy), name patch-back, the world folder (fixed file names) and the pipeline that chains the passes over it.
  - src/passes: naming (charter + chunked groups + repair), typing (types + name pool), constrained output schemas.
  - src/llm: ChatModel surface, Claude implementation, OpenAI-compatible implementation (env-selected, local llama.cpp).
  - src/validate: JSON-schema and coverage validation, the sign alphabet.
  - src/export: the businesses list for the materials rebrand lane.
  - prompts/: every prompt and few-shot set, one .md each.
  - schema/: published JSON schemas (world-state view, params, NPC types, businesses).
  - fixtures/: the atlas tiny sample verbatim (blueprint 0.5.0), two naming-shaped worlds, one explicit-placeholder world.

No inner boxes; the folder is small enough for one agent.

Tests cover the contract surface through its real entry points: the library passes, and the CLI in its own process against a stub OpenAI-compatible server.

Research conclusions: docs/RESEARCH.md.
