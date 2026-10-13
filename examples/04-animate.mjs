// Example 4: a model's animations read as numbers, changed, and written back. One is replaced where it
// stands, one is added after the others, with a sound set off on one of its frames.
//
//   node examples/04-animate.mjs <model.mdl> [animation name or number, default 0]
//        [bone name, default the first with a parent] [output folder, default out]
//
// (Set VIEW=first in the environment for a first-person model, and BODY=<number> to draw another submodel
// than the first, in the pictures.)
//
// A frame is, for every bone, six numbers: where it is from its parent (x, y, z) and how it is turned about
// x, y and z (radians). So an animation is frames[frame][bone][0..5], and making one is arithmetic on those
// numbers. The game asks for a weapon's animations by NUMBER, in the order `smak info` lists them: replace
// one where it is, or add after the last; never reorder.
//
// It writes <model>_animated.mdl into the output folder, with animate_replaced.png and animate_added.png:
// eight moments of each of the two animations.
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import {
  readSequence,
  replaceSequence,
  addSequence,
  bones,
  sequences,
  sequenceAt,
  readMdl,
  events,
  check,
  strip,
  png,
} from "../src/index.mjs";

// ── the command line: each thing that can be wrong with it is said in one line, and nothing is made ──
const [file, sequenceArg = "0", boneName, OUT = "out"] = process.argv.slice(2);
/** Says what is wrong and stops. */
const stop = (message) => {
  console.error(message);
  process.exit(1);
};
if (!file) stop("usage: node examples/04-animate.mjs <model.mdl> [animation] [bone] [output folder]");
const viewToDraw = process.env.VIEW;
if (viewToDraw !== undefined && viewToDraw !== "first")
  stop(`VIEW is "first" or not set, and this is "${viewToDraw}"`);
const bodyToDraw = process.env.BODY ?? "0";
if (!/^\d+$/.test(bodyToDraw)) stop(`BODY is a whole number, and this is "${bodyToDraw}"`);
if (!statSync(file, { throwIfNoEntry: false })?.isFile()) stop(`there is no file ${file}`);
const original = readFileSync(file);
try {
  readMdl(original);
} catch (error) {
  stop(`${file}: ${error.message}`);
}
// all digits: the animation's number; anything else: its name
const sequenceId = /^\d+$/.test(sequenceArg) ? Number(sequenceArg) : sequenceArg;
const oldList = sequences(original);
if (!oldList.length) stop(`${file} has no animations to change`);
if (sequenceAt(original, sequenceId) < 0)
  stop(
    `no animation ${sequenceArg}: it has ${oldList.map((sequence, number) => `${number} ${sequence.name}`).join(", ")}`,
  );
const allBones = bones(original);
// the bone that will be swung: the one named, or the first that hangs from another
const boneIndex = boneName
  ? allBones.findIndex((bone) => bone.name === boneName)
  : allBones.findIndex((bone) => bone.parent >= 0);
if (boneIndex < 0)
  stop(
    boneName
      ? `no bone ${boneName}: it has ${allBones.map((bone) => bone.name).join(", ")}`
      : `${file} has no bone that hangs from another: name the bone to swing (it has ${allBones.map((bone) => bone.name).join(", ")})`,
  );
try {
  mkdirSync(OUT, { recursive: true });
} catch (error) {
  // a file of that name is in the way, or the place cannot be written to
  stop(`the output folder ${OUT} cannot be made (${error.code})`);
}
const oldSequence = readSequence(original, sequenceId);
console.log(
  `${oldSequence.name}: ${oldSequence.frames.length} frames at ${oldSequence.fps} fps; moving the bone ${allBones[boneIndex].name}`,
);

// ── replaced where it stands: the same motion at half the speed, eased in and out ──
/**
 * The pose at a moment between two frames (`time` 3.25: a quarter of the way from frame 3 to frame 4).
 * Frames in between are mixed number by number, which is right for the small turn between two neighbours.
 */
const poseAt = (frames, time) => {
  const frameBefore = Math.min(frames.length - 1, Math.floor(time));
  const frameAfter = Math.min(frames.length - 1, frameBefore + 1);
  const share = time - frameBefore;
  return frames[frameBefore].map((boneValues, bone) =>
    boneValues.map((value, channel) => value + (frames[frameAfter][bone][channel] - value) * share),
  );
};
/** 0..1 to 0..1, slow at both ends and quick in the middle. */
const ease = (share) => share * share * (3 - 2 * share);
// twice the frames (less one) at the same frames a second: half the speed
const slowFrameCount = Math.max(2, oldSequence.frames.length * 2 - 1);
const slow = Array.from({ length: slowFrameCount }, (_, frame) =>
  poseAt(oldSequence.frames, ease(frame / (slowFrameCount - 1)) * (oldSequence.frames.length - 1)),
);
let mdl = replaceSequence(original, sequenceId, { frames: slow });

// ── added after the others: one bone swung through a sine on top of the animation's first frame ──
// 31 frames, each the first frame with the bone's turn about y (its fifth number) moved by up to 0.35
// radians each way: one full swing there and back
const firstFrame = oldSequence.frames[0];
const swing = Array.from({ length: 31 }, (_, frame) =>
  firstFrame.map((values, bone) =>
    bone === boneIndex
      ? [
          values[0],
          values[1],
          values[2],
          values[3],
          values[4] + 0.35 * Math.sin((2 * Math.PI * frame) / 30),
          values[5],
        ]
      : values,
  ),
);
// event 5004 is the engine's "play this sound": here on frame 15, half way through
mdl = addSequence(mdl, {
  name: "smak_swing",
  fps: 30,
  loops: true,
  frames: swing,
  events: [{ frame: 15, event: 5004, options: "weapons/swing.wav" }],
});

// ── check it and write it; nothing is written for a model the check refuses ──
const report = check(mdl);
if (report.errors.length) {
  console.error(report.errors.join("\n"));
  process.exit(1);
}
const outputPath = join(OUT, `${basename(file, ".mdl")}_animated.mdl`);
writeFileSync(outputPath, mdl);
const newList = sequences(mdl);
const added = newList.length - 1; // the new animation's number: the last
console.log(
  `${outputPath}: animation ${oldSequence.index} "${oldSequence.name}" now ${newList[oldSequence.index].frames} frames; animation ${added} "${newList[added].name}" added, with ${events(mdl, added).length} event`,
);

// ── look at them: eight moments of each ──
for (const [name, which] of [
  ["animate_replaced", { seq: oldSequence.index }],
  ["animate_added", { seq: added }],
]) {
  const picture = strip(mdl, {
    ...which,
    count: 8,
    view: viewToDraw,
    body: Number(bodyToDraw),
  });
  writeFileSync(join(OUT, `${name}.png`), png(picture.width, picture.height, picture.rgba));
}
console.log(`${OUT}: animate_replaced.png, animate_added.png`);
