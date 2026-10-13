// Drawing a model into a picture (one view, six views, an animation's frames, a texture with its triangles),
// and the kits that make an axe and a bow.
import * as smak from "../src/index.mjs";
import { axe } from "../kits/axekit.mjs";
import { bow } from "../kits/bowkit.mjs";
import { test, sure, inked, knife } from "./helper.mjs";

// ── drawing ──

test("render, sheet, strip and uvMap draw something", () => {
  // one view of one frame of the wave, at the default size
  const oneView = smak.render(knife.mdl, { seq: "wave", frame: 6 });
  sure(oneView.width === 512 && inked(oneView) > 0.01, `render drew ${inked(oneView)}`);

  // looking straight down, the knife is seen edge on: thinner, but there
  const fromAbove = smak.render(knife.mdl, { pitch: 90 });
  sure(inked(fromAbove) > 0.005, "from above");

  // as the player sees a weapon: the eye at the origin looking along +x, the knife posed 30 units ahead
  const firstPerson = smak.render(knife.mdl, {
    view: "first",
    pose: smak.boneMatrices([{ parent: -1, pos: [30, 0, -6] }, { parent: 0 }]),
  });
  sure(inked(firstPerson) > 0.001, "first person");

  // six views of 128, three across and two down
  const sixViews = smak.sheet(knife.mdl, { size: 128 });
  sure(sixViews.width === 384 && sixViews.height === 256, "sheet");

  // four frames of the wave side by side
  const frames = smak.strip(knife.mdl, { seq: 1, count: 4, width: 96, height: 96 });
  sure(frames.width === 384, "strip");

  // texture 0 enlarged, with every triangle that wears it drawn over it
  const uvMap = smak.uvMap(knife.mdl, 0);
  sure(uvMap.triangles === knife.piece.tris.length && uvMap.width === 256 * uvMap.scale, "uvMap");
});

// ── the kits ──

test("the kits make pieces", () => {
  // an axe: a straight haft 20 long and one bit near its end
  const axePiece = axe({
    seed: 2,
    haft: {
      profile: [
        [0, 0.5],
        [20, 0.5],
      ],
    },
    bits: [{ x0: 15, x1: 19, edges: (k) => [0.4, 3 + k], thick: 0.4 }],
  });
  sure(axePiece.tris.length > 50 && axePiece.haft && axePiece.image.width === 1024, "axe");

  // a bow: a curved stave 20 long, painted by its own function, with a string
  const bowPiece = bow({
    seed: 1,
    L: 20,
    centre: (x) => 3 - (x * x) / 130,
    thick: () => 0.4,
    wide: () => 0.5,
    paint: (q) => [0.4 * q.light, 0.3 * q.light, 0.2 * q.light],
    string: { x: 19, drop: 0.2 },
  });
  sure(bowPiece.tris.length > 50 && bowPiece.rig === "nearest", "bow");
});
