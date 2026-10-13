// Example 6: a model from a Wavefront .obj file. The shape is made somewhere else (Blender, a script, any
// tool that writes .obj) and comes here as text: an .obj, the .mtl that says what its materials are, and a
// picture. It needs no game files:
//
//   node examples/06-from-obj.mjs [output folder, default out]
//
// It first writes the three files another tool would leave (hut.obj, hut.mtl, hut_planks.png: a small
// plank hut with a red roof and a brass knob on its front), then makes hut.mdl from them and draws it into
// hut_sheet.png (six views). From the command line the second half is one line:
//
//   node bin/smak.mjs obj out/hut.obj -o out/hut.mdl --scale 39.37 --ground
//
// The pattern:
//   1. readObj: the .obj's text, and the .mtl's, into triangles and materials
//   2. the pictures the materials name, read from beside the .obj
//   3. objModel: scale, which way is up, where the origin goes; it returns the model and what it had to change
//   4. check, then look at it (sheet) before it goes near a game
//
// What to know about an .obj. It is usually written with +y up and its front towards +z; GoldSrc has +z up
// and a model's front towards +x: `up: "y"` turns one into the other. It has no units: this one is in metres,
// and a unit of the game is about an inch, hence the scale. Its texture coordinates count from the picture's
// bottom left, the kit's from the top left: readObj turns them over.
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { readObj, objModel, check, sheet, png, workshop } from "../src/index.mjs";

const OUT = process.argv[2] ?? "out";
try {
  mkdirSync(OUT, { recursive: true });
} catch (error) {
  // a file of that name is in the way, or the place cannot be written to
  console.error(`the output folder ${OUT} cannot be made (${error.code})`);
  process.exit(1);
}

// ── the picture: 64x64 of planks, with an arrow that points up and a pale dot in the top left corner ──
// (the arrow and the dot are there to be looked for in the drawing: they show the picture is the right way
// up and not mirrored)
const SIDE = 64;
const { wood, times, bell } = workshop;
const canvas = workshop.sheet(SIDE, SIDE);
canvas.zone(
  { x: 0, y: 0, w: SIDE, h: SIDE },
  (u, v) => {
    // four upright planks, darker in the gaps between them
    const plank = Math.floor(u / 16);
    const gap = bell((u % 16) - 0.5, 1.2);
    let colour = times(wood(v / 6, u / 6 + plank * 3, 1, 5 + plank), 1 - 0.5 * gap);
    // the arrow: a shaft in the middle, and a head that narrows towards the top
    const fromMiddle = Math.abs(u - 32);
    const onShaft = fromMiddle < 3 && v >= 24 && v < 50;
    const onHead = v >= 12 && v < 24 && fromMiddle < (v - 12) * 0.8;
    if (onShaft || onHead) colour = [0.1, 0.07, 0.05];
    if (Math.hypot(u - 8, v - 8) < 4) colour = [0.9, 0.85, 0.7];
    return colour;
  },
  0,
);
const image = canvas.image();
const rgba = new Uint8Array(SIDE * SIDE * 4).fill(255);
for (let pixel = 0; pixel < SIDE * SIDE; pixel++)
  rgba.set(image.rgb.subarray(pixel * 3, pixel * 3 + 3), pixel * 4);
writeFileSync(join(OUT, "hut_planks.png"), png(SIDE, SIDE, rgba));

// ── the .mtl: one material with a picture, two with a colour alone ──
writeFileSync(
  join(OUT, "hut.mtl"),
  `# materials of hut.obj
newmtl planks
Kd 0.8 0.6 0.4
map_Kd hut_planks.png

newmtl roof
Kd 0.55 0.12 0.10

newmtl brass
Kd 0.80 0.62 0.25
`,
);

