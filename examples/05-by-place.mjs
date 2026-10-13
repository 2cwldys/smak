// Example 5: a model changed by place. It is worn and struck where a point is on its body, whatever texture
// that falls on, and loose pieces of it are taken off. For characters, monsters, vehicles: anything with
// more than one texture.
//
//   node examples/05-by-place.mjs <model.mdl> [output folder, default out] [--seq <animation to stand in>]
//        [--drop 59,36]
//
// It prints the model's loose pieces first. Give some of their numbers to --drop to see the model without
// them. To look at the results turning and moving beside the original:
// `node bin/smak.mjs view <output folder> <model.mdl>`.
//
// It writes <model>_worn.mdl into the output folder (and <model>_stripped.mdl when --drop is given), with
// <model>_by_place.png: the original and each result, side by side. When the check refuses one of the
// results, it says why and writes nothing.
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import {
  paint,
  surface,
  spot,
  pieces,
  dropTriangles,
  sequences,
  sequenceAt,
  readMdl,
  box,
  sub,
  check,
  lineup,
  png,
  workshop,
} from "../src/index.mjs";

// ── the command line: the two flags are taken out first, what is left is the file and the folder. Each
// thing that can be wrong with it is said in one line, and nothing is made ──
const args = process.argv.slice(2);
/** Says what is wrong and stops. */
const stop = (message) => {
  console.error(message);
  process.exit(1);
};
/** The value after `--name`, taken out of `args` with it; undefined when the flag is not there. */
const flag = (name) => {
  const position = args.indexOf(`--${name}`);
  if (position < 0) return undefined;
  const [, value] = args.splice(position, 2);
  if (value === undefined || value.startsWith("--")) stop(`--${name} needs a value after it`);
  return value;
};
const seqArg = flag("seq");
const dropArg = flag("drop");
const unknownFlag = args.find((word) => word.startsWith("--"));
if (unknownFlag) stop(`no flag ${unknownFlag}: there are --seq and --drop`);
const [file, OUT = "out"] = args;
if (!file) stop("usage: node examples/05-by-place.mjs <model.mdl> [output folder] [--seq n] [--drop ids]");
// --drop: piece numbers with commas between them
const dropIds = (dropArg ?? "").split(",").filter(Boolean);
if (dropArg !== undefined && (!dropIds.length || dropIds.some((id) => !/^\d+$/.test(id))))
  stop(`--drop takes the numbers of pieces with commas between them (59,36), and this is "${dropArg}"`);
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
const modelName = basename(file).replace(/\.mdl$/i, "");

// the pose everything is measured in: an animation in which the model stands as it is usually seen.
// The one asked for with --seq (a number or a name); or the first whose name has "idle" in it; or the
// first; or none, for a model without animations.
const allSequences = sequences(original);
if (seqArg !== undefined && sequenceAt(original, isNaN(seqArg) ? seqArg : Number(seqArg)) < 0)
  stop(
    allSequences.length
      ? `no animation ${seqArg}: it has ${allSequences.map((sequence, number) => `${number} ${sequence.name}`).join(", ")}`
      : `no animation ${seqArg}: ${file} has none`,
  );
try {
  mkdirSync(OUT, { recursive: true });
} catch (error) {
  // a file of that name is in the way, or the place cannot be written to
  stop(`the output folder ${OUT} cannot be made (${error.code})`);
}
const idle = allSequences.findIndex((sequence) => /idle/i.test(sequence.name));
const pose = {
  seq:
    seqArg !== undefined
      ? isNaN(seqArg)
        ? seqArg
        : Number(seqArg)
      : idle >= 0
        ? idle
        : allSequences.length
          ? 0
          : null,
  frame: 0,
};
/** A number kept between 0 and 1. */
const clamp = (value) => Math.min(1, Math.max(0, value));

// ── 1. what it is made of ──
// a "piece" is a group of triangles that touch one another: a helmet, a pouch, a whole body
const found = pieces(original, pose);
const noSuchPiece = dropIds.find((id) => Number(id) >= found.list.length);
if (noSuchPiece !== undefined)
  stop(`no piece ${noSuchPiece}: the model has pieces 0 to ${found.list.length - 1}`);
console.log("  id  texture                 tris   middle (x y z)        size (x y z)");
for (const piece of found.list.filter((candidate) => candidate.tris >= 6))
  console.log(
    `${String(piece.id).padStart(4)}  ${String(piece.tex).padEnd(22)} ${String(piece.tris).padStart(5)}   ${piece.mid.join(" ").padEnd(20)}  ${piece.mx.map((value, axis) => (value - piece.mn[axis]).toFixed(1)).join(" ")}`,
  );

