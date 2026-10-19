# SMAK: Studio Model Agent Kit

Tools for making and changing GoldSrc models (`.mdl`: Half-Life and its mods), built to be driven by an AI
coding agent such as Claude Code. You say what you want; the agent writes small scripts with this kit, draws the
result into pictures to check its own work, and hands you a `.mdl` to try in the game.

Version 0.20.0. An early release, made for an agent to work. For the person it has two pages in the browser: a
**viewer** that shows any two models side by side, turning and playing their animations together, and an
**editor** for touching up a model by hand (its animations, events and textures; not its shape), on a project
file the agent can work on too (`editor/README.md`).

## What it does

- **Textures**: takes them out of a model, puts new ones in (PNG or BMP), recolours, or paints them by rule.
- **Shapes**: replaces a weapon or item inside an existing model, keeping its hands, skeleton and animations;
  or writes a whole new model for a prop or pickup, from triangles or from a Wavefront `.obj` file made in
  any other tool (`smak obj`).
- **Animations**: reads them, changes them, replaces them in place or adds new ones, with their sound events.
- **By place**: paints wear, damage or markings where a point is on the body, across every texture it has, or a
  garment on chosen islands of a picture, in passes and with soft edges, over layers that say what the old picture
  is (mail, plate, a strap) and how far their edges are; adds a body again in another texture; finds
  a model's loose pieces (a pack, a pouch, a helmet) and takes them off; moves a part from one model to another
  that shares its skeleton.
- **Items**: adds a new weapon, shield or bow to the files a game already shows its kind from, as new
  submodels after the ones it has, laid on the game's own, with the numbers its script needs (`smak item`).
- **Bought models**: an .fbx, .glb/.gltf or .obj made a prop, a weapon in a game's own files, or a model with
  its skeleton and animations (`smak import`, `smak item mace.fbx ...`; docs/IMPORT.md).
- **Checking**: tells whether a model stays inside what GoldSrc, or Xash3D, can load.
- **Pictures**: draws any model from any side, or as the player sees a weapon, so the agent can see what it made.
- **Maps**: reads a compiled map (`.bsp`) and draws it, checks its entities against a mod's profile, measures
  how it plays; writes maps from a script or a drawing, with makers for what the game's own maps are made of:
  ground that rises and falls, cliffs, paths, grass and trees strewn, sounds, houses and fences, rooms dressed
  for their use (docs/MAPS-MAKING.md).

It reads and writes the `.mdl` file directly. No decompiler, no studiomdl, no Blender, no `.smd` or `.qc`.

## What you need

- [Node.js](https://nodejs.org) 18 or later. Nothing to install after that: the kit has no dependencies.
- An AI coding agent that can run commands and look at images (Claude Code, or similar).
- Your mod's own model files.

## Starting

1. Unpack this folder somewhere, for example next to your working folder.
2. Check it runs: `node test/selftest.mjs` should end with `0 failed`.
3. Open your agent in a working folder and tell it where the kit is:

   > Read `smak/AGENTS.md`. I want to work on models for my GoldSrc mod; its models are in `C:\…\ts\models`.

   Agents that read `AGENTS.md` or `CLAUDE.md` on their own pick it up if you start them inside the `smak` folder.
4. Ask for what you want, with the model's file name. For example:
   - "Show me what is in `v_katana.mdl`."
   - "Make the blade texture of `v_katana.mdl` darker and more worn."
   - "Replace the knife in `v_knife.mdl` with a longer combat knife with a black cord grip."
   - "Slow the draw animation of `v_katana.mdl` down a little and add a sound at the frame the blade clears."
   - "Make three versions of this player model, more battle-worn each time, and one without its backpack."
5. The agent gives you a new `.mdl` and pictures of it. Copy the `.mdl` into your mod's `models` folder (keep a
   copy of the original) and look at it in the game.

Start with a texture change. It is the smallest step and proves the whole route on your game before anything
larger.

## Trying it yourself

```
node bin/smak.mjs info  path/to/model.mdl
node bin/smak.mjs sheet path/to/model.mdl -o sheet.png
node bin/smak.mjs strip path/to/v_model.mdl -o draw.png --seq 0 --view first
node bin/smak.mjs check path/to/model.mdl
node bin/smak.mjs view  path/to/a/folder/of/models
node examples/01-new-model.mjs out
```

