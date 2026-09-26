# urbe-naming

Version 0.6.0. Names selected city entities from a theme and generates grounded NPC types, personal name pools and business labels. TypeScript library and CLI; geometry and source identities pass through unchanged.

```sh
npm ci
npm run build
npm test
npm run world -- <dir> --theme "<world description>"
```

Node.js 20 or later is required. The CLI scripts run the build in `dist/`. Tests build it first, inject model responses and run without a model server. A real naming run uses the model server at `LLM_BASE_URL`.

[SKILL.md](SKILL.md) gives callable examples and defaults. [CONTRACT.md](CONTRACT.md) defines inputs, outputs, the CLI and errors. [docs/INDEX.md](docs/INDEX.md) maps the box. [docs/ISSUES.md](docs/ISSUES.md) holds open cross-box questions.
