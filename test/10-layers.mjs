// Layers: what an old picture is, pixel by pixel (mail, plate, a strap), by a rule of the caller's. A layer
// is made once from the picture as it was and read by every pass of paint, with the distance to its edge and
// its regions' places on the body.
//
// The model is the sheet and the box of fixture-sheet.mjs under another picture. The box is red as before.
// The sheet is grey, with three marks on it:
//   - a white disc of radius 8 about (22, 22), with a pinhole (one grey pixel) in its middle;
//   - a white speck of two pixels at (36, 8) and (37, 8);
//   - a square of chequer, dark and light dots, from (4, 4) to (13, 13).
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import * as smak from "../src/index.mjs";
import { test, sure, near, tmp, runSmak } from "./helper.mjs";
import { sheetAndBoxModel, dotOf, islands } from "./fixture-sheet.mjs";

const RED = [255, 0, 0];
const GREY = [128, 128, 128];
const WHITE = [255, 255, 255];

/** the colour of one pixel of the marked picture, as described above */
const markAt = (x, y) => {
  if (x >= 43) return RED;
  const inTheChequer = x >= 4 && x < 14 && y >= 4 && y < 14;
  if (inTheChequer) return (x + y) % 2 ? [40, 40, 40] : [220, 220, 220];
  const inTheDisc = Math.hypot(x + 0.5 - 22, y + 0.5 - 22) < 8 && !(x === 22 && y === 22);
  const inTheSpeck = y === 8 && (x === 36 || x === 37);
  return inTheDisc || inTheSpeck ? WHITE : GREY;
};
const marks = new Uint8Array(128 * 64 * 3);
for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) marks.set(markAt(x, y), (y * 128 + x) * 3);

/** the sheet and the box under the marks: "marked.mdl", its one texture "marked.bmp" */
const marked = sheetAndBoxModel("marked", marks);

/** a layer's rule: the pixel is white (paint gives colours from 0 to 1) */
const isWhite = ({ rgb }) => rgb[1] > 0.9;

/** a pass of paint that makes the whole sheet black and leaves the box alone */
const blackenSheet = ({ island }) => (island === islands.sheet ? [0, 0, 0] : undefined);

/** the colour [r, g, b] (0 to 255) of one pixel of a model's "marked.bmp" */
const markedDot = (mdl, x, y) => dotOf(mdl, x, y, "marked.bmp");

/** layers of the marked picture, made outside paint: { name: layer } from { name: rule } */
const layersOfMarked = (rules) => smak.layersOf(marked, rules, { tex: "marked.bmp" });