// ── the .obj: in metres, +y up, the front towards +z ──
const lines = ["# a plank hut, written by examples/06-from-obj.mjs", "mtllib hut.mtl", "o hut"];
// the four corners of the picture, for a face that wears all of it: bottom left, bottom right, top right,
// top left (an .obj counts them from the bottom left)
lines.push("vt 0 0", "vt 1 0", "vt 1 1", "vt 0 1");
let points = 0;
/** Adds a point and gives its number in the file (they count from 1). */
const point = (x, y, z) => {
  lines.push(`v ${x} ${y} ${z}`);
  return ++points;
};
/**
 * A box between two corners, as six faces of four corners each, anticlockwise seen from outside (which is
 * how an .obj says which side of a face is its front). With `textured`, each face wears the whole picture.
 */
const boxOf = ([x0, y0, z0], [x1, y1, z1], textured) => {
  const corners = [
    point(x0, y0, z1),
    point(x1, y0, z1),
    point(x1, y1, z1),
    point(x0, y1, z1),
    point(x0, y0, z0),
    point(x1, y0, z0),
    point(x1, y1, z0),
    point(x0, y1, z0),
  ];
  // each face from its bottom left corner, seen from outside: front, right, back, left, top, bottom
  for (const face of [
    [0, 1, 2, 3],
    [1, 5, 6, 2],
    [5, 4, 7, 6],
    [4, 0, 3, 7],
    [3, 2, 6, 7],
    [4, 5, 1, 0],
  ])
    lines.push(
      `f ${face.map((corner, i) => (textured ? `${corners[corner]}/${i + 1}` : corners[corner])).join(" ")}`,
    );
};

// the walls: 0.6 m wide and deep, 0.6 m tall, in planks
lines.push("g walls", "usemtl planks", "s off");
boxOf([-0.3, 0, -0.3], [0.3, 0.6, 0.3], true);

// the roof: a pyramid of four triangles over the walls, a little wider. Its faces name their points by
// counting back from the last one written (-1 is the last), which an .obj allows
lines.push("g roof", "usemtl roof");
point(-0.36, 0.6, 0.36);
point(0.36, 0.6, 0.36);
point(0.36, 0.6, -0.36);
point(-0.36, 0.6, -0.36);
point(0, 0.95, 0);
lines.push("f -5 -4 -1", "f -4 -3 -1", "f -3 -2 -1", "f -2 -5 -1", "f -2 -3 -4 -5");

// the knob: a small brass block on the front wall, so that the front can be told in the drawing
lines.push("g knob", "usemtl brass");
boxOf([-0.05, 0.25, 0.3], [0.05, 0.35, 0.36], false);
writeFileSync(join(OUT, "hut.obj"), lines.join("\n") + "\n");

// ── from here on: what any .obj takes. Read it, with its materials ──
const obj = readObj(readFileSync(join(OUT, "hut.obj"), "utf8"), {
  mtl: readFileSync(join(OUT, "hut.mtl"), "utf8"),
});
// the pictures its materials name, from beside it (PNG or BMP)
const textures = {};
for (const material of obj.materials)
  if (material.picture) textures[material.name] = readFileSync(join(OUT, material.picture));

// ── the model: metres to units, stood up, standing on the ground ──
const METRE = 39.37; // units of the game in a metre
const { mdl, warnings, report } = objModel(obj, {
  name: "hut.mdl",
  textures,
  scale: METRE,
  up: "y",
  ground: true,
});
for (const warning of warnings) console.log(`WARN ${warning}`);
for (const texture of report.textures)
  console.log(`${texture.name} ${texture.width}x${texture.height}: ${texture.from}`);

// ── check it against what the engine takes, and stop before writing a model that would not load ──
const checked = check(mdl, "goldsrc");
for (const line of [
  ...checked.facts,
  ...checked.warnings.map((warning) => `WARN ${warning}`),
  ...checked.errors.map((error) => `ERROR ${error}`),
])
  console.log(line);
if (checked.errors.length) process.exit(1);
writeFileSync(join(OUT, "hut.mdl"), mdl);

// ── look at it: the knob is on the front, the arrows point up, the pale dot is at each wall's top left ──
const views = sheet(mdl, { seq: "idle" });
writeFileSync(join(OUT, "hut_sheet.png"), png(views.width, views.height, views.rgba));
console.log(`${join(OUT, "hut.mdl")} (${mdl.length} bytes), hut_sheet.png`);
