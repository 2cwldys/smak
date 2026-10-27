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
| `models/smak/<name>.vanmgrph` | its animation graph, when an animation blends (compiled beside it too) |
| `models/smak/<name>/<submodel>.dmx`, `anims/*.dmx` | its meshes and animations |
| `materials/models/smak/<name>/<texture>.png`, `.vmat` | its textures and materials; `<texture>_mask.png`, a masked one's holes |
| `sounds/smak/<its path>.wav`, `.sound` | the sounds its events play (`.wav.meta` a loop's); the `.wav` compiled beside it (`.vsnd_c`), the `.sound` by the editor |

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
- **Events that play a sound** (1004 a step, 1008 a voice, 5004 a view model's clip) as s&box's that play one,
  `AE_CL_PLAYSOUND` naming a `.sound` (5004's `AE_CL_PLAYSOUND_ATTACHMENT`, at the model's first attachment, where
  GoldSrc's client played it): `SkinnedModelRenderer` plays it, with no code of the game's. See "Its sounds" below.
- **Every other event**, and one whose sound is not found, as s&box's generic event, `AE_GENERIC_EVENT`, at its
  frame: the event's number as `Int`, its options (a sound's file, moved under the port's folder; a sentence; a
  script's words) as `StringData`, and `TypeName` `goldsrc`. A game's code hears them through
  `SkinnedModelRenderer.OnGenericEvent`.
- **Hit boxes** as one `HitboxSet`, each box on its bone, its GoldSrc hit group as the tag `hitgroup_<n>`.
- **Attachments** on their bones; a view model's first, unnamed, `muzzle`.
- **Textures** as `complex.shader`'s materials: the picture as the colour, no shine (GoldSrc lit a model by its
  normals alone), and the texture's flags as its features. Masked (64) is alpha-tested on a mask of its holes,
  additive (32) is added to what is behind it, and fullbright (4) lights itself.

## Blends, in an animation graph

GoldSrc's game code chose an animation by its number (`pev->sequence`) and said how far along its blends it was
(`SetBlending`, Half-Life's aiming up and down: a value between the blends' start and end). s&box blends only in an
animation graph, so a model one of whose animations blends gets one (`<name>.vanmgrph`, named by the `.vmdl`) that
does what GoldSrc's game code did:

```
var r = go.Components.Create<SkinnedModelRenderer>();
r.Model = Model.Load( "models/smak/barney.vmdl" );
r.Set( "sequence", "shootgun" );   // the animation, by its name
r.Set( "blend_xr", 20f );          // where along its blends: barney's gun from -50 (down) to 50 (up)
```

- **`sequence`**, an enum: an option each animation, in the model's order. A selector on it plays one; a new one
  starts at its first frame (as GoldSrc's `ResetSequenceInfo`) and fades in over 0.2 seconds (a view model's at
  once, as its fades).
- **An axis a float**, named as the GMod port's pose parameter (`blend_xr` a pitch, `blend_x`, `blend` where GoldSrc
  names no motion), ranging over every animation that blends on it, starting at 0 (level) or the nearest end. An
  animation that blends on one axis is a blend node over its two at the values they stand for; one past its range
  is held at its end, as `SetBlending` holds it. One on two axes is a 2D blend of its four.
- **Each blend an animation of its own** too (`shootgun_blend1`), after all the model's own, so that those keep
  GoldSrc's numbers. With `UseAnimGraph` off, `Sequence.Name` plays any of them, as before.

Measured in the editor: s&box's blend is GoldSrc's. Barney's `shootgun` played by the graph at -50, -25, 0, 25 and
50 is within 0.008 units of where GoldSrc's renderer puts every bone (`StudioSlerpBones`: each bone's turn slerped,
its place mixed). A graph at a playback rate of 0 is not played at all; and told its parameters after it starts, it
fades from the first animation, so the check tells a new renderer before it starts.

The seven of Half-Life's models that blend get a graph: agrunt, barney, hassassin, hgrunt, icky, player (52
animations that aim) and tentacle2 (its taps by height, `blend_x` 86 to 376).

## Its sounds

The sounds a model's events play are looked for where GoldSrc looked: the `sound/` folder of the mod the model is
in, then valve's (`sounds` in the API, as `gmod-port`). Each found is written under `sounds/<folder>/`, at the path
the event named:
- **the `.wav`, as it is.** s&box's compiler takes GoldSrc's files (8-bit at 11025, 22050 and 44100 Hz, 16-bit
  stereo) and compiles them as Opus at 48000 Hz, of the same length, or a small one as 16-bit PCM at its own rate;
