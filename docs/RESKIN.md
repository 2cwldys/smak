# Re-skins: a model's pictures changed, repainted by rules, worn and dressed

The model keeps its bones, bodies, animations and events, and its pictures change: recoloured, replaced by
one painted elsewhere, re-skinned by rules in one step, weathered and marked by place, or dressed in a
garment painted over the old picture with layers and passes. The rules that keep a model working
(`AGENTS.md`) hold here too; how a model is put together is in `docs/MODELS.md`. Each recipe that has a runnable example in `examples/` names it. Read the example first; it is the template.

## A new texture on an existing model (reskin): `examples/03-reskin.mjs`

The least risky change. Three ways, cheapest first:

```js
import { readFileSync, writeFileSync } from "node:fs";
import { textureOf, replaceTexture, textureFrom, check } from "./smak/src/index.mjs";

const src = readFileSync("v_knife.mdl"), old = textureOf(src, "knife.bmp");
// 1. the palette alone: every pixel keeps its place
const dark = replaceTexture(src, "knife.bmp", { ...old, palette: old.palette.map((v) => Math.round(v * 0.6)) });
// 2. a picture painted elsewhere (PNG or BMP, any size): corners are moved to match a new size
const mine = replaceTexture(src, "knife.bmp", { ...textureFrom(readFileSync("painted.png"), old.name), flags: old.flags });
```

Before painting, run `smak uv` to see which part of the picture each part of the shape takes its colour from.
To paint by rule, turn the texture into an image (`rgbOf({ width, height, rgba: rgbaOf(old) })`), change its
`rgb`, and bring it back with `indexed(image, old.name)`. A masked texture (flag 64) goes through `masked` so
that its holes stay holes.

## A re-skin by rules: a game's monster in new colours, in one step

The person's monsters are re-skins: a game's model (or a bought rigged body) with its bones, bodies, animations
and events kept, its pictures repainted. `reskin` does it from a list of rules, each one thing on some pixels:

```js
import { readFileSync, writeFileSync } from "node:fs";
import { reskin, check, png } from "./smak/src/index.mjs";

const src = readFileSync(".../msc/models/monsters/skeleton.mdl");
const PLATE = ["front.bmp", "helmet2.bmp", "shoe.bmp", "arm.bmp"];
const { mdl, changed, pictures } = reskin(src, [
  { only: PLATE, light: [0.1, 1], recolour: [0.2, 0.205, 0.215] },          // bright steel made old iron, its shading kept
  { only: ["helmet2.bmp"], hue: [15, 65], sat: [0.15, 1], recolour: [0.3, 0.22, 0.11] },   // brass to bronze
  { only: ["zombie5.bmp"], box: [120, 0, 205, 140], hue: [160, 210], recolour: [1, 0.6, 0.16] },   // cyan eyes amber
  { only: PLATE, sat: [0, 0.2], rust: 0.6 },                               // rust in patches and streaks, by place
  { only: PLATE, moss: 0.5 },                                              // moss on what faces up and low down
  { only: ["front.bmp"], soft: 2, paint: ({ u, v }) => (Math.abs(u - 56) < 27 && v > 37 ? [0.17, 0.25, 0.17] : undefined) },
], { body: 40 });
for (const { name, image } of pictures) writeFileSync(`${name}.png`, png(image.width, image.height, image.rgba));
console.log(changed, check(mdl, "goldsrc", { source: src }).warnings);   // what the original has too is marked inherited
```

