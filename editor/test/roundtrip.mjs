// The editor's arithmetic checked against a real model, with no page and no browser:
//
//   node editor/test/roundtrip.mjs [model.mdl] [body]
//
//   model.mdl   unless told: v_1hswords.mdl in the folder SMAK_MODELS names (unless told:
//               run-msc/msc/models/viewmodels of the checkout the kit is in)
//   body        the body whose points are measured and drawn (1 unless told)
//
// 1. every animation opened, its keys thinned with tolerance 0, baked: the poses have to be the original's;
// 2. one animation thinned with four real tolerances: how many keys are left and how far the bones and any
//    point of the model move. A looser tolerance never leaves more keys; and for the model the test is
//    written for (v_1hswords.mdl, its attack1) each number is kept under a bound measured on it;
// 3. a key set with the patch that undoes it; an event added and read back; an animation duplicated at the
//    end; a pose mirrored twice, and (for that model) the mirrored left hand near the right hand's place.
//
// One line is printed for each check ("ok" or "FAIL"), then "all passed" or "<n> FAILED"; the exit code is 1
// when a check failed. Writes only under build/editor/test.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve, dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { newProject, patchProject, readProject, bakeProject, saveBake, sourceAt, smak } from "../project.mjs";
import {
  opThin,
  opNudge,
  opEvents,
  opDuplicate,
  opSettings,
  animOf,
  bakeAnim,
  poseError,
  applyPatch,
  mirrorPose,
  mirrorMap,
  mirrorPlane,
  mpt,
  worldOf,
} from "../core.mjs";

// ROOT is the checkout the kit lies in (the folder above smak/); everything written goes under its build/
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT = join(ROOT, "build/editor/test");
const modelPath = resolve(
  process.argv[2] ??
    join(process.env.SMAK_MODELS ?? join(ROOT, "run-msc/msc/models/viewmodels"), "v_1hswords.mdl"),
);
const body = Number(process.argv[3] ?? 1);
// The numbers of parts 2 and 3 have bounds for this model only: they were measured on it. Each bound is about
// half as much again as what a good run printed when it was set (0.7.1), in the comment beside it.
const MEASURED_MODEL = "v_1hswords.mdl";
const MEASURED_ANIM = "attack1";
// thinned within so many degrees and units: at most so many keys left (of 2800), the bones at most so many
// units and degrees from where they were, any point of the model at most so many units
const THINNING_BOUNDS = [
  { degrees: 0.25, units: 0.01, keys: 260, bonesUnits: 0.15, bonesDegrees: 0.5, points: 0.2 }, // 174, 0.080, 0.31, 0.127
  { degrees: 0.5, units: 0.02, keys: 240, bonesUnits: 0.35, bonesDegrees: 1.25, points: 0.55 }, // 162, 0.207, 0.81, 0.370
  { degrees: 1, units: 0.05, keys: 210, bonesUnits: 0.7, bonesDegrees: 2.2, points: 1.1 }, // 140, 0.466, 1.42, 0.718
  { degrees: 3, units: 0.1, keys: 185, bonesUnits: 1.3, bonesDegrees: 4.5, points: 2.6 }, // 123, 0.836, 3.03, 1.728
];
// mirrored, the left hand is at most so far from the right hand's place reflected (4.02 units)
const HANDS_APART_MOST = 6;
mkdirSync(OUT, { recursive: true });
const projectPath = join(OUT, "roundtrip.smakproj.json");
rmSync(projectPath, { force: true });

// The source model as the editor holds it: `buf` is the file's bytes; `ctx` its bones, its animations (seqs)
// and base(n), the frames of animation n as the file has them.
const source = sourceAt(modelPath);
const ctx = source.ctx;

// The one helper every check goes through: prints the line and counts the failures.
let failed = 0;
const check = (condition, text) => {
  console.log(`${condition ? "ok  " : "FAIL"}  ${text}`);
  if (!condition) failed++;
};

/** The bytes of a model file, read the way the editor reads its source. */
function readModel(path) {
  return sourceAt(path).buf;
}

/** The largest distance between the same corner of the model in two files, over every frame of an animation. */
function pointsApart(modelA, modelB, anim, frameCount) {
  let worst = 0;
  for (let frame = 0; frame < frameCount; frame++) {
    const trianglesA = smak.posed(modelA, { seq: anim, frame, body }).tris;
    const trianglesB = smak.posed(modelB, { seq: anim, frame, body }).tris;
    for (let triangle = 0; triangle < trianglesA.length; triangle++)
      for (let corner = 0; corner < 3; corner++) {
        const pointA = trianglesA[triangle].c[corner].p;
        const pointB = trianglesB[triangle].c[corner].p;
        worst = Math.max(
          worst,
          Math.hypot(pointA[0] - pointB[0], pointA[1] - pointB[1], pointA[2] - pointB[2]),
        );
      }
  }
  return worst;
}

