# Specs: a model, a map or its textures from a description

A spec is a description in plain JSON of what is to be made: a map, a model, its textures, a sound, a sprite: Steven
Linn's spec builder ([stevenlafl/smak](https://github.com/stevenlafl/smak)).
Parts are placed by saying what they sit on, rooms by saying what they are next to; what is built is checked and
drawn, and what is wrong is said in a sentence that names it.

```
smak build lab.json                       its kind by its "spec": each file under the spec's folder
smak build hall.json --game <valve>       a map in a folder of its name, compiled when VHLT is found (--vhlt)
smak build lab.json -o <mod folder>       under the mod's folder
smak build hit.json --game <valve>        a sound held to the game's own of its name (docs/SOUNDS.md)
smak build guard.json --game <valve>      a character on a base, a weapon in place of the game's, found there
smak build lamp.json --focus shade        a model with its parts named seen close; --reference x.png beside it
```

| `spec` | What it builds | Where it is told |
| --- | --- | --- |
| `smak.map/1` | A map of rooms laid out by words, compiled, walked and drawn | docs/SPEC-MAPS.md |
| `smak.model/1` | A model of parts: a prop, a character on a game's skeleton, a weapon in place of a game's | below |
| `smak.wad/1` | Textures for maps: a .wad and a sheet of them, the map drawn wearing them | below |
| `smak.video/1` | A video of models and maps from a list of shots: MP4 with ffmpeg, a GIF without | below |
| `smak.sound/1`, `smak.music/1` | Sounds made of layers; a recording made a track | docs/SOUNDS.md |
| `smak.sprite/1` | A sprite of layers | docs/SPRITES.md |

The report follows the files: `ERROR` for a spec that cannot be built, `FAULT` for what the engine would do
wrong, `WARN`, `note`, then the facts; the exit code is 1 when it is not OK. Pictures a spec names (a
photograph, a map to preview on) are read from beside the spec. In a script: `buildMapSpec(spec, { out, folder,
compilers, fgd, wads, readPicture, readFile })` in `src/spec/map.mjs`, `buildWadSpec(spec, { out, folder,
readPicture })` in `src/spec/wad.mjs`, `buildModelSpec(spec, { folder, games, readPicture, readFile })` in
`src/spec/model.mjs`.

## The loop

1. **Read what is asked, and list it.** Each thing the person names (a part, a room, a door, a count, a
   size, a colour) is a line of your list. That list is what you check the result against at the end.
2. **Write the spec.** Sizes in units (about an inch: a player is 72 tall, a door 64 by 96, a barrel 40
   tall). Ids are words that say what the part or the room is: `lid`, `hall`, never `part3`.
3. **Build it** (`smak build x.json`) and read the report from the top. `built, and every check passed` is the
   shape and the map passing every check; `NOT OK` lists what to fix above it, each line naming the part or
   the room. Fix the spec, build again.
4. **Look at the pictures** against your list: a part in the wrong place, a size that reads wrong, a door
   in the wrong wall show there and in no check. The report also lists every part or room with where it
   ended up (`PARTS`, `ROOMS`), which tells a stack built upside down at once.
5. **Large requests: prefabs and modules.** A request that needs more than one spec can say (a tavern with
   its tables, a town with its shops) is cut in pieces: each piece a spec of its own, built and checked
   alone, then put in the larger one: a model's `prefab` part; a map's `models`, `prefabs` (brushes, or a
   `.map` file) and `include` (a whole map spec as a module). A building for a map made another way is taken
   out of its yard (docs/SPEC-MAPS.md, "A building in another map").
