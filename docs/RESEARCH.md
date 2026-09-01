# Research conclusions (2026-08-31)

State of the art for LLM naming over large object sets, applied to this box. Full findings with sources: `.research/llm-naming-structured-output/FINDINGS.md`.

## Decisions taken

- ID-keyed name map, never document regeneration. Anthropic structured outputs (GA Jan 2026, `output_config.format`) support no `maxItems` and `minItems` only 0/1: the one shape where dropping and inventing entities are grammar violations is an object keyed by entity id, every id in `required`, `additionalProperties: false`. Patch-shaped output also measurably raises model care (aider: 20% to 61%).
- Charter first, then chunks. Hierarchical beats flat for long-range coherence (Dramatron, AutoWorldBuilder). One unconstrained call produces the naming charter (theme morphology, per-category register, per-theme cliche blacklist) plus district names; chunk calls reuse it. "Think free, constrain emission": creative content forms during adaptive thinking, the constrained schema only shapes the final JSON.
- Chunk well under 100 entities. Attention overflow degrades item tracking around 100 items; consistency errors cluster mid-generation. Default 30 per call, grouped by category.
- Dedup is external. Models cannot reliably attend to all prior names and sampling more does not buy distinct ones. The harness enforces case-insensitive uniqueness per group and feeds taken names into chunks and repairs.
- Repair is partial. Re-request only the failing ids with the errors named; never regenerate a whole chunk (Instructor pattern; non-converging retries burn calls).
- Cliche blacklist over abstract originality. The effective instruction enumerates the theme's defaults by name (dystopia: "Neo-", "-Corp", "Sector 7") and forbids them; asking for "creativity" in the abstract fails.
- Few-shots: 3-5 per topic, deliberately spread across themes, wrapped in example tags; example names are burned (never valid output).
- Model: claude-opus-5 default for both passes (creative work; mode collapse hits weaker models harder), streaming, output at the model maximum, adaptive thinking on.

## Noted for later

- Prompt caching: 0.1x reads make a shared charter nearly free across a fan-out, but changing `output_config.format` per chunk invalidates the cache; at our scale (tens of calls) this stays cheap either way.
- Batches API offers 300K output and 50% off for offline runs; worth it only if worlds grow far past current fixture sizes.
- Phoneme-recency decay (roguelike practice) and verbalized sampling (1.6-2.1x diversity) are available upgrades if name sameness shows up in real runs.
