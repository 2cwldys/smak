// A skeleton's proportions changed: longer legs, narrower shoulders, a longer back, with every animation kept.
//
//   reproportion(src, { "Bip01 L Thigh": 1.15, "Bip01 L Clavicle": 0.8, "Bip01 Spine": [1.05, 1, 1] }, opts)
//     -> { mdl, factors, mirrored, stride, lift, ground, boxes }
//
// A studio model's bone lengths are where each bone stands from its parent: its rest position, and the
// position channels of every frame of every animation. A frame's value is the bone's rest plus a stored step
// times the bone's scale (mdl.mjs), so multiplying a bone's rest position AND its position scale by one factor
// multiplies that position in every frame of every animation, those kept in other files (<name>01.mdl) too,
// with not one animation written again and no step rounded. The turns (the three angle channels) are not
// touched: every frame turns every joint exactly as it did.
//
// WHAT A FACTOR MEANS. A factor on a bone is that bone's LENGTH: it multiplies the place of each bone that hangs
// from it, in the bone's own axes. "Bip01 L Thigh": 1.2 puts the knee (the calf's place) 1.2 times as far down
// the thigh; the thigh itself stays where the pelvis has it. A number is the same on all three axes; [x, y, z]
// is each axis of the bone's own space (a Biped bone's x runs down its length). The other side's bone gets the
// same factor unless it is given its own (`mirror: false`: only what is named).
//
// THE GROUND AND THE STRIDE. A longer leg would put the feet under the floor and make a walk's planted foot
// slide, the game moving the monster by the sequence's own travel. So the root bones (those with no parent)
// are carried too: their x and y, and every sequence's travel (linearmovement), are multiplied by the stride,
// how much longer the leg is from the hip to the foot; their height becomes a line, z' = slope * z + lift,
// fitted over every frame of every animation that stands on the ground (its lowest point where the reference
// pose's is: the first idle unless told) so that each keeps its lowest point where it was. Standing, walking,
// crouching and lying come out with their feet on the floor as near as the pelvis keeps level over the legs.
//
// WHAT HANGS ON THE BONES. A mesh's points are kept in their bone's own space: they move with their bone and
// keep their shape. Nothing is stretched, as is right for rigid pieces (a robot's plates); a skinned body
// whose thigh grows shows a gap between its thigh's points and its calf's. Hit boxes and attachments on a bone
// that grows are multiplied by its factor (a thigh's box reaches the new knee). The eye goes with the bone
// nearest it. Each sequence's box is measured again through its frames, as studiomdl measures it, where its
// frames can be read (its own file, or `groups`); the others' boxes, and the header's, are carried from the
// reference pose's box before to after.
import { readMdl, readMesh, bodyOf, bones as bonesOf, boneParents, sequences as sequencesOf, sequenceAt, frameValues, poseOf, hitboxes as hitboxesOf, attachments as attachmentsOf, setHitboxes, setAttachments, setBoneValues, replaceSequence, modelBoxes, setModelBoxes, apply34, inverse34 } from "./mdl.mjs"; // prettier-ignore
import { boneIn, otherSideOf } from "./biped.mjs";
import { engineLayout } from "./layout.mjs";

/** The activity of an idle (ACT_IDLE): its first frame is where the ground is taken. */
const ACT_IDLE = 1;
const ONE = [1, 1, 1];
const isOne = (f) => f.every((v) => v === 1);
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const placeOf = (matrix) => matrix.map((row) => row[3]);

/** A factor as three numbers, or a throw naming the bone. */
function threeFactors(value, name) {
  const three = typeof value === "number" ? [value, value, value] : value;
  if (!Array.isArray(three) || three.length !== 3 || !three.every((v) => Number.isFinite(v) && v > 0))
    throw new Error(
      `reproportion: ${name} needs a factor over 0, or three [x, y, z], not ${JSON.stringify(value)}`,
    );
  return [...three];
}

/**
 * Each bone's factor, by number ([x, y, z], ONE where none), from the factors given by name: a Biped bone in
 * any of its names (boneIn: "Bip01 L Thigh" is hgrunt's "Bip01 L Leg"), mirrored to the other side unless told.
 */
function factorsOf(names, given, mirror) {
  const factor = names.map(() => ONE);
  const named = new Set();
  for (const [key, value] of Object.entries(given ?? {})) {
    const name = boneIn(key, names);
    if (!name)
      throw new Error(`reproportion: no bone ${JSON.stringify(key)}: the model has ${names.join(", ")}`);
    const i = names.indexOf(name);
    if (named.has(i)) throw new Error(`reproportion: ${name} is given twice (once as ${key})`);
    named.add(i);
    factor[i] = threeFactors(value, key);
  }
  const mirrored = [];
  if (mirror)
    for (const i of named) {
      const other = boneIn(otherSideOf(names[i]), names);
      const j = names.indexOf(other);
      if (j < 0 || j === i || named.has(j)) continue;
      factor[j] = [...factor[i]];
      mirrored.push(names[j]);
    }
  return { factor, mirrored };
}

