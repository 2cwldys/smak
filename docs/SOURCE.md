# The Source engine: a GoldSrc model in Garry's Mod

A GoldSrc model (`.mdl`, version 10) is ported to Source, as Garry's Mod loads it, in one command:

```
node bin/smak.mjs gmod-port <model.mdl> -o <work folder>
```

The kit reads the model itself and writes what Valve's compiler reads: an SMD for each submodel and each
animation, a QC that says how they go together, and a VTF and a VMT for each texture. GMod's own `studiomdl`
compiles them. The compiled model is then read back from its own files and held to the original, corner by
corner, and drawn. The command ends in `PASS` or `FAIL` and names the picture to look at.

## What it needs

- **Garry's Mod, on Windows.** Its compiler is `GarrysMod/bin/win64/studiomdl.exe`, an outside program that
  comes with the game, as VHLT is for maps. It is found in Steam's libraries. Otherwise name it with
  `--studiomdl <exe>` or `SMAK_STUDIOMDL`.
- **The model's own files**: `<name>t.mdl` (its textures) and `<name>01.mdl` ... (its animations kept apart),
  beside it, where the model has them.
- `--no-compile` writes the files with no compiler. Nothing is checked then.

The compiler runs in a folder of its own, made for the run. Nothing is written into the game.

## What it makes

Under `-o <folder>`:

| | |
| --- | --- |
| `src/<name>.qc`, `src/*.smd`, `src/anims/*.smd` | what the compiler reads. Kept, so a person may change the QC and compile it again |
| `addon/models/smak/<name>.mdl`, `.vvd`, `.dx90.vtx`, `.dx80.vtx`, `.phy` | the compiled model |
| `addon/materials/models/smak/<name>/*.vtf`, `*.vmt` | its textures and materials |
| `sheet.png` | six views of the compiled model, drawn from its own files |

**`addon/` goes into `garrysmod/addons/<any name>/` as it is.** In the game, the model is
`models/smak/<name>.mdl`. In the spawn menu, search "smak". In single player, spawn it from the console with
`gm_spawn models/smak/<name>.mdl`. The person installs it; the kit does not write into their game.

