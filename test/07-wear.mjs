// What is worn: measuring a piece against the body under it, moving a part between models on one skeleton,
// and drawing several models as one.
//
// The models here: a head (a ball of radius 3) on a head bone, with a small chin on a jaw bone of its own;
// and a file of helmets (a pot of radius 4, open below, lined) holding the helmet, the same helmet made for
// a smaller head, and that smaller one again with its triangles in another order.
import * as smak from "../src/index.mjs";
import { test, sure, near, inked } from "./helper.mjs";
import { workshop, plainModel, potTris } from "./fixture-pot.mjs";

// the head bone is turned so that its own +x points up: a helmet's height runs along the bone's x
const skullBones = [
  { name: "neck", parent: -1, pos: [0, 0, 50] },
  { name: "head", parent: 0, pos: [0, 0, 8], rot: [0, -Math.PI / 2, 0] },
];
const skullAndJawBones = [...skullBones, { name: "jaw", parent: 1, pos: [-2, 2, 0] }];

/** the triangles of a ball about the origin: three rings and a small flat cap at each end, 10 sides */
const ballOf = (radius, name = "ball") => {
  const shape = workshop.shape(64, 64);
  shape.turn(
    [
      [-radius * 0.8, radius * 0.6],
      [0, radius],
      [radius * 0.8, radius * 0.6],
    ],
    { x: 0, y: 0, w: 60, h: 30 },
    { name, sides: 10, caps: [radius * 0.2, radius * 0.2] },
  );
  return shape.tris;
};

/** the triangles of a helmet: a wall of radius 4 from -1 to 3, a dome 1.5 high, a lining 0.3 inside */
const helmOf = () => {
  const shape = workshop.shape(64, 64);
  shape.turn(
    [
      [-1, 4],
      [3, 4],
    ],
    { x: 0, y: 32, w: 60, h: 20 },
    {
      name: "helm",
      sides: 12,
      caps: [false, 1.5],
      lining: { inset: 0.3, zone: { x: 0, y: 54, w: 60, h: 8 }, cap: true },
    },
  );
  return shape.tris;
};

/** a plain texture of 64 x 64, one shade of grey */
const greyTexture = (name, shade = 120) =>
  smak.indexed({ width: 64, height: 64, rgb: new Uint8Array(64 * 64 * 3).fill(shade) }, name);

/** the same triangles with every corner hung on the bone of that name */
const onBone = (triangles, bone) =>
  triangles.map((triangle) => triangle.map((corner) => ({ ...corner, bone })));

/**
 * A model of several bodies, each given as [name, triangles, texture]. The triangles' points are in the
 * space of the bone each corner names; buildMdl wants them in model space, so each is taken there first.
 */
const modelOfWornBodies = (name, bones, bodies) => {
  const restPose = smak.boneMatrices(bones);
  const boneNumber = (boneName) => bones.findIndex((bone) => bone.name === boneName);
  return smak.buildMdl({
    name: `${name}.mdl`,
    bones,
    bodyparts: [
      {
        name: "body",
        models: bodies.map(([bodyName, triangles, texture]) => ({
          name: bodyName,
          meshes: [
            {
              tris: triangles.map((triangle) =>
                triangle.map((corner) => ({
                  ...corner,
                  p: smak.apply34(restPose[boneNumber(corner.bone)], corner.p),
                })),
              ),
              texture,
            },
          ],
        })),
      },
    ],
  });
};

/** one body: the head on the head bone and a chin (a ball of 0.8) on the jaw bone */
const headMdl = modelOfWornBodies("head", skullAndJawBones, [
  [
    "head",
    [
      ...onBone(ballOf(3), "head"),
      ...onBone(
        // the chin's triangles, copied corner by corner and moved nowhere
        ballOf(0.8, "chin").map((triangle) =>
          triangle.map((corner) => ({ ...corner, p: [corner.p[0], corner.p[1], corner.p[2]] })),
        ),
        "jaw",
      ),
    ],
    greyTexture("skin.bmp"),
  ],
]);

/** the fit of the smaller helmet: every point scaled by 0.84, then shifted -1 along x and 0.5 along y */
const toSmallHead = (point) => [point[0] * 0.84 - 1, point[1] * 0.84 + 0.5, point[2] * 0.84];
const fittedToSmallHead = (triangles) =>
  triangles.map((triangle) => triangle.map((corner) => ({ ...corner, p: toSmallHead(corner.p) })));

