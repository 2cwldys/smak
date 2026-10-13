# The model editor

A page for touching up a GoldSrc model by hand: open a model (a weapon in the player's hands, a player, a monster),
re-time and re-pose its animations, change a texture, and save a model the game loads. It is the hand-driven
side of SMAK, the kit agents use on the same files. Whatever you do here goes into a small project file
that an agent can read and change too (`editor/AGENTS.md`), so the two of you can take turns on one model.

This is **tier one**: animations, events and textures. It does not change a model's shape.

## Starting it

In a terminal opened in the kit's folder:

```
node bin/smak.mjs edit <folder of models, or one model>
```

then open the address it prints (**http://127.0.0.1:8097/**). Nothing to install: Node 18 or later and a browser.

```
node bin/smak.mjs edit "C:/Games/Half-Life/ts/models/player" --work my-edits --engine goldsrc --port 8097
```

| | default | |
| --- | --- | --- |
| the folder of models | (you give it) | Only read, sub-folders included. Never written to. Given one model, its folder is listed and that model opened. |
| `--work` | `smak-projects`, where you ran the command | `<name>.smakproj.json` (the project), `<name>.tex/` (pictures you dropped in), `<name>.out.mdl` (the saved model). |
| `--engine` | `goldsrc` | What a new project's saved model is checked for: `goldsrc` (Half-Life's own limits, the stricter) or `xash`. Changed for one project in the *Save* tab. |
| `--port` | 8097 | |

To try the saved model in the game, copy `<name>.out.mdl` over the game's copy yourself (keep the original).

## The five things it does

1. **Open and look.** Pick a model at the top left; pick which submodel of each bodypart is shown (the game's
   "body number": a view model file holds several weapons). A view model (`v_<name>.mdl`) opens in first person,
   anything else in orbit. Two cameras: **First person** is exactly the game's
   view of a view model (the eye at the model's origin looking forwards, 90 degrees across a 4:3 screen; a wider
   window shows more at the sides and marks the 4:3 frame), **Orbit** looks from outside: drag to turn, the wheel
   to come nearer, and a double click on the model to turn and zoom about that point (a close look at a chest
   or a helmet's face then needs no sliding; a double click beside the model goes back to its middle).
   Three boxes at the top add to the view:
   - *both sides* (<kbd>F</kbd>) draws both sides of every triangle. The game, and the view as it opens, draw
     one: a face that is inside out is a hole, and a thin sheet vanishes from behind. Tick it to check a new shape.
   - *second body* (<kbd>V</kbd>) opens a second view beside the first with another body of the same model,
     chosen by the selects at its top: a new armour beside the game's own, from the same camera, at the same
     frame of the same animation. It is for looking only; bones are picked and posed in the first view.
   - *smak's picture* shows, beside yours, the picture an agent gets of the same frame, drawn by smak from the
     baked project and from the camera you are using. It follows the camera when you let go of a drag or the
     wheel rests, and it follows *both sides*.
2. **Play and re-time an animation.** Choose one on the left. The timeline plays, pauses, steps and scrubs it, at
   a tenth of its speed if you like. In the *Animation* tab: its frames a second, its length (*Stretch* squeezes
   or stretches the whole of it, keys and events with it), whether it loops, and *Duplicate at the end* to try a
   variant without touching the one the game plays.
3. **Pose a bone at a frame.** Click a part of the model (or a joint of the skeleton, or a name in the list): that
   is the bone you hold. Drag a coloured ring to turn it, or press <kbd>G</kbd> and drag an arrow to move it.
   That sets a **key**: "this bone is like this at this frame". The frames around follow (see below).
4. **Events.** The *Events* tab and the flags on the timeline: the sounds and effects an animation sets off at
   a frame. Add, move (drag the flag), change the text, remove.
5. **Textures.** The *Textures* tab: see a texture and the triangles that wear it, drop a PNG or BMP on it to
   replace it, export it, or shift the whole picture's brightness, contrast, colour, hue and tint. Each of those
   is a slider with a number box beside it: drag the slider, or click it and step it with the arrow keys
   (<kbd>Home</kbd> and <kbd>End</kbd> for its ends), or type the exact value in the box and press
   <kbd>Enter</kbd>. The tint's colour is picked in the colour box or typed beside it as hex digits (`#c08040`);
   digits that cannot be read are said in the line at the top and change nothing.
   **Some colours only.** Click a pixel of the texture's picture: the sliders then change only the colours like
   the one you clicked, and the picture shows the rest dimmed (untick *shown above* to see it plain). *How
   like* says how far a colour may be from yours: 0 is that colour alone, about 20 takes in its lighter and
   darker shades (its hue counts for more than its brightness, so the steel of a helmet is chosen without
   the brass of its face frame), more takes in more. *Every colour but those* turns it round: click the brass,
   tick it, and the steel is what changes. *All colours* goes back to the whole picture. One choice a texture.
   **A replaced picture keeps its adjustments**, and they apply on top of it. The tab says so in a line under
   the picture, with *No adjustments* beside it. *Export PNG* gives the picture as the model wears it,
   adjusted; if you mean to paint on it and drop it back while the adjustments stand, use *PNG without
   adjustments*, or the adjusted picture is adjusted a second time.
   The picture and the model follow as you move; the project is written when you let go, once for a change. A
   run of key presses on one slider is one change too: it is written when the keys have been still for a little
   over half a second, or when you leave the slider, and one undo takes the whole run back.
   Each picture you drop is kept in `<name>.tex/`. Of the pictures one texture was replaced with, the one the
   project names and the eight before it stay there, and older ones are removed when a new one is dropped: so
   undo finds its picture eight replacements back, and says so in words beyond that.

**Save model** (top right, or <kbd>Ctrl</kbd>+<kbd>S</kbd>) bakes everything onto the *original* model, writes
`<name>.out.mdl`, checks it for the project's engine (the *Save* tab changes it) and lists
what the check says. The original is never written over, and saving twice does not stack: each save starts from
the original again.

Your edits are written to the project file as you make them; there is no "save project". Closing the page loses
nothing but the undo history.

## Keys, and why "thin the keys" matters

A model's file holds every bone's position at **every frame**. So an animation opens with a key on every frame,
which is no good for shaping by hand: change one frame and only that frame changes, a flicker.

The editor gives you two ways round it:

- **Spread** (the default). When you pose a bone that still has a key on every frame, the change is carried, fading
  out, onto the frames either side (a sixth of the animation each way, or the number you put in *spread*). Good
  for "the arm should come a little higher through the middle of the swing".
- **Thin the keys** (*Animation* tab). Every bone keeps only the keys needed to give the same motion back within
  the tolerance you set (half a degree by default), and the page tells you how far the thinned animation is from
  what it was. A sword swing of 56 frames and 50 bones comes down from 2800 keys to about 160. After that a key
  is a real handle: move it along the timeline to re-time that moment, pose it to reshape the motion, remove it
  to smooth it out. Between keys the bone follows a curve through them (or straight lines: *between keys*).

Bones you never touch play the original's frames exactly.

## Mouse and keys

| In the 3D view | |
| --- | --- |
| Click the model, or a joint | Hold that bone |
| Drag a ring | Turn the bone about its own axis of that colour (red x, green y, blue z); <kbd>Shift</kbd>: steps of 5 degrees |
| Drag an arrow (move mode) | Move the bone along its parent's axis; <kbd>Shift</kbd>: steps of a quarter unit |
| Drag elsewhere (Orbit) | Turn the camera; right button or <kbd>Shift</kbd>: slide it; wheel: nearer, farther |
| Double click the model (Orbit) | The camera turns and zooms about that point; beside the model: about its middle again |

| In the Textures tab | |
| --- | --- |
| Click the texture's picture | The adjustments apply only to the colours like the one clicked |
| Drop a PNG or BMP on the tab | Replaces the picture |

| On the timeline | |
| --- | --- |
| Click or drag | Go to that frame |
| Drag a diamond | Move that key of the held bone to another frame |
| Drag a flag | Move that event; click it to open it in the Events tab |
| Double click the events row | A new event there |

| Key | | Key | |
| --- | --- | --- | --- |
| <kbd>Space</kbd> | Play, pause | <kbd>R</kbd> / <kbd>G</kbd> | Turn / move |
| <kbd>Left</kbd> <kbd>Right</kbd> | A frame back, on | <kbd>K</kbd> | Key the bone here as it is |
| <kbd>Shift</kbd>+<kbd>Left</kbd> <kbd>Right</kbd> | The held bone's key before, after | <kbd>Delete</kbd> | Remove the bone's key here |
| <kbd>Home</kbd> <kbd>End</kbd> | First, last frame | <kbd>Esc</kbd> | Let the bone go |
| <kbd>Ctrl</kbd>+<kbd>Z</kbd>, <kbd>Ctrl</kbd>+<kbd>Y</kbd> | Undo, redo | <kbd>Ctrl</kbd>+<kbd>C</kbd>, <kbd>Ctrl</kbd>+<kbd>V</kbd> | Copy the pose, paste it at this frame |
| <kbd>1</kbd> / <kbd>2</kbd> | First person / orbit | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd> | Paste it with left and right changed over |
| <kbd>B</kbd> / <kbd>O</kbd> | Skeleton / onion skin | <kbd>Ctrl</kbd>+<kbd>S</kbd> | Save the model |
| <kbd>F</kbd> | Both sides of every triangle, or one | <kbd>V</kbd> | The second body's view, open or shut |

While a slider of the *Textures* tab has the keyboard (you clicked it), the arrow keys, <kbd>Home</kbd>,
<kbd>End</kbd> and the page keys move that slider and not the timeline; <kbd>Esc</kbd> or a click elsewhere gives
them back. In a box you type in, every key is the box's own.

The onion skin shows, faintly, the pose at the held bone's key before (blue) and after (orange).
The numbers in the *Pose* tab are the bone's turn in degrees and its place in units from its parent; typing one sets a key.

## Working with an agent

The page needs no reloading while somebody else works. Within a second it takes up a change to the project (with
a line saying who did what), the open model's file written anew by a script (your camera, body, frame, bone and
undo are kept), and a model that appears in the folder. The mark at the top right says `live` and what last
changed, or `server away` when the editor's server has stopped.

The agent uses `node editor/cli.mjs <project> ...` on the same project file. Its changes show in the page within
a second, with a line at the top right saying what it did; the *Save* tab lists who did what. Your undo only takes
back your own edits (exactly the values your edit changed). There is no locking of "whose turn it is": say so in words.

## What it cannot do

- Change a model's shape, its triangles, which bone a point follows, or add bones. (Tier two, below.)
- Paint on a texture. Paint in a paint program: *Export PNG*, paint, drop it back (*PNG without adjustments*
  when the texture has adjustments you mean to keep).
- Adjust two groups of colours of one texture in two ways: a texture has one set of adjustments and one choice
  of colours. For a second, export the adjusted picture, drop it back, take the adjustments off and begin again.
- Remove or reorder animations. The game plays them by number, so they stay; a duplicate goes after the last.
- Pose an animation the game mixes from several (a player's aim up and down; rare in view models, common in
  player models): written from one set of frames it would lose the others, so the page and the command line refuse
  it and say so. Its speed, looping and events can be changed, and *Duplicate at the end* gives a copy to pose.
- Open animations kept in separate `name01.mdl` files.
- Show the game's lighting, or how the weapon bobs and sways while you walk. The picture is smak's stand-in:
  shapes, poses, textures and the first-person framing are true; brightness is not. Try the saved model in the game.
- A change of an animation's **length** changes whatever the game times by it (a hit that lands when the swing
  ends). The page warns; the game's scripts decide.

