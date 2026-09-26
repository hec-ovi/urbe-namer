# Authoring a named world

Naming asks every creative question through an author dir and answers none itself. You, an agent or a person, write the answers; the box checks them the way it would check a model's and asks again where they fall short. The exact layout is in [CONTRACT.md](CONTRACT.md#author-dir).

## Loop

1. Build once: `npm ci && npm run build`.
2. Put the Atlas blueprint in a folder as `blueprint.json` and run
   `npm run --silent world -- <folder> --theme "<theme>" --model <your model id>`.
3. Exit 2 lists request files on stdout, all in `<folder>/author/`. For each `<key>.md`, write `<key>.json` beside it: one JSON document matching the answer schema at the end of the request.
4. Run the same command again. Repeat until exit 0, which writes `blueprint.named.json`, `npc-types.json` and `businesses.json` beside the blueprint.

A rerun replays every answer on disk, so stopping between rounds loses nothing.

## Requests in order

- `naming-districts-1`: the naming charter (voice, registers, 8 to 15 motifs, 15 to 30 banned words or fragments) and every district's name. Later requests show the charter and hold every name to its banned list.
- `naming-batch-<n>`: all of them at once, one topic per batch (businesses, corporations, civic places, each transit kind). They cannot see each other's names, so keep the whole set varied yourself.
- `naming-repair-<round>-<n>`: names the checks rejected, each with its `problem` and, for quality problems, the `word` behind it.
- `typing-1`: the NPC types and the personal name pool. `typing-2` and on repair it.

## What the checks reject

- Names off the sign alphabet (letters A to Z, digits, spaces and `- . , ' ! ? : / & +`) or longer than 32 characters; accents are folded first.
- A name used twice in its pool: every parcel shares one pool, districts and each transit kind have their own.
- A name containing a charter-banned word; a parcel name copying a district, station, line or route name whole; a word carried by more parcel names than `max(3, ceil(parcels / 25))`. These three keep a valid name when the repair answer is no better.
- Types grounded in a district name, parcel type or tier the world lacks, or category counts outside the ranges.
- Name pools under 20 given or 20 family names, a list whose initials climb the alphabet for eight names in a row, or names no one can say.

## Changing an answer

Edit any `<key>.json` and rerun. Requests after it may change with it; an answer written for a request that changed is set aside as `<key>.stale.json` and the request is written again.