/** three bodies on the head bone: 0 the helmet, 1 the smaller one, 2 the smaller one in another order */
const helmMdl = modelOfWornBodies("helms", skullBones, [
  ["helm", onBone(helmOf(), "head"), greyTexture("helm.bmp", 60)],
  ["helm_small", onBone(fittedToSmallHead(helmOf()), "head"), greyTexture("helm.bmp", 60)],
  ["shards", onBone(fittedToSmallHead(helmOf().reverse()), "head"), greyTexture("helm.bmp", 60)],
]);

/** the corners' places of a posed model's triangles, as one list of points */
const pointsOf = (posedTriangles) =>
  posedTriangles.flatMap((triangle) => triangle.c.map((corner) => corner.p));

test("measuring what is worn: a body in a bone's space, a head inside a helmet, one size to another", () => {
  // the helmet and the head, each in the head bone's own space; `only` leaves the chin (on the jaw) out
  const helm = smak.bodyIn(helmMdl, 0, "head");
  const helmBox = smak.boxIn(helmMdl, 0, "head");
  const headAlone = smak.bodyIn(headMdl, 0, "head", { only: true });
  const headAndChin = smak.bodyIn(headMdl, 0, "head");
  near(helmBox.mn[0], -1, 1e-4, "the helmet's rim in the head's own space");
  near(helmBox.mx[0], 4.5, 1e-4, "its top");
  near(helmBox.size[1], 8, 1e-4, "its width");
  sure(
    helmBox.off === 0 &&
      helmBox.tris === helmOf().length &&
      helm.every((triangle) => triangle.every((corner) => corner.on)),
    "all of it on that bone",
  );
  sure(
    headAlone.length === ballOf(3).length &&
      headAndChin.length === headAlone.length + ballOf(0.8).length &&
      smak.boxIn(headMdl, 0, "head").off === ballOf(0.8).length * 3,
    "the head alone, out of a body with a jaw",
  );
  near(smak.boxIn(headMdl, 0, "head", { only: true }).mx[1], 3, 1e-4, "the head's reach");
  near(smak.boxIn(headMdl, 0, 1).mn[1], -3, 1e-4, "a bone by its number");
  // the chin's corners are on the jaw, at -2 along the head bone's x: it reaches 0.8 * 0.8 + 0.16 from there
  near(
    smak.box(
      headAndChin
        .flat()
        .filter((corner) => !corner.on)
        .map((corner) => corner.p),
    ).mx[0],
    -2 + 0.8 * 0.8 + 0.16,
    1e-3,
    "a corner on another bone is where the pose puts it",
  );

  // the head fits inside the helmet: no corner pokes through, some are below the rim (open)
  const fit = smak.clearance(headAlone, helm);
  sure(
    fit.fits &&
      fit.outside === 0 &&
      fit.inside > 100 &&
      fit.open > 0 &&
      fit.inside + fit.open === headAlone.length * 3,
    JSON.stringify({ ...fit, tightest: 0 }),
  );
  // the wall has 12 flat sides, so it is nearest the head (radius 3) at the middle of a side
  near(
    fit.tightest.gap,
    4 * Math.cos(Math.PI / 12) - 3,
    0.15,
    "the tightest place, to the wall and not to the lining",
  );

  // a head of radius 4.6 does not fit
  const bigHeadMdl = modelOfWornBodies("big", skullBones, [
    ["head", onBone(ballOf(4.6), "head"), greyTexture("skin.bmp")],
  ]);
  const bigFit = smak.clearance(smak.bodyIn(bigHeadMdl, 0, "head"), helm);
  sure(
    !bigFit.fits && bigFit.outside > 20 && bigFit.worst.out > 0.3 && bigFit.worst.out < 1,
    `a head too large pokes through: ${bigFit.outside} corners, ${bigFit.worst.out.toFixed(2)} at the worst`,
  );

  // the inner piece may be triangles or bare points, the shell a file's triangles or the workshop's own
  sure(
    smak.clearance(headAlone, helmOf()).tightest.gap ===
      smak.clearance(
        headAlone.flat().map((corner) => corner.p),
        helmOf(),
      ).tightest.gap && Math.abs(smak.clearance(headAlone, helmOf()).tightest.gap - fit.tightest.gap) < 1e-4,
    "points or triangles, a file's or the workshop's",
  );

  // from the helmet to the smaller one: the same points in the same order, so the fit is found exactly
  const fitToSmall = smak.fitBetween(helm, smak.bodyIn(helmMdl, 1, "head"));
  sure(
    fitToSmall.by === "points" && fitToSmall.worst < 1e-4,
    `the same points: ${fitToSmall.by}, ${fitToSmall.worst}`,
  );
  near(fitToSmall.k[0], 0.84, 1e-5, "the scale");
  near(fitToSmall.t[0], -1, 1e-4, "the shift up");
  near(fitToSmall.t[1], 0.5, 1e-4, "the shift forwards");
  near(fitToSmall.at([1, 1, 1])[1], 1.34, 1e-4, "at");
  near(fitToSmall.back(fitToSmall.at([1, 2, 3]))[2], 3, 1e-9, "back");

  // to the one whose triangles are in another order: the points do not pair up, so it goes by their boxes
  const fitToShards = smak.fitBetween(helm, smak.bodyIn(helmMdl, 2, "head"));
  sure(
    fitToShards.by === "boxes" && fitToShards.worst === null,
    "the same points in another order: by their boxes",
  );
  near(fitToShards.k[1], 0.84, 1e-4, "the same scale");
  near(fitToShards.t[0], -1, 1e-3, "and shift");
  near(
    smak.fitBetween(helm, smak.bodyIn(helmMdl, 2, "head"), { uniform: true }).scale,
    0.84,
    1e-4,
    "one scale for all three",
  );

  // the triangles above the wall's top (3) are the crown: on the whole they look up the bone's x
  const crownFacing = smak.facingOf(
    helm.filter((triangle) => triangle.every((corner) => corner.p[0] > 3.01)),
  );
  const workshopCrownFacing = smak.facingOf(
    helmOf().filter(
      (triangle) => triangle[0].of === "helm" && triangle.every((corner) => corner.p[0] > 3.01),
    ),
  );
  near(crownFacing[0], 1, 1e-3, "the crown looks up the bone's x");
  near(workshopCrownFacing[0], 1, 1e-3, "the workshop's own triangles too");

  // every body of the file with its weight, and the median of them
  const counts = smak.bodyCounts(helmMdl);
  sure(
    counts.length === 3 &&
      counts[1].body === 1 &&
      counts[1].name === "helm_small" &&
      counts[0].tris === helmOf().length &&
      counts.median === helmOf().length &&
      counts[0].textures.join() === "helm.bmp" &&
      counts[0].verts > 20,
    JSON.stringify(counts),
  );
});

