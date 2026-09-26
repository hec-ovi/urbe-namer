<!-- schema {{fingerprint}} -->
# {{key}}

Answer this request with one JSON document matching the answer schema below, saved as `{{key}}.json` beside this file, then run the same command again. The answer goes through the same checks as a model's; anything they reject comes back as a new request.

## System

{{system}}

## User

{{user}}

## Answer schema

```json
{{schema}}
```