// ── 2. worn by place: dirt from the ground up, soot in patches, and three strikes on its front ──
// the model's surface (a point and the way it faces, for every triangle) and the box it fills
const surfacePoints = surface(original, pose);
const bounds = box(surfacePoints.map((point) => point.p));
const tall = bounds.mx[2] - bounds.mn[2];
const wide = Math.max(bounds.mx[0] - bounds.mn[0], bounds.mx[1] - bounds.mn[1]);
const middle = bounds.mn.map((value, axis) => (value + bounds.mx[axis]) / 2);
const noiseScale = 72 / Math.max(tall, wide); // noise sized to the model, as if it were a person
// where the three strikes land: from in front of the model (+x), the place of its surface nearest each of
// three points given as shares of its width (y) and of its height (z); one that finds no surface is left out
const strikes = [
  [0.15, 0.72],
  [-0.2, 0.6],
  [0.05, 0.45],
]
  .map(([y, z]) =>
    spot(surfacePoints, [bounds.mx[0] + tall, middle[1] + y * wide, bounds.mn[2] + z * tall], [1, 0, 0]),
  )
  .filter(Boolean);
const strikeRadius = tall * 0.012;
// `paint` asks for the new colour of every pixel that shows somewhere on the model, telling where that
// place is (`p`), the way the surface faces there (`n`) and the colour it has now (`rgb`)
const { mdl: worn, shared } = paint(
  original,
  ({ p, n, rgb }) => {
    let colour = rgb;
    const brightness = (colour[0] + colour[1] + colour[2]) / 3;
    const heightShare = (p[2] - bounds.mn[2]) / tall; // 0 at its feet, 1 at its top
    // dirt: most on the lowest third, a little wherever the surface looks up, broken up by noise
    const dirt = clamp(
      (clamp(1 - heightShare / 0.3) ** 1.4 * 0.9 + clamp(n[2]) * 0.2) *
        (0.4 + 1.2 * workshop.fbm3(p, 0.9 * noiseScale, 3)),
    );
    colour = workshop.mix(colour, workshop.times([0.36, 0.31, 0.24], 0.55 + 0.9 * brightness), dirt * 0.85);
    // soot: near black, in the patches where a coarser noise is high
    colour = workshop.mix(
      colour,
      [0.05, 0.045, 0.04],
      clamp((workshop.fbm3(p, 0.32 * noiseScale, 21, 3) - 0.6) * 5.5) * 0.9,
    );
    // the strikes: `distance` is 1 on the rim of the mark
    for (const strike of strikes) {
      const distance = Math.hypot(...sub(p, strike.p)) / strikeRadius;
      if (distance > 3) continue;
      // a smudge all round it
      colour = workshop.mix(colour, workshop.times(colour, 0.35), clamp(1 - distance / 3) * 0.6);
      // a ring of bare stuff
      if (distance < 1.15)
        colour = workshop.mix(colour, [0.7, 0.71, 0.72], workshop.step(1.15, 0.75, distance) * 0.85);
      // the hole
      if (distance < 0.62)
        colour = workshop.mix(colour, [0.02, 0.02, 0.02], workshop.step(0.62, 0.42, distance));
    }
    return colour;
  },
  { pose },
);
// textures of which one pixel colours two places of the body (a left and a right arm, say): told, because
// a mark meant for one shows on the other too
const mirrored = Object.entries(shared)
  .filter(([, share]) => share > 0.05)
  .map(([texture, share]) => `${texture} ${Math.round(share * 100)}%`);
if (mirrored.length)
  console.log(
    `\nworn by two places of the body at once (a mark on one shows on the other): ${mirrored.join(", ")}`,
  );

// ── 3. pieces taken off ──
// `results` is what the last picture shows: [label, model] for the original and each thing made from it
const results = [
  ["as it was", original],
  ["worn", worn],
];
// the files to write, once every result has passed the check: [name, model]
const files = [[`${modelName}_worn.mdl`, worn]];
if (dropIds.length) {
  // every triangle that belongs to one of the pieces named goes
  const dropped = dropIds.map(Number);
  const { mdl, gone } = dropTriangles(original, (triangle) => dropped.includes(found.of(triangle)), pose);
  files.push([`${modelName}_stripped.mdl`, mdl]);
  results.push([`without ${dropped.join(" ")}`, mdl]);
  console.log(`\n${gone} triangles taken off`);
}

// ── check them against what the engine takes, and stop before writing a model that would not load ──
let refused = false;
for (const [label, mdl] of results.slice(1)) {
  const report = check(mdl);
  console.log(`${label}: ${report.errors.length ? report.errors.join("; ") : "fit for goldsrc"}`);
  if (report.errors.length) refused = true;
}
if (refused) process.exit(1);
for (const [name, mdl] of files) writeFileSync(join(OUT, name), mdl);
const picture = lineup(results, pose);
writeFileSync(join(OUT, `${modelName}_by_place.png`), png(picture.width, picture.height, picture.rgba));
console.log(
  `\n${join(OUT, `${modelName}_by_place.png`)}: look at it. A piece that left a gap is part of the body, not gear on it.`,
);
