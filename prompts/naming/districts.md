World theme:

{{theme}}

Below are the districts of this city as placeholder entities, one JSON object per line, with their character (kind) and wealth tier:

{{entities}}

Examples of district naming across very different themes (illustrations only, never reuse):

{{fewshots}}

Do two things in one response.

First, write the naming charter for this whole world. Later naming batches for stations, businesses, corporations and civic buildings will follow it without seeing your reasoning, so make it concrete:

- The sound of this world: language roots, morphology, typical word lengths, whether names lean on geography, trades, saints, dynasties, machines, whatever fits the theme.
- Register per category: how districts, transit, corporations, small businesses and civic institutions each sound, and how poor, mid, rich and high-rich versions of the same kind differ.
- The cliche blacklist: name the lazy defaults this specific theme invites (the obvious prefixes, suffixes and stock names everyone reaches for) and forbid them explicitly.
- Recurring device, if any: a shared ending inventory, a founding family, a numbering habit for stations. Something that quietly ties the city together.

Second, name every district. District names anchor everything that follows: stations and businesses will reference them. Ground each name in the district's kind and tier, and make the set feel like one city grown over time, not a list produced in one sitting.

Return JSON: {"charter": "...", "names": {"<district id>": "<name>", ...}}