- A rule's filters read the colour the picture HAD (`hue`, `sat`, `light`, `box`) and the place of the body
  (`near`, `above`, `below`, `facing`), so a later rule still finds the brass after an earlier one darkened it.
  `colourOf(rgb)` gives a pixel's hue, saturation and light to choose ranges by; `smak textures` and `smak
  islands` show where things are.
- Order matters: weather first, then what is painted over it (a tabard), then a little weather again on it.
- **A part a picture shares with others** (the game's skeleton_boss1 lays one rust over every plate: chest, arms,
  greaves and helm wear the same pixels) cannot be marked alone until it has pixels of its own:
  `ownPixels(src, { islands: 172 })` moves that island's triangles to a copy of the pixels they wore, in a texture
  of their own (`rust16_own.bmp`; made smaller when the box is over 512). In `reskin`, `own: [{ islands: [172] }]`
  does it first, and a rule says `only: ["rust16_own.bmp"]`. The islands are numbered again afterwards (the moved
  ones last): read them again before choosing by id.
- From the command line: `smak reskin skeleton.mdl rules.mjs -o guard.mdl --pictures pics` (a `.mjs` that exports
  `rules`, and `body`, `own`; or a `.json` of the same without functions). It prints which textures changed and
  checks the result against the original.
- A new animation for a re-skin is often in the game's own frames: `smak sequence-add boss.mdl --from sitstand
  --frames 80-57 --name kneel_down --fps 25 -o out.mdl` (`addSequenceFrom` in a script).
- docs/API.md, "A re-skin by rules", lists every word of a rule.

## Wear, damage and markings by place: `examples/05-by-place.mjs`

A character has several textures and a wound, a burn or a layer of mud crosses them. `paint` calls your function
for every pixel that some triangle wears, with the point of the body that pixel colours:

```js
import { paint, surface, spot, workshop as W } from "./smak/src/index.mjs";   // or fbm3, step, mix, times by name

const pose = { seq: "idle", frame: 0 };                       // measure in a pose the model is usually seen in
const surf = surface(src, pose), hit = spot(surf, [20, 0, 50], [1, 0, 0]);        // the place on its front nearest that point
const { mdl, shared } = paint(src, ({ p, n, rgb, tex }) => {
  const d = Math.hypot(p[0] - hit.p[0], p[1] - hit.p[1], p[2] - hit.p[2]);
  const soot = Math.max(0, W.fbm3(p, 0.3, 7) - 0.6) * 5;      // noise in space: the same on both sides of a seam
  return W.mix(W.mix(rgb, [0.05, 0.05, 0.05], Math.min(1, soot)), [0.02, 0.02, 0.02], d < 0.6 ? 1 : 0);
}, { pose });
```

- `p` is in model space (units; `+z` up), `n` the way the surface faces, `rgb` the colour there now, 0 to 1.
  Return nothing to leave a pixel alone. The function is also told where it is in the model's own terms: `bone`
  (the name of the bone the point follows), `where`, `body` and `tri` (its mesh, body number and triangle),
  `tex`, `u`, `v` (the pixel) and `island` (the patch of the picture it is in), and what the picture was there before
  any painting (`orig`, `busy`, and the `layers` you declare): see the next recipe.
- Make stages by building each from the **original** with more in the function, not by painting over the last.
- **Read `shared`.** It gives, for each texture, the share of its pixels that two places of the body both wear.
  Arms, legs and gear are often mirrored like that: a mark on the left shows on the right. Tell the person when a
  one-sided mark they asked for cannot be one-sided. Trousers and torsos are usually not shared.
- Textures keep their size and are cut back to 256 colours each, once a call. A masked texture keeps its holes.
  Painting the result again cuts it again: for several layers give one call a list of passes (next recipe).
- The palette alone (recipe "A new texture") is still the way to change a colour everywhere: a team colour, a
  camouflage. Turn only the colours that are clearly coloured and leave the greys, or the reverse.

## A garment or a plate over an old picture: layers, then passes, with soft edges

How a game adds an armour or a uniform: the same body again as a new body, wearing a texture of its own that
begins as a copy of the old one. Two things say where paint goes. The picture of a body is cut into **islands**
(the trunk's front, its back, a sleeve, a boot), and a garment belongs on some of them. And the old picture says
what each pixel **is** (mail, plate, a strap, a rim line): you declare that once, as **layers**, and every pass
reads them, however much the passes before have painted over.

Three steps, each with a picture to look at before the next.

**1. The body and its islands.**

```js
import { copyBody, uvIslands, layersOf, layerMap, paint, textureOf, png, workshop as W } from "./smak/src/index.mjs";