/** Every point of the shown submodels (`body` a body number) or of every submodel (`body` null), with its bone. */
function pointsOf(src, body) {
  const info = readMdl(src);
  const shown = body === null ? null : bodyOf(src, body);
  const seen = new Set();
  const points = [];
  info.bodyparts.forEach((bodypart, i) =>
    bodypart.models.forEach((model, k) => {
      if (shown && shown[i] !== k) return;
      for (const mesh of model.meshes) {
        if (!mesh.numtris) continue;
        for (const tri of readMesh(src, model, mesh))
          for (const c of tri) {
            const key = `${i}.${k}.${c.bone}.${c.p.join()}`;
            if (seen.has(key)) continue;
            seen.add(key);
            points.push({ p: c.p, bone: c.bone });
          }
      }
    }),
  );
  return points;
}

/** The box about some points in a pose: { min, max }, or null for none. */
function boxIn(pose, points) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const { p, bone } of points) {
    const at = apply34(pose[bone], p);
    for (let a = 0; a < 3; a++) {
      if (at[a] < min[a]) min[a] = at[a];
      if (at[a] > max[a]) max[a] = at[a];
    }
  }
  return Number.isFinite(min[0]) ? { min, max } : null;
}

/** The pose the ground and the stride are taken in: { seq (a number, or null for the bones at rest), frame }. */
function referenceOf(src, ground, groups) {
  const all = sequencesOf(src);
  const readable = (q) => !all[q].group || Boolean(groups?.[all[q].group]);
  if (ground !== undefined && ground !== true && ground !== false) {
    const asked = typeof ground === "object" && ground !== null ? ground : { seq: ground };
    if (asked.seq === null || asked.seq === "rest") return { seq: null, frame: 0 };
    const seq = sequenceAt(src, asked.seq ?? 0);
    if (seq < 0) throw new Error(`reproportion: ground: no animation ${asked.seq}`);
    if (!readable(seq))
      throw new Error(`reproportion: ground: ${all[seq].name} is kept in another file: give groups`);
    return { seq, frame: Math.max(0, Math.min(all[seq].frames - 1, asked.frame ?? 0)) };
  }
  let seq = all.findIndex((s, q) => s.activity === ACT_IDLE && readable(q));
  if (seq < 0) seq = all.findIndex((_, q) => readable(q));
  return seq < 0 ? { seq: null, frame: 0 } : { seq, frame: 0 };
}
/** Every bone's six values in the reference pose. */
const valuesIn = (mdl, ref, groups) =>
  ref.seq === null
    ? bonesOf(mdl).map((bone) => [...bone.pos, ...bone.rot])
    : frameValues(mdl, ref.seq, ref.frame, 0, groups);

/** How near the ground the lowest point of a frame is for the frame to count as standing on it. */
const ON_GROUND = 1;
/** The least spread of the roots' heights (units, as a standard deviation) over which the slope is fitted. */
const LEAST_SPREAD = 1;
/**
 * The roots' height as a line, z' = slope * z + lift, that keeps the lowest point of every frame standing on the
 * ground where it stood: fitted by least squares over the frames of every animation that can be read whose lowest
 * point is within ON_GROUND of the reference's (`low`). A frame's lowest point after is its lowest with the
 * limbs changed (`limbs`) plus the root's rise, (slope - 1) * z + lift, so the line is the one through what each
 * frame needs. Null when fewer than two frames stand, or their heights barely differ (the slope then stays the
 * stride's).
 */
function groundFit(src, limbs, { root, low, shown, groups }) {
  const heights = [];
  const needs = [];
  const lowestIn = (pose) =>
    shown.reduce((v, { p, bone }) => Math.min(v, apply34(pose[bone], p)[2]), Infinity);
  sequencesOf(src).forEach((sequence, q) => {
    if (sequence.group && !groups?.[sequence.group]) return;
    for (let frame = 0; frame < sequence.frames; frame++) {
      const values = frameValues(src, q, frame, 0, groups);
      const was = lowestIn(poseOf(src, values));
      if (Math.abs(was - low) > ON_GROUND) continue;
      heights.push(values[root][2]);
      needs.push(was - lowestIn(poseOf(limbs, frameValues(limbs, q, frame, 0, groups))));
    }
  });
  if (heights.length < 2) return null;
  const n = heights.length;
  const meanZ = heights.reduce((a, b) => a + b, 0) / n;
  const meanT = needs.reduce((a, b) => a + b, 0) / n;
  const spread = heights.reduce((a, z) => a + (z - meanZ) ** 2, 0) / n;
  if (spread < LEAST_SPREAD ** 2) return null;
  const rise = heights.reduce((a, z, i) => a + (z - meanZ) * (needs[i] - meanT), 0) / (n * spread);
  return { line: [1 + rise, meanT - rise * meanZ], frames: n };
}

