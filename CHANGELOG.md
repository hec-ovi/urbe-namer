# Changelog

0.3.3: every name spells in the sign alphabet (the materials letter atlas, 32 characters at most; accents fold, anything else repairs); `exportBusinesses` / `npm run businesses` writes the materials rebrand request for every named advertising parcel.

0.3.2: the local OpenAI-compatible server is the default provider: `LLM_BASE_URL` defaults to `http://localhost:8080/v1`, `LLM_MODEL` to the first model it serves; `LLM_PROVIDER=anthropic` selects Claude.

0.3.1: runs on atlas blueprint 0.4.0; street and rail `level` fields pass through untouched, and the atlas tiny sample ships as a fixture.

0.3: NPC name pool tags given names male, female or neutral in `namePool.givenByGender`; `namePool.given` stays the flat union of the three.

0.2: provider layer accepts OpenAI-compatible endpoints via LLM_BASE_URL / LLM_MODEL / LLM_API_KEY (local llama.cpp servers), Claude stays the default; all parcel names share one uniqueness namespace.

0.1: naming and typing passes against atlas blueprint v0.2. Charter-first chunked naming with constrained id-keyed outputs, repair loops, themed NPC type set with prompt boilerplates and personal name pool, fixtures and contract-surface tests.

0.0: scaffold, contract pending.
