World theme:

{{theme}}

Naming charter for this world (binding, including its banned list):

{{charter}}

The districts of this city:

{{districts}}

Some places of this city need a new name. They are {{topic}}. Each entity below carries its current name, when it has one, and its problem:

- missing: it has no name yet.
- unsignable: the name does not spell in the sign alphabet (plain letters A to Z, digits, spaces and - . , ' ! ? : / & + only) or runs past 32 characters.
- duplicate: another place in the same pool already carries that name.
- banned: the name contains the word or fragment the charter bans, given as word.
- overused: too many names in this city already carry its word, given as word.
- echo: the name copies a district, station, line or route name whole.

Words and fragments no new name may contain, because the charter bans them or the city has used them up:

{{avoid}}

Names taken most recently in this city (every new name must differ from these and from each other):

{{taken}}

Entities to name, one JSON object per line:

{{entities}}

Give each of them a fresh name, origin first, the way a careful first pass would: specific to this city, varied across the batch, true to the charter.

Return JSON: {"names": {"<entity id>": {"origin": "...", "name": "..."}, ...}}
