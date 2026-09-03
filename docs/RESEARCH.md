# Research conclusions (2026-08-31)

State of the art for LLM naming over large object sets, applied to this box. Full findings with sources: `.research/llm-naming-structured-output/FINDINGS.md`.

## Decisions taken

- ID-keyed name map, never document regeneration. An object keyed by entity id, every id in `required` and `additionalProperties: false`, makes dropping and inventing entities validation errors. Patch-shaped output also measurably raises model care (aider: 20% to 61%).
- Charter first, then chunks. Hierarchical beats flat for long-range coherence (Dramatron, AutoWorldBuilder). One unconstrained call produces the naming charter (theme morphology, per-category register, per-theme cliche blacklist) plus district names; chunk calls reuse it. Creative content forms before the model emits the validated JSON shape.
- Chunk well under 100 entities. Attention overflow degrades item tracking around 100 items; consistency errors cluster mid-generation. Default 30 per call, grouped by category.
- Dedup is external. Models cannot reliably attend to all prior names and sampling more does not buy distinct ones. The harness enforces case-insensitive uniqueness per group and feeds taken names into chunks and repairs.
- Repair is partial. Re-request only the failing ids with the errors named; never regenerate a whole chunk (Instructor pattern; non-converging retries burn calls).
- Cliche blacklist over abstract originality. The effective instruction enumerates the theme's defaults by name (dystopia: "Neo-", "-Corp", "Sector 7") and forbids them; asking for "creativity" in the abstract fails.
- Few-shots: 3-5 per topic, deliberately spread across themes, wrapped in example tags; example names are burned (never valid output).
- Provider: OpenAI-compatible requests carry no output-token limit. Claude uses [Anthropic's compatibility endpoint](https://platform.claude.com/docs/en/api/openai-sdk), whose request example omits that limit. Its compatibility layer ignores `response_format`, so each prompt states the expected JSON shape and the harness validates and repairs the result.
- Model: claude-opus-5 is the Claude default for both passes because mode collapse hits weaker models harder.

Phoneme-recency decay and verbalized sampling remain available if name sameness appears in real runs.
