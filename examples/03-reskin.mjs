// Example 3: a model's texture changed. It is taken out, painted over by rule, and put back. The shape and
// its layout in the picture stay, so this is the least risky change there is.
//
//   node examples/03-reskin.mjs <model.mdl> [texture name or number, default 0] [output folder, default out]
//
// (`smak info <model.mdl>` lists the textures. Set BODY=<number> in the environment to draw another
// submodel than the first in the picture.)
//
// Three ways are shown, from the cheapest:
//   1. the palette alone (256 colours): a tint, a darker or a worn look, with every pixel left where it was
//   2. the pixels, painted again from the old ones by a rule
//   3. (in a comment) a picture somebody painted by hand, read from a PNG or a BMP
// To see where each part of the shape takes its colour from before painting:
// `smak uv <model.mdl> -o <folder>`.
//
// It writes <model>_tinted.mdl and <model>_rusted.mdl into the output folder, with reskin.png (the original
// and the two side by side) and reskin_uv.png (the texture with the triangles that wear it drawn over it).
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import {
  textureOf,
  replaceTexture,
  rgbOf,
  rgbaOf,
  indexed,
  check,
  render,
  tile,
  png,
  uvMap,
  workshop,
  readMdl,
} from "../src/index.mjs";

// ── the command line: each thing that can be wrong with it is said in one line, and nothing is made ──
const [file, which = "0", OUT = "out"] = process.argv.slice(2);
/** Says what is wrong and stops. */
const stop = (message) => {
  console.error(message);
  process.exit(1);
};
if (!file) stop("usage: node examples/03-reskin.mjs <model.mdl> [texture name or number] [output folder]");
const bodyToDraw = process.env.BODY ?? "0";
if (!/^\d+$/.test(bodyToDraw)) stop(`BODY is a whole number, and this is "${bodyToDraw}"`);
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
// all digits: the texture's number; anything else: its name
const textureId = /^\d+$/.test(which) ? Number(which) : which;
const textureNames = info.textures.map((texture) => texture.name);
const known =
  typeof textureId === "number"
    ? textureId < textureNames.length
    : textureNames.some((name) => name.toLowerCase() === textureId.toLowerCase());
if (!known)
  stop(`no texture ${which}: it has ${textureNames.map((name, number) => `${number} ${name}`).join(", ")}`);
try {
  mkdirSync(OUT, { recursive: true });
} catch (error) {
  // a file of that name is in the way, or the place cannot be written to
  stop(`the output folder ${OUT} cannot be made (${error.code})`);
}
// the texture as it is: its name, size, flags, its 256 colours (`palette`, 768 bytes: r g b of each) and,
// for each pixel, which of them it is
const oldTexture = textureOf(original, textureId);
console.log(`${oldTexture.name}: ${oldTexture.width}x${oldTexture.height}, flags ${oldTexture.flags}`);

// ── 1. the palette: colder and darker ──
// every colour's red, green and blue multiplied by its own factor
const palette = Uint8Array.from(oldTexture.palette, (value, i) =>
  Math.min(255, Math.round(value * [0.62, 0.78, 1.05][i % 3])),
);
// a masked texture's last colour is its holes: it has to stay as it is
if (oldTexture.flags & 64) palette.set(oldTexture.palette.subarray(765), 765);
const tinted = replaceTexture(original, textureId, { ...oldTexture, palette });

// ── 2. the pixels: the old picture with rust eaten into it, by the workshop's noise ──
// the old picture as plain red, green and blue, three bytes a pixel
const image = rgbOf({ width: oldTexture.width, height: oldTexture.height, rgba: rgbaOf(oldTexture) });
for (let y = 0; y < oldTexture.height; y++)
  for (let x = 0; x < oldTexture.width; x++) {
    const offset = (y * oldTexture.width + x) * 3;
    const was = [image.rgb[offset] / 255, image.rgb[offset + 1] / 255, image.rgb[offset + 2] / 255];
    // where a cloud of noise is above its middle the metal is eaten (0..1), and rust is mixed in there
    const eaten = workshop.step(0.5, 0.68, workshop.fbm(x / 14, y / 14, 3, 4));
    const colour = workshop.mix(was, workshop.rust(x / 9, y / 9, 5), eaten * 0.85);
    for (let channel = 0; channel < 3; channel++)
      image.rgb[offset + channel] = Math.round(255 * Math.min(1, colour[channel]));
  }
// cut to 256 colours again and put back under the old name, with the old flags
// (a masked texture would go through `masked` instead of `indexed`, to keep its holes)
const rusted = replaceTexture(original, textureId, {
  ...indexed(image, oldTexture.name),
  flags: oldTexture.flags,
});

// ── 3. a picture painted by hand ──
//   import { textureFrom } from "../src/index.mjs";
//   const mine = replaceTexture(original, textureId,
//     { ...textureFrom(readFileSync("painted.png"), oldTexture.name), flags: oldTexture.flags });
// It may be of another size: every corner that wears it is moved to the same place in the new picture.

// ── check both and write them; nothing is written for a model the check refuses ──
for (const [name, mdl] of [
  ["tinted", tinted],
  ["rusted", rusted],
]) {
  const report = check(mdl);
  if (report.errors.length) {
    console.error(report.errors.join("\n"));
    process.exit(1);
  }
  writeFileSync(join(OUT, `${basename(file, ".mdl")}_${name}.mdl`), mdl);
}

// ── look at them: the three side by side, and the texture's map ──
const view = { width: 400, height: 400, body: Number(bodyToDraw) };
const sideBySide = tile([render(original, view), render(tinted, view), render(rusted, view)], 3, [
  "as it was",
  "palette tinted",
  "rusted",
]);
writeFileSync(join(OUT, "reskin.png"), png(sideBySide.width, sideBySide.height, sideBySide.rgba));
const map = uvMap(original, textureId);
writeFileSync(join(OUT, "reskin_uv.png"), png(map.width, map.height, map.rgba));
console.log(
  `${OUT}: two models, reskin.png (the three side by side), reskin_uv.png (${map.triangles} triangles wear ${oldTexture.name})`,
);
