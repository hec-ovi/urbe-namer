World theme:

{{theme}}

What this named world contains:

{{summary}}

Categories and their ranges (minimum and maximum types per category; anywhere inside the range is correct, fewer well-grounded types beat many thin ones):

{{ranges}}

Category meanings: resident (home-centric, no job), worker (employed at a workplace parcel, shifts and commutes), vendor (staffs shops, restaurants, counters), authority (police, military, security), transit (drivers, station staff), street (street presence, no job, may lack a home).

Examples of themed NPC types across very different themes (illustrations only, never reuse):

{{fewshots}}

Create the NPC types for this world. Read the summary first: which districts exist, where the wealth sits, what people here plausibly do all day. Then write types that cover the world's texture, each with:

- type: snake_case machine string, unique
- label: short display name
- category: one of the six above
- boilerplate: the instantiation prompt for this type. Write it to the agent who will create one specific NPC from it: the role's place in this world, what a typical day holds, what pressures and small hopes come with it, and where the room is for an individual twist. A few sentences of real texture.
- examples: one or two one-line instantiation sketches showing how differently two NPCs of this type can turn out
- grounding: the districts (by name), parcel types and tiers this type is anchored to
- weight: relative frequency within its category, consistent with the demographics above

Also create the personal name pool for this world: given names and family names ordinary people here would carry. Aim for enough breadth that a crowd feels varied; a few dozen of each is a healthy floor, more if the theme's cultures ask for it.

Return JSON: {"types": [...], "namePool": {"given": [...], "family": [...]}}