`view` prints an address (http://127.0.0.1:8098/) to open in the browser. It lists every model in the folders
you give it; press A or B beside two of them, drag to turn, pick an animation. Give it your originals' folder
and the agent's output folder together to compare before and after.

For a map: `node bin/smak.mjs map-info path/to/map.bsp`, `map-plan path/to/map.bsp -o plan.png` and
`map-views path/to/map.bsp -o views.png` say what is in it and draw it.

For a new item, a mod's scripts and a map's light:

```
node bin/smak.mjs item   piece.mjs --mod profile.mjs --game <mod> --family <name> --name club -o out --pictures
node bin/smak.mjs scripts <your scripts> <map.bsp> --mod profile.mjs --game <mod>
node bin/smak.mjs map-light map.bsp [--rooms rooms.json]
```

`node bin/smak.mjs help` lists every command. If a picture comes out empty, the model keeps a blank submodel at
body 0: `info` shows the body numbers, and `--body N` picks one.

## What is in the folder

| | |
| --- | --- |
| `AGENTS.md` | The briefing for the agent: how a model is put together, the rules, the recipes. Worth a read yourself. |
| `docs/API.md` | Every function. |
| `docs/ENGINES.md` | GoldSrc against Xash: limits and differences. |
| `docs/MAPS.md` | Maps: a compiled map (`.bsp`) read, checked, its entities changed, its textures and `.wad` files, pictures of it (a plan, views from inside, a side section, its storeys), and the walk test. |
| `docs/MAPS-MAKING.md` | Maps: brush source (`.map`) written from a script, checked, drawn, and compiled with VHLT, an outside program. |
| `docs/MAPS-SKETCH.md` | A map from a drawing: an Inkscape SVG or a Paint PNG made a sealed `.map` (`smak sketch`). |
| `docs/MAPS-DESIGN.md` | Maps a player likes: rules of thumb read from a game's own 100 maps (shape, height, light, dressing, monsters, rewards). |
| `docs/MAPS-CHECKS.md` | More checks of a map with no game running, added after agents built a series of maps. |
| `docs/PLAY.md` | A map played in the game and tested by what the game says (`smak play`): steps, fights, the run's report. |
| `docs/ITEMS.md` | A new weapon, shield or bow added to a game's own files (`smak item`). |
| `docs/SPRITES.md` | Sprites made by rule (`smak sprite`): glows, flames, explosions, sparks and beams written as `.spr`, measured against Half-Life's own. |
| `docs/IMPORT.md` | Bought models (.fbx, .glb/.gltf, .obj) made props, weapons or rigged models (`smak import`). |
| `CHANGELOG.md` | What changed, version by version. |
| `bin/smak.mjs` | The command line. |
| `src/` | The library: the model reader and writer, pictures, fitting, drawing, checking, working by place, and the workshop for building shapes and painting textures. |
| `src/maps/` | Maps, exported as `maps`: reading and checking a `.bsp`, entities, `.wad` files, brush source, the compile, pictures of a map, and the walk test. |
| `kits/` | Builders for swords and knives, axes, blunt weapons and bows. |
| `viewer/` | The page that shows models side by side, and its small server. |
| `editor/` | The page for re-timing and re-posing animations, events and textures by hand, its server, and the same edits from a terminal. |
| `examples/` | Seven scripts, one for each kind of work; the seventh makes a small map. |
| `scripts/` | `no-game-files.mjs`: every file the repository tracks (`--history`: every version ever committed) held against a game's folders, by their bytes, every texture of their `.wad` files and models by its pixels, and every sound by its samples. Run it before a push. |
| `profiles/` | Two mods' profiles (Master Sword Classic's, and The Specialists' with its role-play cities), as examples of what a mod's own is: what its maps' entities are checked against. No part of the kit's core, and they hold no game content. |
| `mcp/` | The kit as an MCP server, for a client with no shell: `mcp/README.md`. |
| `test/` | The kit checking itself: `selftest.mjs` runs the files beside it, one an area. `test/fixtures/` holds the kit's own small map. |

## Limits worth knowing first

- GoldSrc models only (version 10). Not Source.
- A new model written from nothing has no hit boxes and no attachments. For a weapon's first-person model, the
  kit replaces the shape inside the model your mod already has, which keeps both.
- One bone a vertex, as the format has it.
- Animations kept in separate `name01.mdl` files cannot be edited.
- The kit's pictures and its viewer use a plain light of their own. Shape, size, texture and pose are true;
  brightness is not.
- Written for GoldSrc's limits by default, so the same files load in Xash3D. See `docs/ENGINES.md`.
- It was built for another GoldSrc mod (Master Sword). Thirteen player models of The Specialists have been read,
  changed and drawn with it, but **nothing it made has been loaded by The Specialists yet**: your first model in
  the game is the real test.
- Many models give the left and right side of the body the same pixels of a texture. A mark painted on one side
  then shows on the other; the kit reports how much of each texture is shared.

## What is new

0.20.0 makes maps that read as the game's own: ground with relief, cliffs and a skyline, worn paths, grass,
flowers and trees strewn as the game strews them, a forest's edge, ambient sounds, detail textures, the
sizes of the game's doors, steps and roofs, half-timbered houses and fences, and interiors (`dressRoom`:
rooms dressed for their use, with galleries, torches and places kept for what happens there).

Every version's changes, the newest first: [CHANGELOG.md](CHANGELOG.md).

## Where it comes from

SMAK is the model tooling of the msr-web project, taken out so that it stands on its own. The kits for swords,
axes, blunt weapons and bows were made for that project's medieval weapons; for firearms and anything else the
agent builds shapes from the workshop's parts (`AGENTS.md`, "Making a shape").

## Licence

MIT (see `LICENSE`): use it, change it and pass it on freely, for any purpose. That covers the kit's code only.
The models and textures of a game belong to that game's authors, and what you make from them is theirs to allow.