/**
 * Returns a copy of the model with its bones' lengths changed (see the top of this file):
 *   factors  { "bone": factor or [x, y, z] }: the bone's length, the place of every bone hanging from it, in its
 *            own axes. Names as the model has them, or a Biped bone in any of its names
 *   opts     mirror (true): the other side's bone gets the same factor unless given its own
 *            ground ({ seq, frame }; the first idle, frame 0, unless told; null for the bones at rest; false:
 *              the roots' height is left alone): the pose whose lowest point is kept where it was
 *            stride (measured unless told): what the roots' places and every travel are multiplied by
 *            fit (true): the roots' height a line fitted over every frame that stands (see groundFit); false:
 *              times the stride, lifted to put the reference pose's foot back
 *            body (0): the body number whose points are the ground's
 *            groups: the files of animations kept beside the model (sequenceFilesOf), for their boxes, the fit,
 *              and a ground in one of them
 * It returns { mdl, factors ({ bone: [x, y, z] } of those not 1), mirrored (bones given their other side's),
 * stride, lift, ground ({ seq, frame, bone, low, frames, slope } or null), boxes ({ measured, carried }) }.
 * With every factor 1 (and no stride) the file comes back as it was, byte for byte.
 */
export function reproportion(
  src,
  factors,
  { mirror = true, ground, stride, body = 0, groups, fit = true } = {},
) {
  const all = bonesOf(src);
  const names = all.map((bone) => bone.name);
  const parents = boneParents(src);
  const { factor, mirrored } = factorsOf(names, factors, mirror);
  if (stride !== undefined && !(Number.isFinite(stride) && stride > 0))
    throw new Error(`reproportion: stride is a number over 0, not ${stride}`);
  const told = Object.fromEntries(factor.flatMap((f, i) => (isOne(f) ? [] : [[names[i], f]])));
  if (factor.every(isOne) && (stride === undefined || stride === 1))
    return { mdl: Buffer.from(src), factors: told, mirrored, stride: 1, lift: 0, ground: null, boxes: { measured: 0, carried: [] } }; // prettier-ignore

  // the limbs: each bone's place, and the scale its stored steps are read by, times its parent's factor
  const limbs = setBoneValues(
    src,
    all.map((bone, i) => {
      const f = parents[i] >= 0 ? factor[parents[i]] : ONE;
      if (isOne(f)) return undefined;
      return {
        pos: bone.pos.map((v, a) => v * f[a]),
        scale: bone.scale.map((s, j) => (j < 3 ? s * f[j] : s)),
      };
    }),
  );

  // the reference pose before and after: the lowest point, the bone it is on, and that bone's place (the ankle)
  const ref = referenceOf(src, ground, groups);
  const before = poseOf(src, valuesIn(src, ref, groups));
  const after = poseOf(limbs, valuesIn(limbs, ref, groups));
  const shown = pointsOf(src, body);
  let lowest = null;
  for (const point of shown) {
    const z = apply34(before[point.bone], point.p)[2];
    if (!lowest || z < lowest.z) lowest = { z, bone: point.bone };
  }
  // a model of no points stands on its lowest bone
  if (!lowest)
    before.forEach((matrix, bone) => {
      if (!lowest || matrix[2][3] < lowest.z) lowest = { z: matrix[2][3], bone };
    });
  const foot = lowest.bone;
  // the stride: the hip (the highest bone above the foot whose length changed: nothing above it moved) to the foot
  let hip = -1;
  for (let i = parents[foot]; i >= 0; i = parents[i]) if (!isOne(factor[i])) hip = i;
  const was = hip < 0 ? 0 : distance(placeOf(before[foot]), placeOf(before[hip]));
  const r = stride ?? (was > 1e-6 ? distance(placeOf(after[foot]), placeOf(before[hip])) / was : 1);
  // the roots' height: times the stride and lifted so that the ankle is back where it was, or the line fitted
  // over every frame that stands; left alone with ground: false
  let root = foot;
  while (parents[root] >= 0) root = parents[root];
  const height = valuesIn(src, ref, groups)[root][2];
  const keepGround = ground !== false;
  const fitted = keepGround && fit ? groundFit(src, limbs, { root, low: lowest.z, shown, groups }) : null;
  const [up, lift] = !keepGround
    ? [1, 0]
    : (fitted?.line ?? [r, before[foot][2][3] - after[foot][2][3] + height - r * height]);
  const groundSaid = keepGround
    ? {
        seq: ref.seq === null ? null : sequencesOf(src)[ref.seq].name,
        frame: ref.frame,
        bone: names[foot],
        low: +lowest.z.toFixed(3),
        frames: fitted?.frames ?? 0,
        slope: up,
      }
    : null;

  // the roots: their places and scales on x and y times the stride, their height on its line
  let out = setBoneValues(
    limbs,
    all.map((bone, i) => {
      if (parents[i] >= 0 || (r === 1 && up === 1 && !lift)) return undefined;
      const slope = [r, r, up];
      return {
        pos: [bone.pos[0] * r, bone.pos[1] * r, bone.pos[2] * up + lift],
        scale: bone.scale.map((s, j) => (j < 3 ? s * slope[j] : s)),
      };
    }),
  );

  // hit boxes and attachments on a bone that grew, grown with it
  const boxes = hitboxesOf(src);
  if (boxes.some((box) => !isOne(factor[box.bone])))
    out = setHitboxes(
      out,
      boxes.map((box) => ({
        ...box,
        min: box.min.map((v, a) => v * factor[box.bone][a]),
        max: box.max.map((v, a) => v * factor[box.bone][a]),
      })),
    );
  const points = attachmentsOf(src);
  if (points.some((point) => !isOne(factor[point.bone])))
    out = setAttachments(
      out,
      points.map((point) => ({ ...point, pos: point.pos.map((v, a) => v * factor[point.bone][a]) })),
    );

  // the reference pose's box before and after, by which what cannot be measured is carried
  const everything = pointsOf(src, null);
  const finalRef = poseOf(out, valuesIn(out, ref, groups));
  const boxBefore = boxIn(before, everything);
  const boxAfter = boxIn(finalRef, everything);
  const carry = (v, a) => {
    if (!boxBefore) return v;
    const wide = boxBefore.max[a] - boxBefore.min[a];
    const k = wide > 1e-6 ? (boxAfter.max[a] - boxAfter.min[a]) / wide : 1;
    return boxAfter.min[a] + (v - boxBefore.min[a]) * k;
  };
  const carried = (p) => p.map(carry);

  // every sequence: its travel times the stride, its box measured through its frames or carried
  const said = { measured: 0, carried: [] };
  sequencesOf(src).forEach((sequence, q) => {
    const readable = !sequence.group || Boolean(groups?.[sequence.group]);
    let box = null;
    if (readable && everything.length) {
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (let blend = 0; blend < sequence.blends; blend++)
        for (let frame = 0; frame < sequence.frames; frame++) {
          const one = boxIn(poseOf(out, frameValues(out, q, frame, blend, groups)), everything);
          for (let a = 0; a < 3; a++) {
            min[a] = Math.min(min[a], one.min[a]);
            max[a] = Math.max(max[a], one.max[a]);
          }
        }
      box = { min, max };
      said.measured++;
    } else {
      box = { min: carried(sequence.bbmin), max: carried(sequence.bbmax) };
      said.carried.push(sequence.name);
    }
    const travels = sequence.movement.some((v) => v !== 0) && r !== 1;
    out = replaceSequence(out, q, {
      ...(travels ? { movement: sequence.movement.map((v) => v * r), motiontype: sequence.motiontype } : {}),
      bbmin: box.min,
      bbmax: box.max,
    });
  });

  // the header: the eye with the bone nearest it, the boxes carried (a box of nothing stays nothing)
  const header = modelBoxes(src);
  const changes = {};
  if (header.eyes.some((v) => v !== 0)) {
    let nearest = 0;
    before.forEach((matrix, i) => {
      if (distance(placeOf(matrix), header.eyes) < distance(placeOf(before[nearest]), header.eyes))
        nearest = i;
    });
    changes.eyes = apply34(finalRef[nearest], apply34(inverse34(before[nearest]), header.eyes));
  }
  for (const [lo, hi] of [
    ["min", "max"],
    ["bbmin", "bbmax"],
  ])
    if ([...header[lo], ...header[hi]].some((v) => v !== 0)) {
      changes[lo] = carried(header[lo]);
      changes[hi] = carried(header[hi]);
    }
  out = setModelBoxes(out, changes);

  return {
    mdl: engineLayout(out),
    factors: told,
    mirrored,
    stride: r,
    lift,
    ground: groundSaid,
    boxes: said,
  };
}