test("graft hangs what is on a bone the target lacks on the nearest one above it, when asked", () => {
  const everyMesh = () => true;
  const firstModel = { bodypart: 0, model: 0 };
  const unmoved = (point) => point;

  // the head has a jaw bone and the helmets' file has none: as it stands, the graft is refused
  let refusal = "";
  try {
    smak.graft(helmMdl, headMdl, everyMesh);
  } catch (e) {
    refusal = e.message;
  }
  sure(
    /no bone called jaw/.test(refusal) && /ancestor/.test(refusal),
    `refused as before, with the way out named: ${refusal}`,
  );

  // told to use the nearest bone above the missing one, the chin goes on the head bone
  const grafted = smak.graft(helmMdl, headMdl, everyMesh, firstModel, unmoved, { missing: "ancestor" });
  const info = smak.readMdl(grafted);
  const addedMesh = smak.readMesh(
    grafted,
    info.bodyparts[0].models[0],
    info.bodyparts[0].models[0].meshes[1],
  );
  sure(
    info.bones.length === 2 &&
      addedMesh.length === ballOf(3).length + ballOf(0.8).length &&
      addedMesh.every((triangle) => triangle.every((corner) => corner.bone === 1)),
    "the jaw's corners are on the head bone",
  );
  sure(!smak.check(grafted).errors.length, smak.check(grafted).errors.join("; "));

  // the box, at rest, of everything a model draws with one texture
  const restBoxOf = (mdl, textureName) =>
    smak.box(
      pointsOf(smak.posed(mdl, { seq: null }).tris.filter((triangle) => triangle.tex.name === textureName)),
    );
  const boxBefore = restBoxOf(headMdl, "skin.bmp");
  const boxAfter = restBoxOf(grafted, "skin.bmp");
  near(
    Math.max(
      ...[0, 1, 2].flatMap((axis) => [
        Math.abs(boxBefore.mn[axis] - boxAfter.mn[axis]),
        Math.abs(boxBefore.mx[axis] - boxAfter.mx[axis]),
      ]),
    ),
    0,
    1e-4,
    "and stand where they stood",
  );

  // a target whose bones have nothing in common with the head's: there is no bone above the jaw to use
  let refusalWithNoBone = "";
  try {
    smak.graft(plainModel("lone", potTris), headMdl, everyMesh, firstModel, unmoved, { missing: "ancestor" });
  } catch (e) {
    refusalWithNoBone = e.message;
  }
  sure(/nor any it hangs from/.test(refusalWithNoBone), "with no bone above it either, it is refused");
});