test("layers: made once from the picture as it was, read in every pass, soft at their edges", () => {
  // the sheet painted black, then white again wherever the layer says the disc was
  const whiteWhereDiscWas = ({ layer }) => (layer.disc > 0.5 ? [1, 1, 1] : undefined);
  const discRestored = smak.paint(marked, [blackenSheet, whiteWhereDiscWas], {
    layers: { disc: isWhite },
  }).mdl;
  sure(
    markedDot(discRestored, 20, 20).join() === "255,255,255" &&
      markedDot(discRestored, 34, 34).join() === "0,0,0" &&
      markedDot(discRestored, 22, 22).join() === "0,0,0" &&
      markedDot(discRestored, 60, 10).join() === "255,0,0",
    `the disc is back after a pass painted the sheet black: ${markedDot(discRestored, 20, 20)}, beside it ${markedDot(discRestored, 34, 34)}`,
  );

  // the layer's own value painted as a grey, each pixel asked at `soft` x `soft` points: how many pixels
  // about the disc come out neither black nor white
  const greyPixelsWhenSoft = (soft) => {
    const painted = smak.paint(
      marked,
      [
        blackenSheet,
        {
          soft,
          fn: ({ layer, island }) =>
            island === islands.sheet ? [layer.disc, layer.disc, layer.disc] : undefined,
        },
      ],
      { layers: { disc: isWhite } },
    ).mdl;
    let greyPixels = 0;
    for (let y = 10; y < 34; y++)
      for (let x = 10; x < 34; x++) {
        const value = markedDot(painted, x, y)[0];
        if (value > 30 && value < 225) greyPixels++;
      }
    return greyPixels;
  };
  sure(
    greyPixelsWhenSoft(1) === 0 && greyPixelsWhenSoft(3) > 20,
    `read at the middle of each pixel the layer is 0 or 1; read at 3x3 points its edge is soft: ${greyPixelsWhenSoft(1)} and ${greyPixelsWhenSoft(3)} grey pixels`,
  );

  // layers made ahead with layersOf, in the four ways a layer can be declared
  const layers = layersOfMarked({
    // a rule on the pixel
    disc: isWhite,
    // a rule that reads an earlier layer, here and two pixels to the right: a strip left of the disc
    ring: ({ layer, layerAt, u, v }) => !layer.disc && layerAt("disc", u + 2, v) > 0.5,
    // an image stretched over the texture: its left half white, its right half black
    half: { image: { width: 2, height: 1, rgb: Uint8Array.of(255, 255, 255, 0, 0, 0) } },
    // a rule with options
    twice: { fn: isWhite, soft: 2 },
  });
  sure(
    layers.disc.width === 128 &&
      layers.disc.tex === "marked.bmp" &&
      layers.disc.value.length === 128 * 64 &&
      layers.disc.at(20.5, 20.5) === 1 &&
      layers.disc.at(34.5, 34.5) === 0 &&
      layers.disc.at(60.5, 10.5) === 0,
    "a layer's values",
  );
  sure(
    layers.ring.at(13.5, 22.5) === 1 && layers.ring.at(20.5, 22.5) === 0 && layers.ring.at(34.5, 22.5) === 0,
    "a later layer reads an earlier one, here and at another pixel",
  );
  sure(layers.half.at(10.5, 10.5) === 1 && layers.half.at(100.5, 40.5) === 0, "a layer from an image");
  sure(
    layers.disc.at(14, 22.5) === 0.5,
    `between two pixels a layer is read between them: ${layers.disc.at(14, 22.5)}`,
  );

  // paint takes layers made ahead in place of rules, and paints the same file
  const withLayersMadeAhead = smak.paint(marked, [blackenSheet, whiteWhereDiscWas], { layers }).mdl;
  sure(withLayersMadeAhead.equals(discRestored), "layers made before with layersOf paint the same picture");

  let refusal = "";
  try {
    smak.paint(marked, ({ layerAt }) => layerAt("nothing", 1, 1), { layers: { disc: isWhite } });
  } catch (e) {
    refusal = e.message;
  }
  sure(
    /no layer nothing/.test(refusal) && /disc/.test(refusal),
    `a layer that is not declared is refused by name: ${refusal}`,
  );
  sure(
    smak
      .paint(marked, ({ layer }) => (layer.disc ? undefined : undefined), {
        layers: { disc: isWhite },
      })
      .mdl.equals(marked),
    "layers alone change nothing",
  );
});

test("a pass reads the picture as it was before the first: orig, and the blur of it", () => {
  // after a pass that blackened the sheet, what a second pass is told at pixel (20, 20), inside the disc
  let told = null;
  smak.paint(marked, [
    blackenSheet,
    ({ u, v, orig, at, blur, rgb }) => {
      if (Math.floor(u) === 20 && Math.floor(v) === 20)
        told = {
          here: orig(),
          there: orig(34.5, 34.5),
          at: at(20.5, 20.5),
          was: blur(2, { orig: true }),
          now: blur(2),
          rgb,
        };
    },
  ]);
  // `orig` is the picture before any pass (white here, grey beside the disc); `at` and `rgb` are what the
  // pass before left (black)
  sure(
    told &&
      told.here.join() === "1,1,1" &&
      Math.abs(told.there[0] - 128 / 255) < 1e-9 &&
      told.at.join() === "0,0,0" &&
      told.rgb.join() === "0,0,0",
    `orig ${told?.here} and ${told?.there}; at ${told?.at}`,
  );
  sure(
    told.was[0] > 0.9 && told.now.join() === "0,0,0",
    `the blur of the picture as it was ${told.was}, of what the pass before left ${told.now}`,
  );
});