// 1. tolerance 0 on every animation
// A project in which every animation has been thinned with tolerance 0. Animations the game mixes from
// several (`group` set: the editor refuses to key them) are left as they are, here and in the comparison
// below.
let project = newProject(modelPath, projectPath);
for (let anim = 0; anim < ctx.seqs.length; anim++)
  if (!ctx.seqs[anim].group)
    project = applyPatch(project, opThin(project, ctx, anim, { rot: 0, pos: 0 }).set).project;

// Baked (the time printed is the bake's alone), then compared with the source: every bone's matrix at every
// frame, and every corner of the body.
const bakeStarted = Date.now();
const bakedModel = bakeProject(project, projectPath).mdl;
const bakeMs = Date.now() - bakeStarted;
let worstMatrixValue = 0; // the largest difference in any number of any bone's matrix
let worstPoint = 0; // the furthest any corner of the model is from where the source has it
let keysLeft = 0; // keys in the thinned project
let keysDense = 0; // keys if every bone had one on every frame, as the file has them
for (let anim = 0; anim < ctx.seqs.length; anim++) {
  if (ctx.seqs[anim].group) continue;
  const sourceFrames = ctx.base(anim);
  const bakedFrames = smak.readSequence(bakedModel, anim).frames;
  for (let frame = 0; frame < sourceFrames.length; frame++)
    for (let bone = 0; bone < ctx.bones.length; bone++) {
      const sourceMatrix = smak.poseAt(source.buf, anim, frame)[bone];
      const bakedMatrix = smak.poseAt(bakedModel, anim, frame)[bone];
      for (let row = 0; row < 3; row++)
        for (let column = 0; column < 4; column++)
          worstMatrixValue = Math.max(
            worstMatrixValue,
            Math.abs(sourceMatrix[row][column] - bakedMatrix[row][column]),
          );
    }
  worstPoint = Math.max(
    worstPoint,
    pointsApart(source.buf, bakedModel, anim, Math.min(sourceFrames.length, bakedFrames.length)),
  );
  keysDense += sourceFrames.length * ctx.bones.length;
  keysLeft += Object.values(project.anims[anim].keys).reduce(
    (count, boneKeys) => count + Object.keys(boneKeys).length,
    0,
  );
}
check(
  worstMatrixValue < 1e-4 && worstPoint < 1e-3,
  `tolerance 0, ${ctx.seqs.length} animations: ${keysDense} keys to ${keysLeft}; baked in ${bakeMs} ms; the largest difference in any bone matrix is ${worstMatrixValue.toExponential(2)}, in any point of the model ${worstPoint.toExponential(2)} units`,
);
check(
  smak.check(bakedModel, "xash").errors.length === 0,
  `the baked model passes check for xash (${bakedModel.length} bytes, the source ${source.buf.length})`,
);
check(
  smak
    .sequences(bakedModel)
    .map((sequence) => sequence.name)
    .join() === ctx.seqs.map((sequence) => sequence.name).join(),
  "the animations are in the order they were",
);

// 2. a real tolerance on one animation
// The animation the rest of the test works on: the first whose name has "attack1" in it, or animation 0.
const chosenAnim =
  ctx.seqs.findIndex((sequence) => /attack1/i.test(sequence.name)) >= 0
    ? ctx.seqs.findIndex((sequence) => /attack1/i.test(sequence.name))
    : 0;
// whether the bounds measured on the test's own model apply to this run
const measuredHere =
  basename(modelPath).toLowerCase() === MEASURED_MODEL && ctx.seqs[chosenAnim].name === MEASURED_ANIM;
// Four tolerances, from the tightest to the loosest, each on a fresh project. Each leaves fewer keys than
// there were and no more than the tolerance before it left; on the measured model each number is under its
// bound.
let keysLeftBefore = Infinity;
for (const bound of THINNING_BOUNDS) {
  let trial = newProject(modelPath, projectPath);
  const thinning = opThin(trial, ctx, chosenAnim, { rot: bound.degrees, pos: bound.units });
  trial = applyPatch(trial, thinning.set).project;
  const thinnedFrames = bakeAnim(animOf(trial, ctx, chosenAnim), ctx);
  const error = poseError(ctx.bones, ctx.base(chosenAnim), thinnedFrames);
  const trialModel = bakeProject(trial, projectPath).mdl;
  const points = pointsApart(source.buf, trialModel, chosenAnim, thinnedFrames.length);
  const withinBounds =
    !measuredHere ||
    (thinning.after <= bound.keys &&
      error.units <= bound.bonesUnits &&
      error.degrees <= bound.bonesDegrees &&
      points <= bound.points);
  const boundsText = measuredHere
    ? ` (at most ${bound.keys} keys, ${bound.bonesUnits} units and ${bound.bonesDegrees} degrees, ${bound.points} units)`
    : " (no bounds for this model: only the keys are checked)";
  check(
    thinning.after < thinning.before && thinning.after <= keysLeftBefore && withinBounds,
    `${ctx.seqs[chosenAnim].name} within ${bound.degrees} degrees, ${bound.units} units: ${thinning.before} keys to ${thinning.after}; bones apart at most ${error.units.toFixed(3)} units and ${error.degrees.toFixed(2)} degrees (frame ${error.frame}, ${error.bone}); points of the model at most ${points.toFixed(3)} units${boundsText}`,
  );
  keysLeftBefore = thinning.after;
}

