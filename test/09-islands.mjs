// A picture's islands and painting by them: uvIslands finds them, paint tells its function where each pixel
// is and can keep to chosen islands, soften an edge, run several passes and blur; copyBody adds a body again
// in a texture of its own. The model is the sheet and the box of fixture-sheet.mjs, under a chequer.
import * as smak from "../src/index.mjs";
import { test, sure, near, poseGap, knife } from "./helper.mjs";
import { flat, dotOf, islands } from "./fixture-sheet.mjs";

test("uvIslands finds a picture's islands, their borders and which of them are open", () => {
  // seven islands: the sheet (the one whose box in the picture starts at pixel 2) and the box's six faces
  const found = smak.uvIslands(flat);
  const sheet = found.list.find((island) => island.box[0] === 2);
  sure(found.list.length === 7 && sheet, `${found.list.length} islands`);
  islands.sheet = sheet.id;
  islands.boxFaces = found.list.filter((island) => island !== sheet).map((island) => island.id);

  // what is told of the sheet: its triangles, its box in the picture, its texture, bones and body
  sure(
    sheet.tris === 2 &&
      sheet.box.join() === "2,2,42,42" &&
      sheet.tex === "flat.bmp" &&
      sheet.bones.join() === "root" &&
      sheet.uses.length === 1 &&
      sheet.uses[0].body === 0 &&
      sheet.uses[0].name === "flat",
    JSON.stringify(sheet),
  );
  // its border is four sides of 40 pixels, all of it open: no other triangle of the body meets it there
  sure(
    sheet.border === 160 && sheet.open === 160,
    `the sheet's border is ${sheet.border}, ${sheet.open} of it open`,
  );
  sure(sheet.n[0] > 0.99 && sheet.mid.join() === "0,0,5", `it faces ${sheet.n} at ${sheet.mid}`);
  // a face of the box has four sides of 16, each meeting another face on the body: none of it is open
  for (const island of found.list)
    if (island !== sheet)
      sure(
        island.tris === 2 && island.border === 64 && island.open === 0,
        `a face of the box: border ${island.border}, open ${island.open}`,
      );

  // `of` gives the island of any triangle of the posed model
  const triangles = smak.posed(flat).tris;
  sure(
    triangles.every((triangle) => found.of(triangle) !== undefined) &&
      found.of(triangles[0]) === sheet.id &&
      new Set(triangles.map((triangle) => found.of(triangle))).size === 7,
    "of",
  );

  // the knife's islands hold all its triangles, every one on the hand bone
  const knifeIslands = smak.uvIslands(knife.mdl);
  sure(
    knifeIslands.list.length >= 3 &&
      knifeIslands.list.reduce((sum, island) => sum + island.tris, 0) === knife.piece.tris.length &&
      knifeIslands.list.every((island) => island.bones.join() === "hand"),
    `the knife: ${knifeIslands.list.length} islands`,
  );

  // the islands drawn, and an island used to choose the triangles to take off
  const map = smak.islandMap(flat, "flat.bmp");
  sure(map.width === 128 * map.scale && map.islands.length === 7, "islandMap");
  sure(smak.islandMap(flat, 0, { body: 0, scale: 2 }).width === 256, "islandMap of one body");
  sure(
    smak.dropTriangles(flat, (triangle) => found.of(triangle) === sheet.id).gone === 2,
    "dropTriangles by island",
  );
});

test("paint tells its function where it is, and paints only the islands it is told", () => {
  const found = smak.uvIslands(flat);
  const pixelsSeenByIsland = new Map();
  let wrong = "";
  let deepestInTheSheet = 0;

  // one pass over every pixel that paints nothing, noting the first thing told that is not right
  smak.paint(flat, (pixel) => {
    pixelsSeenByIsland.set(pixel.island, (pixelsSeenByIsland.get(pixel.island) ?? 0) + 1);
    const island = found.list[pixel.island];
    // the bone, the body, the mesh, the texture and the island of the pixel
    if (
      pixel.bone !== "root" ||
      pixel.boneIndex !== 0 ||
      pixel.body !== 0 ||
      pixel.where.mesh !== 0 ||
      pixel.tex !== "flat.bmp" ||
      found.of(pixel) !== pixel.island
    )
      wrong = "bone, body, where, tri or island";
    // its place in the picture: the middle of a pixel, within two pixels of its island's box
    if (
      pixel.u < island.box[0] - 2 ||
      pixel.u > island.box[2] + 2 ||
      pixel.v < island.box[1] - 2 ||
      pixel.v > island.box[3] + 2 ||
      pixel.u % 1 !== 0.5
    )
      wrong = `u, v: ${pixel.u} ${pixel.v} in island ${pixel.island}`;
    // how far it is from its island's border (`edge`) and from the open part of it (`open`), and how many
    // units of the body a pixel covers (`per`): the sheet's 10 units lie over 40 pixels
    if (pixel.island === islands.sheet) {
      deepestInTheSheet = Math.max(deepestInTheSheet, pixel.edge);
      if (pixel.open !== pixel.edge || Math.abs(pixel.per - 0.25) > 1e-6)
        wrong = `the sheet: edge ${pixel.edge}, open ${pixel.open}, ${pixel.per} units a pixel`;
    } else if (pixel.open !== Infinity || !(pixel.edge >= 0 && pixel.edge < 10))
      wrong = `the box: edge ${pixel.edge}, open ${pixel.open}`;
  });
  sure(!wrong, wrong);
  sure(
    pixelsSeenByIsland.size === 7 && pixelsSeenByIsland.get(islands.sheet) > 1600,
    `${pixelsSeenByIsland.size} islands seen`,
  );
  near(deepestInTheSheet, 19.5, 1e-9, "the middle of the sheet from its border");

  // told to paint the sheet's island only: blue within 3 pixels of its border, green inside
  let calls = 0;
  const sheetPainted = smak.paint(
    flat,
    ({ island, edge }) => {
      calls++;
      if (island !== islands.sheet) throw new Error("another island was painted");
      return edge < 3 ? [0, 0, 1] : [0, 1, 0];
    },
    { islands: [islands.sheet] },
  ).mdl;
  sure(calls === pixelsSeenByIsland.get(islands.sheet), `${calls} calls`);
  sure(
    dotOf(sheetPainted, 3, 20).join() === "0,0,255" &&
      dotOf(sheetPainted, 20, 20).join() === "0,255,0" &&
      dotOf(sheetPainted, 60, 10).join() === "255,0,0",
    `a line inside the border: ${dotOf(sheetPainted, 3, 20)}, ${dotOf(sheetPainted, 20, 20)}, and the box ${dotOf(sheetPainted, 60, 10)}`,
  );
  sure(smak.paint(flat, () => [0, 0, 0], { islands: [] }).mdl.equals(flat), "no islands, nothing painted");
});