test("dist: how far a layer's edge is, over 0 inside and under 0 outside, and smoothed", () => {
  // a layer with a saw-toothed right edge: every three rows it ends at pixel 30, then at 33
  const sawToothed = ({ u, v, island }) => island === islands.sheet && u < 30 + (Math.floor(v / 3) % 2) * 3;
  const layers = layersOfMarked({
    disc: { fn: isWhite, fill: 3, drop: 5 },
    saw: sawToothed,
    calm: { fn: sawToothed, smooth: 3 },
  });
  const disc = layers.disc;

  // the disc, radius 8 about (22, 22): its distances at the middle, outside and on the edge
  near(disc.distAt(22.5, 22.5), 7.5, 0.8, "the disc's middle to its edge");
  near(disc.distAt(34.5, 22.5), -4, 0.8, "a pixel outside it");
  near(disc.distAt(30, 22.5), 0, 0.3, "on its edge");

  // the distance picks out a rim just inside the edge, and a thin line inside that rim
  let rimPixels = 0;
  let linePixels = 0;
  for (let y = 2; y < 42; y++)
    for (let x = 2; x < 42; x++) {
      const distance = disc.dist[y * 128 + x];
      if (distance > 0 && distance < 2) rimPixels++;
      if (distance > 2 && distance < 3) linePixels++;
    }
  sure(
    rimPixels > 60 && rimPixels < 120 && linePixels > 25 && linePixels < 60,
    `a rim of 0 < d < 2 has ${rimPixels} pixels and its line of 2 < d < 3 ${linePixels}`,
  );

  // paint hands a pass the same numbers: here, at another pixel, and smoothed
  let handed = null;
  smak.paint(
    marked,
    ({ u, v, dist, distAt, distSmooth }) => {
      if (Math.floor(u) === 22 && Math.floor(v) === 22)
        handed = [dist.disc, distAt("disc", 34.5, 22.5), distSmooth("disc", 2)];
    },
    { layers },
  );
  sure(
    handed &&
      handed[0] === disc.distAt(22.5, 22.5) &&
      handed[1] === disc.distAt(34.5, 22.5) &&
      Math.abs(handed[2] - handed[0]) < 2,
    `paint hands the same distances over: ${handed}`,
  );

  // down column 28, beside the saw's teeth: the largest step of the distance from one row to the next
  const largestStep = (distances) => {
    let largest = 0;
    for (let y = 8; y < 34; y++)
      largest = Math.max(largest, Math.abs(distances[y * 128 + 28] - distances[(y + 1) * 128 + 28]));
    return largest;
  };
  sure(
    largestStep(layers.saw.dist) > 0.4 &&
      largestStep(layers.saw.distSmooth(2)) < 0.5 * largestStep(layers.saw.dist) &&
      largestStep(layers.calm.dist) < 0.5 * largestStep(layers.saw.dist),
    `beside a saw-toothed edge the distance steps by ${largestStep(layers.saw.dist).toFixed(2)} from row to row, smoothed by ${largestStep(layers.saw.distSmooth(2)).toFixed(2)}, of a layer declared smooth by ${largestStep(layers.calm.dist).toFixed(2)}`,
  );

  // where a layer's own edge is in each row (the first pixel from 20 on that is out of it): how far apart
  // the rows' edges are at most
  const depthOfTeeth = (values) => {
    let leftmost = 1e9;
    let rightmost = -1e9;
    for (let y = 8; y < 34; y++) {
      let x = 20;
      while (values[y * 128 + x] >= 0.5) x++;
      leftmost = Math.min(leftmost, x);
      rightmost = Math.max(rightmost, x);
    }
    return rightmost - leftmost;
  };
  sure(
    depthOfTeeth(layers.saw.value) === 3 && depthOfTeeth(layers.calm.value) <= 1,
    `the saw's teeth are ${depthOfTeeth(layers.saw.value)} pixels deep; declared smooth, the layer's own edge keeps within ${depthOfTeeth(layers.calm.value)}`,
  );
});

test("blur keeps to a layer, or leaves one out, and stays inside its island", () => {
  // blurs asked for at four pixels of the sheet, in rows 22 and 34
  const blurs = {};
  smak.paint(
    marked,
    ({ u, v, blur }) => {
      const x = Math.floor(u);
      const y = Math.floor(v);
      // just left of the disc
      if (y === 22 && x === 12) {
        blurs.within = blur(4, { within: "disc" });
        blurs.plain = blur(4);
      }
      // inside the disc
      if (y === 22 && x === 16) blurs.not = blur(4, { not: "disc" });
      // at the sheet's right rim, beside the box's red
      if (y === 34 && x === 41) blurs.rim = blur(3, { not: ["disc"] });
      // on the grey, farther from the disc than the blur reaches
      if (y === 34 && x === 30) blurs.far = blur(2, { within: "disc" });
    },
    { layers: { disc: { fn: isWhite, fill: 3 } } },
  );
  sure(
    blurs.within.every((value) => value > 0.999) && blurs.plain[0] > 0.55 && blurs.plain[0] < 0.95,
    `beside the disc, a blur within it is white (${blurs.within.map((value) => value.toFixed(2))}) where the plain one is between (${blurs.plain[0].toFixed(2)})`,
  );
  sure(
    blurs.not.every((value) => Math.abs(value - 128 / 255) < 1e-6),
    `in the disc, a blur that leaves it out is the sheet's grey: ${blurs.not}`,
  );
  sure(blurs.rim[0] === blurs.rim[1], `nothing of the red beside the island: ${blurs.rim}`);
  sure(
    blurs.far.every((value) => Math.abs(value - 128 / 255) < 1e-6),
    `out of the layer's reach it is the island's plain blur: ${blurs.far}`,
  );
});