// 3. the file: a key and its undo, an event, a duplicate
// From here the project is changed where it lies on disk, through patchProject, as the page and the command
// line change it. First the chosen animation thinned (revision 1).
project = newProject(modelPath, projectPath);
const thinnedOnDisk = patchProject(
  projectPath,
  { ...opThin(project, ctx, chosenAnim, { rot: 0.5, pos: 0.02 }), by: "agent" },
  project,
);
// The bone that gets the key (the right hand or forearm; the last bone of a model that has neither) and the
// frame: the middle of the animation.
const keyedBone =
  ctx.bones.find((bone) => /R Hand|R Forearm/i.test(bone.name))?.name ?? ctx.bones[ctx.bones.length - 1].name;
const keyedFrame = Math.floor(ctx.seqs[chosenAnim].frames / 2);
const animsBeforeKey = JSON.stringify(thinnedOnDisk.project.anims);

// The bone turned 25 degrees at that frame: the project changes and its revision goes up by one.
const keyed = patchProject(projectPath, {
  ...opNudge(thinnedOnDisk.project, ctx, chosenAnim, keyedBone, keyedFrame, { rot: [0, 0, 25] }),
  by: "agent",
});
check(
  JSON.stringify(keyed.project.anims) !== animsBeforeKey && keyed.project.rev === 2,
  `a key on ${keyedBone} at frame ${keyedFrame}: rev ${keyed.project.rev}`,
);

// The inverse that patchProject gave back for that change, applied: the keys are what they were, to the
// letter.
const undone = patchProject(projectPath, { set: keyed.inverse, what: "undo", by: "agent" });
check(
  JSON.stringify(undone.project.anims) === animsBeforeKey,
  "the patch's inverse puts the keys back exactly",
);

// The key set again (the inverse of the undo), then an event added at frame 5, the animation duplicated at
// the end, and the duplicate made twice as long less one frame, at 20 frames a second.
patchProject(projectPath, { set: undone.inverse, what: "redo", by: "agent" });
project = readProject(projectPath);
const eventsWithOneMore = [
  ...animOf(project, ctx, chosenAnim).events,
  { frame: 5, event: 5004, options: "weapons/swingsmall.wav" },
];
project = patchProject(projectPath, {
  ...opEvents(project, ctx, chosenAnim, eventsWithOneMore),
  by: "agent",
}).project;
// duplicate.n is the number the new animation gets
const duplicate = opDuplicate(project, ctx, chosenAnim, "attack1_slow");
project = patchProject(projectPath, { ...duplicate, by: "agent" }).project;
project = patchProject(projectPath, {
  ...opSettings(project, ctx, duplicate.n, { frames: ctx.seqs[chosenAnim].frames * 2 - 1, fps: 20 }),
  by: "agent",
}).project;

// Saved as the page's Save does it (bake, write, check), and the written file read back.
const saveReport = saveBake(project, projectPath);
const savedModel = readModel(saveReport.out);
check(
  saveReport.errors.length === 0,
  `saved ${saveReport.out} (${saveReport.bytes} bytes), check for ${saveReport.engine}: ${saveReport.errors.length} errors, ${saveReport.warnings.length} warnings`,
);
check(
  smak
    .events(savedModel, chosenAnim)
    .some((event) => event.frame === 5 && event.options === "weapons/swingsmall.wav"),
  `the event is read back by smak: ${JSON.stringify(smak.events(savedModel, chosenAnim))}`,
);

