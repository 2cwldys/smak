# Figures: rigid hard-surface pieces on a game's skeleton, and the judges

A robot, a suit of plates, a machine built of pieces that each hang on one bone of a game's skeleton, and the
three judges that say whether a figure belongs to a game's manner. The functions are in `docs/API.md`
("Rigid pieces in bodyparts of their own", "The figure judges"); how a shape is made is `docs/SHAPES.md`.

## A figure of rigid hard-surface pieces on a game's skeleton

A robot, a suit of plates, a machine: many pieces, each wholly on one bone, so that nothing stretches when the
game's own animations play. Build the pieces in model space at rest from `solids` and the kitbash kit, put them
into new bodyparts with `putRigid`, and let the animations tell you what collides.

```js
// src: the game's model; knee, ankle, thigh, calf: its bones' numbers; candidatesA, candidatesB: points about the knee
import { solids as S, putRigid, findPiston, motionOverlaps, unwrap, withUV, restPose, check } from "./smak/src/index.mjs";
import { kitbash } from "./smak/kits/kitbash.mjs";

const at = (bone) => restPose(src)[bone].map((row) => row[3]);                 // a joint, in model space at rest
const shin = S.beam(at(knee), at(ankle), 2.4, 2.2, [1, 0, 0], { bevel: 0.3 });  // a solid between two joints
const bolts = kitbash("boltRow", S.place(S.at(shin.place, 0, 1.1, 0), [0, 1, 0], [0, 0, 1]), 1.2, 7);
const piston = findPiston(src, { boneA: thigh, boneB: calf, candidatesA, candidatesB });   // across the knee
const pieces = [
  { bone: calf, tris: [shin, ...bolts].flatMap(S.trisOf) },
  ...(piston.found ? [{ bone: thigh, tris: piston.cylinder.flatMap(S.trisOf) }, { bone: calf, tris: piston.rod.flatMap(S.trisOf) }] : []),
];
const layout = unwrap(pieces, { density: 3, width: 256 });                     // nets on one picture, 3 texels a unit
const { mdl, report } = putRigid(src, { pieces: withUV(pieces, layout), texture, space: "rest" });
const hits = motionOverlaps(mdl, pieces, undefined, { space: "rest" });        // pairs the animations drive together
```

- **Proportions first.** A soldier's skeleton is a soldier's: for a tall, thin robot make its legs longer and its
  shoulders narrower before any piece is laid on it, `reproportion(src, { "Bip01 L Thigh": 1.2, "Bip01 L Calf":
  1.2, "Bip01 L Clavicle": 0.8 }, { groups: sequenceFilesOf(file, src) })`. A factor is a bone's length (where the
  bones under it stand); the other side follows; the turns of every animation stay, the roots are raised so the
  feet stand where they stood and every walk's travel grows with the legs. A hit box grows along its bone and
  keeps its thickness across it, so a shorter bone is not a thinner target. The model's own body is not stretched
  (its points stay in their bones): look at it from the front and the side, then build on the new skeleton.
- **One piece, one bone, one convex solid** where you can: `motionOverlaps` measures convex pieces (a part of
  several solids is several pieces). Pairs on bones next to each other (`near`) are a joint's own parts; pairs
  on bones apart are faults to move or shrink.
- **`putRigid` keeps the model's own bodies**: its bodyparts come after them, one submodel each, as many as the
  2048 points a submodel need. Every animation and body number the game uses still works. A body the figure
  replaces (a player's own, emptied with `clearModel`) can then go: `removeBodypart(mdl, 0)` counts the numbers
  again and refuses where one the game asks for would show another body; name the file inside with
  `setModelName(mdl, "robot.mdl")`, or it keeps the original's.
- **The weight**: a figure of plates is mostly faces no one sees. Before the paint, `reducePieces(pieces, { tol:
  0.12 })` (each piece as few triangles as keep it within 0.12, under half a texel at 3 a unit), then
  `cullHidden(src, pieces, { groups })` (the faces never seen over the poses of the animations taken out, pieces
  left with none dropped): The Specialists' robot went from 7,618 triangles to 4,996. Give the pieces of a left and
  its right one `share`, so that they keep the same faces and still wear one set of texels.
- **The paint**: `unwrap` lays each piece out as its own net at one texel density (give a left and its right one
  `share`, a piece of the middle a `mirror` plane, the pieces of one limb one `net` to lay them side by side), `withUV` puts the places on the corners; paint the picture by
  place (`paint`), or bake a detailed copy onto it in Blender with `bakeMaps` where the machine has Blender.
- `findPiston` and `motionOverlaps` pose every animation the file keeps unless told; those kept in other files
  are posed when you give `groups: sequenceFilesOf(file, src)`, and listed in `skipped` when you do not: give
  them, or tell the person what was not measured.
- **The feet**: `footSlide(mdl, "walk", { groups })` says how far a walk's planted foot slides with its travel
  applied, and the lowest point of every frame: hold the figure against the model it is built on.

## Does a figure fit the game? The figure judges

Three judges hold a figure against the game's own figures (`docs/API.md`, "The figure judges"): **style** (52
measures of the model: shape, texture as laid, colour, proportions and parts told but not scored), **texture** (the
painting: repetition, flat fills, ramps, speckle, slant, charts, occlusion, value), **shape** (silhouettes from
four sides and the mesh: holes, notches, inner edges, symmetry, pieces, layers, mirror, likeness, boxes).

1. **The corpus first, once, on the person's machine**: `smak figure-survey <Half-Life folder> --mod ts` (or msc,
   halflife; `--as <name>` for a game with no profile). It measures the installed game's figures into their library
   (`~/.smak/figures.json`, or `--library`); a few minutes for the shape judge, which draws each figure. Never copy
   the library into the kit or a shared repository: it is measures of the game's files. Survey two or three games:
   the yardstick each judge tells distances in is the library's, all its figures together.
2. **Judge**: `smak figure-judge robot.mdl --mod ts`, `figure-texture robot.mdl --mod ts`, `figure-shape robot.mdl
   --mod ts`. Read the findings farthest first: each says the measure, the corpus' middle half, where on the body
   and what to do. The profile's weights make the measures that tell THAT game's manner count most. Each ends
   in a line PASS or FAIL: the style judge passes a figure at or over the lower quarter of the game's own
   figures' scores, the texture and shape judges one with no measure far out of the corpus' middle half
   (`docs/COMMANDS.md`, "Answers in text first"). A pass is the measures' word, not the owner's (step 4).
3. **A reference in the manner wanted**, when the game in development has few figures: a picture of its atlas
   (`--reference atlas.png`, its pixels a texel found or `--reference-scale 4`), masks of its figure cut from a
   screenshot (`--reference front=mask.png --reference back=...`), or a folder of its models. Hold the model in the
   reference's own pose (`--pose pose.mjs`: a module exporting `pose(src)` and the views' cameras), or holes and
   asymmetry measure the pose, not the build.
4. **Tell the person what the judge cannot**: a corpus of many hands (MSC's) lets almost anything in; a small one
   (the HD pack's seven) scores coarsely; a judge that tells two games apart may not tell a game from its remake.
   The owner's eye is the last word: draw the figure beside the corpus' nearest (the style judge's `nearest`) with
   `render` and `tile`, and show them.