test("a layer cleaned where it is declared: specks dropped, pinholes filled, softened", () => {
  // the same rule (white) with four sets of options
  const asItIs = layersOfMarked({ w: isWhite }).w;
  const cleaned = layersOfMarked({ w: { fn: isWhite, drop: 5, fill: 3 } }).w;
  const softened = layersOfMarked({ w: { fn: isWhite, blur: 2 } }).w;
  const softenedOverGrey = layersOfMarked({
    grey: ({ rgb }) => rgb[1] < 0.9,
    w: { fn: isWhite, blur: 2, over: "grey" },
  }).w;

  // (36.5, 8.5) is in the speck, (22.5, 22.5) is the pinhole
  sure(
    asItIs.at(36.5, 8.5) === 1 && asItIs.at(22.5, 22.5) === 0 && asItIs.regions.length === 2,
    "as it is: a speck and a pinhole",
  );
  sure(
    cleaned.at(36.5, 8.5) === 0 &&
      cleaned.at(22.5, 22.5) === 1 &&
      cleaned.regions.length === 1 &&
      cleaned.at(20.5, 20.5) === 1 &&
      cleaned.at(34.5, 34.5) === 0,
    "cleaned: neither",
  );
  // (13.5, 22.5) is the first pixel left of the disc
  sure(
    softened.at(13.5, 22.5) > 0.05 && softened.at(13.5, 22.5) < 0.5 && softened.at(22.5, 18.5) > 0.9,
    `softened: ${softened.at(13.5, 22.5).toFixed(2)} just outside the disc`,
  );
  sure(
    softenedOverGrey.at(13.5, 22.5) === 0 && softenedOverGrey.at(34.5, 34.5) === 0,
    `softened over the grey pixels alone: ${softenedOverGrey.at(13.5, 22.5)} there`,
  );
});

test("a layer's regions: box, centre, size and place on the body", () => {
  // the white layer has two regions: the speck is region 0 and the disc region 1
  const whiteLayer = layersOfMarked({ w: isWhite }).w;
  const [speck, disc] = whiteLayer.regions;
  sure(
    speck.size === 2 &&
      speck.box.join() === "36,8,38,9" &&
      speck.centre.join() === "37,8.5" &&
      speck.id === 0 &&
      disc.id === 1,
    `the speck: ${JSON.stringify(speck)}`,
  );
  sure(
    disc.size > 185 &&
      disc.size < 215 &&
      disc.box.join() === "14,14,30,30" &&
      Math.abs(disc.centre[0] - 22) < 0.2 &&
      Math.abs(disc.centre[1] - 22) < 0.2 &&
      disc.islands.join() === String(islands.sheet),
    `the disc: ${JSON.stringify(disc)}`,
  );
  // the sheet stands at x = 0, 10 units wide (y) and high (z) over 40 pixels: the disc covers y from -2 to 2
  // and z from 3 to 7
  sure(
    disc.mn[0] === 0 &&
      disc.mx[0] === 0 &&
      Math.abs(disc.mn[1] + 2) < 0.3 &&
      Math.abs(disc.mx[1] - 2) < 0.3 &&
      Math.abs(disc.mn[2] - 3) < 0.3 &&
      Math.abs(disc.mx[2] - 7) < 0.3 &&
      Math.abs(disc.mid[2] - 5) < 0.2,
    `the disc on the body: ${disc.mn} to ${disc.mx}`,
  );
  // which region a pixel is in, or -1
  sure(
    whiteLayer.regionAt(22.5, 20.5) === 1 &&
      whiteLayer.regionAt(37.5, 8.5) === 0 &&
      whiteLayer.regionAt(34.5, 34.5) === -1,
    "regionAt",
  );
  // paint tells a pass the same, for each layer by its name
  let regionTold = null;
  smak.paint(
    marked,
    ({ u, v, region }) => {
      if (Math.floor(u) === 20 && Math.floor(v) === 20) regionTold = region.w;
    },
    { layers: { w: whiteLayer } },
  );
  sure(regionTold === 1, `paint's region.w in the disc: ${regionTold}`);
});