Rough edges of this first version: one key track is shown (the held bone's) rather than every bone's; a key cannot
be copied between bones; mirroring a pose works from the bones' names (`L`/`R`) and the skeleton's rest pose, which
in view models is seldom quite symmetric, so check the result; there is no stretching of one part of an animation
(move the keys instead, after thinning); the 3D view has no inverse kinematics (you turn the upper arm, then the
forearm, then the hand).

## How it is built

| File | |
| --- | --- |
| `serve.mjs` | The local server: the page, and the model work, done in Node with `smak/src`. |
| `core.mjs` | Keys, interpolation, thinning, mirroring and every edit as a patch. Pure arithmetic; the page and Node both load this one file, so what you see is what is baked. |
| `project.mjs` | The project file (read, patched under a lock, logged) and the bake onto the original with smak's `replaceTexture`, `replaceSequence`, `addSequence`, `setEvents`, `check`. |
| `cli.mjs` | The same edits from a terminal, and pictures through smak's `render` and `strip`. |
| `page/` | `index.html`; `app.mjs`, the entry, which lists the modules of the interface beside it (`state`, `server`, `model`, `edits`, `panes`, `actions`, `adjust`, `stage`, `timeline`, `keyboard`, `live`); `view.mjs` (WebGL2, drawn as smak's renderer draws). No library. |
| `test/` | Not in the release: `roundtrip.mjs` (the arithmetic against a real model), `drive.mjs` (the page driven by Playwright, a picture a step), `zero.mjs` (a body whose normals are all nothing, in the page against smak's render; it makes its model with the kit, or opens the game's own named in `SMAK_ZERO`), `shot.mjs` (one picture of any state; exit code 1 when the page throws). The kit's own `test/selftest.mjs` covers the editor without a browser. The others take the game's models from the folder in `SMAK_MODELS` (it holds `v_1hswords.mdl`; by default `run-msc/msc/models/viewmodels` of the checkout the kit is in) and Playwright from the project whose `package.json` is named in `SMAK_PLAYWRIGHT` (by default a `MasterSwordThreeJS` checkout beside that one). Each starts a server on a port of its own (8198, 8199, 8197), or on the one `SMAK_TEST_PORT` names. |

Model files are read and written only in Node (smak works on Node's `Buffer`); the page gets geometry, frames and
pictures over a small HTTP API and does the posing itself, live.

## Tier two, and what it would build on

Tier two is the shape: moving points, swapping a weapon's mesh for another, re-rigging a point to another bone.

- **The project file** takes more sections beside `anims` and `textures` (say `meshes`: per submodel, moved points
  and replaced pieces), baked in the same pass before the animations, with smak's `replaceMesh` / `swapMesh`.
- **The patch mechanism** (`core.applyPatch`: paths, inverse for undo, the log, the lock) is not about animation
  at all; point edits are patches like any other, and the agent gets them for nothing.
- **The view** already has the corners in bone space, a ray under the mouse (`view.pick`) and the handles; point
  selection and a move handle on a selection are the same parts used again.
- **Painting** would be a 2D canvas over the Textures tab's picture, written through the `upload` call that a
  dropped file uses now.
- Not prepared for: new bones (smak's `addBones` exists, but every animation's frame gains a bone, and the keys are
  already by bone name, so it should hold), and inverse kinematics for the arms, which would make posing a swing
  far easier than turning three bones in turn.
