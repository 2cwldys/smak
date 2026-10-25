# Map specs: a map of rooms laid out by words

A `smak.map/1` spec, built by `smak build x.json` (`--game <valve>` for the game's textures, `--mod <profile>`
for a mod's map; compiled when VHLT is found, `--vhlt`): the map in a folder of its name, compiled, walked
and drawn. Models, textures, videos, sounds and sprites have their specs in `docs/SPEC.md`, which also has the
loop every spec is built by, in short: list what the person asked for; write the spec, ids that say what each
room is; build it and read the report from the top (`built, and every check passed`, or `NOT OK` and what to
fix above it, each line naming the room); look at the pictures against your list; change as little as a
request needs and build it again under the same name (the report then says what changed). A map's textures
of its own are a `smak.wad/1` spec (`docs/SPEC.md`, "Textures for maps (a .wad)").

## A map

```json
{
  "spec": "smak.map/1",
  "name": "two_rooms",
  "theme": { "floor": "stone", "wall": "plaster", "ceiling": "planks" },
  "rooms": [
    { "id": "hall", "size": [320, 256, 160] },
    { "id": "study", "size": [256, 256, 128], "place": { "east_of": "hall" }, "floor": 16 }
  ],
  "links": [{ "between": ["hall", "study"], "kind": "door" }],
  "entities": [
    { "class": "info_player_start", "room": "hall", "at": "against west", "facing": "study" },
    { "class": "item_healthkit", "room": "study", "at": "corner ne" }
  ]
}
```

| Field | |
| --- | --- |
| `name` | The map's name: what is typed in the console (`map two_rooms`) |
| `size` | What the person asked the map to measure across its plan: its longest side (`2500`), both sides (`[1500, 1500]`) or `{ length, width }`. Its rooms and the rock round them off by more than 10% is warned of, more than 25% is a fault, as a model's size is |
| `theme` | `{ floor, wall, ceiling, door, furniture }`: materials for every room's rock, its doors and furniture. Made into a .wad of the map's own, or taken from a game's .wad (below) |
| `textures` | More named materials, for furniture, prefabs and rooms' surfaces: `{ "counter": { "base": "darkwood" } }` |
| `wall` | Rock between rooms (16). Rooms placed side by side have exactly this between them |
| `rooms` | Boxes of empty space, each placed against one before it |
| `links` | The ways from room to room |
| `entities` | What is in the rooms: the start, monsters, items, lights of your own |
| `furniture` | Brush furniture put in rooms: a box, or a prefab of `prefabs` |
| `ladders` | `[{ room, side, along, width, height }]`: a ladder against that wall of the room (`side` north, south, east or west; `along` 0 to 1, 0.5 unless told; 32 wide and the room's height unless told), built as Valve's are: a `func_ladder` to climb and over it the rungs a player sees, a `func_wall` in render mode 4 in a texture with holes (`{LADDER1` when the game's `.wad` is given, a mesh of the map's own otherwise). Never make a ladder as furniture: a ladder texture without its holes reads as a vent |
| `prefabs` | `{ name: { pieces: [...] } }` or `{ name: { file: "table.map" } }`: brush furniture made once, put in many places |
| `models` | `{ name: <a model spec> }` or `{ name: { file } }`: models built with the map, for `props`. Each is written to `models/<map name>/<name>.mdl` beside the map, and its props name that path: copy the folder into `<mod>/models/` and the `.bsp` finds them, apart from the mod's own |
| `props` | Models put in rooms: `{ model, room, at, facing, z, solid }`. `model` is one of `models`, a `.mdl` path the game has, or the kit's own furniture as `"kit:<name>"` (the specs in `kits/furniture/`: toilet, bathtub, sink_cabinet, bed, sofa, armchair, dresser, stove, fridge, coffee_table, tv_stand, bench, sedan, trees and more), built with the map. A model is walked through in the game: kit furniture, a prop with `solid: true`, or a model a mod's profile says is solid (its `spec.things`, with the footprint and `high` it gives, turned as the prop stands, from its foot up), gets a `CLIP` box that stops a body and draws nothing; `solid: false` leaves one out. Furnish with these, not with boxes |
| `include` | Other map specs taken in as modules (below) |
| `layout` | A drawing of the plan (below), in place of placing rooms by words |
| `wads` | A game's .wad files to take textures from: `["halflife.wad"]`, found by name in the game's folder |
| `fgd` | Entity definitions to hold the entities against, beside those given with `--fgd` |
| `night` | true: a dark sky, a dim moon and the sky's own light far under it; the views draw the sky dark |
| `sky`, `sun` | The sky: the name of one of the game's (`desert`), or the words of one to make (below, "A sky of its own"); and the sun's `{ pitch, yaw, brightness, color }`, for rooms under the sky |
| `compile` | How the compilers run: `{ quality: "draft" \| "normal" \| "final", threads, light: { bounce, ao, extra, softShadows }, hulls: { large: false, crouch: false }, clipEconomy: true }`. Every program gets all the machine's threads unless told |
| `detail` | `false` keeps furniture in the world; unless told, furniture is `func_detail` (below) |
| `fidelity` | `"game"` (unless told) or `"high"`: a map made to look its best, when the person asks for it. High adds trim (a baseboard along every wall under a roof, a casing round every door and opening, a sill and frame at every window, in the theme's `trim`, darkwood unless told: drawn, not solid, so a narrow room keeps its room), a lamp for each 192 x 192 of floor where `"auto"` gives one for each 256 x 256, and puts furniture of boxes named for a piece the kit has a model of (`toilet`, `tub`, `fridge`) in as that model, moved back inside its room if the model is larger than the boxes. The report says what it added |
| `frame` | `true`, or numbers over the defaults: each room framed as Valve frames its own. A band at the foot of every wall (`dado`, 48 high) and one under the ceiling (`cornice`, 24), each its own brush `proud` (2) off the wall, so a tall wall is not one texture tiled up it; ribs (`rib` [16 wide, 8 deep]) every `ribs` (224) along a long wall, beams (`beam` [16, 16]) every `beams` (192) across a wide ceiling over every way's head, the corners cut at 45 degrees (`chamfer`, 24 along each wall), and a frame (`jamb`, 8 wide) round every way through. A room under 128 across (a corridor) keeps its width: no ribs, beams or cut corners. `fixtures` (true) puts each lamp in a fixture that glows, a texture light as Valve lights its rooms: a panel on the ceiling for a lamp under it, a glowing shade for one hung lower; `fill` (0) a weak light that brightness low over every floor. Its textures are the spec's `dado`, `cornice` and `frame` words when it gives them, else its `trim` when it names one, else dark steel plate; `fixture` the glass of the fixtures. A room's own `frame` (`false`, or numbers) is over the map's. All of it is `func_detail`, so it seals nothing and cuts no portal; the walk test still runs through every way. The report counts what it made. Valve's `c1a0`, from its own source, is 942 brushes with a quarter of its world brushes cut off the axes; a spec's box rooms are a handful of boxes. `bands: true` bands each room 128 or more tall on the wall's own faces instead of the two strips stood off it: a base band to `dado`, the field, and an upper band from the head of the room's highest way (112 with none) to the ceiling, the rock (or a room's own lining) cut where they join, each band's picture standing on its foot, so the joins fall on brush edges on one plane, as a third of Valve's tall walls are joined (a median 124 over the foot). The bands' textures are the spec's `dado` and `upper` words when it gives them; else, for a wall of the game's own texture, what Valve stacks under and over that texture in its maps and at those heights (`WALL_FAMILIES`, src/maps/families.mjs, measured over the 96 campaign maps), where the .wad files given have it; else a wall of a .wad's texture takes its `trim` at its foot; else the wall's own material darker at its foot and lighter above. Ribs stand on the base band. `breaks: true` (or `{ pillars, coves, pipes, pillar, cove, pipe }`) breaks a wide room's box silhouette with pieces off the axes, as Valve's rooms are 22 in 100 of their face area off the axes and a spec's box rooms about 5: a round pillar (twelve sides, its radius `pillar`, 12) in each corner the frame leaves uncut (`chamfer: 0`), a sloped cove (`cove`, 24) where each wall 192 or longer meets the ceiling, and a pipe run (`pipe`, 4) along the top of the longest wall, under the cove and the beams, with a bracket every 128; all of it clear of the ways and their frames, in the framing's texture and the spec's `pipe` word (metal unless told) |
| `lighting` | `true`, or numbers over the defaults: the light composed, not spread. A lamp in each `rhythm` (3) along a room's run dimmed to `dim` (0.2) of its brightness, its fixture glowing dim too; the `goalRoom`'s lamps `goal` (1.6) times brighter; a weak light of `spill` (50) under the head of every way through, so a doorway spills light; each lamp's light falling off `fade` (2.5) times sooner (hlrad's `_fade`), so it pools under its lamp; and the compile's light bounced `bounce` (2) times, not SDHLT's 8, unless `compile.light.bounce` says. It works on the rooms' lamps and the spec's own `light` entities. Valve's floors, measured sample by sample over the campaign: 6 to 60 in 100 dark (under 24 of 255; median 21) and a contrast of 3.6 to 152 (the brightest tenth over the darkest; median 12.9). Spread even, a spec's lamps leave about 1 dark and 2 to 4; composed, about 5 dark and 3. The rest of Valve's dark is under and behind things in its rooms, which lamps alone do not make |
| `focus` | `{ room, landmark, at, z, plinth, clear, from, texture }`: the map's one main area and the landmark in it, as Valve gives a map one centre the eye finds from each way in. `landmark` is a furniture's or prop's `id` in that room, or the name of a prefab or model it has there (every piece of it in the room is the landmark: three pumps along a hall), or a piece put in for it: `{ prefab }`, `{ model }`, or `{ kit: "pump" \| "machine" \| "reactor" \| "statue" \| "door", size: [x, y, z] }`, a centrepiece the kit makes, at `at` (the room's middle unless told). Each piece stands on a `plinth` of its own, 8 high and 16 past its foot (`false`: none), in the framing's texture (`texture`); the room is the composed light's goal (`lighting.goalRoom`) and a lamp hangs over the landmark. The build tests, on the map as laid out, a player's sightline from 24 inside each way into the room (a room placed `in` another, a pool or a pit, takes the ways into the room that holds it; and from the start, `from: ["start"]`) to the landmark: a way that does not see it is warned of, with its eye point, and so is furniture within `clear` (32) of it. An `info_target` named `landmark` stands just over its top: the views (`features.png`, `map-views --aim`, the judges') aim a camera at it, and the dressing report names it with the ways that see it |
| `music` | `[{ track, when }]`: the game's CD tracks, 2 to 27 (a music spec with that `track` makes the file): `when` `"start"` (unless told: a `trigger_auto` firing a `target_cdaudio` as the map begins) or `{ enter: "<room>" }` (a `trigger_cdaudio` over the room's floor, the first time a player walks in); `{ stop: true, when }` stops it. They play for the first player only, and each once: a multiplayer mod plays music its own way |
| `fog` | `true` or `{ near, far, color }`: fog over the whole map, as the mod draws it (its profile's `spec.fog`: The Specialists' `ts_fog`, near 2048, far 9000, colour 0.8 grey unless told, as ts_frigid has it); a game with none is warned of |
| `sounds` | `[{ spec, room, at, z, volume, radius }]`: sounds made with the map (`spec`: a sound spec, or `{ file }`) and played where they are put by an `ambient_generic`: `volume` 1 to 10, `radius` `everywhere`, `small`, `medium` or `large`; looped when the sound loops (a hum, a fire), once otherwise. The files go under `sound/<map name>/` beside the map, and its `ambient_generic` names them there: copy that folder into `<mod>/sound/` |