// The saved model has one animation more, the duplicate, with the name, length and rate it was given; the
// animations that were there are still at their numbers.
const savedAnims = smak.sequences(savedModel);
check(
  savedAnims.length === ctx.seqs.length + 1 &&
    savedAnims[duplicate.n].name === "attack1_slow" &&
    savedAnims[duplicate.n].frames === ctx.seqs[chosenAnim].frames * 2 - 1 &&
    savedAnims[duplicate.n].fps === 20,
  `the duplicate is animation ${duplicate.n} of ${savedAnims.length}: ${savedAnims[duplicate.n].name}, ${savedAnims[duplicate.n].frames} frames at ${savedAnims[duplicate.n].fps} fps, events ${JSON.stringify(smak.events(savedModel, duplicate.n).map((event) => event.frame))}`,
);
check(
  savedAnims
    .slice(0, ctx.seqs.length)
    .map((sequence) => sequence.name)
    .join() === ctx.seqs.map((sequence) => sequence.name).join(),
  "the others kept their numbers",
);

// Mirroring (the page's "mirror the pose"): the source's pose at the keyed frame mirrored twice has to be the
// pose it was, bone matrix for bone matrix. Mirrored once, the left hand is where the right hand was,
// reflected in the plane, but for what the skeleton lacks of being alike on both sides at rest: on the
// measured model that is kept under HANDS_APART_MOST. How many bones have another side is for reading only.
{
  const pose = ctx.base(chosenAnim)[keyedFrame];
  const mirroredOnce = mirrorPose(ctx.bones, pose);
  const mirroredTwice = mirrorPose(ctx.bones, mirroredOnce);
  const worldBefore = worldOf(ctx.bones, pose);
  const worldTwice = worldOf(ctx.bones, mirroredTwice);
  const worldOnce = worldOf(ctx.bones, mirroredOnce);
  const otherSideOf = mirrorMap(ctx.bones); // for each bone, the number of its partner on the other side
  let largestDifference = 0;
  let handsApart = 0;
  worldBefore.forEach((matrix, bone) =>
    matrix.forEach((value, index) => {
      largestDifference = Math.max(largestDifference, Math.abs(value - worldTwice[bone][index]));
    }),
  );
  const leftHand = ctx.bones.findIndex((bone) => /L Hand/.test(bone.name));
  const rightHand = otherSideOf[leftHand];
  if (leftHand >= 0 && rightHand !== leftHand) {
    // a bone's place is the last column of its matrix: entries 3, 7 and 11
    const reflected = mpt(mirrorPlane(ctx.bones).m, [
      worldBefore[rightHand][3],
      worldBefore[rightHand][7],
      worldBefore[rightHand][11],
    ]);
    handsApart = Math.hypot(
      worldOnce[leftHand][3] - reflected[0],
      worldOnce[leftHand][7] - reflected[1],
      worldOnce[leftHand][11] - reflected[2],
    );
  }
  check(
    largestDifference < 1e-4,
    `a pose mirrored twice is itself (largest difference ${largestDifference.toExponential(1)}); ${otherSideOf.filter((partner, bone) => partner !== bone).length} bones have another side; the plane is through ${mirrorPlane(ctx.bones).o.map((value) => value.toFixed(1))} with normal ${mirrorPlane(ctx.bones).n.map((value) => value.toFixed(2))}`,
  );
  const handsHaveSides = leftHand >= 0 && rightHand !== leftHand;
  check(
    !measuredHere || (handsHaveSides && handsApart <= HANDS_APART_MOST),
    handsHaveSides
      ? `mirrored, the left hand is ${handsApart.toFixed(2)} units from the right hand's place reflected${measuredHere ? ` (at most ${HANDS_APART_MOST}` : " (no bound for this model"}: what the skeleton lacks of being alike on both sides at rest)`
      : "the skeleton has no left hand with a right one to mirror to",
  );
}

// The key is in the saved model: some corner of the body is somewhere else than in the source.
const furthestPoint = pointsApart(source.buf, savedModel, chosenAnim, ctx.seqs[chosenAnim].frames);
check(
  furthestPoint > 0.5,
  `the key moved the model: a point is ${furthestPoint.toFixed(2)} units from where it was`,
);

// A picture to look at: eight frames of the animation from the eye, the original above and the saved below.
const stripOptions = { seq: chosenAnim, view: "first", body, count: 8, cols: 8, width: 240, height: 180 };
const originalStrip = smak.strip(source.buf, stripOptions);
const savedStrip = smak.strip(savedModel, stripOptions);
const stacked = {
  width: originalStrip.width,
  height: originalStrip.height * 2,
  rgba: new Uint8Array(originalStrip.width * originalStrip.height * 8),
};
stacked.rgba.set(originalStrip.rgba, 0);
stacked.rgba.set(savedStrip.rgba, originalStrip.rgba.length);
writeFileSync(join(OUT, "roundtrip_strip.png"), smak.png(stacked.width, stacked.height, stacked.rgba));
console.log(`      ${join(OUT, "roundtrip_strip.png")}: the original above, the saved model below`);

console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