6. **Given pictures of the thing** (its sides, some angles), let the pictures do what they can measure: a
   prop's `carved` part takes its outline from them at once (then paint it); a character's `pose: { fit: true }`
   and `motion` take its stance and its run from them; a texture's `picture` its detail. Build the rest by
   hand: what an outline cannot show (a hollow, a handle's hole, a face). `--reference` draws the picture
   beside the result.
7. **The person asks for a change** ("looks good, now add a chest next to the bed"): change the spec as
   little as the request needs and build it again under the same name. The report then says what changed
   since the last build (`CHANGED ... things added: ...`, `... are where they were`): tell the person that,
   and check that nothing changed that they did not ask for.

## A model

```json
{
  "spec": "smak.model/1",
  "name": "barrel.mdl",
  "kind": "prop",
  "size": { "height": 40 },
  "materials": { "oak": { "base": "wood" }, "hoop": { "base": "iron", "rust": 0.3 } },
  "parts": [
    { "id": "body", "kind": "turn", "material": "oak", "sides": 16,
      "rings": [[0, 11], [10, 12.5], [20, 13], [30, 12.5], [40, 11]] },
    { "id": "hoop_low", "kind": "band", "material": "hoop", "on": { "part": "body", "s": 0.15 }, "width": 2, "height": 0.4 },
    { "id": "hoop_high", "kind": "band", "material": "hoop", "on": { "part": "body", "s": 0.85 }, "width": 2, "height": 0.4 }
  ]
}
```

| Field | |
| --- | --- |
| `name` | The file: letters, digits, `_ . -`, ending `.mdl` |
| `kind` | `prop` (stands on the floor: its lowest point is put at z 0), `held` or `piece` (left where it was built), `character` (a body on a game model's skeleton, below) |
| `base` | For a character: `{ file }`, the game's model whose skeleton and animations it keeps, looked for beside the spec and then in the game folders. A spec that takes the model's place under its own name (`headcrab.mdl` on `headcrab.mdl`) reads the game's, not its own last build; the same holds for `contract` |
| `weapon` | For a weapon: `{ like: "crowbar" }`, the game's weapon whose v_, p_ and w_ files it takes the place of (below) |
| `size` | What the person asked for: `{ height, length, width }` (any of them). Off by more than 10% is warned of, more than 25% is a fault |
| `texture` | `{ width, height }` of the shared picture (256 x 256 unless told, 512 x 512 when it projects pictures; 512 x 256 for a larger thing) |
| `materials` | Names for materials the parts share: `{ "oak": { "base": "wood", "tone": [r, g, b] } }`. A part may also name a base itself (`"material": "iron"`) |
| `parts` | The parts, each placed on one listed above it |
| `prefabs` | `{ name: <another model spec> }`, for parts of kind `prefab` |
| `allow` | `{ open: [ids], floating: [ids] }`: parts open or apart on purpose (a part can say `open: true` or `loose: true` itself) |
| `finish` | What a painter adds over the materials, read from the shape (below): `{ light, wear, grime, vary }`, each 0 to 1, or `false` for none. A part may have its own |
| `project` | The person's pictures of the thing laid onto it as its texture (below, "Pictures projected onto it") |
| `smooth` | The angle (degrees) under which faces are shaded as one surface: 40 unless told; a round part (turn, cylinder, sphere, tube of 5 sides or more) is shaded round across its own sides unless told, so 8 sides read round. A part may have its own. A tube of 4 meets itself at 90 degrees and is shaded flat, each face with normals of its own: a rib cost 104 normals for 44 points. Over its faces' angle (100 for 4 sides) it is shaded round with a normal a point: the engine holds 2048 normals a body |
| `contract` | `{ file }`: a model whose contract with a mod's code this one must keep: every bone, every animation at the same number with its activity, its attachments on the same bones, its bodyparts with as many bodies. A model built for a mod on another's skeleton (a player of The Specialists, whose code plays its dives and rolls by name) is checked against it; what it breaks is a FAULT. `smak contract <mdl> [--against ref.mdl]` shows one |
| `budget` | The most triangles the model may have: over it is a FAULT. Without one, a prop over 576 is warned of. The report lists the heaviest parts and the thin boxes that could be painted |
| `layout` | `"regions"`: the picture laid as Valve lays its own (research/valve-uv.md): each part, and on a skeleton each region of the body it covers by its bones (the head at twice the texels, the chest, the hips, the legs, the feet, the arms, the hands), seen flat from the front and the back, a side only for faces that look nearly square to it, from above and below for faces that look up or down; each such picture every face of it, connected or not (both legs' fronts on one), and a right part or limb that is its left's mirror on the left's pixels. What the materials painted is carried over point for point. Every triangle then lies on a flat projection (a robot of boxes 100 in 100, against 31 for the charts each part has unless told; a generated guard 88 against 32), so a front and a back picture land on it near one to one. Use it for a body painted from pictures of its front and back, and for a thing made of boxes; leave it out (each part laid in its own zone, `parts`) where a part's own charts pack its picture tighter (61 against 46 in 100 of the robot's sheet in use) |
| `palette` | `"own"`: a character's projected pictures keep their colour. Unless told, they are pulled to its base's palette (below, "Pictures projected onto it") |
| `fidelity` | `"game"` (unless told): held to Half-Life's own of its kind and size, warned past them. `"high"`: a person's own model made to look its best: the larger picture (512 x 512) unless `texture` says, and its triangles against Half-Life's told as a fact, not warned. Use it only when the person asks for detail over the game's budget; a `budget` still binds |

### Axes, and which way is up

`+x` is the front, `+y` the left, `+z` up. A prop stands on z 0. A part is built in its own space (below),
turned by `rotate`, then moved to its place. **Build things upright**: a post, a lamp, a barrel along `z`
(the turned kinds' default); a beam, a blade, a car's body or a log lying down along `x` (`"axis": "x"`).

### The kinds of part

| kind | fields | its own space |
| --- | --- | --- |
| `box` | `size: [x, y, z]` | centred on x and y, from z 0 up to z |
| `cylinder` | `radius`, `height`, `top` (radius at the top: a cone or a taper), `sides` (16) | along z from 0 to `height`, both ends closed |
| `sphere` | `radius`, `sides` | from z 0 to `2 * radius` |
| `carved` | `size: [x, y, z]` (the thing's size: its outlines are stretched to it), `sheet` (a picture of six sides laid as the kit's sheets are: front, left, back; right, top, below), `pictures` (more views: `[{ picture, view or yaw and pitch, area, rect }]`, the three-quarter ones), `cells` (64 on its longest side; more for thin parts), `triangles` (what it is reduced to: leave it out, and it is what three quarters of Half-Life's props of its size have under them; a copy over twice its original's count fails), `symmetric` (below), `layout` (`charts` unless told: its picture laid out in regions by the side that sees each best, packed to fill its zone; `sides`: six patches, one a side, which share texels and speckle), `clip` (a height in its own space under which the carve is left out: a coat carved to its hem, the legs under it built as parts of their own) | a shape carved from the outlines of pictures of the thing (a visual hull), centred on x and y, from z 0 up: every outline right at once, which parts built one by one rarely get. A hollow no picture sees into is filled; a part thinner than a cell is lost. Paint it with `project`, and give the spec `smooth: 80` so its normals fit |
| `blob` | `pieces`: each `{ span: [bone, bone], radius }` (a limb from joint to joint, `radius` a number or `[start, end]`), `{ at: bone or [x, y, z], radius }` (round a joint or a point: a number, or `[x, y, z]` for an egg) or `{ from: [x, y, z], to: [x, y, z], radius }`, each with `offset` and `bone` if it likes; `blend` (3: the units over which pieces melt into each other, 0 a plain union), `cells` (64), `triangles`, `symmetric` (give one side's limbs: each piece is copied to the other side's bones, or through y 0) | one smooth surface over many pieces: a torso running into its shoulders, a coat into its hem, a creature's body into its legs, with no seam between them. On a base each corner hangs on the bone of the piece nearest it, so the body bends at its joints. Placed by its pieces (no `attach`, `at`, `rotate`); laid out and painted as `carved` is, by its material and `project` |
| `mesh` | `file` (an `.obj` beside the spec), `size: [x, y, z]` (it is stretched to it: give its own proportions, which the report says), `triangles` (what it is reduced to: unless told, what three quarters of Half-Life's props of its size have under them), `up` (`y` unless told, an .obj's own way; `z`), `turn` (degrees about the upright, when its front is not towards +x), `symmetric` (below), `layout` (as `carved`'s) | a shape made elsewhere, centred on x and y, from z 0 up, laid out and painted as `carved` is: by its material and the finish, or by `project` from the picture it was made from (cut out from its ground, so that its outline is found). Faces wound inwards on the whole are turned round. A generator guesses what its picture does not show: look at every side |
| `superquadric` | `size: [x, y, z]`, `round: [up, round]` (each 0.05 to 2: 0.1 a box with its corners eased, 0.3 a rounded block, 1 an egg or a ball, 2 a diamond; 0.3, 0.3 unless told), `sides` (16) | centred on x and y, from z 0 up to z: a boot, a fist, a helmet's shell, a padded block, in one part |
| `turn` | `rings: [[s, r], ...]` (s along the axis, growing; r its radius, `[ra, rb]` an oval, 0 makes a point; `{ s, r, crease: true }` a hard edge, `{ s, r, off: [a, b] }` its middle moved off the axis), `caps: [start, end]` (true: flat; a number: a dome that high; false: open, which needs `open: true` or a `lining`), `lining: { inset }` (an inside: a cup, a bowl, a helmet, a pipe; the rings then run from the open rim, so the first ring is the open end and `caps` is `[false, ...]`: a pipe open at its front is built from the front back, `rotate: [180, 0, 0]`), `axis` (`z`), `sides` (16) | along its axis from its first ring |
| `fingers` | `hand` (a base's hand bone), `count` (4), `length` (6), `radius` (`[at the hand, near the tip]`), `spread` (40 degrees across), `curl` (30 degrees forward), `palm` (1.5: how far past the hand's joint they start), `sides` (4) | on a character only: tubes out of the hand along its forearm's line, fanned across and curled forward, each to a point, hung on the hand. Long thin fingers and claws are thinner than a carve's cells and come out of a carve as fragments: build them so |
| `tube` | `path: [[x, y, z, r], ...]` (a bent pipe, an arm, a horn, a rope, a rim round a circle; r 0 at an end makes a point), `sides` (8) | as the path's numbers say |
| `leaf` | `width`, `height`, `bend` (how far its middle bulges), or `rows` of points (a grid: a sagging awning; a column of points every row keeps within 0.25 of the line through its neighbours is left out, and the report says how many) | a sheet seen from both sides, in the x-z plane: a flag, a sign, a pane, a sail |
| `cards` | `size: [x, y, z]` (the crown's box), `count` (4), `card: [width, height]` (each card's size: leave it out for cards crossed through the crown's middle, each the crown's size, the last laid flat; give it smaller for `count` cards scattered through the crown), `tilt` (30: the degrees a scattered card may lean) | a tree's crown, a bush, a fern, a hedge: thin sheets seen from both sides, all wearing one picture of leaves with holes between (`material` `leaves` unless told), thinning to a ragged egg inside each card. How GoldSrc's trees are made: a crown of solid spheres or blobs reads as a toy. Centred on x and y, from z 0 up |
| `band` | `on: { part, s }`, `width`, `height` | a hoop round a turned part (`s` 0 at its first ring, 1 at its last). Moves with that part |
| `boss` | `on: { part, s, angle }`, `radius`, `height` | a round stud (a rivet, a knob, a gem) on a turned part; `angle` in degrees round it: for a part along `z`, 0 faces +x and 90 +y; along `x`, 0 faces +y and 90 +z (up); along `y`, 0 faces +z and 90 +x |
| `ridge` | `on: { part, path: [[s, angle], ...] }`, `width`, `height` | a raised line along a turned part (a stripe, a seam) |
| `studs` | `on: { part, path }`, `count`, `radius`, `height` | a row of studs along that path |
| `kit:sword`, `kit:axe`, `kit:blunt`, `kit:bow`, `kit:firearm` | `options`: the kit's own (its header in `kits/`; a blade's `half` as `{ "taper": [base, tip] }`; a firearm's `preset`, `pistol`, `shotgun`, `smg` or `rifle`, and any part over it) | lying along +x, grip at the origin |
| `prefab` | `prefab` (a name of `prefabs`), `spec` (one given here) or `file` (a .json beside this spec: another case's model, reused), `scale` | the prefab as it was built |

**Symmetric things are built symmetric.** A chair, a person, a car, a crate, most things made are the same on
their left as on their right, and a carve, a generated mesh or a blob seldom is: a picture's light, a three-quarter
view or a generator's guess leaves one side fuller. Give such a `carved` or `mesh` part `"symmetric": true`: its
left half (+y) is kept and the right made its mirror, so the two meet on the same points (`turn` its front to +x
first). Built parts are symmetric when their sizes are: give the other side with `mirror: "y"`, never as a second
part placed by eye. Leave it off only for what is lopsided in the pictures too (a held gun, a coat open on one side).

Every part takes `texels`: how finely its picture is painted against the others' (1). A face, a badge or a
label at 2 gets twice the texels a unit of the body does; a sole or an inside that is hardly seen at 0.5 half.
Half-Life's characters give their faces two to three times the body's.

### Placing a part

A part is placed in one of two ways, then copied when asked:

- `attach: { to, toAt, at, offset }`: **its anchor `at` is put on the anchor `toAt` of the part `to`**.
  Anchors are the middles of the faces of a part's box: `top`, `bottom`, `front` (+x), `back`, `left`
  (+y), `right`, `centre`; `start` and `end` (the two ends of a turned part's axis, a tube's path, a box's
  bottom and top); and on a turned part `{ "s": 0.9, "angle": 90, "out": 0 }`, a point of its surface.
  Unless told, `at` is `bottom` and `toAt` is `top`: **"stands on"**. `offset: [x, y, z]` moves it on from
  there. A lid on a pot: `{ "to": "pot" }`. A lamp's arm out of its post near the top:
  `{ "to": "post", "toAt": { "s": 0.9, "angle": 0 }, "at": "start" }`. A second mug beside the first:
  `{ "to": "mug", "toAt": "left", "at": "right" }`.
- `at: [x, y, z]`: where its own space's origin goes.
- `rotate: [yaw, pitch, roll]` in degrees turns the part in its own space before it is placed: yaw about
  z (90 turns +x to +y), pitch about y (90 turns +x down to -z, so `[0, -90, 0]` stands a part made along
  x upright), roll about x.
- `mirror: "y"` adds a copy on the other side (left for right, through y = 0); `"x"`, front for back.
- `repeat: { count, around, start, axis }` makes `count` of it round an axis (`z`, upright, unless told;
  `y` for a wheel facing sideways, `x`) through the middle of the part `around` (or through `through: [x,
  y, z]`), the first turned `start` degrees: chair legs, a crown's points, a wheel's spokes. Copies of a
  part must not all begin at one point: start each a little off the axis.

A `box` may carry words on a face: `"print": { "text": "NOODLES", "face": "front", "ink": [0.7, 0.1, 0.1],
"size": 0.6 }` (or a list of them), in plain capitals and digits as large as the face holds (`size`: the
share of its height), over its material. `face`: `front`, `back`, `left`, `right`, `top`.

Any part may be **painted, not built**: `"paint": true`. It is built and placed as any part, then baked into
the faces it sits on (within 1.5 units of them): their texels take its colour where a short ray out from them
meets it, its own faces' turn shading it so an edge still reads, and its triangles are left out. A strap, a
drawer's front, a vent's slats, a plate, a pull: whatever stands off a surface by less than it shows.

A box may carry painted **panels** on its faces: `"panels": [{ "face": "front", "at": [11, 29], "size":
[20, 17] }, { "face": "front", "at": [11, 32], "size": [5, 2], "shape": "round", "style": "raised",
"material": "chrome" }]`: a drawer's front, a door, a slot, a vent, a pull, a screen. `at` is the panel's middle
and `size` its width and height, in units from the face's bottom left as one facing it sees it; `shape` rect
(unless told), round (corners of `radius`) or ellipse; `style` inset (unless told: a gap, a recess), raised
(a plate, a pull) or flat (a painted patch); `edge` the bevel's width (0.4); `material` its own (the box's
unless told). The bevel is painted lit from the top left, so it reads as relief, and costs no triangle.
Later panels go over earlier ones.

A turned part (`turn`, `cylinder`, `sphere`, `tube`) may carry painted **marks**: `"marks": [{ "path": [[0.2,
130], [0.2, 230]], "width": 1.1, "material": "stripe", "ends": "point" }]`. A path is a ridge's (`s` 0 to 1
along the part, the angle in degrees round it; `[[0.5, 0], [0.5, 360]]` is a ring round it); `width` in
units; `material` a word of `materials` or a base (near-black unless told); `ends` `round` (unless told) or
`point`, or one of each. A mark is painted into the part's picture and follows it wherever it is placed.

**Shape or paint.** Build it (`ridge`, `band`, `boss`, a part of its own) when it changes the outline: it
stands off the surface by a unit or more on a thing a player's size, it is seen edge-on (a brim, an ear, a
collar), or it moves on a bone of its own. Paint it (`marks`, `print`, `panels`) when it lies on the
surface or stands off it by less than a unit: stripes, spots, a painted line, a seam, a label, a drawer's
front, a pull, a vent, a rivet seen from two steps away. A built ridge 0.3 high changes
nothing the engine's flat light shows, and costs triangles, normals (2048 a body) and a part that can come
apart. Holes in a thin sheet (a fence, a net, a grate) are a third way: a `mesh` material, see-through.

**How many sides.** A round part's sides show only in its outline: an n-sided ring strays from its circle by
`r * (1 - cos(180 / n))`. Take the fewest that keep that under half a unit on a prop (a quarter on what a
player holds): 8 for a radius of 6, 6 for a pipe seen only lengthways, more only for a wheel seen side-on.

**How many triangles.** Half-Life's own models, counted (the first frame of each, by kind):

| Kind | A quarter have under | Half under | Three quarters under |
| --- | --- | --- | --- |
| Pickup lying in the world (`w_`) | | 28 | 104 |
| Prop, plant, creature, person | 60 | 176 | 576 |
| Weapon in another player's hands (`p_`) | 88 | 142 | 187 |
| First-person weapon with its arms (`v_`) | 523 | 615 | 832 |

A crate there is 26 triangles, its planks and bands painted on; a can, 28; a person (Barney, a scientist) about 750,
the zombie 844, a small creature (the houndeye) 308. A character over twice its base's own body is a FAULT: choose a
base near its size, and paint what a spine or a fin does not change in the outline. A character's report gives
the median, third quartile and most of Half-Life's creatures and people of its size, and warns past the most: a
judge holds a creature to the most of the game's own (the headcrab's size: 478). A
prop's report gives the median and third quartile of Half-Life's props of its size, and warns past the third
quartile: a copy is judged against twice its original's count. A filing cabinet there is 14 triangles, its
drawers, handles and rails all painted on a box.
Build to that: the shape in triangles, the detail in the picture.

Parts should touch: the check calls a part more than 0.25 units from every other **floating**. Let parts
sink a little into what they stand on (an `offset` of `[0, 0, -0.5]`), the way a real thing is made: a part
sunk into another, or cutting through it, touches it.

### A character on a game's skeleton

A player model or a monster is a body put on a model the game already has, so that it keeps that model's
bones and every animation: `"kind": "character"`, `"base": { "file": "player/gordon/gordon.mdl" }` (found
in the game's `models` folder). The parts are placed in model space as the base stands in its first
animation's first frame (the report's `fact base ...` lists every joint there; the pose is not symmetric:
Gordon's right hand holds a gun forward), each corner hung on one bone, and the body replaces each of the
base's bodies. Then the report holds it in that pose, the middle of a run, a walk, a crouch and a jump:
a part that comes apart in any of them is a fault (`in run2 frame 11: ... thumb_left 0.28 units away`).

- `span: { bones: [a, b], over }`: laid along a limb from joint `a` to joint `b`, its own z stretched to
  their distance and `over` units past each end (so that the joints overlap and stay closed when they bend),
  its x towards the front. A cylinder, a box or a turn: an upper arm, a thigh, the chest from `Spine1` to
  `Neck`. It hangs on `a`.
- `attach: { bone, at, offset }`: its anchor `at` (`centre` unless told) on that bone's joint: a head, a
  hand, a foot, a knob at a knee. Parts attached to it hang on its bone.
- `bone`: the bone a part placed by `at` hangs on (a rib built in the chest's space).
- Left and right are given apart, each on its own side's bones; `mirror: "y"` of a part on a middle bone
  copies it across, and a mirrored part on an `L` bone hangs its copy on the `R` one. A mirrored part stays on
  its own side: one that reaches across the middle runs into its copy (a boot 24 wide on a calf 5 off the
  middle made both boots one block over both legs), a FAULT on a character and a warning elsewhere.
- `pose`: the stance it is built and judged in, when the original stands otherwise than the base:
  `"pose": { "keys": { "Bip01 L Thigh": { "turn": { "y": 20 } }, "Bip01 R UpperArm": { "turn": { "y": -10 } } } }`,
  degrees about the model's axes as each bone stands in the first frame (`y` over 0 swings a hanging limb back,
  `x` over 0 out to the left). Every frame of the first animation is turned so (its number, length and
  activity kept), and the parts are placed as the base then stands. Turn the walking plane's joints (hips,
  knees, ankles, spine, upper arms, forearms) forward and back; a twist reads as wrong at once.
  `"pose": { "fit": true }` finds the stance for you: the model is built, its first frame fitted to the
  outlines of the spec's `project` pictures (or `fit`'s own list of views, as `project` takes them), and
  built again in it. Only forward and back swings of the hips, knees, spine and arms, and the upper arms a
  little out, are tried. The report gives the outlines' overlap before and after and the keys it chose, to
  keep or change; `keys` given beside `fit` win over it. `"pose": { "fit": "shape" }` fits the base to the
  spec's own `mesh` or `carved` body instead, by its outlines from the front and the side, which the body has in
  3D: a picture of the front alone guesses the forward and back swings, the body's side settles them, and the
  base's bones are laid in its limbs before each corner takes one.
  `"pose": { "from": "walk" }` makes the first animation one of the base's own (its frames, rate, looping and
  travel), starting at `frame`, or, with none given, at the frame whose box of the base's body comes nearest the
  spec's `size`: an original whose first animation is a walk stands mid-stride in it (Half-Life's scientist is
  33 long so, where a standing body is 22), and words that say so are a frame of the base's walk, not a stride
  turned by hand. `keys` and `fit` then turn it further. `smak info` on the base lists its animations.
  `"pose": { "aim": { "L arm": { "out": 8, "forward": 25, "bend": 15 }, "R leg": { "forward": -12 } } }` says where
  each limb points, whatever the base's own stance: from its top joint, `out` degrees from the body seen from the
  front, `forward` degrees (under 0 back) from hanging straight down seen from the side, and its elbow or knee bent
  `bend` degrees, at the base's own lengths. A description that gives the stance in angles ("the left upper arm 8
  degrees out and 25 forward, the elbow bent 15") is written so, number for number: `keys` turn a bone from where
  the base has it, and Gordon's first frame holds a gun forward, so turns read off a description land elsewhere.
  Limbs: `L arm`, `R arm`, `L leg`, `R leg`. After `from`, before `keys`.
  `"bind": true` beside any of these binds the body in that stance and writes the base's own first animation back:
  each corner is kept in its bone's own space, so the body then stands as the base stands. A body made in a stance
  that is not the game's (arms held out, so that they come apart from the trunk) wants it: without it the first
  animation stands in the stance, and the character idles in the game with its arms held out.
