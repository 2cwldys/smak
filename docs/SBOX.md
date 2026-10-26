# s&box (Source 2): a GoldSrc model in s&box

A GoldSrc model (`.mdl`, version 10) is ported to s&box in one command:

```
node bin/smak.mjs sbox-port <model.mdl> -o <project>/Assets
```

The kit reads the model itself and writes what s&box's model compiler reads: a DMX for each submodel and each
animation, a `.vmdl` (ModelDoc's document) that says how they go together, and a PNG and a `.vmat` for each
texture. s&box's own `resourcecompiler` compiles them. The command ends in `PASS` with what it made, or stops
with what the compiler said.

## What it needs

- **s&box, on Windows.** Its compiler is `sbox/bin/win64/resourcecompiler.exe`, an outside program that comes
  with s&box. It is found in Steam's libraries, or by `FACEPUNCH_ENGINE` (which s&box's launcher sets). Otherwise
  name its folder with `--sbox <folder>` or `SMAK_SBOX`.
- **The model's own files**: `<name>t.mdl` and `<name>01.mdl` ... beside it, as for GMod.
- **An s&box project's `Assets` folder** for `-o`, or any folder laid out as one. The editor picks the files up
  as they are; `sbox-cli --new "Title" --template addon.minimal` makes a project.
- `--no-compile` writes the files with no compiler.

