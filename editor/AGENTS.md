# The model editor: guide for the agent

A person edits a model's animations, events and textures in a page (`editor/README.md`, started with `node bin/smak.mjs edit <folder>`). Everything they do is
kept in one JSON **project file** beside the saved model. You work on that same file with `node editor/cli.mjs`,
so that the two of you take turns on one model: they pose something by eye, you clean it up or do the forty
dull edits, they look again. Read the kit's `AGENTS.md` first; this adds only what the project file brings. Commands here are run in the kit's folder. The examples are on a sword held in the hands; a player or a monster is worked the same way.

The project is not a model. It is a list of changes to an **original** `.mdl`, baked onto it from scratch each
time (`bake`). Never edit the baked `.out.mdl` with smak directly: the next bake would lose it. If a change is
needed that the project cannot say (a new mesh, a new bone), tell the person; that is not this tier.

## The loop

```
node editor/cli.mjs new <models>/v_1hswords.mdl smak-projects/v_1hswords.smakproj.json --engine goldsrc
                                                           (only when there is no project yet; the page makes the same file
                                                            at the same place on a person's first edit)
P=smak-projects/v_1hswords.smakproj.json      (the page keeps its projects in its --work folder, under the model's name)
node editor/cli.mjs $P show                                 what the model has and what the project changes; who did what last
node smak/bin/smak.mjs info <the source model>              bones, and the BODY NUMBER of each weapon in the file
node editor/cli.mjs $P strip -o before.png --anim attack1 --body 1 --count 12      look (a view model from the eye, as the game; another from outside)
node editor/cli.mjs $P thin attack1 --tol 0.5               keys you can work with (see "Keys")
node editor/cli.mjs $P key attack1 "Bip01 R Forearm" 12 --rot 0,0,-15
node editor/cli.mjs $P strip -o after.png --anim attack1 --body 1 --from 4 --to 20 --count 6 --compare   source above, project below
node editor/cli.mjs $P bake                                 writes <name>.out.mdl beside the project, runs smak's check
```