- `motion`: an animation of the base fitted to a strip of pictures of the original doing it, as the kit's
  `strip` draws one from the side with the floor as a line: `"motion": [{ "seq": "run2", "fit": { "picture":
  "pictures/motion.png", "count": 8, "cols": 4 } }]`. The strip's cycle is matched to the animation's (it may
  start at another point of the stride), each of its frames fitted by the pose's swings, and the swings spread
  over every frame, round the loop. The animation keeps its number, length and travel. Seen from the side,
  arms over the body barely change the outline: legs and lean are what it finds.
- `floor`: where its feet stand. A player model's origin is the middle of its hull, so its feet are at -36; a
  monster's origin is its feet, at 0. A monster made on a player's skeleton (Gordon's) gives `"floor": 0`, and
  every animation is lifted so that it stands on the floor and not sunk to its hips; a player keeps -36.
- Bones may be named in English or as the base names them. 3ds Max's Biped names its bones in the language
  it ran in: The Specialists' own player (`player/gordon/gordon.mdl` of the `ts` folder, every stunt in
  it) says `Bip01 Testa`, `Bip01 SX Mano`, `Bip01 Dorso1`, `Bip01 Dito mano DX0` where Half-Life's says
  `Bip01 Head`, `Bip01 L Hand`, `Bip01 Spine1`, `Bip01 R Finger0`, and Half-Life's older limbs (`Bip01 L
  Arm1`, the upper arm) are the newer `UpperArm`. A name is turned into the base's own (the report notes it).
- A joint that bends far (an elbow, a knee) wants a sphere on it, or a limb part with `over`: two boxes
  that meet end to end open a gap as soon as it bends.
- **A soft body of one surface: `blob`.** Parts built one by one meet at hard seams, and judges call such a body
  stiff ("the coat is a stiff box with a squared hem"). What is soft is a `blob`: skin, a creature's body and legs,
  bare arms, a coat's drape (a piece for each limb along its bones, `span`; an egg round the chest or the hips,
  `at`; a skirt as a cone from the waist, `from` and `to`, its radius growing), blended over a few units. What is
  squared stays as parts: a vest, a helmet, a holster, boots (`superquadric`, `box`); a blob rounds every corner, and
  one that swallowed a squared vest lost the outline. Keep a blob to what is round: its outline against the
  pictures says so at once. 40 triangles a piece unless told, 600 at most.
- **Given pictures of the character** (a photograph, the person's drawings), a carve is seldom the way. A carve is the pictures' outlines crossed, so from a front and a side every slice of it is a
  rectangle: the arms, the legs and the trunk are one column from the side, and the side faces wear no picture.
  A person's soldier so carved from four photographs was a cut-out from every side but the front. Carve a character only from a full sheet of six sides drawn
  without perspective, as the kit's own `sheet` draws them (a reproduction of a model from its renders), and so:
  (`carved`, with `sheet` or `pictures`, and no `at`:
  it stands on the base's own feet, where the skeleton stands before `floor` lifts it; `at: [0, 0, 0]` hangs it over
  its bones, 36 units on Gordon's, each corner on the wrong limb): each corner hangs on the base's limb nearest it, so the one shape bends at the
  knees and elbows, and its outline is the pictures' at once. Turn the base to the pictures' stance first (`pose:
  { fit: true }`, or keys: the forearms down where the pictures' hands hang; Gordon's first frame holds a gun
  forward in both hands). Then add what a carve loses as parts on their bones: long fingers and claws as `fingers`
on each hand (the carve's report names the thin pieces it lost), a jaw as a part of its own. With `project`, a
  character whose outline shares under 0.7 with a picture's is a FAULT: its texture follows its shape, and on a
  shape that far off no projection comes near.
- A generated body (`mesh`) whose arms hang against its trunk, or whose hands touch its thighs, is fused there
  where a game's body keeps them apart: its triangles across the two tear in every motion, whatever bone each
  corner takes. The report warns past a few triangles that join limbs meeting 4 or more joints apart on the trunk
  (`54 triangles join limbs ... most between R Arm1 + Spine2`). Choose a take with its limbs clear of the body,
  or build the limbs as parts of their own.
- GoldSrc holds 2048 points and 2048 normals a body: a character of many round parts wants few `sides`
  (6 for a limb, 4 or 5 for a finger). The check says when it is over.

### A weapon in place of a game's

A weapon is a `held` model (built lying along +x, its grip at the low-x end) with `weapon: { like, views,
size, rig }`: the build fits it over the game's own weapon in each of its files, `v_<like>.mdl` (first
person, with the hands), `p_<like>.mdl` (in another player's hands) and `w_<like>.mdl` (lying in the world),
found in the game's `models` folder. Each keeps its hands, bones, animations, events and attachments; only
the weapon's meshes are replaced (the hands are told by their textures' names: gloves, sleeves, arms).
The files keep the game's names, so the game loads them in place of its own with no code (a weapon under a
new name needs the mod's code). They are written in `<name>_weapon/` beside the model.

- `like`: the game's weapon, as its files are named: `crowbar`, `357`, `rpg`, `tripmine`. Its files are read from the game folders first, then from beside the spec: a copy of a build's own put beside it is never fitted to in the game's place.
- A gun is best one part, `{ "kind": "kit:firearm", "options": { "preset": "shotgun", ... } }` (`kits/firearmkit.mjs`
  lists every field: receiver, frame, barrel, grip, guard, trigger, magazine, stock, forend, sights, `finish`,
  `wear`, and `length`: the whole gun made that long in proportion, for a brief's "about 10 long", its real gun's
  size without it; an option it has not is refused): a receiver, a grip, a closed guard and a magazine that read as a gun's, at its real size (`size: "own"`),
  180 to 300 triangles (Valve's own first-person guns are 276 to 363 without the hands). Its stock is left out of the first-person file as
  Valve's are (`stock: { "firstPerson": true }` keeps it), and it is laid the right way up and round in each file
  where its outline alone cannot tell. The report names its parts (`gun.receiver`, `gun.stock`).
- `views`: `["v", "p", "w"]` unless told.
- `size`: `"old"` (unless told) stretches it to the old one's length; `"own"`: build it at the **real weapon's
  length** (a crowbar about 24, a pistol about 7), and it is laid in each file at the size Valve draws that very
  weapon there: 0.82 of life in another player's hands, and in first person and the world as the game's own
  file draws it against that (its crowbar 0.82 and 1.37, where its guns' median is 1.24 and 1.81: a pickup is
  drawn large, to read on the floor). Without the game's files, the median. Its grip goes where the old grip was. In another player's hands
  and in the world the build lays a lighter mesh, as Valve's are: 0.59 of the first person's triangles and 254
  at most, the shape and picture kept (the report says how many).
- `rig`: `"carry"` (unless told) hangs it all on the bone that carried the old one; `"nearest"` gives each
  corner the bone of the old one's nearest corner, so that a part over a slide or a drum moves with it.
- A part may be in some of the files only: `"views": ["p", "w"]` leaves it out of first person (a stock behind
  the camera, as Valve's own first-person weapons leave theirs out), `["v"]` keeps it there alone (a sight).
- `chrome: ["v"]` gives the weapon's picture in those files the engine's chrome (a moving reflection over it), as
  Valve's first-person weapons have it.
- A part that moves names the game's bone it moves with: `"bone": "cylinder_spin"` (a revolver's drum),
  `"hammer"`, `"trigger"`. `smak info` on the game's `v_` file lists its bones. A file without that bone
  (the `p_` and `w_` ones have few) keeps the part on the bone that carried the old weapon.
- `turn`: where the fit cannot tell which way round the piece goes (a box, a can are the same outline every
  way), `"as drawn"`, `"x"`, `"y"` or `"z"`, or one a view (`{ "v": "as drawn" }`). Unless told, the one
  whose outline follows the old weapon's best. Draw it and look at which face the player sees.
- `animations`: animations of its own in place of the game's, in the first-person file, where the game's
  do not fit what it is (a broom sweeps where a crowbar chops):
  `[{ "replace": "attack1", "from": "idle1", "frames": 11, "fps": 22, "keys": [{ "at": 0 }, { "at": 3,
  "turn": { "Bip01 R Arm1": { "y": 40, "z": -20 } }, "ease": "out" }, ...] }]`. Each takes the place of
  the game's animation of that name, so its number stays and the game's code plays it; the keys turn bones
  about the model's axes (+x forward, +y left, +z up, from the eye) as they stand in the `from` frame, and
  the frames between are eased. Keep its length: the game times its hits by it, and the report warns past a
  quarter off. Its events stay as they were. A key may say where the weapon is to be on the screen
  instead of how to turn: `"aim": [across, up]`, shares of the distance ahead from the eye (`[0.45, -0.35]`
  low on the right), and the build finds the turns of the arm and the hand (`bones`, the right arm's unless
  told) that put the weapon's far end there, and says them. Draw it (the build shows the first attack).
- `sounds`: `[{ "spec": <a sound spec>, "event": { "sequence": "reload", "frame": 70 } }]`: its sounds (see
  docs/SOUNDS.md, "A sound"), written under `sound/` with its files. Most of a weapon's sounds are played by the game's code
  under fixed names (the crowbar's hit is `weapons/cbar_hit1.wav`, the .357's shot `weapons/357_shot1.wav`):
  give the sound that name and the game plays it. One an animation plays (a reload's clicks) takes `event`:
  the build writes event 5004 at that frame of the first-person file with the sound's path, keeping the
  others, and warns when the sound runs on past the animation.
- One picture: a weapon's parts share one texture, so leave out `neon`, `flame` and `glass` (each of those
  is a picture of its own).

The pictures: the game's first-person view beside the new one, the other views, and the attack as the
player sees it.

### The finish

Over its material, each part's picture is painted from the shape itself, unless the spec says `"finish":
false`:

- `light` (0.3): the room's light painted in, gently: faces that look up lighter, down darker, as smooth as
  the engine's shading. The engine lights a model softly and flatly; the form has to be in the picture.
- `wear` (0.5): sharp edges (a box's corners, a rim, an end: faces meeting at more than 65 degrees, not the
  facets of a round thing) rubbed lighter, broken up by noise in space.
- `grime` (0.5): dirt in the corner where a part meets another at least half its size in front of it (a
  barrel against a counter, a brim over a face), and on a `prop` near the floor.
- `vary` (0.08): each part a little lighter or darker than the next, so that ten boxes of one material are
  not one colour.

A character's are gentler unless told (`wear` 0.15, `grime` 0.3): cloth and skin do not rub bright. A part's
own `finish` (the same fields, or `false`) is over the spec's: a glass pane, a clean blade. Glowing and
see-through materials are left as they are.

### Pictures projected onto it

When the person gives pictures of the thing taken straight on (a front, a side, a top: drawn, rendered or
photographed), they can be its texture, as they are, on the shape you built:

```json
"project": [
  { "picture": "pictures/front.png", "view": "front" },
  { "picture": "pictures/sides.png", "view": "left", "area": [512, 0, 1024, 512] },
  { "picture": "pictures/quarter.png", "yaw": 35, "pitch": 20 }
]
```

- `view`: `front`, `left`, `back`, `right`, `top` or `below`, or `yaw` and `pitch` in degrees as `render`
  takes them (yaw 0 looks at the front, 90 at the left side; pitch 90 looks down). The picture must look that
  way with no perspective (or very little: a photo from far off).
- `area`: the part of the picture to look in, `[x0, y0, x1, y1]` in pixels (one view of a sheet of several).
- `rect`: where the thing's outline is in the picture. Found unless told: the largest patch that is not the
  background (its border's colour, or the see-through dots of a cut-out), with every patch a hundredth its size
  or more, leaving out a caption in the area's top left corner. The report says what it found.
- `parts`: only these parts take it, and its outline is theirs: a picture of the body alone is laid over the
  body, not stretched over the gear beside it.

Each texel takes the colour of the pictures that see it, weighted by how squarely each does, where nothing of
the model hides it from that view. Only the ground joined to the picture's border is ground: a dark patch of
the ground's colour inside the outline is the thing's, and a texel whose dot is ground still takes the dot's
colour when no other picture sees it, so the thing's own blotches and specks come as the picture has them. A
texel no picture sees keeps its material; on a character it carries the colour the first picture shows at the
same height and side, softened over a few units, so the back of a shirt is the shirt (from one picture of its
front, a generated guard's back was its plain material). And a character's pictures are pulled to its base's
palette: a photograph's colour is far stronger than the game's own people's (a generated guard 0.43 in mean
saturation, Gordon 0.32, Barney 0.24), so each texel is moved toward its own grey, its lightness kept, until the
pictures' mean saturation is the base body's own; the report says by how much, and `"palette": "own"` keeps them. Only the views that see a texel nearly as squarely as the best one
blend in it, so a detail is not ghosted by two views that place it a little apart. Each picture's own light is
fitted to the way the surfaces face in it and divided out (a face seen head-on keeps its brightness), so the
game's light is not laid over a second shading; the finish is not painted over what the pictures cover. The shape decides how well it fits: the outline in
each view must match the picture's, faces should be square to the views (an eight-sided column with flats to
the front, not a corner), and a part the pictures show stands where they show it.

### What the report says of a model

- `FAULT ... open edges ... the first at x y z`: a hole, or a shape left open (a turn with a cap `false`
  and no `lining`). Open edges buried inside another part (a band's feet) are no fault.
- `FAULT ... shared by three triangles or more`: faces given twice, or copies of a part that begin at one
  point.
- `FAULT ... turned the wrong way` / `... inside out`: faces that look inwards.
- `FAULT ... float apart`: a part that touches nothing; move it onto what it should sit on.
- `note ... nearly touch and do not`: two parts within 0.6 of each other, not touching. A row of things
  (teeth, nails) is so on purpose; a joint meant to close (a stock against its receiver, a guard against
  its frame) is open by a sliver, which no fault catches when each part touches something else. Look at
  each pair close (`focus`) and sink one into the other where they were meant to meet.
- `FAULT the pictures look through the model`: seen from outside, the inside shows somewhere.
- `fact the shape's outline against each picture's`: with `project`, how much of the model's outline and each
  picture's are shared, view by view, both at their true proportions (as a judge measures it); under 0.8 is
  `WARN ... outline is off`: a part missing, too big or out of place in that view. Mend it, or carve the body.
- `fact its look against each picture's`: the painted model drawn from each picture's camera and set against
  the picture in cells (mean colour difference, and the worst cell with where it is); a mean over 10 or a cell
  over 45 is `WARN ... its look parts from the pictures`: a part a little out of place takes another's colour
  (a strap's texels reading the case behind it). Look at that view beside the picture and move the part.
- `WARN its pictures look unlike nine in ten of Valve's models'`: a picture with more near-white texels than
  Valve's (over 23%), more strongly coloured ones (over 30%), brighter on the whole (over 0.61), or with little grain
  (under 0.048), each against 287 textures of Half-Life's own models. Clean whites, toy colours and flat paint read as
  The Sims, not GoldSrc: a painted or manufactured white there (a fridge, a wall, a sign) is a used grey of 0.5 to
  0.6, its colours muted, its surfaces worn. Give tones nearer Valve's and the materials a photograph (`picture`).
  What is white by what it is stays white: the scientist's lab coat is 70 to 100% near white at 0.8 to 0.94, so a
  copy of a white garment keeps its original's white and the warning is read and left. Not told of pictures
  projected from the person's.
- `WARN N% of its triangles stretch past 3 times their length in motion`: on a character, a surface whose corners hang
  on several bones is pulled apart in the base's runs and walks, between the bones it names. A garment carved or
  blended into one surface with the limbs under it (a coat, a robe, a skirt) tears so: carve the garment alone
  (`clip` at its hem) and build the limbs under it as parts of their own, as the game's own characters are made.
- `WARN ... no outline from any side changes with it`: a part that, seen from every side at the size the game shows
  it (2 cells a unit), adds next to nothing to the outline, and costs more than 24 triangles. Valve keeps such a
  piece only as a few flat triangles (a lens in front of the face, teeth, a sole: 24 at most) and paints the rest:
  a tie, a belt, buttons, the folds of cloth (`research/paint-or-geometry.md`). Paint it on the part it lies on
  (`print`, `marks`, the material's detail), give it `paint: true`, or make it a few flat triangles. A part buried
  in another (a hand inside its sleeve) is said so too.
- `FAULT height ... where the spec asks`: the size is not what was asked.
- `fact from the lowest part up`: each part's height from and to. A roof under a floor is a stack built
  upside down.
- Then `PARTS`: every part's triangles and its box in the model's space.

The pictures: six sides of it; with `focus`, those parts close from the front, the back and below (a light
under a housing shows only from below); with `reference`, the person's picture beside a view of it.

## A video

A video of the kit's models and maps, for sharing: shots one after another, each a camera move drawn frame by
frame and checked for smoothness, previewed as a contact sheet before it is made.

```json
{
  "spec": "smak.video/1",
  "name": "showcase",
  "size": [960, 540], "fps": 30,
  "shots": [
    { "kind": "title", "seconds": 2, "text": "LAMP POST" },
    { "kind": "turntable", "model": "lamp.mdl", "seconds": 6, "pitch": 10, "caption": "lamp, 210 triangles" },
    { "kind": "flyover", "map": "square.bsp", "seconds": 8, "height": 600, "turns": 0.5 },
    { "kind": "walk", "map": "square.bsp", "from": "info_player_start", "to": "weapon_shotgun", "speed": 200 }
  ]
}
```

| kind | what it draws | fields |
| --- | --- | --- |
| `title` | words on a plain ground | `text`, `seconds` |
| `turntable` | the model turning on the spot, at one scale over the shot | `model`, `seq` (played as it turns), `turns` (1), `from` (20), `pitch`, `zoom`, `body`, `skin` |
| `sheet` | the six-sided sheet, playing an animation | `model`, `seq` |
| `animations` | animations one after another, from one camera | `model`, `seqs`, `each` (seconds), `view` (`side` with `ground`) |
| `flyover` | the map from above, circling its middle | `map`, `height` (400), `turns` (0.5), `from`, `fov` |
| `walk` | through the map at a player's eye, along the walk test's way | `map`, `from` and `to` (entities by class, name or number), `speed` (160), `eye` (64) |
| `path` | a camera along keys, eased at its ends | `map`, `keys: [{ t, at, look ([x, y, z] or ahead), fov }]` |

Every shot takes `seconds` (unless its path says), `caption`, and for a map `brightness`, `fov`, `entities`.
`smak build showcase.json --preview` draws a contact sheet of four frames a shot (`showcase-sheet.png`) and no
more: look at it first. Without `--preview` it draws every frame, tells each shot's change from frame to frame
(a FAULT for a frame that jumps, or an eye in a wall) and writes `showcase.mp4` (H.264, through ffmpeg) or a GIF
(`format: "gif"`, or when there is no ffmpeg on the PATH), under -o (beside the spec unless told). The models
and maps a shot names are read from beside the spec; `--game` the folders their textures are found in.

## Textures for maps (a .wad)

```json
{
  "spec": "smak.wad/1",
  "name": "lab.wad",
  "materials": { "panel": { "base": "metal", "tone": [0.55, 0.57, 0.6] } },
  "textures": [
    { "name": "lab_wall1", "size": [128, 128], "material": "panel", "grime": 0.5,
      "panels": [{ "at": [64, 96], "size": [112, 48], "edge": 2 }, { "at": [64, 30], "size": [112, 40], "style": "raised" }],
      "print": { "text": "B-12", "size": 0.12, "ink": [0.8, 0.6, 0.1] } },
    { "name": "{lab_grate", "size": [64, 64], "material": { "base": "mesh", "cell": 8 } }
  ],
  "preview": { "map": "lab.bsp", "views": 6 }
}
```

A texture of a compiled map that a picture shows on its wall, as the map's place view draws it (`texturePlaces`,
`placeView`: the picture a textures leg is given), may be taken off that picture: `"lift": { "map":
"frenzy.bsp", "view": "pictures/c3a1b_w1.png" }`. Each pixel is told which texel of the wall it shows
and the light it was seen in, and the texel is its colour over that light; what the view does not show is the part
it shows repeated; with `"views": "pictures/views.png", "cameras": "pictures/views.json"` (a sheet of the
map's views and each tile's camera, as `viewsOf` drew them) the texels those show are taken too. The build says the
share of texels seen, the share white in the view (a lamp's colour is not there to read) and the share under a light
of one strong colour (a blue lamp leaves a teal wall's red and green too dark to divide back): use it on every
texture whose view is neither white nor tinted there, however little of it the view shows. A lamp's face is white at
the place view's brightness: drawn again darker (`placeView(bsp, place, { brightness: 0.5 })`), it is lifted with
`"brightness": 0.5` (frenzy's lamps came back within 2.5 to 9 of delta E, against 28 to 46). Paint only what no view
gives (a wall under a coloured lamp). A wall seen sparsely (far off, a pixel every few texels) has the gaps
between its seen texels closed from them before the rest is filled. On frenzy, a texture seen at 5% to 40% came back within 2 to 5 of delta E of the game's colour (a copy is
held to 15), where makers who painted those instead missed by 21 to 32; what a small view lacks is a pattern
larger than what it shows (a row of studs), which the map's views often add.

A texture may be made from another above it in the spec, `"from": "-0genpipe1"` or `{ texture, brightness, flip,
shift }`: that one's picture, dimmed or brightened (`brightness`, a multiple: 0.4 a lamp switched off), flipped (`"x"`,
`"y"`), shifted (`[x, y]` texels, wrapping) and fitted to its own size. A random set's other tiles (`-1`, `-2` beside
a lifted `-0`) and an animation's other frames (a lamp's `+a`) are not on the map's faces to be lifted: made apart they
do not match their set, made from it they do.

