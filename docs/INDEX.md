# Box map

- root box: the naming and typing passes. Contract in CONTRACT.md; entry points `runNamingPass` / `runTypingPass` (src/index.ts) plus the CLI (src/cli.ts).
  - src/world: worksheet extraction (generic placeholder walk + atlas blueprint policy) and name patch-back.
  - src/passes: naming (charter + chunked groups + repair), typing (types + name pool), constrained output schemas.
  - src/llm: ChatModel surface, Claude implementation, OpenAI-compatible implementation (env-selected, local llama.cpp).
  - src/validate: JSON-schema and coverage validation.
  - prompts/: every prompt and few-shot set, one .md each.
  - schema/: published JSON schemas (world-state view, params, name map, NPC types).
  - fixtures/: the atlas tiny sample verbatim (blueprint 0.4.0), two naming-shaped worlds, one explicit-placeholder world.

No inner boxes; the folder is small enough for one agent.

Research conclusions: docs/RESEARCH.md.
