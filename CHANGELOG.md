# Changelog

0.5.0: named worlds are validated by schema for structure and metadata and in code for selected-name coverage. The named copy is built and patched in one pass, and named JSON is written compact. Naming batches run four at a time carrying a bounded window of taken names, and a busy or dropped provider call is retried.

0.4.10: naming and NPC typing with validated parameters, repairable model output, streamed provider responses, business export and world-folder calls. Agent skill and isolated contract tests cover the public API.