Each texture is a material laid seamlessly (one texel a unit, as a map draws it), with `panels` and `print`
as a box face has them (in texels from the bottom left) and `grime` (0 to 1) gathered toward its foot. `wear`
makes it a used surface and not a fill: `{ "stains": 0.6, "streaks": 0.5, "cracks": 0.4, "scratches": 0.3,
"speckle": 0.8 }`, each 0 to 1 (`seed` another pattern), every layer tiling with the texture. `relief` raises
machinery over it, lit from the top left with the dark of a recess round what stands out, each part in texels
from the bottom left with a `material` of its own where it has one: `{ "kind": "pipe", "path": [[0, 100],
[128, 100]], "radius": 6 }` (bends where the path turns), `bars` (`at`, `size`, `count`, `width`, `axis`: a
grille over a dark hole), `louvre` (`at`, `size`, `count`), `rivets` (`from`, `to`, `count`, `radius`), `seam`
(`from`, `to`, `width`, `notched`: a groove) and `lamp` (`at`, `size`, `colour`: a lamp's face bright in its
middle; name the texture with `~` and light it with the map's texture lights). A game's concrete
has grit all over it (`speckle`: specks two to four texels across) and blotches (`stains`); its machinery,
streaks and scratches.
A plain fill reads as flat beside it; every material is painted with some patches and grain already, and the
report warns, as a map's does, of a texture brighter, more coloured, more even or noisier than nine in ten of
Valve's ("Materials"). A material may take a photograph (`picture`, with `filter`, `rect`, `size`, `tile`: "A
material from a photograph"), read from beside the spec: its detail under the texture's panels
and print (`valve`), or the photograph itself (`literal`, `aged`) as a sign or a mural. A name
is one word of 15 letters at most and its first letters mean what a map's do (`{` holes, `!` a liquid, `+0` an
animation's first frame, `-0` the first of random tiles); sides are multiples of 16, 512 at most. The build
writes the .wad and a sheet of its textures. With `preview.map`, a compiled map beside the spec is
drawn wearing them: textures of the same names stand in for the game's, the way a mod replaces a game's look,
and the report names the textures the map wears that the .wad does not have. With `preview.each: true` as well,
each texture is drawn on its own place in the map, its largest face lit in every colour, from the camera and at
the brightness (4.5) a reproduction test's judge looks from: set it beside a picture of the original's place.
For each, the report says how many texels the view spans across (its scale), how far the picture's top is
turned from up or north on that face (the map may turn it), and the light on the face, `[r, g, b]`, which a
colour read off such a view is the paint times, and what yours reads as in the middle of that view (`yours reads as
RGB ...`): a colour someone read off a picture of the original's place is set beside that, not beside the paint. A texture the map keeps inside itself is the one the game
wears; the report says so. `smak map-view --wad`, `map-views` and `map-plan` draw any map wearing one.

## Materials

`base` is one of: `wood`, `darkwood`, `planks`, `iron`, `steel`, `brass`, `gold`, `copper`, `leather`,
`cloth`, `rope`, `stone`, `marble` (polished stone clouded and crossed by veins that wander on a slant, `vein` their
colour, `veins` how many, `scale` its clouds in units, 48; with `cell` laid as tiles; let be bright and coloured, a
bank's cream and green), `brick`, `plaster`, `tile`, `metal`, `grass`, `dirt`, `glass`, `flame`, `neon`,
`hazard` (stripes of its tone and black), `flat` (its tone and nothing else: no grain, patches or wear, as the game's own BLACK and YELLOW are; a plain colour a person asks for), `leaves` (pointed leaves on two layers with holes between, a masked texture: a crown's `cards`; `cell` a leaf's size in units, 2.5, `fill` the share of places that hold one, 0.75), `asphalt`, `water`, `paint`, `bone`, `door` (maps: a panelled door with
its handle, fitted to the leaf), `mesh` (a net, a wire fence,
a grille: cords in its tone with holes between, seen through as in the game; `cell` the holes' size, 2;
`weave: "diamond"` runs the cords on the diagonals, as chain-link's do). `tone: [r, g, b]` (0 to 1)
changes its colour, or words: `"tone": "dark warm grey"` (the XKCD colour survey's 949 names, with `dark`,
`light`, `pale`, `muted`, `bright`, `deep`, `warm`, `cool`, `grimy` and `-ish`). A colour read off a picture is
lighter or darker than its paint by the picture's light: give it as `seen` (`"seen": [0.4, 0.38, 0.35]` or
words) and the build takes the paint as the colour over the pictures' light (0.8); read off a view of a map,
give the light the preview reports for that face as well (`"seen": { "colour": [0.4, 0.3, 0.2], "light": [1.1,
1.05, 0.9] }`), and the paint is the colour over it, channel by channel. A pattern's size, in texels of its
picture (made to divide it, so that it tiles): `cell` a `tile`'s or a `metal` panel's (32, or `[w, h]`),
`course` and `length` a `brick`'s (16 and 32), `board` a plank's width (16), `stripe` and `angle` a `hazard`'s
stripe width and slant (1.06 at 45 degrees). `rust` (0 to 1) a metal's rust; `flags: ["fullbright"]` makes it shine in the dark
(`flame` and `neon` are so already; such parts get a texture of their own).

A map's pictures are painted as used surfaces, as Valve's are: patches a little lighter and darker, each tile and
panel a tone of its own with its bevel lit from the top left, and a soft grit two to four texels across (not glass,
flames, neon or water). Pick tones within Valve's: nine in ten of Half-Life's walls and floors are no brighter than
0.57 and no more coloured than 0.18 (a pixel's highest channel less its lowest), and half are under 0.33 and 0.08.
A white wall is 0.55 to 0.6 there, not 0.9: the game's light brightens it again. A pale tone keeps less of a
wood's grain, as paint over it does. The report warns of each of the map's own pictures past nine in ten of Valve's
(`WARN N of the map's own textures look unlike...`), saying which way: brighter, more coloured, too even, little
grain, or grain that is noise (texels unlike their neighbours: static, not a material). Grain and patches are
held to Valve's of the material's kind (their wood is grainier than their concrete). Snow and bone may be bright,
and brass, gold, copper, leather, rope, `paint` and `hazard` coloured. The softest bases (cloth, dirt, grass,
paint, snow...) have less texel contrast than nine in ten of Valve's and say so: a photograph gives them more.

### A material from a photograph

Valve's textures are photographs cut down: their fine detail is the material's own. Give a material a photograph
(a map's, a .wad's or a model's) and its picture is made from it:

```json
"textures": {
  "wall": { "base": "plaster", "picture": "refs/plaster.jpg", "size": 96 },
  "front": { "base": "door", "tone": "dark green", "picture": "refs/painted_planks.jpg" },
  "notice": { "base": "paint", "picture": "refs/notice.png", "filter": "literal", "size": [32, 48] }
}
```

- **Getting one.** Search the web for a photograph of the material seen straight on and evenly lit (plain white
  plaster wall, raw plywood, poured concrete, a painted panel door), and save it beside the spec (`refs/`), named
  for what it is. Texture sites that give scans away (Poly Haven, ambientCG: CC0) say their real size; a photo of a
  wall from a few steps away works too. PNG, BMP or JPEG (baseline or progressive).
- **A picture the person gave of the thing itself** (the door they want, the sign, the wall in their photo) is
  used as it is: `literal`, or `aged` to sit among Valve's, cropped to it by `rect`. They want it to look as their
  picture does, and a material redrawn from a photo of something like it does not. Whether they may use their
  picture is theirs to know, not the kit's to decide; a game's own files are still never put in anything shared
  (AGENTS.md, rule 7).
- `picture`: its path in the work folder (`refs/oak.jpg`) or beside the spec. Any base takes one but `mesh`.
  On a model it is laid over each part that wears the material at its real size (`size`, as for a map), at 4 texels a
  unit, in place of the base's own painted grain: a sofa's leather, a fridge's chipped enamel, a cabinet's worn
  wood. A plain painted base on a model reads as a toy; Valve's props are photographs too. Pictures of the thing
  itself, from its sides, are `project`'s (below).
- `filter`: what is done with it.
  - `valve` (unless told): the material's detail. The largest part of the picture that is one material is taken
    (or `rect`), its broad light divided out, laid one texel a unit at its real size, made to tile, its mean colour
    made the `tone` (the base's own unless told), and its grain, patches and colour moved into the range of Valve's
    textures of that kind. Then the base's own structure is drawn over it with no grain of its own: a door's frame,
    panels, bevels and handle; a tile's grout and bevels; bricks' courses; planks' seams; metal's panels. Use it for
    a surface: a wall, a floor, a door's wood or paint. A picture with a pattern of its own (tiles, bricks) doubles
    the base's: give it to `plaster` or `stone`, or use `aged`.
  - `literal`: the picture itself, cropped by `rect` and laid over the texture, nothing changed: a sign, a poster,
    a mural, a photo of one particular door. Made to tile only with `"tile": true`. It is not held to Valve's look.
  - `aged`: the picture's content as `literal`, its light flattened and its grain, patches, colour and brightness
    moved into Valve's range: a person's photo of a tiled floor, a brick wall or a door made to sit among Valve's
    textures, its pattern its own.
- `rect`: `[x0, y0, x1, y1]`, the part of the picture to take, in its pixels (a door in a photo of a street).
- `size`: the units of the game the picture's part spans across (or `[width, height]`), a unit about an inch: a
  door 36 wide, a sheet of plywood 48, a metre 39. For `valve` it sets the scale of the detail (unless told: about
  a photo of a surface of that kind, 48 for wood to 128 for ground); a part smaller than the texture repeats, so
  take a photo of more of the surface where the repeat shows. For `literal` and `aged` in a map it is the texture's
  own size (a 32 by 48 poster); in a .wad the texture's `size` is, and `size` makes the picture repeat within it.
- The report says what was done to each (`fact texture SM_WALL: valve: 1451x1963 of the picture at 341,85 ..., as
  79 across units, 2 by 1 times; its light divided out, made to tile; grain x2.33 ...`): look at the sheet, and
  give a `rect` when the part it took is not the material.

## A map

A map spec (`smak.map/1`) is in `docs/SPEC-MAPS.md`: rooms laid out by words, a floor plan, buildings in the open,
links, prefabs, modules, a mod's map and The Specialists', a building in another map, and what the report says.
