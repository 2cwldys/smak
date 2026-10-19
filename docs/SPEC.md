# Specs: a model, a map or its textures from a description

A spec is a description in plain JSON of what is to be made: its textures, a sound, a sprite, and as the rest of
Steven Linn's spec builder comes in ([stevenlafl/smak](https://github.com/stevenlafl/smak)), a model and a map.
Parts are placed by saying what they sit on, rooms by saying what they are next to; what is built is checked and
drawn, and what is wrong is said in a sentence that names it.

```
smak build lab.json                       its kind by its "spec": each file under the spec's folder
smak build lab.json -o <mod folder>       under the mod's folder
smak build hit.json --game <valve>        a sound held to the game's own of its name (docs/SOUNDS.md)
```

| `spec` | What it builds | Where it is told |
| --- | --- | --- |
| `smak.wad/1` | Textures for maps: a .wad and a sheet of them, the map drawn wearing them | below |
| `smak.sound/1`, `smak.music/1` | Sounds made of layers; a recording made a track | docs/SOUNDS.md |
| `smak.sprite/1` | A sprite of layers | docs/SPRITES.md |

The report follows the files: `ERROR` for a spec that cannot be built, `FAULT` for what the engine would do
wrong, `WARN`, `note`, then the facts; the exit code is 1 when it is not OK. Pictures a spec names (a
photograph, a map to preview on) are read from beside the spec. In a script: `buildWadSpec(spec, { out, folder,
readPicture })` in `src/spec/wad.mjs`.

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
`cloth`, `rope`, `stone`, `brick`, `plaster`, `tile`, `metal`, `grass`, `dirt`, `glass`, `flame`, `neon`,
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
