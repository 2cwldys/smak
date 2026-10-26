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
| `addon/models/smak/<name>.mdl`, `.vvd`, `.dx90.vtx`, `.phy` | the compiled model. Not the `.dx80.vtx` and `.sw.vtx` the compiler also writes: GMod reads only the `.dx90.vtx`, and gmad, which packs an addon for the Workshop, refuses a `.sw.vtx` |
| `addon/materials/models/smak/<name>/*.vtf`, `*.vmt` | its textures and materials |
| `addon/sound/smak/...` | the sounds its events play, copied from the game |
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
- **A looping animation's travel.** GoldSrc's compiler took a walk's travel out of its frames, along the axes
  marked LX, LY and LZ, in one straight line. The port puts it back into the root bones' frames and tells
  Source's compiler `LX` in its turn, with `$motionrollback 0`: Source's default rollback treats the last
  0.3 s on its own, and the root drifts off the line. A one-shot (a jump, a lunge) stays in place, as GoldSrc
  played it: Source takes a one-shot's travel out along a curve, and a jump straight ahead lurched back. These
  are stevenlafl's findings, in their port of The Specialists to GMod.
- **An animation's blends** (Half-Life's aiming up and down), on a pose parameter. Each GoldSrc axis is one,
  named by the motion it was: `blend_xr` for a pitch (every aim of Half-Life's), `blend_x` for the tentacle's
  reach, `blend` for a blend of no motion (the icky's swim). Each animation keeps the values GoldSrc gave its
  first and last blend (barney's `shootgun`: -50 to 50), and the pose parameter ranges over all of them. Four
  blends of two axes are a grid two by two (`blendwidth 2`). In GMod, `ent:SetPoseParameter("blend_xr", 30)`
  aims as GoldSrc's `SetBlending(0, 30)` did.
- **A view model's animations start outright** (`fadein 0 fadeout 0`), as GoldSrc's did. Source fades a new
  animation in over 0.2 s, which swallows a gun's short kick. A model whose name begins `v_` is taken for a
  view model; `--kind` tells it otherwise (`kind` in portToSource). A view model also:
  - collides as nothing: it is drawn before the eyes and never touches the world;
  - has its animations with no activity given Source's by their names (`VIEW_ACTIVITIES`), as a GMod weapon's
    script plays them (`self:SendWeaponAnim(ACT_VM_PRIMARYATTACK)`): idle `ACT_VM_IDLE`, draw or deploy
    `ACT_VM_DRAW`, holster `ACT_VM_HOLSTER`, reload `ACT_VM_RELOAD`, shoot or fire `ACT_VM_PRIMARYATTACK`,
    shoot_empty `ACT_VM_DRYFIRE`, grenade or shoot_big `ACT_VM_SECONDARYATTACK`, attack1miss
    `ACT_VM_MISSCENTER`, throw, pinpull, fidget. The 9mmAR's three shoots share `ACT_VM_PRIMARYATTACK`, so
    Source picks one, as Half-Life's code did. A name that fits none (`add_silencer`, the gauss's `spin`) gets
    none; the port says which it named;
  - has its first attachment, when it has no name, named `muzzle`, which GMod's muzzle flash looks for, and
    turned along the gun's forward in its first animation: a Source attachment points along its x, a GoldSrc
    one has no turn.
- **A player, and a weapon held in a player's hand** (`--kind player`, `--kind held`; a model under
  `models/player/` is a player, one whose name begins `p_` held), made a biped GMod knows (`valveBiped`,
  `src/source/biped.mjs`):
  - its bones under Valve's names, by Half-Life's biped names: `Bip01 R Arm2` is
    `ValveBiped.Bip01_R_Forearm`, `Bip01 L Leg1` `ValveBiped.Bip01_L_Calf`, `Bip01 Spine3`
    `ValveBiped.Bip01_Spine4`. GMod finds a held weapon by `ValveBiped.Bip01_R_Hand`, and Source merges a
    held model onto its holder bone by bone name, as GoldSrc's renderer drew a `p_` model. A bone of no biped's
    (`Dummy08`) keeps its name;
  - its hands turned as Valve's are. Every Half-Life player's hand is turned half round its arm from GMod's
    male_07's: its thumb stands at 86 degrees about the hand's x where male_07's stands at -105. The turn is
    measured by the thumb, to the nearest quarter, and a hand with no thumb (a `p_` model's) is turned
    Half-Life's 180, said (`--hand-roll` says otherwise). Nothing moves: the hand's own axes turn, what hangs
    from it is turned back, and every bone stays where it was in every frame (Gordon's 1,751, within 3e-14);
  - a player also gets GMod's `anim_attachment_RH` and `anim_attachment_LH`, on bones of those names under the
    hands, where GMod puts a held thing and the flashlight, and stands on its feet. GoldSrc's player stands about
    the middle of its hull, 36 above its feet; Source's on its feet. Its animations are lifted 36, and it is lit
    from its middle (`$illumposition 0 0 36`; male_07's is 35): lit from its origin under the floor it would draw
    black. Its reference is not lifted, so its triangles are held where the original has them;
  - with `--upper`, each of a player's animations is copied as `<name>_upper`, moving the body from
    `ValveBiped.Bip01_Spine` up (`$weightlist "upper"`), with no activity, events or travel: a layer a gamemode
    lays over a walk. The copies come after the animations, which game code plays by number;
  - a held model collides as nothing.

  This is stevenlafl's finding, in their port of The Specialists to GMod, where a ported player plays its own
  animations, its gamemode's. **GMod's own player animations** (`m_anm.mdl`, what a sandbox player model plays)
  are not made to work on a port: they turn each bone about Valve's own axes, which a GoldSrc skeleton does not
  have. That takes the skeleton rebuilt as Valve's (PLAN.md).
- **The sounds its events play** (1004 a step, 1008 a voice, 5004 a gun's clip, by the same numbers): moved
  to `sound/smak/<their path>` and copied there from the mod's `sound/` folder, or from `valve/`'s, which
  every mod plays. Under the port's folder they stay clear of GMod's own sounds of the same names (Half-Life 2
  has `weapons/` and `common/`). One the game does not have is said; Half-Life's own models name 19 such
  voices. Source plays 8 or 16-bit PCM at 11025, 22050 or 44100 Hz only, and a file at another rate silently
  (stevenlafl's finding: The Specialists' 48000 Hz `block.wav` was never heard): such a file is rewritten as
  16-bit PCM at 44100, one channel, its loop point kept (`sourceWav`), and said; Half-Life's own are all 8-bit
  at 22050 or 11025 and are copied as they are. A sentence (`!HG_ALERT`) is kept as it was: GMod has no Half-Life sentences. 1004 and 1008 play
  only on an NPC whose code answers them.

  **A view model's** (5004, its clip coming out and going in) GMod never plays from the model: v_9mmar's
  reload was silent in GMod with the events compiled in and the files in place, and stevenlafl found the same
  in The Specialists' port. So they are left out of the model and written as Lua beside it,
  `addon/lua/autorun/client/smak_sounds_<folder>_<name>.lua` (`viewSoundsLua`), as their weapon base plays
  them: each as the view model's animation passes its frame, a loop's again each time round, an animation begun
  again (a second reload) from its start, heard by the holder alone, as GoldSrc's client played it. Any weapon
  that shows the model gets them, with no code of its own. The sounds a weapon's code played in GoldSrc (the
  shot, a shotgun's pump) were never in the model, and are the weapon script's to play.

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

- **Chrome (flag 2).** GoldSrc never draws a chrome texture by the file's s and t: it works out where each
  corner is in the picture by how its surface faces the eye, again each frame (R_StudioChrome), so the picture
  slides over the surface as it turns. Source has no such shader. It is worked out once, in the first animation's
  first frame: for a view model from the view's eye, where a view model's always is, so its gloves and barrel
  look as in GoldSrc while it idles; for anything else from in front of it. What moves far from that frame keeps
  the picture as it was there. No room's reflection is laid over it: GoldSrc had none (an `$envmap` of the room
  drew a view model's gloves as mirrors).
- **Bone controllers** (a head that follows its target). Source turns such bones by pose parameters.
- **Blends GoldSrc's renderer does not blend**: of three, or of more than four, the first two are ported. A
  blend whose first and last stand for one value is ported as its first, since no pose parameter ranges over
  nothing. None of Half-Life's models has either.
- **An activity past 76.** It is the mod's own, and only its game code knows it.
- **What plays its animations.** In GMod a ported figure is a model: spawned as a ragdoll it falls as a body,
  and as an effect (`gm_spawneffect`) it stands in its first pose. Its animations play only when an entity
  plays them, or an NPC asks for them by activity. Half-Life's monsters' AI is not in GMod.

## How a port is checked

Every check a port passes was measured on Half-Life's 301 models, all 210 that are models (2026-10-25). Each
compiled with no error and held:
- every bone, animation, material, bodygroup and its submodels, skin family, attachment and hit box;
- **each loop's travel**, taken out by Source's compiler in one straight piece, as far as GoldSrc took it out
  (the grunt's walk1 112.19 units, its run 172.27);
- each animation's blends, on their pose parameters; a view model's animations, with no fade;
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

## A GoldSrc map in GMod

```
node bin/smak.mjs gmod-map <map.bsp> -o <work folder> [--game <mod folder>]
```

The compiled GoldSrc map (BSP 30) is rewritten as a Source map (BSP 20), lump by lump. There is no decompile and
no Valve compiler: the geometry, the baked light and the visibility are the ones the GoldSrc compilers made.
The converter is a port of stevenlafl's, made for their port of The Specialists to GMod. Each rule below was
found in the game, by them, and is kept with its reason in `src/source/map.mjs`:
- **Faces.** A face on the back of its node's plane names the plane turned round, or Source takes a brush
  entity's faces for back faces and never draws them. Each corner gets its face's normal.
- **Leaves.** Each leaf has its own run of faces, in leaf order; two leaves sharing one crash the client on
  load. The clusters are the open leaves, numbered with no gaps, or the client warns of a vis overrun without
  end.
- **Light.** Re-curved to Source's shader, `2 (sample/255)^2.2`. Brush entities in render modes 1, 2, 3 and 5
  get an unlit copy of their material, as GoldSrc draws them without a lightmap. Lights become WORLDLIGHTS, for
  models, and each open leaf gets one ambient sample.
- **Collision.** GoldSrc keeps no brushes, so they are rebuilt: one for each solid or liquid leaf of the drawn
  tree, with bevels. Clip brushes come from the player's hulls (standing and ducked), shrunk back by the
  player's box and carved into the tree as player and NPC clip. A brush entity's `skin` under 0 sets its
  contents.
- **Physics.** The PHYSCOLLIDE lump is made by GMod's own `bin/win64/vphysics.dll`, through a small C++ helper
  (`src/source/vcollide.cpp`). It is built once with Visual Studio's C++ tools into `~/.smak/`. Name them with
  `SMAK_VPHYSICS` and `SMAK_VCOLLIDE` where they are not found. Without them the map is written without
  physics, and said: Lua's traces then miss and props fall through. Outside the game, GMod's 64-bit DLL hangs
  on vbsp's drag areas and crashes on its outer hull of several pieces, so both are left out. A brush entity
  collides as its pieces, as exactly. Each piece is tagged, as vbsp tags it, with the index of its surfaceprop in
  GMod's own table. Tagged with its own number, as in stevenlafl's helper, the world's pieces were antlion (87)
  and the rest, and a map of more than 126 pieces killed vphysics (23 of Half-Life's 115 maps).
- **What a surface is made of.** Each texture's type is read from the game's `sound/materials.txt` as the
  engine reads it, and becomes its material's `$surfaceprop`: concrete (GoldSrc's default), metal, dirt,
  metalvent, metalgrate, tile, wood, computer, glass. A brush's physics takes the one most of its sides wear.
- **Entities:**
  - a player start comes down 36 units, to its feet;
  - a missing `renderamt` is 0, as in GoldSrc;
  - `rendercolor` tints only where GoldSrc tints;
  - movers' `angles` become `movedir` (`pushdir`);
  - `func_ladder` becomes a ladder `func_brush` that draws nothing;
  - sprites become `env_sprite` on a Sprite material, every frame kept;
  - a `cycler_sprite`'s model is ported by `gmod-port` as a `prop_dynamic`.
- **Textures.** VTF and VMT by the texture's kind: masked, with its holes' colour bled and a fence's thin bars
  kept at a distance; liquids unlit and drifting; the sky's six sides clamped. A wad's textures are shared files
  of the addon (`materials/<folder>/<wad>/`). The map's own, and every file from Valve's `valve` folder (its
  wads, skies and sprites), go inside the map's PAKFILE, never as loose files of Valve's in the addon.
  Every VTF carries a thumbnail, as vtex writes one. The engine samples it for the colour of the chips and dust a
  bullet throws up. Without one, the shotgun's impacts on stalkyard's concrete came out yellow, like antlion
  blood, though the bullet's own trace said concrete on the server and on the client.

Seen in GMod (2026-10-25), Half-Life's stalkyard: it loads with nothing in the console, drawn, lit and skied as
GoldSrc draws it. The player stands on its floor, a trace hits the world, and a dropped crate lands. Half-Life's
own pickups (`ammo_357`, `item_longjump`) are GMod's Half-Life: Source entities, which want that game's models:
without it mounted they show as ERROR.

Not done, as in stevenlafl's: outputs (GoldSrc's targets as Source's I/O), water surfaces, animated textures,
decals.

## Not yet

These are `PLAN.md`'s phases 6c to 6e:
- the model seen in GMod by the kit itself;
- new models made for Source: weapons, normal maps, more than one bone a vertex;
- controllers as pose parameters.
