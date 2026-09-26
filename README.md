# urbe-naming

Version 0.8.0. Names selected city entities from a theme and generates grounded NPC types, personal name pools and business labels. TypeScript library and CLI; geometry and source identities pass through unchanged. An external author answers each creative request through an author dir; the box calls no model.

```sh
npm ci
npm run build
npm test
npm run world -- <dir> --theme "<world description>" --external <author-dir>
```

Node.js 20 or later is required. The CLI scripts run the build in `dist/`. Tests build it first and answer requests with scripted models and author dirs. A naming run stops with exit 2 until its author has answered every request ([AUTHORING.md](AUTHORING.md)).

[SKILL.md](SKILL.md) gives callable examples and defaults. [CONTRACT.md](CONTRACT.md) defines inputs, outputs, the CLI, the author dir and errors. [docs/INDEX.md](docs/INDEX.md) maps the box. [docs/ISSUES.md](docs/ISSUES.md) holds open cross-box questions.