An animation the game mixes from several (`node bin/smak.mjs info <model>` marks it "2 blends": a player's aim up and down)
is refused by `key`, `thin` and a change of length, with a message that says so: `dup` it and work on the copy, or
change only its speed, looping and events.

Look at every picture you make. `--body` matters: body 0 of a view model is often not the weapon you mean, and
part of a swing is off the screen in first person (use `--view orbit --yaw 250` to see the arm from outside).

The person's page takes your change up within a second and shows your `what` line. You do not need the server
running to use the command line.

## Commands

`<anim>` and `<texture>` are a number or a name; `<bone>` a name (quote it) or a number. Angles are in **degrees**
on the command line and in **radians** in the file.

| Command | Does |
| --- | --- |
| `show [--json]` | Animations (with the project's changes marked), changed textures, the last ten log lines. |
| `keys <anim> [bone]` | Which bones have keys of their own; or one bone's keys. |
| `pose <anim> <frame> [bone]` | The six values of every bone (or one) at a frame, as the project has them. |
| `key <anim> <bone> <frame> --rot dx,dy,dz` | A key: the bone turned from where it is, about **its own** axes (the same as dragging the page's red, green, blue rings). |
| `key ... --move dx,dy,dz` | Moved from where it is, in units, along its **parent's** axes. |
| `key ... --set x,y,z,rx,ry,rz` | The six values outright (what `pose` prints). |
| `key ... --spread n` | The same change carried, fading out (a raised cosine), onto the bone's other keys within `n` frames either side. Without it, only that frame's key is set. |
| `unkey <anim> <bone> <frame>` / `all` | One key removed (the bone is interpolated there) / every key: the bone plays the source's frames again. |
| `movekey <anim> <bone> <from> <to>` | A key taken to another frame: re-timing one moment. |
| `thin <anim> [--tol deg] [--pos units] [--bone name]...` | Fewest keys that give the present motion back within the tolerance. Prints how far the result is from what it was. |
| `set <anim> [--frames n] [--fps f] [--loops yes\|no] [--interp smooth\|linear]` | Length (the whole animation is stretched: keys and events keep their moment), rate, looping, curve or straight between keys. |
| `dup <anim> <name>` | The animation again as a new one after the last. Prints its number. |
| `events <anim> [--add frame,event,text] [--del i] [--move i,frame] [--text i,text] [--clear] [--source]` | Lists; changes. `--source`: as the original has them. |
| `texture <tex> [--file p.png] [--brightness n] [--contrast n] [--saturation n] [--hue deg] [--tint r,g,b,amount] [--no-adjust] [--no-file] [--export out.png]` | Replace from a picture (copied beside the project), adjust through the palette, export as the project has it. |
| `texture <tex> --select r,g,b` / `--select-at x,y` `[--tolerance n] [--invert]` | The adjustments apply only to the palette colours like that one (`--select-at`: the colour under that pixel of the picture before its adjustments). `--tolerance`: how like, 20 unless told, 0 for that colour alone. `--invert`: to every colour **but** those; `--no-invert` back. Prints how many of the picture's colours and what share of its pixels are taken. See "Some colours only". |
| `texture <tex> --all-colours` | The whole picture again (the adjustments stay). `--no-adjust` drops the adjustments and the selection. |
| `texture <tex> --mask out.png` | The texture with what the selection leaves alone dimmed: look at it before you bake. |
| `texture <tex> --export out.png --plain` | The picture without its adjustments (replaced or not): the one to paint on and put back with `--file` while the adjustments stand. Without `--plain` the export is adjusted, and put back it would be adjusted twice. |
| `diff <anim>` | The furthest any bone is from the source's animation. |
| `bake [-o out.mdl] [--engine xash\|goldsrc]` | Bake, write, check. Exit code 1 on an error from the check. Refuses to write over the source. |
| `render -o p.png --anim a --frame f [--view first\|orbit] [--body n] [--yaw d] [--pitch d] [--source] [--both]` | One frame, drawn by smak from the baked project. `--both`: both sides of every triangle, so a face that is inside out shows as a face and not as a hole (compare the two pictures to find one). |
| `strip -o p.png --anim a [--count n] [--from f] [--to f] [--body n] [--view ...] [--compare]` | Frames side by side; `--compare` puts the source's above. |

## Some colours only

A texture's adjustments change its whole palette unless the project names a colour for them
(`adjust.select`). Then only the palette colours like that one change: a steel helmet goes to copper and the
brass of its face frame stays.

```
node editor/cli.mjs $P texture helmet.bmp --select-at 40,22 --hue 25 --saturation 40      the colour under a pixel of the steel
node editor/cli.mjs $P texture helmet.bmp --mask build/mask.png                           look: what is dimmed is left alone
node editor/cli.mjs $P texture helmet.bmp --tolerance 28                                  wider, or narrower
node editor/cli.mjs $P texture helmet.bmp --select 201,160,70 --invert                    or name the brass and change all but it
```

- The colour is read from the picture **before** its adjustments (the replaced picture if there is one), and so
  is what counts as like it: changing the sliders never changes which colours are chosen.
- How like two colours are is `colourGap` in `editor/core.mjs`: their hue and its strength count in full, their
  brightness by half. A metal's light and dark shades are within about 20 of one another; another metal of the
  same brightness is past 35. Very dark colours of any hue are near one another: look at the mask.
- `uv` islands play no part: it is the colour that is chosen, wherever it lies in the picture. Two parts in the
  same colours cannot be told apart this way; that needs `paint` in the kit (`AGENTS.md`).
- One selection a texture. For a second group of colours: `--export` the adjusted picture, put it back with
  `--file`, `--no-adjust`, and select again.

In the page the person clicks a pixel of the texture's picture (*Textures* tab) and has the same three things:
*how like*, *every colour but those*, *All colours*.

## What the person can see in the page

Worth knowing when they describe something to you, or you ask them to look:

- *both sides* (key F): both sides of every triangle. A face of yours that is inside out is a hole without
  it and a face with it.
- *second body* (key V): another body of the same model beside the first, from the same camera at the same
  frame: your new armour beside the game's own.
- *smak's picture*: beside their view, the picture you would get of the same frame from their camera.
- A double click on the model in Orbit: the camera turns about that point.
- The page's address opens it in a state: `?model=p_helmets.mdl&body=22&body2=2&second=1&both=1&cam=orbit&anim=0&frame=0&tab=textures&tex=3`
  (`body2`: the second view's body; `second`, `both`, `compare`, `bones`, `onion`: 1 or 0).

## Keys

The file's animations hold every bone at every frame. In the project:

- A bone with **no entry** under an animation's `keys` plays the source's frames exactly (resampled in time if the
  project changed the length). That is the state of everything the project does not mention.
- A bone **with** an entry is defined only by its keys: `{ "<frame>": [x, y, z, rx, ry, rz] }`. Between keys it is
  interpolated: position along a curve, rotation by quaternion the short way round, through the keys
  (`interp: "smooth"`, a Catmull-Rom spline by the keys' own spacing) or straight from key to key (`"linear"`).
  Before its first key and after its last it holds. At a key, the baked frame is the key's numbers to the digit.
- Setting a key on a bone that has no entry first gives it a key on **every** frame (from the source), then
  changes yours. So on an un-thinned animation, `key` without `--spread` changes one frame: a flicker. Either
  `thin` first, or pass `--spread`.
- `thin` leaves every bone with at least its first and last frame. A typical swing: 2800 keys to about 160 at
  0.5 degrees, with no point of the model more than 0.4 units from where it was. Tolerance 0 gives the source
  back exactly (measured: no difference in any bone matrix) and drops only keys of bones that do not move.
- The six numbers are smak's: position from the parent, then rotation about x, y, z in radians, applied x then y
  then z. A bone's numbers are relative to its parent.

## The project file

`<name>.smakproj.json`. Paths in it are relative to the file itself, with forward slashes.

```json
{
 "format": "smakproj 1",
 "rev": 13,
 "source": { "path": "../models/v_1hswords.mdl", "sha1": "...", "bytes": 6405408 },
 "output": "v_1hswords.out.mdl",
 "engine": "xash",
 "anims": {
  "2": {
   "name": "attack1",
   "fps": 30, "loops": false, "frames": 56, "interp": "smooth",
   "keys": { "Bip01 R Forearm": { "0": [14.2434, 0, 0, 0, 0, -0.7791], "12": [14.2434, 0, 0, 0, 0, -0.6807] } },
   "events": [ { "frame": 14, "event": 5004, "type": 0, "options": "weapons/swingsmall.wav" } ]
  },
  "25": { "name": "attack1_slow", "copyOf": 2, "frames": 84, "fps": 30, "loops": false, "interp": "smooth", "keys": {}, "events": [] }
 },
 "textures": {
  "55": { "name": "sword_lab.bmp", "file": "v_1hswords.tex/55_painted.png", "adjust": { "hue": 150, "brightness": 10 } },
  "3": { "name": "helmet.bmp", "adjust": { "hue": 25, "saturation": 40, "select": { "colour": [142, 146, 150], "tolerance": 20 } } }
 },
 "log": [ { "rev": 13, "by": "agent", "at": "2026-10-11T10:00:00.000Z", "what": "key: attack1 / Bip01 R Hand / frame 22" } ]
}
```

| Field | Meaning |
| --- | --- |
| `format` | `"smakproj 1"`. Anything else is refused. |
| `rev` | Goes up by one with every change. The page reloads when it differs from what it holds. |
| `source.path` | The original model. Read, never written. `sha1` and `bytes` are of the file when the project was begun; if they no longer match, `show` and `bake` say so and go on (keys are laid on by bone name). |
| `output` | Where `bake` writes, relative to the project. Must end in `.mdl` and cannot be the source. |
| `engine` | `"xash"` or `"goldsrc"`: which limits `bake` checks against. |
| `anims` | Keyed by the animation's **number** (as a string). Only animations the project says something of are there. Numbers below the source's count change that animation where it stands; numbers from the count upwards are **added** animations and must run on without a gap. |
| `anims[n].name` | For a source animation: a note for the reader (the number decides). For an added one: its name in the model, 31 letters at most. |
| `anims[n].copyOf` | Added animations only: the source animation (number) whose frames its un-keyed bones play, and whose bounding box it takes. |
| `anims[n].frames` | The length in frames, when it differs from the source's. Un-keyed bones are then resampled to it. Absent: as the source. |
| `anims[n].fps`, `.loops` | Absent: as the source. |
| `anims[n].interp` | `"smooth"` (default when absent) or `"linear"`. |
| `anims[n].keys` | `{ "<bone name>": { "<frame>": [x, y, z, rx, ry, rz] } }`, radians. A bone not listed, or listed with no keys, plays the source. Do not write a frame at or beyond the length: it would still bend the curve before it. |
| `anims[n].events` | The animation's **whole** list of events when present; absent: the source's. `event` is the number the game's code knows (5004: play the sound in `options` on the client), `type` is 0, `options` at most 63 letters. |
| `textures` | Keyed by the texture's **number**. `name` is a note. `file`: a PNG or BMP that replaces the picture (any size; cut to 256 colours, or 255 and the hole for a masked texture; an 8-bit BMP keeps its palette index for index). `adjust`: `brightness`, `contrast`, `saturation` (each -100 to 100), `hue` (degrees), `tint` `[r, g, b]` with `tintAmount` (0 to 100), applied to the palette after any replacement. The texture's name and flags never change. |
| `textures[n].adjust.select` | Absent: the adjustments apply to every colour. `{ "colour": [r, g, b], "tolerance": 20, "invert": true }`: only to the palette colours within `tolerance` of `colour` (0: that colour alone; `colourGap` in `core.mjs`), read on the palette before the adjustments; with `invert` (absent when not), to every colour but those. The hole's colour of a masked texture is never changed. A `select` with no adjustment beside it changes nothing. |
| `log` | The last 60 changes: `rev`, `by` (`"person"` or `"agent"`), `at`, `what`. Written by the tools. |

What `bake` does with it, in order, always from the source: each texture with `file` or `adjust` through smak's
`replaceTexture`; then each entry of `anims` in order of number: `replaceSequence` (frames only if a bone has keys
or the length changed; `fps` and `loops` if given) and `setEvents` (if `events` is there), or `addSequence` for
an added one; then `check`. Animations are never removed or reordered.

## Not trampling the person's work

1. **Change the file only through `cli.mjs`** (or `patchProject` in `editor/project.mjs` from a script). Each
   command reads the file as it is at that instant, changes only the paths it names, and writes it back under a
   lock: a key is one frame of one bone, so your key on the forearm and theirs on the hand both survive.
   Do not read the JSON, hold it, and write it back whole: you would undo whatever they did meanwhile.
   If you must edit it by hand, re-read it immediately before, change only your part, and add one to `rev`.
2. **Know which commands are wide.** `thin` (without `--bone`) rewrites every bone's keys of that animation;
   `set --frames` moves every key and event of it; `events` rewrites the animation's whole event list; `unkey ...
   all` drops a bone's keys. Use them when the person has asked, or on an animation they are not working on.
   `key`, `movekey`, `unkey <frame>` and `texture` touch one thing.
3. **Read the log before you start** (`show`): the last lines say what the person has just been doing. Leave
   alone the bones and animations they are in the middle of, unless that is what they asked you about.
4. **Say what you did** in the same terms the log uses (animation, bone, frame), and show the picture
   (`strip --compare`). They will see your change appear in the page; they should not have to guess why.
5. **Undo your own changes by the opposite change** (`unkey`, `set`, `events --source`, `texture --no-adjust`, `texture --all-colours`).
   The page's undo belongs to the person: it puts back exactly the values their own edit replaced.
6. Prefer `dup` for an experiment: a new animation at the end disturbs nothing the game or the person uses.

## From a script

```js
import { readProject, patchProject, sourceOf, bakeProject, saveBake } from "./editor/project.mjs";
import * as core from "./editor/core.mjs";

const P = "smak-projects/v_1hswords.smakproj.json";
let project = readProject(P); const ctx = sourceOf(project, P).ctx;      // bones, seqs, base(n): the source's frames
for (let f = 8; f <= 16; f += 4) {
  const op = core.opNudge(project, ctx, "attack1", "Bip01 R Hand", f, { rot: [0, 10, 0] });   // { what, set }
  project = patchProject(P, { ...op, by: "agent" }).project;              // read, patch, write, under the lock
}
const frames = core.bakeAnim(core.animOf(project, ctx, core.animAt(project, ctx, "attack1")), ctx);   // [frame][bone][6]
console.log(saveBake(project, P));                                        // { out, errors, warnings, facts, notes }
```

Every edit in `core.mjs` is a function returning `{ what, set: [{ path, value }] }` (`opKey`, `opNudge`,
`opDeleteKey`, `opMoveKey`, `opPaste`, `opThin`, `opSettings`, `opDuplicate`, `opEvents`); a `value` of `null`
removes what is at the path. `patchProject` returns the `inverse` set that undoes exactly that change.

## What to tell the person

What you changed (animation, bone, frames), the picture, what `bake` and its check said, and what the kit's
picture cannot show: timing in play, the game's lighting, and anything the game's scripts time by an animation
whose length you changed.
