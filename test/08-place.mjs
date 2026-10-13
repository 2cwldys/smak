// Working by place: painting a model by where a point is on its body, finding its loose pieces and taking
// one off, and moving a mesh to another model by its bones' names.
import * as smak from "../src/index.mjs";
import { test, sure, near, poseGap, knife } from "./helper.mjs";

test("paint colours the model by place, and says what is shared", () => {
  // the model's surface: one entry a triangle, each with a unit normal
  const surface = smak.surface(knife.mdl);
  sure(
    surface.length === knife.piece.tris.length && Math.abs(Math.hypot(...surface[0].n) - 1) < 1e-6,
    "surface",
  );

  // the place on the surface nearest a point 5 units past the knife's tip is near the tip
  const farthestX = surface.reduce((most, face) => Math.max(most, face.p[0]), -1e9);
  const atTheTip = smak.spot(surface, [farthestX + 5, 0, 10]);
  sure(atTheTip && atTheTip.p[0] > farthestX - 1.5, "spot");

  // the last 3 units of the blade painted red, the rest left as it is
  let calls = 0;
  const { mdl: redTipped, shared } = smak.paint(knife.mdl, ({ p, rgb }) => {
    calls++;
    return p[0] > farthestX - 3 ? [1, 0, 0] : rgb;
  });
  sure(calls > 500 && "knife.bmp" in shared, `${calls} pixels`);
  sure(redTipped.length === knife.mdl.length, "same size: written in place");
  sure(!smak.check(redTipped).errors.length, "check");

  // how many pixels of a model's first texture are red
  const redPixelsOf = (mdl) => {
    const texture = smak.textureOf(mdl, 0);
    let count = 0;
    for (const index of texture.pixels)
      if (texture.palette[index * 3] > 200 && texture.palette[index * 3 + 1] < 60) count++;
    return count;
  };
  sure(redPixelsOf(redTipped) > 20 && redPixelsOf(knife.mdl) === 0, `${redPixelsOf(redTipped)} red pixels`);
  sure(smak.paint(knife.mdl, () => undefined).mdl.equals(knife.mdl), "nothing returned changes nothing");

  // the workshop's noise and its random numbers give the same answer for the same input and seed
  near(smak.workshop.fbm3([1, 2, 3], 0.5, 4), smak.workshop.fbm3([1, 2, 3], 0.5, 4), 0, "fbm3");
  const random = smak.workshop.seeded(5);
  const sameSeed = smak.workshop.seeded(5);
  sure(random() === sameSeed() && random() < 1, "seeded");
});

test("pieces finds the loose parts and dropTriangles takes one off", () => {
  // the knife's pieces (pommel, grip, guard, blade ...) between them hold every triangle
  const pieces = smak.pieces(knife.mdl);
  sure(
    pieces.list.length >= 3 &&
      pieces.list.reduce((sum, piece) => sum + piece.tris, 0) === knife.piece.tris.length,
    `${pieces.list.length} pieces`,
  );

  // the largest piece taken off: its triangles are gone and nothing else is
  const largest = pieces.list.reduce((most, piece) => (piece.tris > most.tris ? piece : most));
  const { mdl: withoutLargest, gone } = smak.dropTriangles(
    knife.mdl,
    (triangle) => pieces.of(triangle) === largest.id,
  );
  sure(
    gone === largest.tris &&
      smak.posed(withoutLargest).tris.length === knife.piece.tris.length - largest.tris,
    `${gone} gone`,
  );
  sure(!smak.check(withoutLargest).errors.length, "check");
  sure(smak.dropTriangles(knife.mdl, () => false).gone === 0, "none");
  near(
    poseGap(smak.poseAt(withoutLargest, 1, 6), smak.poseAt(knife.mdl, 1, 6)),
    0,
    1e-9,
    "the animation is untouched",
  );
});

test("graft moves a mesh to another model by its bones' names", () => {
  // the same bones under other numbers, with a small thing on the hand
  const ringShape = smak.workshop.shape(64, 64);
  ringShape.lathe(
    [
      [9, 0.6],
      [11, 0.6],
    ],
    { x: 2, y: 2, w: 60, h: 60 },
    { sides: 5, caps: [true, true] },
  );
  const ringTexture = smak.indexed(
    { width: 64, height: 64, rgb: new Uint8Array(64 * 64 * 3).fill(200) },
    "ring.bmp",
  );
  const ringMdl = smak.buildMdl({
    name: "ring.mdl",
    bones: [
      { name: "spare", parent: -1 },
      { name: "arm", parent: -1, pos: [0, 0, 10] },
      { name: "hand", parent: 1, pos: [8, 0, 0], rot: [0, 0, 0.3] },
    ],
    bodyparts: [
      {
        name: "body",
        models: [
          {
            name: "ring",
            meshes: [
              {
                tris: ringShape.tris.map((triangle) =>
                  triangle.map((corner) => ({ ...corner, bone: "hand" })),
                ),
                texture: ringTexture,
              },
            ],
          },
        ],
      },
    ],
  });

  // the ring's mesh added to the knife: one mesh and one texture more, and the model still fit
  const knifeWithRing = smak.graft(knife.mdl, ringMdl, (mesh) => mesh.texture.name === "ring.bmp");
  const info = smak.readMdl(knifeWithRing);
  sure(
    info.textures.length === 2 && info.bodyparts[0].models[0].meshes.length === 2,
    "one more mesh and texture",
  );
  sure(!smak.check(knifeWithRing).errors.length, smak.check(knifeWithRing).errors.join("; "));

  // "hand" is bone 2 in the ring's file and bone 1 in the knife's: the corners went by the name
  const addedMesh = smak.readMesh(
    knifeWithRing,
    info.bodyparts[0].models[0],
    info.bodyparts[0].models[0].meshes[1],
  );
  sure(
    addedMesh.length === ringShape.tris.length &&
      addedMesh.every((triangle) => triangle.every((corner) => corner.bone === 1)),
    "on the bone called hand",
  );
  // the box, at rest, of what a model draws with the ring's texture
  const ringBoxOf = (mdl) =>
    smak.box(
      smak
        .posed(mdl, { seq: null })
        .tris.filter((triangle) => triangle.tex.name === "ring.bmp")
        .flatMap((triangle) => triangle.c.map((corner) => corner.p)),
    );
  near(ringBoxOf(knifeWithRing).mx[2], ringBoxOf(ringMdl).mx[2], 1e-3, "in the same place");

  // a target with no bone called hand (a model built with no bones given)
  let threw = false;
  try {
    smak.graft(
      smak.buildMdl({
        name: "x.mdl",
        bodyparts: [
          {
            name: "b",
            models: [{ name: "m", meshes: [{ tris: knife.piece.tris, texture: knife.texture }] }],
          },
        ],
      }),
      ringMdl,
      () => true,
    );
  } catch {
    threw = true;
  }
  sure(threw, "a missing bone is refused");

  // the two side by side in one picture, 320 across from cells 80 wide
  const sideBySide = smak.lineup(
    [
      ["a", knife.mdl],
      ["b", knifeWithRing],
    ],
    { width: 80, height: 100 },
  );
  sure(sideBySide.width === 320 && sideBySide.height === 100, "lineup");
});