test("paint softens an edge, and several passes are cut to 256 colours once", () => {
  // blue to the right of a line a quarter of the way into pixel 20, on the sheet
  const blueRightOfLine = ({ u }) => (u > 20.25 ? [0, 0, 1] : undefined);
  const hardEdged = smak.paint(flat, blueRightOfLine, { islands: [islands.sheet] }).mdl;
  const softEdged = smak.paint(flat, blueRightOfLine, { islands: [islands.sheet], soft: 4 }).mdl;
  // asked at its middle alone, pixel 20 is all blue
  sure(
    dotOf(hardEdged, 20, 10).join() === "0,0,255" && dotOf(hardEdged, 19, 10).join() === "0,0,0",
    "the staircase",
  );
  // asked at 4 x 4 points, three quarters of them are blue: the pixel is that share of blue over its white
  sure(
    dotOf(softEdged, 20, 10).join() === "64,64,255" &&
      dotOf(softEdged, 19, 10).join() === "0,0,0" &&
      dotOf(softEdged, 21, 10).join() === "0,0,255",
    `three quarters of the dot painted: ${dotOf(softEdged, 20, 10)}`,
  );

  // a pass that paints far more than 256 colours, and a pass that only notes the colours it is shown
  const manyColours = ({ u, v }) => [u / 128, v / 64, ((u * v) % 7) / 7];
  const noteColoursInto =
    (set) =>
    ({ rgb }) => {
      set.add(rgb.join());
    };
  const seenInOneCall = new Set();
  const seenAfterCut = new Set();
  // both passes in one call: the second sees the first's colours in full
  const bothPasses = smak.paint(flat, [manyColours, noteColoursInto(seenInOneCall)]);
  // one call each: the first's result was cut to a palette before the second saw it
  const firstPassAlone = smak.paint(flat, manyColours);
  smak.paint(firstPassAlone.mdl, noteColoursInto(seenAfterCut));
  sure(
    seenInOneCall.size > 1000 && seenAfterCut.size <= 256,
    `the second pass saw ${seenInOneCall.size} colours, and ${seenAfterCut.size} when the first was cut before it`,
  );
  sure(
    bothPasses.mdl.equals(firstPassAlone.mdl) && "flat.bmp" in bothPasses.shared,
    "a pass that changes nothing changed the result",
  );

  // three passes, each with its own islands: green on the sheet; on one face of the box, a colour worked
  // from what is there; then blue added to whatever the sheet has by now
  const threePasses = smak.paint(flat, [
    { fn: () => [0, 1, 0], islands: [islands.sheet] },
    { fn: ({ rgb }) => [rgb[1], 0, 1], islands: islands.boxFaces.slice(0, 1), soft: 2 },
    ({ rgb, island }) => (island === islands.sheet ? [rgb[0], rgb[1], 1] : undefined),
  ]).mdl;
  sure(
    dotOf(threePasses, 20, 20).join() === "0,255,255" &&
      dotOf(threePasses, 58, 10).join() === "0,0,255" &&
      dotOf(threePasses, 78, 10).join() === "255,0,0",
    `each pass its own islands: ${dotOf(threePasses, 20, 20)}, ${dotOf(threePasses, 58, 10)}, ${dotOf(threePasses, 78, 10)}`,
  );
});