test("busy tells a chequer from a flat ground", () => {
  // `busy` asked at a pixel of the chequer (as mail is drawn) and at one of the plain grey
  const busyAt = {};
  smak.paint(marked, ({ u, v, busy }) => {
    const x = Math.floor(u);
    const y = Math.floor(v);
    if (x === 9 && y === 9) busyAt.mail = busy(2);
    if (x === 32 && y === 34) busyAt.flat = busy(2);
  });
  sure(
    busyAt.mail > 0.3 && busyAt.flat < 0.02,
    `busy(2) on the chequer ${busyAt.mail?.toFixed(2)}, on the grey ${busyAt.flat?.toFixed(3)}`,
  );

  // a layer of what is busy, small regions dropped: one region, about the chequer
  const mailLayer = layersOfMarked({ mail: { fn: ({ busy }) => busy(2) > 0.25, drop: 20 } }).mail;
  sure(
    mailLayer.at(9.5, 9.5) === 1 &&
      mailLayer.at(32.5, 34.5) === 0 &&
      mailLayer.regions.length === 1 &&
      Math.abs(mailLayer.regions[0].centre[0] - 9) < 1.5,
    `a layer of what is busy: ${JSON.stringify(mailLayer.regions.map((region) => [region.size, region.box]))}`,
  );
});

test("layerMap and the command line draw layers over a texture", () => {
  // the texture enlarged, each layer tinted its own colour
  const map = smak.layerMap(marked, "marked.bmp", {
    disc: { fn: isWhite, drop: 5 },
    mail: ({ busy }) => busy(2) > 0.25,
  });
  const scale = map.scale;
  // the colour of the map where the texture's pixel (x, y) is drawn
  const mapColourAt = (x, y) => [
    ...map.rgba.subarray(
      (Math.floor(y * scale) * map.width + Math.floor(x * scale)) * 4,
      (Math.floor(y * scale) * map.width + Math.floor(x * scale)) * 4 + 3,
    ),
  ];
  sure(
    map.width === 128 * scale &&
      map.layers.disc.regions === 1 &&
      map.layers.disc.pixels > 185 &&
      map.layers.mail.pixels > 60,
    JSON.stringify(map.layers),
  );
  const inTheDisc = mapColourAt(25.5, 27.5);
  const inTheChequer = mapColourAt(6.5, 11.5);
  const onTheGround = mapColourAt(34.5, 30.5);
  sure(
    inTheDisc[0] > inTheDisc[2] + 60 &&
      inTheChequer[2] > inTheChequer[0] + 60 &&
      onTheGround[0] === onTheGround[1] &&
      onTheGround[1] === onTheGround[2],
    `the disc is tinted ${inTheDisc}, the chequer ${inTheChequer}, the ground left grey ${onTheGround}`,
  );

  // the same from the command line: the model in a file, and a module that exports layers and a texture
  const modelFile = join(tmp, "marked.mdl");
  const layersModule = join(tmp, "marked-layers.mjs");
  writeFileSync(modelFile, marked);
  writeFileSync(
    layersModule,
    'export const layers = { disc: { fn: ({ rgb }) => rgb[1] > 0.9, drop: 5 } };\nexport const tex = "marked.bmp";\n',
  );

  // layers written as expressions on the command line: it lists their regions and draws them to one file
  const listedFromExpressions = runSmak(
    "layers",
    modelFile,
    "white=lum>0.9&&sat<0.1",
    "mail=busy(2)>0.25&&!layer.white",
    "--min",
    "1",
    "-o",
    join(tmp, "lay/one.png"),
  );
  sure(
    /white: \d+ pixels in 2 regions/.test(listedFromExpressions) &&
      /mail: \d+ pixels in/.test(listedFromExpressions) &&
      /36,8 to 38,9/.test(listedFromExpressions) &&
      smak.unpng(readFileSync(join(tmp, "lay/one.png"))).width === 128 * scale,
    listedFromExpressions,
  );

  // layers from the module, drawn into a folder under a name of the command's own
  const listedFromModule = runSmak("layers", modelFile, layersModule, "-o", join(tmp, "lay"));
  sure(
    /disc: \d+ pixels in 1 regions/.test(listedFromModule) && existsSync(join(tmp, "lay/layers_marked.png")),
    listedFromModule,
  );
});