Options:
- `--name n`: its name in Source (the file's, lower case, unless given).
- `--folder f`: the folder under `models/` and `materials/models/` (`smak` unless given).
- `--collision auto|hull|box|ragdoll|none`: what it collides as.
  - `hull`: the convex hull of all its triangles, one solid. A physics prop that rolls as it is shaped (a barrel
    rolls). The kit makes the hull: Source's compiler refuses a collision mesh of several pieces.
  - `box`: the box about its triangles.
  - `ragdoll`: a figure that falls as a body, a piece a bone with hit boxes, each joined to the piece above it.
    A `ragdoll` animation (its rest pose, `ACT_DIERAGDOLL`) is added.
    - **Each piece is fitted to the body**: the convex hull of its bone's corners, and of the bones below it
      that have no piece (a hand's fingers, its gun). A GoldSrc vertex is on one bone, so a body's corners are
      rings, one a bone: where a triangle's side goes from one piece to another, each takes its share of it, and
      the pieces meet. A bone with hit boxes and no body of its own is left to the piece above. There are 24
      pieces at most, the smallest left to their parents. GoldSrc's hit boxes, far bigger than the body, are the
      pieces only of a model whose corners make none.
    - **Each joint bends as far as the model's animations bend it**: how far the bone turns from its rest against
      the piece above, about each of its axes, over every frame (the 2nd to the 98th hundredth of them, 10
      degrees spare each way). An axis it never turns about is held, so a knee is a hinge: Half-Life's grunt's
      knee bends -133 to 22 about z, and not at all about x and y. A bone the animations never turn, or a model
      with none, bends 40 degrees each way.
    - The limits are Source's own: measured on a Half-Life 2 citizen in GMod, its `.phy` gives its knee z -12 to
      126, and +z is the turn that bends that knee. GMod's compiler writes the QC's limits into the `.phy` as
      they are.
  - `auto` (the default): a hull for a model of one bone, a ragdoll for one with a skeleton and hit boxes, else
    none.
- `--surfaceprop wood`: what it is made of, to Source: the sound it makes when hit, how heavy a volume of it
  is, how it breaks.
  - A model the kit built from a spec takes it from its build's record (`<name>.built.json`): the material
    with the most surface, by its base (`wood` → `wood`, `iron` → `metal`, `stone` → `rock`...).
  - A ragdoll is `flesh`; anything else `default`. Each is said.
- `--mass kg`. Unless it is given:
  - a hull or a box weighs its volume at its surfaceprop's density, read from GMod's own
    `scripts/surfaceproperties.txt` (wood 700 kg a cubic metre, metal 2700). GMod's compiler weighs everything
    as `default` (2000), whatever its surfaceprop: measured, a barrel's hull 671 kg as wood and as metal.
  - a ragdoll weighs a person's 90 kg, as Valve's do whatever their build (a citizen's and Kleiner's `.phy` both
    say 90). By its volume, Half-Life's bulky grunt would weigh 232 kg as water.

  A solid barrel of wood 40 tall weighs 235 kg by its volume. An empty one is nearer 40: give `--mass 40`.

The PASS line ends with what the compiled model collides as, read from its `.phy`: its solids, joints, mass
and surfaceprop.

## A model made for Source

A model spec (`docs/SPEC.md`) built with `"engine": "source"`, or with `--engine source`:

```
node bin/smak.mjs build barrel.json --engine source
```

The model is built as any spec is, and checked the same way: its shape, its pictures, a character's poses. What
differs is what it is held to and what is written:
- **Half-Life 2's models, not Half-Life's.** Measured on GMod's packs by `scripts/source-budgets.mjs`: 2170 props,
  88 people and creatures. Three quarters of Half-Life 2's props of a barrel's size have under 598 triangles
  (Half-Life's: 156); its people under 4976 (Half-Life's: 785). Past those, it is warned of.
- **A larger picture.** 512 a side unless told, Half-Life 2's props' at the median; 1024 a character's.
- **Pictures in full colour.** GoldSrc's are cut to 256 colours; the Source files are written from the pictures
  as they were painted.
- **Source's limits.** `check` holds the file to its `source` profile, not GoldSrc's: no 512-pixel cap, more
  points a submodel.

A character keeps its base's bones and every animation, those the base keeps in `<base>01.mdl` files too (read
beside the base). It is bound in the stance it was built in, its base's first frame: Source draws a model at rest
in its bind pose, and a ragdoll falls from it, and a body made in a stance is out of shape at the bones' own rest
(a robot built on Half-Life's grunt stood with a leg kicked out). Its joints are measured from that stance.

The GoldSrc model written beside the spec is the step between. Under `-o`, `<name>_source/` has its `src/` and
its `addon/`, as a port's. `<name>-source-sheet.png` is the compiled model drawn from its own files. It collides
and weighs as a port does: a prop as its hull, at the density of what its parts are made of. `--collision`,
`--surfaceprop`, `--mass`, `--folder` and `--no-compile` are taken as `gmod-port` takes them.

A spec's own `budget` and `texture` still bind. Source allows a finer model, but a low-poly look is a choice it
allows too: nothing is made finer than the spec asks.

Not yet for Source: a weapon's files (refused), normal maps and the other material parameters, more than one
bone a vertex, pose parameters.

## What is kept, value for value

- **The bones, their names and their rest, and every frame of every animation.** A GoldSrc bone's six values
  are an SMD bone's six. Animations kept in `<name>01.mdl` files are read from them.
- **Each bodypart as a `$bodygroup`, each submodel in its place.** A submodel with no triangles is `blank`.
  So a body number means what it meant.
- **Each skin family as a row of the `$texturegroup`**, so a skin number means what it meant.
- **The attachments, the hit boxes and their groups, the eyes and the boxes.**
- **Each animation's fps, looping, activity and weight, and its events by their numbers.** Activities take
  their names from `activity.h`, numbers 1 to 76.
- **An animation's travel.** GoldSrc's compiler took a walk's travel out of its frames, along the axes marked
  LX, LY and LZ. The port puts it back into the root bones' frames and tells Source's compiler `LX` in its
  turn.

## What changes, and why

| Change | Why |
| --- | --- |
| `$origin 0 0 0 -90` | Source's compiler turns everything it reads by 90 degrees about z, as GoldSrc's did when it compiled the original. What is written is the original as it was compiled, already turned |
| Meshes written in the model's space, their corners the other way round, v counted from the picture's bottom | SMD's way: GoldSrc keeps a vertex in its bone's space. The compiled triangles wind as Valve's own models do (measured on Half-Life 2's in GMod's packs) |
| A texture becomes a picture of a power of two each way, mip-mapped | Source halves a picture for each mip level. GoldSrc's may be 96 by 83 |
| A masked texture (flag 64) becomes `$alphatest`, its last colour a hole (one-bit alpha) | GoldSrc's way of a hole |
| Additive (32) becomes `$additive`; fullbright (4) becomes `UnlitGeneric` | |
| A bone with no name is named `bone<n>`; a bone or animation whose name another has (in any case) gets `_2` after it | Source's compiler cannot read a bone with no name, merges two bones of one name in any case (`Bone10` and `bone10`), and refuses two animations of one name |
| An fps of 0 is written 1 (30 for one frame); a weight of 0 is written 1 | Source's compiler refuses both |
| A triangle of no area is left out | Source's compiler drops it |
| A bone no vertex is on is kept (`$bonemerge`) | Source's compiler drops it, then cannot find it for a hit box or an animation |

Each change is said in a `WARN` line.

## What is left behind, and said

- **Chrome (flag 2).** GoldSrc draws the picture turned with the view. Source has no such shader, so it is
  written as the picture with the room's reflection over it (`$envmap env_cubemap`).
- **Bone controllers** (a head that follows its target). Source turns such bones by pose parameters.
- **An animation's second blend and after** (an aim up and down). Source blends by pose parameters.
- **An activity past 76.** It is the mod's own, and only its game code knows it.
- **What plays its animations.** In GMod a ported figure is a model: spawned as a ragdoll it falls as a body,
  and as an effect (`gm_spawneffect`) it stands in its first pose. Its animations play only when an entity
  plays them, or an NPC asks for them by activity. Half-Life's monsters' AI is not in GMod.

## How a port is checked

Every check a port passes was measured on Half-Life's 301 models, all 210 that are models (2026-10-25). Each
compiled with no error and held:
- every bone, animation, material, bodygroup and its submodels, skin family, attachment and hit box;
- **every corner of the original**, within 0.05 units of where it was and on the same place of its picture.

The tolerance is there because Source's compiler turns each bone through a quaternion. On garg.mdl's toes, a
quarter turn about y, that moved a corner 0.01 units on a model 230 tall. A model turned, moved or with its
pictures laid another way is off by far more.

What the kit cannot see is how GMod lights it and plays it: open it in the game, or in GMod's own viewer,
`bin/hlmv.exe`.

## Source models read and drawn

The same reading works on any Source model (versions 44 to 49), its triangles from its `.vvd` and `.vtx`, its
materials as the engine finds them:

```
node bin/smak.mjs source-info models/kleiner.mdl                 # from GMod's folders and packs
node bin/smak.mjs source-sheet <folder>/addon/models/smak/barney.mdl -o barney.png
node bin/smak.mjs source-render models/props_c17/oildrum001.mdl -o drum.png --yaw 40
```

A path under the game (`models/...`) is looked for in:
1. GMod's `garrysmod/` folder, then its `addons/`;
2. its packs (`.vpk`), Half-Life 2's among them (`sourceengine/hl2_misc_dir.vpk`, `hl2_textures_dir.vpk`).

A file on the disk has its materials looked for under the folder that holds its `models/`. Pictures in DXT1, DXT3
and DXT5 are read, and so are the uncompressed formats.

In a script: `smak.source`, see `docs/API.md` ("The Source engine").

## Not yet

These are `PLAN.md`'s phases 6c to 6e:
- the model seen in GMod by the kit itself;
- new models made for Source: weapons, normal maps, more than one bone a vertex;
- blends and controllers as pose parameters;
- maps.