test("a pass reads the picture as it was before it, and blurs within an island", () => {
  // `at` reads any pixel of the picture: here each pixel of the sheet takes the colour of its right-hand
  // neighbour
  let mismatches = 0;
  const shiftedLeft = smak.paint(
    flat,
    ({ u, v, at, rgb }) => {
      if (at(u, v).join() !== rgb.join()) mismatches++;
      return at(u + 1, v);
    },
    { islands: [islands.sheet] },
  ).mdl;
  sure(
    !mismatches &&
      dotOf(shiftedLeft, 10, 10).join() === "0,0,0" &&
      dotOf(shiftedLeft, 11, 10).join() === "255,255,255",
    "at",
  );

  // the chequer blurred is mid grey; at the sheet's rim the red beside the island is not mixed in
  const blurred = smak.paint(flat, ({ blur }) => blur(3), { islands: [islands.sheet] }).mdl;
  const inTheMiddle = dotOf(blurred, 20, 20);
  const atTheRim = dotOf(blurred, 41, 20);
  sure(
    Math.abs(inTheMiddle[0] - 127) < 12 && inTheMiddle[0] === inTheMiddle[2],
    `the chequer smoothed to ${inTheMiddle}`,
  );
  sure(
    Math.abs(atTheRim[0] - 127) < 25 && Math.abs(atTheRim[0] - atTheRim[2]) < 3,
    `at its rim, beside the red: ${atTheRim}`,
  );

  // a second pass blurs the white the first one left, not the chequer
  const whiteThenBlurred = smak.paint(flat, [
    ({ island }) => (island === islands.sheet ? [1, 1, 1] : undefined),
    ({ blur, island }) => (island === islands.sheet ? blur(2) : undefined),
  ]).mdl;
  sure(
    dotOf(whiteThenBlurred, 20, 20).join() === "255,255,255",
    "a later pass blurs what the one before left",
  );
});

test("copyBody: a body again, as a new body, wearing another texture", () => {
  // the knife's body copied as "knife2", in a texture that is the knife's with its colours inverted
  const invertedTexture = {
    ...knife.texture,
    name: "second.bmp",
    palette: knife.texture.palette.map((value) => 255 - value),
  };
  const copied = smak.copyBody(knife.mdl, "knife", "knife2", invertedTexture);
  const info = smak.readMdl(copied);
  const original = smak.posed(knife.mdl).tris;
  const copy = smak.posed(copied, { body: 1 }).tris;
  sure(
    info.bodyparts[0].models.map((model) => model.name).join() === "knife,knife2" &&
      info.textures.map((texture) => texture.name).join() === "knife.bmp,second.bmp",
    "the new body and its texture",
  );
  sure(!smak.check(copied).errors.length, smak.check(copied).errors.join("; "));

  // corner for corner, the copy is where the original is, in space and in the picture
  let gap = 0;
  original.forEach((triangle, i) =>
    triangle.c.forEach((corner, k) => {
      gap = Math.max(
        gap,
        Math.hypot(...smak.sub(corner.p, copy[i].c[k].p)),
        Math.abs(corner.u - copy[i].c[k].u),
        Math.abs(corner.v - copy[i].c[k].v),
      );
    }),
  );
  sure(
    copy.length === original.length &&
      gap < 1e-6 &&
      copy.every((triangle) => triangle.tex.name === "second.bmp") &&
      smak.posed(copied).tris.every((triangle) => triangle.tex.name === "knife.bmp"),
    `the same shape in the other texture (${gap} apart)`,
  );
  near(
    poseGap(smak.poseAt(copied, 1, 6), smak.poseAt(knife.mdl, 1, 6)),
    0,
    1e-9,
    "the animation is untouched",
  );

  // the body named by its number, the texture by the name of one the file has: no texture is added
  const inSameTexture = smak.copyBody(knife.mdl, 0, "again", "knife.bmp");
  sure(
    smak.readMdl(inSameTexture).textures.length === 1 &&
      smak.posed(inSameTexture, { body: 1 }).tris.every((triangle) => triangle.tex.name === "knife.bmp"),
    "by number, in a texture the file has",
  );

  // a picture of half the size: the copy's corners are moved to fit it
  const inSmallTexture = smak.copyBody(knife.mdl, 0, "small", {
    name: "small.bmp",
    ...smak.shrink(knife.piece.image, 8),
  });
  const smallCorners = smak.posed(inSmallTexture, { body: 1 }).tris.flatMap((triangle) => triangle.c);
  sure(
    smak.readMdl(inSmallTexture).textures[1].width === 128 &&
      Math.max(...smallCorners.map((corner) => corner.u)) <= 128,
    "an image of another size: the corners follow",
  );

  // the old body's islands are numbered as they were, so paint written for them still finds them
  sure(
    smak
      .uvIslands(copied)
      .list.filter((island) => island.tex === "knife.bmp")
      .every(
        (island, i) =>
          island.id === smak.uvIslands(knife.mdl).list[i].id &&
          island.tris === smak.uvIslands(knife.mdl).list[i].tris,
      ),
    "the islands of the old body keep their ids",
  );

  let threw = false;
  try {
    smak.copyBody(knife.mdl, "nothing", "x", "knife.bmp");
  } catch {
    threw = true;
  }
  sure(threw, "a body that is not there is refused");
});