The compiler runs without its renderer, so nothing is written into s&box's folder. It writes each file's compiled
form beside it (`.vmdl_c`, `.vmat_c`, the textures' `.vtex_c`).

## What it makes

Under `-o <Assets>`:

| | |
| --- | --- |
| `models/smak/<name>.vmdl` | the model's document; `<name>.vmdl_c` beside it, compiled |
| `models/smak/<name>/<submodel>.dmx`, `anims/*.dmx` | its meshes and animations |
| `materials/models/smak/<name>/<texture>.png`, `.vmat` | its textures and materials; `<texture>_mask.png`, a masked one's holes |

In the editor or a game's code, the model is `models/smak/<name>.vmdl`. `--folder` puts it under another folder
than `smak`.

## Why DMX, not SMD

s&box reads no SMD. Its resourcecompiler refuses an SMD as an animation ("unrecognized file type"), fails one
as a mesh with no reason given, and none of its libraries names the format; `dmxconvert` knows no SMD either.
Source 2's own format is DMX, and s&box ships some (`addons/citizen/.../citizen_head.dmx`). A port's DMX is that
file's kind: keyvalues2 text, format `model 22`.

## What is kept, and how

The port is Source's port (`docs/SOURCE.md`) written for s&box: `portToSource` works the model out once and hands
its parts as data, and `src/sbox/` writes them as s&box reads them. So everything that page says is kept is
kept here too (the bones, every frame, the bodygroups in their order, the skins, attachments and hit boxes, an
animation's fps, looping and activity, a loop's travel, chrome worked out once), and:

- **Bodygroups** as ModelDoc's `BodyGroup`s, a submodel each `BodyGroupChoice`, a blank one with no meshes. Two
  of one name (`v_9mmhandgun.mdl`'s two `studio`) are `<name>`, `<name>_2`: s&box finds a bodygroup by its name.
  A name ending in a number after a letter gets an underscore before it (loader.mdl's `leg2` is `leg_2`): ModelDoc
  renumbers such a group (`leg1` to `leg4` came out `leg1`, `leg3`, `leg5`, `leg7`). A model of one submodel has
  none to choose.
- **Skins** as material groups: the first is the default, each after it a `MaterialGroup` `skin1`, `skin2`...
  that changes the materials it changes. A renderer picks one by its `MaterialGroup`.
- **A loop's travel** taken out by the compiler as root motion (`ExtractMotion` on the root bone, along the axes
  GoldSrc's was, LX LY LZ): the walk plays in place and the game moves the model by it, as GoldSrc's did.
- **Events** as s&box's generic event, `AE_GENERIC_EVENT`, at their frame: the event's number as `Int`, its
  options (a sound's file, moved under the port's folder; a sentence; a script's words) as `StringData`, and
  `TypeName` `goldsrc`. A game's code hears them through `SkinnedModelRenderer.OnGenericEvent`.
- **Hit boxes** as one `HitboxSet`, each box on its bone, its GoldSrc hit group as the tag `hitgroup_<n>`.
- **Attachments** on their bones; a view model's first, unnamed, `muzzle`.
- **Textures** as `complex.shader`'s materials: the picture as the colour, no shine (GoldSrc lit a model by its
  normals alone), and the texture's flags as its features. Masked (64) is alpha-tested on a mask of its holes,
  additive (32) is added to what is behind it, and fullbright (4) lights itself.

## What changes, and why

Measured on Half-Life's barney in s&box's editor, its bones read back while it played (2026-10-26):

- **No turn.** GMod's QC turns the model back with `$origin`; s&box's compiler turns nothing. The DMX says
  its axes are z up, `forwardParity 1`, which s&box reads as its own. `-2`, the parity s&box's citizen uses,
  turns meshes and animations alike a quarter round. A model at rest may still face another way: barney's
  root bone rests turned -90 degrees and his animations turn it back. GoldSrc drew a model only through an
  animation, and so does a port, so judge its facing by one.
- **Bones named as s&box keeps them**: anything but a letter, a digit or an underscore as an underscore
  (`Bip01 Pelvis` is `Bip01_Pelvis`, stealth.mdl's `Stealth.` is `Stealth_`). s&box renames the mesh's bones so, and
  an animation's channel on `Bip01 Pelvis` then moves nothing, a hit box on `Stealth.` finds no bone. Two names
  that come out one are kept apart (`Bip01_L`, `Bip01_L_2`).
- **A `p_` model keeps its bones' names.** GMod's port gives a held weapon Valve's biped's names so GMod finds its
  hand; s&box looks for no such hand. `--kind held` still asks for them. A `v_` model is a view model, as for GMod:
  its animations start outright and its first attachment is its `muzzle`.
- **No bone dropped** (`bone_cull_type "None"`). The compiler drops a bone no vertex is on: barney's root `Bip01`,
  and with it the turn it rests in and a walk's travel.
- **A mesh's node named with no hyphen.** `barney-x_template` fails the compile as `Node ... resolve failure`,
  with nothing else said. Its file keeps its name. An animation's node is named so too, said in a warning.

## What is left behind, and said

- **Collision.** s&box's physics shapes are nodes of their own, not made by a port yet: a ported model collides
  as nothing.
- **An animation's blends after the first** (Half-Life's aiming up and down). s&box blends by its animation graph,
  which a port does not make yet.
- **The sounds events name are not copied.** s&box plays a `.sound` asset, not a file named in an event; the path
  is in the event for a game's code.
- **Bone controllers**, as for GMod.

## How a port is checked

The compile is the first check: it ends in an error, or in a `.vmdl_c` with nothing it could not resolve. A model
can still compile wrong, though (turned, its animations moving nothing), so the port is then held to its
original in s&box's own editor:

```
node bin/smak.mjs sbox-check <model.mdl> --project <project folder> [-o shot.png]
```

`sbox-check` makes the port again as `sbox-port` made it (give it the same `--name`, `--folder`, `--kind`), reads the
compiled model back in the editor and holds it to what the original says:

- every bone of the port, under its parent;
- every animation, of its length ((frames - 1) / fps);
- every bodygroup with its choices, a material group a skin, every attachment and hit box;
- **each animation's poses**: it is stopped at its first frame and its middle one (`--frames` more), and every
  bone's place in the model's space is read and set beside where GoldSrc's frame puts it (`poseAt`), within
  `--tolerance` units (0.1) and 0.0005 of the bone's chain (its links to the root, end to end): s&box compresses
  rotations, which moves the end of a long chain farther (a turn of 0.03 degrees; a model turned one degree is 35
  times that). A turned model, a misnamed bone (its channel then moves nothing), a dropped bone, a
  walk whose travel was not taken out all show here as bones off their place.

It talks to the editor through `sbox-cli` (which comes with s&box: `sbox/bin/managed/sbox-cli.exe`), over a local
pipe, never the network. It uses the editor open on the project, or opens one and closes it after (a minute). Its
probe object is made in the scene being edited, far below it, and removed before the check ends; nothing is saved.
`-o`: the editor's picture of the model in its first animation. Ends in `PASS` or `FAIL`.

Measured so: barney, houndeye, scientist and hgrunt (918 poses) are within 0.025 units of GoldSrc's places at every
bone, walks and runs included (their travel taken out by s&box gives GoldSrc's pose exactly). s&box wraps a looping
animation's very end to its start; the check plays it not looping, so its last frame is held. Before the check,
a port of Half-Life's barney, houndeye, can, w_crowbar, v_9mmhandgun, hgrunt, scientist and Counter-Strike's
bigtree was looked at in the editor: a view model's muzzle 20 units ahead of the eye, bigtree's leaves cut out.

All 210 of Half-Life's models port and compile with nothing the compiler could not resolve, in 3.5 minutes
together (2026-10-26). The 211th, doctor.mdl, is a version 9 file, which the kit does not read. All 210 pass
`sbox-check` in one editor, in 8 minutes. Most bones are within 0.03 units; the farthest is 0.19, the end of
tentacle2's tentacle 650 units along its chain (nihilanth's arm, the osprey's prop and the loader's legs 0.10 to
0.16). The run found loader's renumbered bodygroups, and one call (of thousands) that found no running editor, which
a call now tries once more.

## Not yet

- Collision: a hull for a prop, a ragdoll for a figure.
- Blends as an animation graph; sounds as `.sound` assets.
- Maps.
