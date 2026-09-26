World theme:

{{theme}}

Below are the districts of this city as placeholder entities, one JSON object per line, with their character (kind) and wealth tier:

{{entities}}

Examples of district naming across very different themes (illustrations only, never reuse):

{{fewshots}}

Do two things in one response.

First, write the naming charter for this whole world. Every later naming batch (stations, lines, businesses, corporations, civic buildings) receives it next to the theme and follows it without seeing your reasoning, so make each part concrete and short, with no restatement of the theme and no filler.

- voice: which peoples and languages this city's names come from and how they mix, typical word shapes, and what names lean on (families, trades, landmarks, slang, saints, machines, whatever fits the theme).
- registers: how districts, transit, corporations, small businesses and civic places each sound, and how the poor and the rich versions of one kind differ. Describe; never list sample words here, because every word listed in the charter gets copied into dozens of names.
- motifs: 8 to 15 local references a name may draw on: founding families, landmarks, local slang, old trades, disasters, saints, ships, events. Short phrases, specific to this one city, so that a few names echo each of them and the city hangs together.
- banned: the words this theme tempts every generated city into, the ones any namer reaches for first: stock prefixes and suffixes, genre buzzwords, empty prestige words. Single words, or fragments written with a hyphen such as "-ville" or "neo-". No name anywhere in the city may contain them, so be thorough: 15 to 30 entries.

Second, name every district. District names anchor everything that follows: stations and businesses will reference them. Ground each in its kind and tier, write its origin first, and make the set feel like one city grown over time, not a list produced in one sitting.

Return JSON: {"charter": {"voice": "...", "registers": "...", "motifs": ["..."], "banned": ["..."]}, "names": {"<district id>": {"origin": "...", "name": "..."}, ...}}