### A floor plan

A map whose plan is drawn already (a level's storeys, a building of floors over floors) takes its space from height
plans in place of rooms: `"floorplan": { "dir": "plans/" }`, the folder `smak map-heights` writes. One picture a
layer of floor (`floor-0.png` the lowest floor at each place, `floor-1.png` the next above it...), each cell's floor
height as a colour, `room-N.png` the headroom over it, and `legend.json` (the colour of each height and headroom,
the cell's size, and the world's x at the pictures' left edge, `x0`, and y at their top, `y1`). Every cell's open
space is carved out of rock in one, so a gallery over a hall and the hall under it are one space; the walked floor
is grown `grow` cells (1) to the walls, since a player's middle keeps 16 off them. Rooms may be left out; what
stands on the plan is in the room `"plan"`, `at: [x, y]` of the world, on the floor of its `layer` there (0, the
lowest, unless told; numbered as the height plan's pictures are) or under the `height` a plan gives it (the highest
floor at or under it), `z` over it:

```json
{ "spec": "smak.map/1", "name": "arena", "floorplan": { "dir": "plans/" },
  "entities": [{ "class": "info_player_deathmatch", "room": "plan", "at": [-512, 640] }, { "class": "weapon_shotgun", "room": "plan", "at": [128, 96], "z": 4 }] }
```

`areas: [{ min: [x, y] or [x, y, z], max, floor, wall, ceiling, light }]` gives parts of the plan their own: the
words of `theme`, `textures` or a base for the faces under, beside and over each (concrete in the hall, tiles in the
washroom, wood on the gallery), and `light` as a room's (`"auto"`, `"none"`, `{ brightness, color }`). The plan's
open space is cut at the areas' edges; the first area that holds a piece's middle is its. A plan of more than a
million square units of floor with fewer than two areas is warned of: one wall texture over a whole level reads as no
place in particular (frenzy's copy so wore one, and the judges gave its textures and its views 0). Give a level's
parts their own. Unless it has lights of
its own, in its entities or its areas, a lamp hangs under the ceiling of each of its largest open spaces (24 at most).
A light's `brightness` is a light entity's (a lamp's is 250), not a multiple: one under 40 is warned of. After the
compile, each area and the plan's floor outside them is a fault when more than half of its floor is dark (under 24 of
255; Valve's maps have 10 to 37% so), and an area whose box covers none of the plan's floor is warned of.
Frenzy's height plans read back so overlap its walked floor 0.898; the textures, the
light and every entity are still the map's to give.

### Rooms

`{ id, size: [x, y, z], place: { east_of: "hall", align, gap }, floor }`:

- `place`: one of `east_of`, `west_of`, `north_of`, `south_of` (side by side, `wall` of rock between),
  `above`, `below` (stacked, the rock between is the floor of the upper; `gap` for its thickness). The
  first room needs none: it stands at the origin. `at: [x, y, z]` puts a room's least corner anywhere.
- `in`: inside another room, `offset: [x, y]` from its least corner, `floor` from its floor: the two are one
  space (a channel sunk in a tunnel's floor, a pool in a lab, a raised dais). It need not hold a player.
- `align`: `centre` (unless told), or `north`, `south` (for rooms east or west of each other), `east`,
  `west` (for rooms north or south): those sides even. A number: so many units from the other's least side.
- `floor`: its floor this much over the room it is placed against (under 0: lower).
- `sky: true`: open to the sky (a yard, a street). It is lit by the sun (or the moon), not by lamps.
- `surfaces: { floor: "grass", ceiling: "planks", walls: "tile" }`: a floor, a ceiling or walls of another
  material than the theme's (a lining 8 thick inside the rock). A wall's picture stands on its room's floor, as
  a mapper lines it up: a texture's bands and panels sit at the same height over the floor in every room.
- `water: 32` or `{ depth, material }`: water over its floor, swum in or waded; a `!` texture.
- `light`: `"auto"` (one lamp for each 256 x 256 of floor, hung no higher than 192 over it, and over a flight of
  stairs clear of a head on its top tread or at the ceiling; unless told),
  `"none"`, or `{ count, brightness, color, fixture }`: `fixture` what the lamps are built as, `"panel"` (on the
  ceiling, unless told: laid along the room's longer side), `"sconce"` (on its two longer walls in turn, a shade of
  glass on a plate) or `"chandelier"` (hung from the ceiling, its lowest glass a head's room and more over the floor). A floor lit under 24 of 255 after the compile is a fault, unless
  the room says `dark: true` (meant so: a cellar, a dim corridor, a copy of a map that is dark there).
- `test: true`: a room only for trying a module alone (a stretch of street before a shop), left out when
  the module is included.
- `frame`: `false`, or numbers over the map's `frame` (above), for this room alone.
- `use`: what the room is for, and so how it is dressed: `storage` (crates in twos and stacks at its walls and
  corners, shelves, barrels), `lab` (consoles, benches, cabinets), `control` (consoles), `office` (desks, cabinets),
  `industrial` (machines and tanks, barrels, pipes up the walls, crates), `plant` (pipes, tanks, machines) or
  `corridor` (a pipe or a crate). Brush pieces of the kit, each at a wall with its back to it or in a corner, clear
  of every way through and the floor in front of it, of the focus's landmark, of the places to start and of what the
  spec put there, none reaching past a third of the room's depth from its wall (the middle stays walked), several
  of each kind and no one more than twice in a room (more when a dense room wants more), turned to face in. A kind
  `wall` spreads along every wall; a kind `corner` fills the corners and then the walls nearest them, close, so
  crates pile into a corner and along from it. A mod's uses may also stand things in the middle, a walk (48) from
  the walls and from what stands at them: `rows` (desks of an office side by side in rows facing one way, an
  `aisle` between), `group` (two seats facing each other over a piece `between` them, a walk round it: couches
  about a coffee table), `cluster` (a pile of `count` crates to take cover behind) and `middle` (one).
- `density`: how thickly the room's `use` dresses it: a number (to 4) that each kind's count is multiplied by, or
  `sparse` (0.5), `normal` (1), `dense` (1.5), `cluttered` (2); a mod's profile may give one by use. They are furniture, `func_detail`, and wear the spec's `crate`,
  `barrel`, `locker`, `console`, `screen`, `desk`, `machine`, `pipe` and `strut` words when it gives them (wood,
  metal, steel, neon, darkwood and iron unless told). What stands at a wall shades the floor under and behind it:
  the dark Valve's floors have that lamps alone do not make. The report lists each room's pieces.

### Buildings that stand in the open

A room carved out of rock is a hole: from a street it is a wall with a door in it. A house, a shop or a shed
that stands in a yard, with its own walls and a roof, is a **building**: its first room is placed `in` an
open room with `stand: true`, and the rooms placed against that one (`east_of`, `above`...) are of it too.

```json
{ "id": "living", "size": [320, 256, 112], "floor": 8, "place": { "in": "yard", "offset": [256, 256], "stand": true },
  "building": { "walls": "outside", "roof": { "material": "roof", "pitch": 30, "overhang": 12 } } },
{ "id": "kitchen", "size": [192, 256, 112], "place": { "east_of": "living" } }
```

- Its shell is `wall` thick out from each room's face, from the open room's floor to over its top room, of
  `building.walls` outside (the theme's `outside`, siding unless told) and its rooms' own surfaces inside.
- Its roof is a gable over its longer side (`roof: { material, pitch, overhang }`, the theme's `roof`,
  shingles unless told), or flat with `roof: false`. The open room's sky must clear the ridge.
- A way out is a link between a room of it and the open room round it, with `side`: the wall it goes
  through (`"south"`). A door, a window and glass are as between rooms. A floor higher than a step (18) over
  the open room's (a house raised on piers or a crawl space) gets steps out from the wall into the open room,
  railed where they stand free: leave them room there (24 a step of 8 and a player's width past their foot).
- A storey over it is a room `above` one of its rooms, with stairs as between any stacked rooms.
- `siding` (clapboards) and `shingles` are materials of their own, for its outside and its roof. A theme
  word may name one of the spec's `textures` (`"outside": "siding_blue"`).
- Furniture and props in the open room must stand clear of it: one inside its walls is a fault.
- The pictures add each building seen from the corner of its open room on the side of its front door.

### Links

`{ between: [a, b], kind, width, height, along, sill, glass }`. The two rooms must be side by side (or
stacked) with the wall's rock between them, and the link goes through that rock:

- `opening` (unless told): a way through, 64 wide and 96 high unless told.
- `door`: the same with a door in it: a `func_door` that slides up into the wall over it, all the way, or with
  `door: { swing: true }` a door on hinges (`func_door_rotating`), as a house's are, turning a quarter away
  from whoever opens it about its hinge at the start of the way (`hinge: "end"` the other edge), opened as
  a player walks into it and shut by itself two seconds later, as Valve's doors are (`wait`: the seconds it stays
  open; a door that swings shut on a player turns back). A door to be used rather than walked into is a mod's to
  make, with a trigger. Other keys of `door` are the entity's (`speed`, `wait`, `targetname`); `material` its own, the theme's `door` unless told,
  which is the `door` base: a panelled wooden door with a brass handle, one picture fitted to the leaf. A
  material of another base (`{ "base": "wood", "tone": "white" }`) is painted as that door in its tone, unless
  it names a game's texture. A sliding door opens and shuts the same way. Any door's picture is fitted to its
  leaf, one whole picture across it.
- `window`: 48 by 48, `sill` (40) over the higher floor. Nothing walks through a window. `glass: true` (or
  `{ alpha, health, material, keys }`) glazes it: a `func_breakable` pane, half see-through, that shatters, with the
  keys of glass (a mod's, where its profile gives them: The Specialists' at health 1, back after 45 seconds).
- `stairs`: for rooms stacked one above the other: a stair in the lower room up through a hole in the
  floor of the upper (the lower room needs `rise / 16 * 24 + 32` of length along x). It climbs along x
  against the south wall, or with `along: 1` the north (between, a share): keep it clear of a doorway.
- Between rooms side by side whose floors differ by more than 18, any opening or door gets **stairs** in the
  lower room, up to the opening. The lower room must reach as high as the opening (its ceiling over the
  higher floor by the opening's height).
- `along`: where on the shared wall, 0 to 1 (0.5, the middle).
- A way a player walks through is never narrower than they pass at ease: an opening or a sliding door 48, a door
  on hinges 56 (its leaf stands in the way when open). A narrower `width` (a house's drawing gives 36) is widened
  and the report says so; a shared wall too short to hold it is a fault: make the rooms share more wall, or leave
  the way out. 32, a player's own width, is a squeeze the game may not let through. And it is 96 high at least,
  Valve's door height, and 90 over the lower floor where there is a step (the engine lifts the body by up to 18
  before it moves over one), as far as the rooms' ceilings allow.

### Where things go in a room

`at`: `centre`, `corner ne` (`nw`, `se`, `sw`), `against north` (`south`, `east`, `west`), `near <room>` (by
the wall towards that room), `[dx, dy]` from the room's middle, or `{ beside: "<id>", side: "west", gap: 4 }`:
against the side of a thing put before it, by both their real footprints, lined up with its middle.
`facing`: `north`, `east`, `south`, `west`, degrees (0 east, 90 north), or a room's id (looking towards
it). `z`: over the floor. `id` names a thing for `beside` (an entity's `id` is also its `targetname`).

Furniture and props must stay in their room: one that reaches into a wall is a fault. The floor 40 deep on
each side of a door or an opening is kept clear: furniture standing there, between a step over its floor and
a player's head, that leaves less than 48 of its width free is a fault (steps up to it, a slab, a hedge beside
a wide opening are not). So are stairs, over their treads and 40 past their foot, up to a player's head at their
top. Nothing floats: each piece of furniture rests on its room's floor, stands against a
wall (or a building standing in the room), reaches its ceiling, or touches a piece that does; one that touches
none is a fault (flush means flush: a sign 2 off a wall floats). A thing put
`against` a wall stands 48 from it; a prefab whose origin is its back (a shelf, a bed's headboard) is put at
the wall itself (`[dx, dy]` with `dx` half the room's length).

### Prefabs of brushes

```json
"prefabs": {
  "table": { "pieces": [
    { "box": [[-32, -20, 28], [32, 20, 32]], "texture": "furniture" },
    { "box": [[-28, -16, 0], [-24, -12, 28]], "texture": "furniture" }
  ] },
  "bar": { "file": "bar.map" }
}
```

A piece is `{ box: [min, max] }`, `{ wedge: [min, max], high: "+x" }` (a ramp), `{ cylinder: { centre:
[x, y], radius, from, to, sides } }` or `{ prism: { outline: [[x, y], ...], from, to } }` (a convex outline
stood up: a corner cut at 45 degrees, an octagon's wall, a slanted pillar's foot; put in the world with
`as: "world"` it shapes the room itself), in units from the point on the floor where it is put, with a
`texture` that is a word of `theme`, `textures` or a base. A prefab may instead be a `.map` file (`file`),
as Hammer's are: its brushes and its entities (a candle's light) moved and turned as one; its textures
named `SM_` and a word of the spec's materials (`SM_FURNITURE`). A set piece wired of brush and point entities is one
too: Valve's soda machine is its body's brushes, five `func_button` brushes each `target`ing an `env_beverage` (`skin`
the can, `health` how many) at the slot. The names a prefab gives its own entities (`targetname`, and what targets
them) take `_1`, `_2`... at each one put, so each machine's buttons fire its own can; a name it only uses (the map's
own `lights_main`) is kept. `furniture: [{ prefab: "table", room:
"hall", at: "centre", rotate: 90 }]` puts one (turned by a multiple of 90). `entity: "func_breakable"` (or
`{ class, keys... }`) makes its brushes a brush entity: a crate that breaks (`material: 1`, wood), a
`func_wall`, a `func_illusionary`. `breakable: "wood"` (on a piece of furniture, on a prefab, or on one piece of a
prefab) makes each piece it covers a `func_breakable` of its own, so a stack of crates breaks a crate at a time,
with the keys its material takes: Half-Life's materials `glass` (0), `wood` (1; `true` is wood), `metal` (2),
`flesh`, `cinder` and `concrete` (4), `tile`, `computer`, `unbreakable_glass`, `rocks`, each with the kit's
health (glass 20 and half see-through, render mode 2 at 90) under a mod's (its profile's `spec.breakable`: `{
keys, materials: { glass: { ... } } }`). A teller's counter is a prefab of a wooden base and a glass screen on it
that says `breakable: "glass"`. The report counts them (`breakables: 12 func_breakable (4 glass, 8 wood)`). Furniture wearing a `mesh` (a chain-link fence: a box 2 thick in
`{ "base": "mesh", "cell": 6, "weave": "diamond" }`) or a game's `{` texture is a `func_wall` in render mode
4 unless told, the only way the game draws its holes; its texture is named with `{` (`{SM_CHAIN_LINK`).
Unless told, other furniture is a `func_detail`: it cuts no portals, so a
furnished map is seen through by `hlvis` in hundredths of a second where it took minutes (every `func_detail` the
kit writes says `zhlt_detaillevel 1`: SDHLT takes one without it as world, and the original mod's pump hall so cut
1802 portals and took 54 seconds to compile where it takes 4); it still stops a
player, and it seals nothing (it never has to: the rooms' rock does). `as: "world"` keeps a piece in the
world. The report carries the compilers' own chart of the engine's limits (`allocblock 3 of 64`,
`worldleaves`, `worldfaces`, `clipnodes`), and warns from three quarters of any.

### Modules

A module is a map spec of its own (a shop, a sewer), built, walked and scored alone, then taken into a
larger map, as Hammer's prefabs are:

```json
"include": [{ "spec": "../13-map-noodle-bar/spec.json", "as": "noodle", "place": { "north_of": "street", "align": 96 } }]
```

Its rooms, links, furniture, props and entities come in with their ids prefixed by `as` and an underscore
(`noodle_shop`); its first room is placed by the include's `place` (or `at`), the rest where the module
places them against it; its `test` rooms and its starts are left out; its materials, prefabs and models
come with it, and its rooms keep their own floors, ceilings and walls. The larger map links to it by the
prefixed ids: `{ "between": ["street", "noodle_shop"], "kind": "opening" }`. Make a module's first room
the one that meets the larger map, with the way in on the side the larger map will be.

### The same map, changed everywhere: `replace`

`"replace": { "textures": { "lawn": { "base": "snow" } }, "models": { "tree_summer": "tree_winter" } }`
swaps every texture (and theme word) of that name, and every prop of that model, in the map and in every
module it takes in (`ranch_lawn`, `park_tree_summer`): the same town in winter, every tree bare. A model put
in place of another is one of the spec's own `models`. The report says what each replaced, and the change
report tells a thing swapped where it stood as one (`things swapped where they stood: ...`).

### A sky of its own

`"sky": { "zenith": [0.2, 0.4, 0.8], "horizon": [0.75, 0.8, 0.9], "clouds": { "cover": 0.5 }, "hills": { "height": 5 } }`
makes the map's sky: six sides of 256, each pixel the colour along its way out of the eye (so the sides meet
with no seam), written as the game's own are (24-bit `.tga`) into `gfx/env/<map name>/` beside the map, and
named by the map's `skyname`. Copy that folder into `<mod>/gfx/env/`. Every word is optional:

- `zenith`, `horizon`, `ground`: the colour overhead, at the horizon and below it (0 to 1); `haze` (0 to 1) how
  far up the horizon's colour reaches.
- `sun`: `{ size, glow, colour }` (degrees), and `yaw` and `pitch` as the light's (the map's `sun` unless told,
  so the sun stands where the map's light comes from); `false` for none.
- `clouds`: `{ cover (0 to 1), colour, scale, seed }`, or `false`. They lie on a plane overhead, so they grow
  small and thin toward the horizon.
- `hills`: `{ height (degrees), colour, roughness, seed }`: a far skyline all round.
- `stars` (0 to 1); `night: true` (the map's `night` unless told) starts from a dark sky, a moon and stars.

### A game's textures

Name the game's .wad files in `wads` and give a material as a texture of them:

- `{ "texture": "C1A0_LABW4" }`: that one, by name.
- `{ "pick": { "words": ["labflr"], "tone": [0.6, 0.6, 0.55], "else": { "base": "plaster" } } }`: the
  best fit, by its name holding the words and by its average colour. The report says which it picked and
  the next three it weighed. Liquids, see-through and animated textures (`!`, `{`, `+`) are picked only when
  a word asks for them (`"!toxic"`).
- When nothing fits, that is a **gap**: the report says so, with the nearest, and the texture is made from
  `else` into the map's own .wad, which the map names beside the game's.

`smak wad <file.wad>` lists a .wad's textures. A game's textures are its authors': a map built with them
names them and the game's .wad, and copies nothing (AGENTS.md, rule 7).

### A mod's map

`"mod": "profiles/mastersword.mjs"` (a profile's file beside the spec, or `--mod`; docs/MAPS-MAKING.md, "A
mod's profile") makes the map one of that mod's, with its folders given by `--game` (the mod's first):

- a place to start is one of the mod's `starts` (Master Sword's `ms_player_begin`, `ms_player_spawn`), its box
  stood on the floor; the plan, the walk test and the entities are held to the mod's classes and rules (Master
  Sword's: a map with no `ms_player_spec` or `ms_player_spawn` drops a player who connects);
- its .wad files and models are found in its folders;
- its profile's `spec` gives what the spec leaves out: the game's own .wad files (`wads`), the theme's words as
  the game's textures (Master Sword's: `ms_generic.wad`, flags, laid stone, planks, its wooden door), the class a
  prop is (`env_model`), and rooms furnished by their `use` with the game's models: `tavern`, `hall`, `store`,
  `bedroom`, `kitchen`, `library`, `crypt` (tables in the middle, barrels in the corners, shelves, a hearth, beds,
  urns), besides the kit's own uses. The spec's own words stand over the profile's.

```json
{ "spec": "smak.map/1", "name": "tavern", "mod": "../smak/profiles/mastersword.mjs",
  "rooms": [{ "id": "taproom", "size": [448, 320, 160], "use": "tavern" },
            { "id": "cellar", "size": [320, 256, 128], "place": { "east_of": "taproom" }, "use": "store" }],
  "links": [{ "between": ["taproom", "cellar"], "kind": "door" }],
  "entities": [{ "class": "ms_player_begin", "room": "taproom", "at": "against west" },
               { "class": "ms_player_spawn", "room": "taproom", "at": "corner se", "keys": { "message": "from_town" } }] }
```

`smak build tavern.json --game <Half-Life>/msc --game <Half-Life>/valve`. Its own .wad (the textures the spec
paints) goes into the mod's folder beside the map.

A profile's thing (`things: { name: { model, r, wall, lift, deep, turn, on } }`) is placed by its footprint: `r`
half its length along the wall, `wall` how far its origin stands off the wall, `deep` how far it reaches into the
room (`r` unless told), `lift` its origin over its foot; `turn` the yaw that faces the model into the room (one made
facing -y, as a couch of The Specialists is, turns 90); `on` a piece of the kit's it stands on (`bench`, `desk`),
put with it, the model on its top. A use's kinds may name the kit's pieces beside the mod's things (a warehouse of
the game's boxes and the kit's crates). No piece is put within a player's box and a step of a place to start.

### The Specialists' map

`"mod": "profiles/specialists.mjs"` with `--game <Half-Life>/ts --game <Half-Life>/valve`. Its `spec` (SPEC in the
profile, which says where each word was read from) gives:

- textures of the game's two shipped .wad files, `specialists.wad` and `halflife.wad` (the game's 29 maps keep most
  of theirs inside themselves, which a new map cannot name), each the one those maps wear most for its part: floors
  `wood4a`, walls `crete33`, ceilings `fifties_ceil01`, doors `door006`, trim `basetrim02`, outside brick `wall1`,
  roofs `masphalt4`; and words for a room's `surfaces`: `ts_tile`, `ts_brick`, `ts_concrete`, `ts_plaster`,
  `ts_parquet`, `ts_planks`, `ts_asphalt`, `ts_street`, `ts_metal`, `ts_hazard`, `ts_glass`. The kit's dressing
  pieces wear the game's too (crates `cardbox1`, barrels `metal_rusty5ccc`, desks `trrm_wood2`, consoles
  `drkmtlt_bord11`);
- props as `ts_model`, the class the game's maps place theirs with (627 in 14 maps);
- rooms furnished by `use` with models the game's maps name (a model the game lacks stops a map loading), as
  cluttered at their edges as the game's compact maps (ts_trident: 47 props and 34 breakables over 4.4 million
  square units; a warehouse of 448 x 384 had 4 pieces and has 8 to 12):
  `office` (computers on desks against the walls and in rows in the middle, office chairs, plants, paintings, a
  cabinet), `lobby` (couches against the walls, two more facing each other over a coffee table, plants,
  armchairs, pictures), `cafe` (booths, tables in rows, chairs), `warehouse` (the game's boxes and crates piled
  into the corners and along the walls, a pile in the middle, shelves, barrels), `garage` (a dumpster, boxes, barrels, rubbish), `server` (consoles, cabinets),
  `stairwell` (a plant), and for rooms open to the sky `alley` (a dumpster, rubbish, a street lamp), `plaza`
  (benches, lamps, plants, a statue in the middle) and `rooftop` (machines, pipes, barrels). The game has no models
  for a bathroom or a stove; its crates are brushes (`func_breakable`): the kit's crates (and crates of 40 and 48
  of the profile's own `pieces`) dress a warehouse, a garage and an alley, each a `func_breakable` of wood;
- props a player cannot walk through: a `ts_model` is a point to a player (the game's program gives it a box of
  no size), and the maps' makers clip some (118 of 886: the seating most, plants and boxes none). Couches, armchairs,
  tables, booths, the game's boxes, a dumpster, a bench and a statue are `solid` in the profile and get a `CLIP` box
  of their footprint and height, in a room's dressing too; plants, pictures, office chairs and the street lamp are
  walked through;
- lamps of the game's own: every room's lamp (unless a `frame` says `fixtures: false`) is a fixture of two tubes of
  `+0~fifties_lgt2` (halflife.wad's light the game's maps wear most, 12 of them) on the ceiling, each its whole
  picture once, lit as a texture light (an `info_texlights` in the map, which hlrad reads: no lights.rad, and the
  game ships none). The profile's `lamps` give each of the game's light textures its colour, as the maps' makers
  lit it (the light on its own faces in their maps: fifties_lgt2 252 255 234), and the brightness this kit's Valve
  list gives it; any of them a spec wears is lit so. Words for a spec's own lamps: `ts_lamp`, `ts_lamp_warm`
  (`~trn_lt1`), `ts_lamp_cool` (`+0~light3a`), `ts_sodium` (`+0~tnnl_lgt4`, 255 185 124), `ts_screen`
  (`+0drkmtl_scrn`). The dressing's share of brushes wearing a lamp comes to Valve's (11 to 21 in 100); a room's lamp is its
  fixture alone, with no light entity under it, and the light is composed unless the spec says `lighting: false`: one
  lamp in three dimmed, its fixture the dim tube `+0~fifts_lght3` (the profile's `spec.lighting`: `{ lamp, composed }`).
  Valve's lamps of 250 under the fixtures lit the rooms' floors at 218 of 255; so lit, a lobby, an office and a
  warehouse come to 83, within the game's own maps' 52 to 102;
- what breaks, as the game's maps make it (1006 `func_breakable` in 27 of its 29 maps): glass (`material` 0) in
  render mode 2 at 100 and `health` 1, wood (crates) at 15, metal at 50; every one with `respawntime` 45, since no
  stock map sets it (0 is the game's 30 seconds, under 0 never, per `ts/mapping.txt`) and the Havoc9 matchmode
  plugin resets nothing between rounds. A window's glass is the game's `glass_bright`, and the word `glass` names it
  for a screen of the spec's own;

**Delivered as the .bsp alone.** A mod's map is built on the .wad files its game ships (the profile's `spec.wads`):
a map that wears only their textures writes no .wad of its own and names none but theirs (the sky is the
compilers' own texture: zhlt.wad and sdhlt.wad have it, and hlcsg puts it inside the .bsp by itself). One with
pictures of its own (a spec's `textures` painted by the kit: marble, brass) writes them to `<name>.wad`, which the
.map names for an editor, and the compile puts them inside the .bsp (`hlcsg -wadinclude <name>`): the compiled map
asks the game for the shipped .wad files alone, and the report says so (`the compiled map asks the game for
specialists.wad, halflife.wad and carries N pictures inside`). `"compile": { "embed": false }` leaves them out of
the .bsp, and the report warns that `<name>.wad` has to be shipped beside the map.

```json
{ "spec": "smak.map/1", "name": "ts_offices", "mod": "../smak/profiles/specialists.mjs",
  "rooms": [{ "id": "lobby", "size": [448, 320, 160], "use": "lobby", "surfaces": { "floor": "ts_parquet" } },
            { "id": "office", "size": [384, 320, 128], "place": { "east_of": "lobby" }, "use": "office" },
            { "id": "alley", "size": [384, 384, 256], "place": { "north_of": "office" }, "sky": true, "use": "alley",
              "surfaces": { "floor": "ts_street", "walls": "ts_brick" } }],
  "links": [{ "between": ["lobby", "office"], "kind": "door" }, { "between": ["office", "alley"], "kind": "door" }],
  "entities": [{ "class": "info_player_deathmatch", "room": "lobby", "at": "against west", "facing": "east" },
               { "class": "info_player_deathmatch", "room": "alley", "at": "corner ne", "facing": "west" }] }
```

### A building in another map

A map spec's building is put in a map made another way (an outdoor map of `carvePlan`, a sketch, a village of
`house`s) by building it in an open yard and taking out what stands there: its shell, roof, door, furniture,
props and lights, without the yard's rock, sky, floor, starts and sun.

```js
const { report, files } = buildMapSpec(tavernSpec, { out, mod, compilers: { found: false, message: "" } });
const built = maps.readMap(readFileSync(files.map, "utf8"));
const tavern = maps.standingIn(built, report.rooms.yard, { by: [x, y, groundAt(x, y)], starts: mod.starts });
const village = maps.mergeMaps(outdoorMap, tavern);      // then compiled as one, its .wad files joined
```

The yard's floor (z 0) goes to the ground's height at `by`: give the building flat ground to stand on, a pad
its size or a little more, and keep what is strewn off it. The building's ways out are links to the yard, so
they open onto the other map's ground. A Master Sword tavern so set on a village's green compiles with SDHLT
and is walked into from the village's start.

### Entities

Write every entity's class and keys from the game's FGD, never from memory (`smak map-fgd` reads one, and a
mod's source against it). Every build holds the entities against the FGDs given (`--fgd`, the spec's `fgd`): a
class the game does not have, or a key its class does not take, is told.

### A drawing of the layout

A plan drawn in text: a character a cell (`cell` units, 64 unless told), the first row the northmost. The
key gives each character a room (a letter) or a prefab (`{ "prefab": "table", "rotate": 90 }`); `.` is
rock. A room's cells (and the marks inside it) must make a rectangle. Rooms drawn so take their height
from `size` (a number) and their floor from `floor`; links, entities and the rest are given as for any
map. Leave one row or column of `.` (one cell of rock) between rooms that are not meant to join.

```json
"layout": { "cell": 64, "rows": [
  "HHHHH.KKK",
  "HHtHH.KKK",
  "HHHHH.KKK"
], "key": { "H": "hall", "K": "kitchen", "t": { "prefab": "table" } } }
```

With a layout the `wall` is the gap the drawing leaves (one cell), so set `"wall": 64` (or the cell size).
When a person gives a drawing as a picture, read the rooms and their labels off it into rows like these,
and pass the picture as `--reference`: it is then drawn beside the plan of the result, to be compared.

### What the report says of a map

- `FAULT ... leaks` (the plan's flood or the compiler): a way to the void. A spec carved in one piece does
  not leak; it comes from a link or a room placed wrongly.
- `FAULT walk: ... not reached on foot ...`, `... stand in something solid ...`, `... one-way ...`: the
  walk test's own sentences, each saying why (no way in, a step too high, a gap of 28 where 32 is wanted).
- `FAULT ... reaches N into <room>'s <side> wall`: furniture or a prop standing in a wall.
- `FAULT furniture[n] ... stands in front of links[m]`: in the way of a door or an opening; move it aside.
  `... stands on or at the foot of the stairs of links[m]`: the same for a flight of stairs.
- `WARN N rooms of a building have nothing in them`: a house's rooms are furnished unless the person asks for them
  bare; corridors and open rooms are not counted.
- `WARN N pieces of furniture are boxes where the kit has a model`: a prefab named for a thing the kit furnishes
  (`toilet`, `tub`, `wall_sink`, `fridge`) is built of boxes, which read as blocks in the game: put the kit's in
  as props (`"model": "kit:toilet"`), unless the boxes are meant.
- `WARN N of the map's own textures look unlike nine in ten of Valve's walls and floors`: each picture named
  with what is off: brighter or more coloured than Valve's (with the number and Valve's middle), or too even.
  Darken or soften its tone (`docs/SPEC.md`, "Materials").
- `FAULT no floor of <room> is walked to, though a way leads into it`: the way in is shut (furniture across it,
  a wall, or a step too high on the way there); `smak map-reach` draws the walk on the plan.
- `FAULT N pieces of furniture float`: touching no floor, wall, ceiling or other piece; each named with its height.
- `WARN N pieces of furniture stand on ... under half their footprint`: set on others, not on the floor or a wall,
  with less than half of what they stand on under them (on an edge or a corner when almost none): line each up
  with what holds it, unless it overhangs on purpose (a shelf, a balcony).
- `fact sweep: ...` (after the compile): the drops a player can step off and be hurt by (over 210 units, a
  warning: mean it or rail it), glows and sprites with nothing solid within 32 (a fault: an `env_glow` or
  `env_sprite` the spec puts more than 32 from its room's surfaces and its furniture is refused before the build;
  a `light` entity in open air is only noted, since the game draws it not), and solid that touches nothing,
  floating in the air (a fault: a slab or a wall left between carved rooms). Every lamp the spec hangs below a
  ceiling has a rod and a shade, so none floats; `smak map-sweep <bsp>` sweeps any map.
- `FAULT links[n]: the wall ... share is N long`: too short for a way a player passes at ease.
- `FAULT N ways a player walks through are under 48 wide`: furniture, or walls, too close together where the
  walk test goes through; each is named by its place.
- `FAULT ... is dark`: a room whose floor is lit under 24 of 255 after the compile.
- `ERROR links[n]: ... not side by side`: the two rooms of a link do not share a wall.
- `fact <word>: picked ... / a GAP ...`: where each game texture came from.
- `CHANGED since the last build ...`: what this build changed from the one before of the same name.
- `FAULT size: its plan is ... where the spec asks ...`: the rooms reach further (or less far) than the size asked.
- `ROOMS`: every room's box and the light on its floor.
- `fact dressing: ...` (after the compile): the map's dressing beside Valve's own campaign, measured, a line a
  measure (`dressing: tall walls of one texture only: 100% (Valve's: 44% to 93%, median 68%)`), and a `WARN` for
  one outside Valve's 5th to 95th in 100, with which way to go: band tall walls, light by lamps built into the
  walls and ceilings, keep dark spots, break the boxes, more detail. Measures, not a judge's opinion: read them
  when revising (docs/MAPS.md, "A map's dressing"; `smak map-dressing <bsp>` measures any map).

The pictures: the plan of the result (every entity marked with its number and class; beside the person's
drawing when one is given); a view of every room from high in its south-west corner, looking down across
it, lit by the map's own light; views aimed at what the map has (`features`: its water, its largest standing
piece, its lamps, its crowd, each storey); the same three times as bright when the map is dark; a section through
every staircase; a view at a man's height towards each room's props; and every model the map builds, one
by one and named, close enough to judge.