const base = copyBody(src, "armor", "orchard", { ...textureOf(src, "armor1.bmp"), name: "orchard.bmp" });
const body = 40, pose = { seq: 0, frame: 0, body }, TEX = "orchard.bmp";          // its number: `info` lists it, after the bodies that were there
const mine = uvIslands(base, pose).list.filter((e) => e.tex === TEX && e.uses.some((u) => u.body === body));
const FRONT = mine.find((e) => e.tris > 50 && e.bones[0].startsWith("Bip01 Spine") && e.n[0] > 0.5).id, LEGS = mine.find((e) => e.tris > 60 && e.bones.some((b) => /Leg$/.test(b))).id;
```

`smak islands base.mdl --body 40 -o dir` draws them numbered and lists their ids, boxes, bones, places and the
way each faces; `uvIslands(src, pose).list` is the same list for a script. Choose by `id` read off the picture,
or by `tex`, `bones`, `mid`, `n` (`n[0] > 0.5` looks forwards) and `tris`. An island that two bodies lay on the
same pixels counts its triangles for both in `tris`; `bodies` has the count for each.

**2. The layers, declared from the old picture, and looked at.**

```js
const lum = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
const LAYERS = {
  mail: { fn: ({ busy, blur }) => busy(3) > 0.25 && lum(blur(5)) > 0.05, drop: 90, smooth: 3 },       // told by its texture, not its colour
  leather: { fn: ({ rgb: [r, g, b] }) => r > g + 0.05 && lum([r, g, b]) < 0.3, blur: 2 },
  plate: ({ rgb, layer, dist }) => dist.mail < -1.5 && layer.leather < 0.2 && lum(rgb) > 0.2,         // a later layer reads the ones before it
  strap: ({ rgb, layer, island, v }) => island === LEGS && v > 400 && layer.mail < 0.5 && lum(rgb) < 0.12,
  buckle: ({ rgb, island, v }) => island === LEGS && v > 400 && rgb[0] > rgb[2] + 0.08 && lum(rgb) > 0.2,
};
const L = layersOf(base, LAYERS, { pose, tex: TEX }), map = layerMap(base, TEX, L);
writeFileSync("layers.png", png(map.width, map.height, map.rgba));                 // look at it before painting
// things found by rule, with their place on the body: each buckle, and the strap it sits on
const straps = L.buckle.regions.filter((b) => b.size >= 60).map((b) => { const parts = L.strap.regions.filter((r) => r.size >= 100 && b.mid[2] > r.mn[2] && b.mid[2] < r.mx[2]); return { z0: Math.min(...parts.map((r) => r.mn[2])), z1: Math.max(...parts.map((r) => r.mx[2])), at: b.centre }; });
```

- A layer is a number from 0 to 1 a pixel, from a function of what `paint` hands its own (`rgb`, `p`, `island`,
  `u`, `v`, `edge`, `blur`...) or from an image (`{ image }`: a mask painted by hand). It is made from the
  picture **as it was**, over every pixel the pose's triangles wear.
- **`busy(r)`** measures local contrast: about 0.03 on smooth plate, 0.35 on mail's chequer. Mail and plate are
  often the same grey; their texture tells them apart.
- **Clean a layer where you declare it**: `blur: 2` softens it (with `over: "lit"`, counting only the pixels of
  that earlier layer, so that it does not fade into a black shadow), `drop: 90` takes out regions under 90 pixels (a
  belt hole is not mail), `fill: 20` closes pinholes, `smooth: 3` straightens its boundary so that a rim drawn
  beside it is one even line.
- **Try a rule before writing it down**: `smak layers base.mdl "mail=busy(3)>0.25" "dark=lum<0.12&&!layer.mail"
  --texture orchard.bmp --body 40 -o try.png` draws the layers tinted over the texture and lists every region
  with its box, centre, size and place on the body. With the declarations in a module of their own
  (`export const layers = {...}`), `smak layers base.mdl layers.mjs -o l.png` draws the very ones the script
  paints with.
- **Regions** (`L.strap.regions`) are a layer's connected patches: `size`, `box` and `centre` in pixels, `mn`,
  `mx`, `mid` in model space. Find a thing by what it is and where it is ("the dark patches behind the knee,
  between z 11 and 14"), never by a pixel measured off a picture: the rule survives another model.

**3. The passes.**

```js
const TAN = [0.74, 0.57, 0.33], LINE = [0.08, 0.04, 0.03], PLUM = [0.19, 0.09, 0.14], copper = (l) => W.mix([0.09, 0.05, 0.03], [0.8, 0.59, 0.35], l);
const { mdl, shared } = paint(base, [
  // 1. the ground: cloth where the old picture has mail, metal elsewhere, lit by the plate's own light (no mail or rim in the sum)
  ({ rgb, blur, layer }) => (layer.mail > 0.5 ? W.times(PLUM, 0.6 + 1.6 * lum(blur(5))) : layer.leather > 0.5 ? W.times(rgb, 0.8) : copper(lum(blur(5, { within: "plate", orig: true })))),
  // 2. a pale rim on the plate's side of the mail's edge, a dark line inside it: one expression on the distance
  { soft: 3, fn: ({ dist }) => (dist.mail > -2 && dist.mail <= 0 ? TAN : dist.mail > -3 && dist.mail <= -2 ? LINE : undefined) },
  // 3. a mark on the chest, by place, kept clear of the rim
  { soft: 3, islands: [FRONT], fn: ({ p, dist }) => (dist.mail < -4 && Math.hypot(p[1], p[2] - 55) < 2 ? [0.35, 0.06, 0.04] : undefined) },
], { pose, only: [TEX], layers: L, islands: mine.map((e) => e.id) });
```

- **`layer.mail`** is the layer at the point asked about; **`dist.mail`** how far that point is from the layer's
  edge in pixels, **over 0 inside it and under 0 outside**: `0 < d && d < 2` is a band just inside the edge,
  `-2 < d && d < 0` one just outside. `region.mail` is the id of the region there. `layerAt(name, u, v)` and
  `distAt(name, u, v)` read any other pixel; `distSmooth(name, r)` is the distance averaged, when the layer was
  not declared `smooth`.
- **Passes.** A list in place of the function: each pass sees in `rgb` what the one before left, in full colour,
  and the picture is cut to 256 colours once, after the last. A pass is a function, or `{ fn, islands, only,
  soft, pose }` where it differs from the call's options. Do not chain `paint(paint(...).mdl, ...)` for layers.
- **`orig(u, v)`** is the picture as it was before the first pass, from any pass (`orig()`: this pixel);
  `at(u, v)` and `blur(r)` see what the pass before left.
- **`blur(r)`** is the picture smoothed over `r` pixels about this one, from this island only: an old picture's
  fine detail (the "ghost" of what the cloth covers) is lost and its shading kept. `blur(r, { within: "plate" })`
  takes only pixels of that layer, `{ not: "mail" }` leaves a layer out, `{ orig: true }` smooths the picture as
  it was: so a plate's light does not go grey beside its mail.
- **`islands: [ids]`** paints those and nothing else, as `only` does for textures. Without it a rule by place
  alone spills: a skirt's rim hangs on the leg bones, and a trunk and its arms are one piece in space.
- **`soft: 3`** asks the function at 3x3 points inside each pixel and averages: the edge of any shape decided by
  `p`, `u`, `v`, `edge`, `layer` or `dist` comes out soft instead of as a staircase. It costs nine calls a
  pixel; use it on the passes that draw shapes.
- **`edge`** is how far the pixel is from its *island's* border, in pixels, and `open` the same to the nearest
  open stretch of it, where no triangle goes on across it in space (a hem, an armhole, a neckline; Infinity when
  the island has none): a hem line is `open < 2`. A layer's `dist` is for boundaries that lie *inside* an island,
  as a plate's edge against its mail does. `per` is the units a pixel covers there.
- A pixel or so past an island's border is painted too, so that no seam of the old colour shows; where two
  islands touch on the picture, that pixel is the neighbour's edge.
- `copyBody` takes the body by its submodel's name or by its body number, and the texture as a name already in
  the file, a texture, or `{ name, ...image }`. The new body's number is the old count of submodels of that
  bodypart (times the bodypart's `base`): tell the person, since the game's scripts choose bodies by number.
- Read `shared` as before, and draw the result from four sides in the pose you painted in.