test("together: several models on one skeleton drawn as one", () => {
  // the smaller helmet and the head, as one model of one body on the helmets' bones
  const worn = smak.together([{ mdl: helmMdl, body: 1 }, headMdl]);
  const info = smak.readMdl(worn);
  const triangles = smak.posed(worn).tris;
  sure(
    info.bodyparts.length === 1 &&
      info.bodyparts[0].models.length === 1 &&
      triangles.length === helmOf().length + ballOf(3).length + ballOf(0.8).length &&
      info.bones.join() === "neck,head",
    `one body of ${triangles.length} triangles on the first's bones`,
  );
  sure(!smak.check(worn).errors.length, smak.check(worn).errors.join("; "));

  // its box is the two models' boxes together: nothing moved, the chin on its lost jaw bone neither
  const boxTogether = smak.box(pointsOf(triangles));
  const boxOfHelm = smak.box(pointsOf(smak.posed(helmMdl, { body: 1 }).tris));
  const boxOfHead = smak.box(pointsOf(smak.posed(headMdl).tris));
  near(
    boxTogether.mx[2],
    Math.max(boxOfHelm.mx[2], boxOfHead.mx[2]),
    1e-4,
    "each where its own model has it",
  );
  near(boxTogether.mn[2], Math.min(boxOfHelm.mn[2], boxOfHead.mn[2]), 1e-4, "the jaw too");

  // the result is a model like any other to the functions that draw
  const sixViews = smak.sheet(worn, { size: 64 });
  const sideBySide = smak.lineup(
    [
      ["bare", smak.together([headMdl])],
      ["worn", worn],
    ],
    { width: 60, height: 80 },
  );
  sure(
    sixViews.width === 192 &&
      inked(smak.render(worn, { width: 64, height: 64 })) > 0.05 &&
      sideBySide.width === 240,
    "sheet, render and lineup take it as it is",
  );

  // `pick` chooses meshes: none of the helmet's, and of the head's file those of the body called head
  sure(
    smak.posed(
      smak.together([
        { mdl: helmMdl, body: 0, pick: () => false },
        { mdl: headMdl, pick: (mesh, model) => model.name === "head" },
      ]),
    ).tris.length ===
      ballOf(3).length + ballOf(0.8).length,
    "of each, the body and the meshes it is asked for",
  );

  // two files with a texture of one name and another picture: each keeps its own
  const otherMdl = modelOfWornBodies("other", skullBones, [
    ["cap", onBone(ballOf(1), "head"), greyTexture("helm.bmp", 200)],
  ]);
  const mixed = smak.together([helmMdl, otherMdl]);
  const textureNames = smak.readMdl(mixed).textures.map((texture) => texture.name);
  sure(
    textureNames.length === 2 &&
      textureNames[0] === "helm.bmp" &&
      /helm\.bmp$/.test(textureNames[1]) &&
      textureNames[1] !== "helm.bmp" &&
      smak.textureOf(mixed, 1).palette[0] !== smak.textureOf(mixed, 0).palette[0],
    `their textures: ${textureNames}`,
  );
});
