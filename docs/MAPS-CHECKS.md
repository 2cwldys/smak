# More checks of a map, with no game running

Beside `docs/MAPS.md` and `docs/MAPS-MAKING.md`: what was added after agents built two maps of a series and
met these faults. Each is a function of `maps` and, where it says so, a command.

## The walk test: what a class is

`reachOf` counts "the entities a player goes to". Three lists say what the classes alone do not, each by
number, classname (`*` for any letters) or targetname, and a mod's profile may carry them (`exits`,
`markers`, `wiring`, `off`):

| option | what it names | and then |
| --- | --- | --- |
| `exits` | a way out of the map (`msarea_transition`) | counted, and floor it is reached from is no one-way place |
| `markers` | a point a player is to get to though its class is wiring's (an `info_target` a script puts a chest at) | counted |
| `wiring` | what is fired by name and works wherever it stands (a line of text, a counter, a spawn area's own origin) | never counted, wherever it is |
| `off` | classnames that are an entity switched off (`disabled_*`: a class the game does not have) | no wall; one whose class would be a way out is looked for and told apart |

An entity of a class the game does not have is never made by the engine, so a brush entity so named stops
nothing (`spaceOf` takes `off` too). A switched-off way out is the way on that is not opened yet: it is in
`entities` with `off: true`, a fact says whether it is reached, and it is neither a way out nor, when it is
not reached, a warning.

The triggers that are only fired (`trigger_counter`, `trigger_relay`, `trigger_auto`,
`trigger_changetarget`, `trigger_camera`, `trigger_transition`) are left out by themselves, made of a brush
or not: nobody walks to a counter. And a `trigger_counter` with no brush is not said to have "no shape": its
code never asks for one.

`reach.walked(x, y, under)` is a **height**, and a floor at 0 is 0: compare with `null`, or ask
`reach.on(x, y, under)`, which gives `{ floor, stands, walked, jumped, trapped }` as yes and no.

## Scripts of one's own against the game's

For a mod whose maps and scripts name scripts by path, and which lays one's scripts over its own pack: a
file at a path the pack has takes that script's place; one at a new path does something only if something
names it. `scriptsPlaced` tells the three apart:

```
smak scripts content/scripts maps/yard.bsp --mod profile.mjs --game <mod folder> [--shipped <the pack unpacked>]

replaces  monsters/wolf
new       yard/keeper: named by the map yard (entity 161 ms_npc "keeper")
new       yard/map_startup: named by the game itself, when the map yard starts
UNNAMED   world/server/maps
WARN  1 scripts are new (the game ships none of that name) and nothing names them: ...
```

A new script is live when a map's entity names it, when the game runs or lists it by itself, or when a live
script's text names it (the game's own scripts, ours in their place, and every new one made live in turn).
How scripts are named is the profile's `scriptPack` (`shipped`, `loose`, `ofEntity`, `aliases`, `started`:
`src/maps/scripts.mjs`). `map-check --scripts <folder>` says the same of that map's folders. What it cannot
see is a name put together while the game runs: a script reached only so is "named by nothing", a warning.

## A compile that is seen, and stopped

`compileMap` always had a time for each program (2 minutes for hlcsg and hlbsp, 15 for hlvis and hlrad;
`timeout: { hlvis: ms }`); a program that passes it is stopped, the error says so, and no `.bsp` is written.
New:

- `progress: true` hands on what the compilers print as they work (to standard error; a file descriptor
  will do). `smak map-compile` does it by itself on a terminal, `--progress` / `--no-progress` say otherwise,
  and `--timeout 600` or `--timeout hlvis=600,hlrad=1200` sets the times in seconds.
- `result.portals`: `{ leaves, portals, seconds }`, read from the `.prt` hlbsp leaves. The portals are
  hlvis's work. Measured: 5088 portals, 219 seconds of full hlvis on 12 threads; 269 portals, 0.01. The
  time is taken to grow with the square of the count (the least it does), so `seconds` is a floor. From
  4000 portals, or when the floor passes hlvis's time, a warning says so **before** hlvis begins.
- `result.facts`: a draft (`fast`) says what it is: hlrad bounced no light (its own log: `bounces 0` where
  the full compile has 8), so what no lamp sees directly is black.
- the summary and the command print each program's seconds, "stopped" for one that was, and the portals.

## The light on the floor

A view's `brightness` is the mean of one picture: walls, ceiling and floor together. A lamp high in a room
makes a bright picture of a room whose floor is dim, and the game lights whatever stands in a room (a
monster, a chest) by the light of the floor under it. `lightReport` reads the lightmaps of the floors:

```js
const light = maps.lightReport(bsp, { rooms: { hall: { min, max }, tomb: { min, max } } });
// light.floor { area, mean, least, most, darkShare }, light.rooms [{ name, mean, dark, dim }], light.patches
```

```
smak map-light map.bsp [--rooms rooms.json] [--dark 24] [--walked]
```

A room is **dark** when its floor's samples average under 24 of 255 (this kit's own line), and **dim** when
it has under 0.6 of the light of the map's middling room: the eye settles to the rooms it came through.
Without rooms, the dark of the floor is gathered into stretches and listed with their places. With
`reach` (`--walked`), only floor a player walks is counted.

The numbers are the bytes hlrad stored. The engine (Xash's GL renderer, its defaults) shows texture x
sample x 2; this kit's views use 1.55. Both are a straight multiply, so a view is as true as the lightmaps
are: of a draft it shows the draft's light.
