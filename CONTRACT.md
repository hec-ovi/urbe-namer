# CONTRACT: naming

Purpose: agentic pass that names every placeholder in a generated world (districts, stations, businesses) and creates the themed NPC type strings with prompt boilerplates.

Status: draft, schemas pending research.

## In (must cover)
- placeholder world state (atlas schema)
- world description prompt (theme, era, tone)
- range constraints (min and max per kind, never exact quotas)

## Out (must cover)
- named world state, saved as a new version alongside the placeholder one
- NPC type list: type string, prompt boilerplate, themed few-shots, demographic weight

## Errors
Closed set, to be defined.

## Depends on
- ../atlas/CONTRACT.md
- ../simulation/CONTRACT.md
