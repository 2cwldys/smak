// Example 2: a new piece in the place of one a model already shows. The model keeps its bones, its
// animations, its events and its hands, and the game goes on using it as it did. Here a fighting knife, made
// with the sword kit, replaces the weapon of one submodel of a first-person model.
//
//   node examples/02-swap-mesh.mjs <model.mdl> <body number> [output folder, default out]
//        [texture name pattern]
//
// Find the body number with `smak info <model.mdl>`: it is the number beside the submodel that shows the
// weapon. The last argument narrows the meshes that are replaced to those whose texture's name matches it (a
// regular expression), for a submodel that holds more than the weapon; without it, every mesh but the hands'
// and arms' goes.
//
// It writes into the output folder the changed model (under the name of the one it was given), and two
// pictures: swap_before_after.png and swap_strip.png (the new model through its first animation). When the
// check refuses the new model, it says why and writes nothing.
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import {
  swapMesh,
  indexed,
  shrink,
  check,
  strip,
  render,
  tile,
  png,
  HANDS,
  sequences,
  readMdl,
} from "../src/index.mjs";
import { sword, taper } from "../kits/swordkit.mjs";

// ── the command line: each thing that can be wrong with it is said in one line, and nothing is made ──
const [file, body = "0", OUT = "out", only] = process.argv.slice(2);
/** Says what is wrong and stops. */
const stop = (message) => {
  console.error(message);
  process.exit(1);
};
if (!file)
  stop(
    "usage: node examples/02-swap-mesh.mjs <model.mdl> <body number> [output folder] [texture name pattern]",
  );
if (!/^\d+$/.test(body))
  stop(`the body number is a whole number, and this is "${body}": \`smak info\` lists them`);
let onlyPattern = null;
try {
  if (only) onlyPattern = new RegExp(only, "i");
} catch (error) {
  stop(`the texture name pattern "${only}" is not a regular expression: ${error.message}`);
}
if (!statSync(file, { throwIfNoEntry: false })?.isFile()) stop(`there is no file ${file}`);
const original = readFileSync(file);
let info;
try {
  info = readMdl(original);
} catch (error) {
  stop(`${file}: ${error.message}`);
}
if (!info.textures.length)
  stop(`${file} keeps its textures in another file (<name>t.mdl): \`smak inline\` puts them inside it`);
// which of the submodel's meshes are the old piece: not the hands, and the pattern's when one was given
const pick = (mesh) =>
  !HANDS.test(mesh.texture.name) && (!onlyPattern || onlyPattern.test(mesh.texture.name));
// the submodel that body number shows (of the first bodypart: where a weapon's model keeps its weapons)
// must have such a mesh
const weapons = info.bodyparts[0];
const submodel = weapons.models[Math.floor(Number(body) / weapons.base) % weapons.models.length];
if (!submodel.meshes.some(pick))
  stop(
    `the submodel ${submodel.name} (body ${body}) has no mesh to replace${only ? ` whose texture matches "${only}"` : ""}: its textures are ${submodel.meshes.map((mesh) => mesh.texture.name).join(", ") || "none"}`,
  );
try {
  mkdirSync(OUT, { recursive: true });
} catch (error) {
  // a file of that name is in the way, or the place cannot be written to
  stop(`the output folder ${OUT} cannot be made (${error.code})`);
}

// ── the piece: drawn in its own axes (+x from the pommel to the tip, in units); swapMesh lays it over the
// old one. kits/swordkit.mjs says what each of these numbers is. ──
const piece = sword({
  seed: 11,
  // each profile is [[x, radius], ...]: the part is that outline turned about the sword's axis
  pommel: {
    profile: [
      [0, 0.35],
      [0.4, 0.62],
      [0.9, 0.5],
    ],
    metal: "gunmetal",
  },
  grip: {
    profile: [
      [0.8, 0.5],
      [2.2, 0.6],
      [4.4, 0.56],
      [5.2, 0.6],
    ],
    flatten: 0.75,
    wrap: "cord",
    colour: [0.07, 0.08, 0.07],
  },
  // the guard's sections are [y across the sword, half length along it, half thickness]
  guard: {
    x: 5.4,
    sections: [
      [-1.3, 0.2, 0.14],
      [-0.6, 0.3, 0.26],
      [0, 0.34, 0.3],
      [0.6, 0.3, 0.26],
      [1.3, 0.2, 0.14],
    ],
    metal: "gunmetal",
  },
  // one cutting edge, from x = 5.7 to the tip at 17; `taper` gives its half width along the way
  blade: { x0: 5.7, x1: 17, half: taper(0.9, 0.8, 0.7, 0.9), section: "single", thick: 0.2, rust: -1 },
});
// the kit paints 1024 wide; shrunk by 2 (each side halved: a quarter of the pixels) it is 512 wide, the most
// a GoldSrc texture should be, and a power of two
const texture = indexed(shrink(piece.image, 2), "knife_smak.bmp");

// size "own": the knife was drawn in the game's units (17 long) and stays that long, held where the old piece
// was held. Without it the piece is stretched to the old one's length, which is right for a like-for-like
// replacement.
const { mdl, report } = swapMesh(original, {
  body: Number(body),
  pick,
  piece,
  texture,
  size: "own",
  name: basename(file),
});
console.log(
  `${report.model}: ${report.was} -> ${report.now} triangles on ${report.bones.join(" + ")}, scale ${report.scale.toFixed(3)}, ${report.turn}, outline off by ${report.left.toFixed(2)} units`,
);

// ── check it against what the engine takes, and stop before writing a model that would not load ──
const result = check(mdl, "goldsrc");
for (const line of [
  ...result.warnings.map((warning) => `WARN ${warning}`),
  ...result.errors.map((error) => `ERROR ${error}`),
])
  console.log(line);
if (result.errors.length) process.exit(1);
const outputPath = join(OUT, basename(file));
writeFileSync(outputPath, mdl);

// ── before and after, as the player sees them, and the new one through its first animation ──
// both are drawn on the last frame of the first animation; a model that has no animations, with its bones
// at rest (and there is then nothing to draw a strip of)
const firstAnimation = sequences(original)[0];
const view = {
  view: "first",
  body: Number(body),
  seq: 0,
  frame: firstAnimation ? firstAnimation.frames - 1 : 0,
  width: 480,
  height: 360,
};
const beforeAfter = tile([render(original, view), render(mdl, view)], 2, ["before", "after"]);
writeFileSync(
  join(OUT, "swap_before_after.png"),
  png(beforeAfter.width, beforeAfter.height, beforeAfter.rgba),
);
if (firstAnimation) {
  const animation = strip(mdl, { view: "first", body: Number(body), seq: 0, count: 8 });
  writeFileSync(join(OUT, "swap_strip.png"), png(animation.width, animation.height, animation.rgba));
}
console.log(
  `${outputPath} (${original.length} -> ${mdl.length} bytes), swap_before_after.png${firstAnimation ? ", swap_strip.png" : " (no swap_strip.png: the model has no animations)"}`,
);
