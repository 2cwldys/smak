# Looking at a map, and changing its entities

A compiled map read, checked and drawn, and its entities changed with no compile. The walk test is
`docs/MAPS-CHECKS.md`; a new map `docs/MAPS-MAKING.md`; every function that reads a compiled map, and every
option of its pictures, `docs/MAPS.md`.

## What a map is

A map is three kinds of file. Its **source** (`.map`) is text: brushes (convex solids) and entities (a light, a
door, a place to start). The **compiled map** (`.bsp`) is what the game loads: the brushes cut into faces, with
the light baked onto them and what is seen from where worked out, and the entities as text inside it. Its
**textures** are named in both and kept in `.wad` files, unless they were put inside the `.bsp`. Units are the
models': about an inch, `+z` up; on a plan `+x` is east and `+y` north. `docs/MAPS.md` and `docs/MAPS-MAKING.md`
hold the vocabulary; in a script, `import { maps, png } from "./smak/src/index.mjs"`.

The loop is the models' loop: look at what is there, change it in a script or with a command, check it, **draw
it and look at the picture**. Never write over a map of the game's: write a new file.

## Looking at a map

```
node bin/smak.mjs map-info gatecity.bsp                          what is in it
node bin/smak.mjs map-check gatecity.bsp --game <mod> --game <valve>   would the engine take it; are its .wad files there
node bin/smak.mjs map-check gatecity.bsp --mod <profile> --game <mod> --game <valve>   and would the mod: its entities, names, rules, files
node bin/smak.mjs map-plan gatecity.bsp -o plan.png              from above: where everything IS
node bin/smak.mjs map-views gatecity.bsp -o views.png            from each start and the largest rooms
node bin/smak.mjs map-view gatecity.bsp -o v.png --from -191,-802,-433 --yaw 90
```

- **The plan is the picture to find things by.** `+y` is up it and `+x` to its right. Every point entity is a
  dot (places to start, lights, monsters and the rest each in a colour), every brush entity an outline, each
  with its number, the one `map-entities` and `map-set` go by. The command prints each mark's pixel (`--list`
  for a big map). A big map labels only its starts: `--area x0,y0,x1,y1` draws a part closer.
- **A view is taken from a point inside** (`--from`, with `--yaw` 0 along `+x`, 90 along `+y`), or from an entity
  (`--at 12`, `--at info_player_start`). A start is looked from at a player's eye height. Read what the command
  prints under the picture's line: an eye "in solid" is inside a wall or outside the map.
- **The light is the map's own**, baked by its compiler, at about the brightness the game shows. A dark picture
  is a dark place (the line says so): `--brightness 4` looks into it, `--no-light` shows the textures alone.
- **What stands is drawn at its true size.** A place to start, a monster and an NPC are the box they move
  with (32 x 32 x 72; `--body name=large` for 64 x 64 x 64): in a view a box that stands on the floor, hangs
  over it or goes into it; on a plan its outline. `--models` (with `--game`) draws a prop that names its
  `.mdl` as that model, with its textures, in the `body`, `skin`, `sequence`, `scale` and `angles` its
  entity gives; a masked texture's holes are open, so a tree's crown hides what the game's hides and no
  more. A monster's own comes from its script: `--mod <profile>` with `--models` draws it where the
  profile can read it (`modelOf`), and `--model name=models/x.mdl` names one by hand. A door is
  drawn shut.
- **With `--game`, the sky is the map's own** (`skyname`: the six pictures of `gfx/env`) **and a sprite is
  drawn** (`env_sprite`, `env_glow`: its first frame at its `scale`, blended by its render mode; a small
  cross on a plan). `--entities game --no-labels` draws only what the game shows, with no boxes: the picture
  to lay beside a screenshot. A `{` texture has its holes only on an entity in render mode 4, as in the game:
  a view that says `N faces wear a \`{\` texture ... the game draws their holes filled` has found a fence
  with no `rendermode`.
- **One plan is one height.** `map-plan --heights` writes each floor's height on it; `map-storeys` lays a
  plan for each storey side by side; `map-section --from x,y --to x,y` cuts the map upright along a line: the
  picture for a cellar under a terrace, a stair, a ceiling's height, a thing sunk in the floor.
- **`map-reach` walks the map**, the walk test: `docs/MAPS-CHECKS.md`, "The walk test: running it".
- **A crowded plan** writes an entity's number alone where its label has no room: `--legend` lists every
  number with its class beside the plan.
- A face in one flat colour is a texture that was not found: `--game` the mod's folder and `valve`, or `--wad`.
- In a script: `maps.planOf(bsp, { z, area })`, `maps.drawMap(bsp, { from, yaw })`, `maps.viewsOf(bsp)`,
  `maps.sectionOf(bsp, { from, to })`, `maps.storeysOf(bsp)`, `maps.openingViews(bsp)`, each giving `{ width,
  height, rgba, facts }`, and `maps.reachOf(bsp)` (`{ warnings, facts, entities, openings ... }`);
  `maps.contentsAt(bsp, point)`, `maps.floorUnder` and `maps.restOf(maps.spaceOf(bsp), feet)` answer "is this
  spot open, and does a body fit" before you put something there (`docs/MAPS.md`).

## Changing what is in a compiled map

Entities are read by the game when the map starts, so they can be changed with no compile:

```
node bin/smak.mjs map-entities gatecity.bsp --class ms_player_spawn        their numbers and keys
node bin/smak.mjs map-set gatecity.bsp -o work/gatecity.bsp --entity 266 --move -688,-3300,-330 "angles=0 90 0"
node bin/smak.mjs map-set gatecity.bsp -o work/gatecity.bsp --add monster_zombie --at 96,300,36 "angles=0 180 0"
node bin/smak.mjs map-set gatecity.bsp -o work/gatecity.bsp --entity 24 speed=40      a door's speed
node bin/smak.mjs map-plan work/gatecity.bsp -o plan.png                              the dot has moved: look
```

- One change a command, each from the file the last one wrote when several are wanted; in a script
  (`maps.moveEntity`, `setKey`, `addEntity`, `removeEntity`, then `maps.withEntities(bytes, entities)`) any
  number at once, from the original.
- **What takes effect**: where things and monsters stand and face, what they are, their keys, targets and
  scripts. A point entity's origin is its middle: a player's or a monster's is 36 over the floor for a
  standing one (`maps.floorUnder(bsp, point, { hull: 1 })`).
- **What does not, without a recompile from the source**: light (a `light` entity added or moved lights
  nothing: the light is baked into the faces), the brushes (a wall, a door's shape), what is seen from where,
  and collision. A brush entity cannot be added or taken out; it can be shifted (`origin`), hidden
  (`rendermode=2 renderamt=0`) or have its keys changed. The command says so in its last line every time.
- A new class the mod does not know does nothing; a monster whose model the game has not loaded on that map
  may be refused (AGENTS.md, rule 8). Look at how the map's own entities of that kind are written, and copy their keys.