- **its loop, in a `.meta` beside it** (`{ loop, start }`, the cue's time). GoldSrc loops a file from its cue point
  to its end; s&box's compiler does not read the cue chunk (measured: `weapons/rocket1.wav` compiled with no loop),
  it reads the `.meta`;
- **a `.sound` that plays it as GoldSrc's mixer did.** GoldSrc's gain falls in a straight line from 1 where the
  sound is to 0 at 1000 units over its attenuation (Xash3D's `S_SpatializeChannel`, as Quake's); a monster's events
  play at `ATTN_IDLE` (500 units), a view model's at `ATTN_NORM` (1250). The `.sound`'s `Distance` is that, its
  `Falloff` a line from 1 to 0 (s&box's mixer gains a sound by its falloff at its distance over its `Distance`),
  with no occlusion, reverb or air absorption, which GoldSrc's mixer had not.

`resourcecompiler` compiles the `.wav` (`compileSounds`, one run for all of a model's); a `.sound` only the editor
compiles, which it does on opening the project, and `sbox-check` asks it to. A sound the game has not
(Half-Life's `holo.mdl` names 18 that Steam's Half-Life leaves out) is said, and its event kept generic.

## What it collides as

As the GMod port does, made by the same code (`--collision auto`, the default): a model of one bone collides as
its convex hull, a figure with hit boxes as a ragdoll, a view model and a held one as nothing, and a model of many
bones with no hit boxes as nothing (`--collision hull` or `box` makes one; `ragdoll`, `none`). Gibs are no ragdoll
either: a body part whose choices are each on bones of their own, the model as first drawn on one bone with hit
boxes at most (hgibs.mdl, woodgibs.mdl, mil_crate.mdl), is shown one choice at a time, its pieces never one body;
said, and nothing made unless told. `--surfaceprop` and `--mass` as gmod-port's. `src/sbox/physics.mjs` writes it
as ModelDoc's physics nodes:

- **A hull a piece, on its bone**: a `PhysicsHullFile` of its own DMX (`models/<folder>/<name>/physics/`), on its
  bone. s&box reads the file in the model's space at rest and puts the hull in the bone's frame, a body each bone.
  A skinned file on no bone is one body on no bone whatever its vertices are on, so a ragdoll is a file a piece.
- **A joint a piece** but the first. A bone its animations turn about one axis only (a knee, an elbow) has a
  revolute joint (a hinge) about it, from its least to its most; one they turn about more a conical joint, twisting
  about the bone (its x, along it to its child) and swinging as far as the widest of its other two. The anchor is
  the child's place at rest, turned so its z is that axis: s&box turns a joint about its frame's z (citizen's elbows,
  its cones along its limbs). Tried on barney's poses inside his limits, cones about the frames' z held 93 of 95,
  about their x 68. A cone is round, where Source's limits are a box an axis: a pose near two limits at once is
  outside it (barney's upper arm in shootgun, 87 degrees of swing against 86). A cone holds 90 degrees of swing at
  most: at 100 or more s&box's flips the piece over; a wider one is held to 90, said.
- **A hull of 44 corners at most**, made exactly (`optimization_algorithm "Exact"`). s&box drops a hull of more than
  255 half-edges ("Hull Too Complex for Runtime"), and the compiler's own simplifying (QEM) left hulls 0.5 to 14
  units off theirs (nihilanth's head), so the port simplifies each itself, said when one is cut in more than 0.5.
- **Weight**: a ragdoll a person's 90 kg unless told, shared among its pieces by their volume (`mass_override` a
  body), as Source's compiler shares it; a prop what s&box's surface makes of its volume (its density) unless told.
  Then evened out, said: no piece weighs less than 1% of the whole, nor a tenth of one joined to it. s&box's joints
  give between pieces of weights far apart (loader thrown thousands of units, with 31 to 1366 times across a joint),
  and the rest dropped on a light piece presses it through the floor (archer's fin, 0.2% of it, 1.1 units through;
  big_mom's Bone26, 0.08%, its joint 3.4 apart).
- **Its inertia and damping** as the GMod port's QC has them (`$inertia 10`, `$damping 0.01`, `$rotdamping 1.5`):
  `inertia_scale`, `linear_damping`, `angular_damping`.
- **Surface**: GMod's surfaceprop as the s&box surface it starts with or is kin to (`metal_box` metal, `alienflesh`
  flesh, `porcelain` ceramic); none like it is `default`, said. s&box has 13: cardboard, ceramic, default, dirt,
  fabric, flesh, glass, grass, metal, plastic, rubber, water, wood.
- **Pieces that meet at rest are trimmed apart.** Source's physics let a ragdoll's pieces start inside each other;
  s&box's pushes them apart: barney's arms out of his chest, his hands 13 units off, 10 to 44 units a piece as a
  game's ragdoll (`ModelPhysics`). A joint keeps its two pieces from colliding, so two that are not joined and meet
  (within 0.1) are cut along the plane across which they reach into each other least, each kept on its side, 0.1
  apart; said, with how far they reached (barney's chest and arms 1 to 5 units; loader's cockpit and neck 26, its
  meshes through each other). A `PhysicsJointNull` would keep them from colliding as they are, but s&box's own code
  cannot read a model that has one ("Unhandled joint type: NULL_JOINT").
- **A flat hull** (a model whose triangles lie in one plane) is made 0.5 thick, as the GMod port's pieces are.

Measured in a running game (the editor's play mode): barney as a game makes a ragdoll (`ModelPhysics`) dropped onto a
floor falls whole, its 19 pieces together, crumples, and is still in 3 seconds, nothing through the floor.

All 210 of Half-Life's models pass `sbox-check` with their physics (2026-10-26): 60 ragdolls, 55 hulls, the rest
nothing (view models, `p_` models, gibs, many bones and no hit boxes). Dropped, every ragdoll comes to rest, none
0.4 units through the floor; most within 4 seconds, the biggest slower (tentacle2 7.7, rengine 11.2, nihilanth
13.3). The runs before found the cone that flipped, the hulls s&box dropped,
the pieces too light for their joints and the floor, and gibs made one ragdoll.

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

- **A sound that follows the model.** s&box plays an event's sound where the model (or its attachment) was when
  the event fired, and leaves it there; GoldSrc's followed the entity. A step is over before it shows.
- **Sentences** (`!HG_ALERT`), which an event may name in GoldSrc: kept in the generic event's options.
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
  walk whose travel was not taken out all show here as bones off their place. Each blend after an animation's first
  is held so too, as the animation of its own it is;
- **its graph's blends**, when it has one: the graph there, with `sequence` and each axis's parameter, and each
  animation that blends played by it at its first frame at its blends' start, middle and end (one on two axes at its
  four corners), every bone where GoldSrc's renderer puts it, within the same tolerance;
- **what it collides as**: a body on each piece's bone, its hull's corners within 0.5 units of the port's, its mass
  and surface, and each joint between its pieces, of its kind and limits, at the
  child's place, about its axis. Then tried in physics worlds of its own (made and deleted; nothing in the scene):
  held at rest with its pieces colliding (none may move 0.1: none pushes another); held in each pose the check
  samples that is 5 degrees inside every joint's limits and moves no bone 0.5 off the piece above, its collisions
  off (none may move 1: the joints hold what the animation does; GoldSrc's animations move bones as well as turn
  them, barney's head 2 units off his neck in smlflinch, which no joint holds); dropped from 20 units onto a floor
  with s&box's gravity until it is still (no piece moved 1 unit in the last second), 15 seconds at most: it comes
  to rest, nothing through the floor, its joints together, within 1 unit or 1% of its size, whichever is more;
- **its sounds**, when its events play any: each `.sound` as the editor compiled it, playing its file, as long as the
  original (within 0.005 s), heard to GoldSrc's distance in a line, with no occlusion or reverb, and as loud as the
  original 10 ms by 10 ms (correlated 0.99 or more; Half-Life's are 0.998 or more). Then each played far below the
  scene, where no one hears it: one that loops still playing after its length, one that does not stopped. And each
  animation with sound events played through by a renderer of its own: the sounds it is heard to fire
  (`OnSoundEvent`) must be its events', as many of each. A loop is played looping, each of its sounds heard and no
  other: s&box fires an event at the last frame of an animation held at its end not at all, and a looping one's each
  time round, as GoldSrc did.

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

With their graphs (2026-10-26), the seven that blend pass too: 207 blends played by their graphs, every bone
within 0.023 units of GoldSrc's but tentacle2's tentacle (0.19 at its end, as its animations). 210 of 210 compile.

With their sounds (2026-10-26): the 13 of Half-Life's models whose events play sounds pass, 69 sounds and 185 sound
events (agrunt, barney, bullsquid, garg, gman, hgrunt, islave, loader, scientist, v_357, v_9mmar, v_9mmhandgun,
zombie); every sound as loud as its original 10 ms by 10 ms correlated 0.993 or more (all but v_357 0.998 or more), every event
heard. holo.mdl's sounds are not in Steam's Half-Life, and its events stay generic.

## Not yet

- Maps (and with them, the sounds a map plays: `ambient_generic`, sentences, a texture's steps).
