// A figure (a studio model of a body that stands: a man, a robot, an orc) as neutral facts, which every judge of
// src/figures/ reads: its skeleton (the bones of a body found by their Biped names in any of their languages, or
// by plain words when it has none), its height as it stands, and its triangles in the body's own frame (x to its
// left, y to its front, z up from its lowest point) with the bone, the part of the body and the texture each is
// on, and where it lies on the texture in texels. Only this file knows GoldSrc: the measures read what it gives.
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { readMdl, bones as bonesOf, sequences, withTextures, textureOf } from "../mdl.mjs";
import { posed } from "../render.mjs";
import { boneIn } from "../biped.mjs";

/** The parts of a body a triangle can belong to. */
export const PARTS = ["head", "torso", "arm", "hand", "leg", "foot", "other"];

/** The bones looked for, by their Biped names, and the part each begins. */
const ROLES = {
  pelvis: ["Bip01 Pelvis", "torso"],
  spine: ["Bip01 Spine", "torso"],
  neck: ["Bip01 Neck", "torso"],
  head: ["Bip01 Head", "head"],
  lClavicle: ["Bip01 L Clavicle", "torso"],
  rClavicle: ["Bip01 R Clavicle", "torso"],
  lUpper: ["Bip01 L UpperArm", "arm"],
  rUpper: ["Bip01 R UpperArm", "arm"],
  lFore: ["Bip01 L Forearm", "arm"],
  rFore: ["Bip01 R Forearm", "arm"],
  lHand: ["Bip01 L Hand", "hand"],
  rHand: ["Bip01 R Hand", "hand"],
  lThigh: ["Bip01 L Thigh", "leg"],
  rThigh: ["Bip01 R Thigh", "leg"],
  lCalf: ["Bip01 L Calf", "leg"],
  rCalf: ["Bip01 R Calf", "leg"],
  lFoot: ["Bip01 L Foot", "foot"],
  rFoot: ["Bip01 R Foot", "foot"],
};

/** Bodyparts that hold what is carried, not the body: left out of the figure. */
const CARRIED = /gun|weapon|wpn|rifle|pistol|sword|shield|item|hold/i;
/** A figure has at least this many triangles on its body. */
const LEAST_TRIANGLES = 12;
/** A figure stands: its head above this share of its height, its feet under this, its legs at least this long. */
const HEAD_ABOVE = 0.55;
const FEET_UNDER = 0.4;
const LEGS_LEAST = 0.2;

/** A model's bones found by plain words, for one without Biped names: `{ role: bone }`. */
function byWords(names, parents) {
  const side = (n, s) =>
    new RegExp(`(^|[^a-z])(${s === "l" ? "l|left|sx" : "r|right|dx"})([^a-z]|$)`, "i").test(n);
  const find = (re, s) => names.findIndex((n) => re.test(n) && (!s || side(n, s)));
  const depth = (b) => {
    let d = 0;
    for (let x = b; x >= 0; x = parents[x]) d++;
    return d;
  };
  // the last bone of a limb named by `re`: the deepest of them on that side
  const deepest = (re, s) =>
    names
      .map((n, i) => i)
      .filter((i) => re.test(names[i]) && side(names[i], s))
      .sort((a, b) => depth(b) - depth(a))[0] ?? -1;
  const found = { head: find(/head|skull|testa/i) };
  for (const s of ["l", "r"]) {
    found[`${s}Hand`] = find(/hand|wrist|palm|mano/i, s);
    found[`${s}Foot`] = find(/foot|ankle|piede/i, s);
    if (found[`${s}Hand`] < 0) found[`${s}Hand`] = deepest(/arm|elbow/i, s);
    if (found[`${s}Foot`] < 0) found[`${s}Foot`] = deepest(/leg|calf|shin|knee/i, s);
  }
  if (Object.values(found).some((v) => v < 0)) return null;
  // the limbs' upper bones: up each chain to where it meets the other side's
  const up = (b) => {
    const out = [];
    for (let x = b; x >= 0; x = parents[x]) out.push(x);
    return out;
  };
  const meet = (a, b) => {
    const theirs = new Set(up(b));
    return up(a).filter((x) => !theirs.has(x));
  };
  const arm = meet(found.lHand, found.rHand); // hand ... first bone of the arm
  const armR = meet(found.rHand, found.lHand);
  const leg = meet(found.lFoot, found.rFoot);
  const legR = meet(found.rFoot, found.lFoot);
  if (leg.length >= 2) [found.lCalf, found.lThigh] = [leg[1], leg.at(-1)];
  if (legR.length >= 2) [found.rCalf, found.rThigh] = [legR[1], legR.at(-1)];
  if (arm.length >= 3) [found.lFore, found.lUpper] = [arm[1], arm[2]];
  if (armR.length >= 3) [found.rFore, found.rUpper] = [armR[1], armR[2]];
  return found;
}

/**
 * The bones of the body: `{ bones: { role: bone number }, by: "biped" | "words" }`, or null when no head, two
 * hands and two feet are found. `names` and `parents`: the model's bones' names and parents' numbers.
 */
export function skeletonOf(names, parents) {
  const found = {};
  for (const [role, [biped]] of Object.entries(ROLES)) {
    const name = boneIn(biped, names);
    if (name) found[role] = names.indexOf(name);
  }
  const needed = ["head", "lHand", "rHand", "lFoot", "rFoot"];
  if (needed.every((r) => found[r] !== undefined)) return { bones: found, by: "biped" };
  const words = byWords(names, parents);
  return words
    ? { bones: Object.fromEntries(Object.entries(words).filter(([, v]) => v >= 0)), by: "words" }
    : null;
}

/** For each bone, the part of the body it moves: the first bone of a part up its chain decides. */
function partsOf(parents, skeleton) {
  const begins = new Map();
  for (const [role, bone] of Object.entries(skeleton)) begins.set(bone, ROLES[role]?.[1] ?? "other");
  return parents.map((_, b) => {
    for (let x = b; x >= 0; x = parents[x]) if (begins.has(x)) return begins.get(x);
    return "other";
  });
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => {
  const l = Math.hypot(...a) || 1;
  return a.map((v) => v / l);
};
const mid = (a, b) => a.map((v, i) => (v + b[i]) / 2);

/**
 * The animation a figure is measured and drawn standing in: the number of its idle (the game's activity for
 * standing, else a name that says idle and not crouching, swimming, sitting or lying), else its first; -1 for
 * the bones at rest (no animation inside the file).
 */
export function standingSeq(src) {
  const seqs = sequences(src);
  const ok = (i) => i >= 0 && !seqs[i].group;
  let which = seqs.findIndex((s, i) => ok(i) && s.activity === 1);
  if (which < 0)
    which = seqs.findIndex(
      (s, i) => ok(i) && /idle/i.test(s.name) && !/crouch|duck|swim|sit|lie|prone/i.test(s.name),
    );
  if (which < 0 && ok(0)) which = 0;
  return which;
}

/**
 * A model file read for the judges, its textures put in from `<name>t.mdl` when kept there: `{ src }`, or
 * `{ skip }`, why it is no figure to measure (no triangles: a file of animations or textures; its textures in a
 * file that is not there).
 */
export function loadFigure(file) {
  let src = readFileSync(file);
  const info = readMdl(src);
  if (!info.bodyparts.some((p) => p.models.some((m) => m.meshes.some((x) => x.numtris))))
    return { skip: "no triangles (an animation or texture file)" };
  if (!info.textures.length) {
    const tfile = file.replace(/\.mdl$/i, "t.mdl");
    if (!existsSync(tfile)) return { skip: "its textures are in a file that is not there" };
    src = withTextures(src, readFileSync(tfile));
  }
  return { src };
}

/**
 * The facts of a figure: `{ skip }` when the model is no standing figure (and why), else `{ hash, by, height,
 * pose, bones: [{ name, part }], joints: { role: [x, y, z] }, tris, textures, mdl }`. `src`: the model's bytes,
 * its textures inside it (`loadFigure` reads a file so), or a file's path. Points are in the body's frame: x to
 * its left, y to its front, z up from its lowest point, in the file's units. A triangle: `{ p: [[x,y,z] ×3],
 * bone: [b ×3], part, tex, uv: [[u,v] ×3] (texels), axes: its bone's three axes }`. It stands as its idle's
 * first frame has it (`standingSeq`), or the bones at rest. Bodyparts named for what is carried (gun, weapon,
 * sword, shield ...) are left out. `withPixels`: each texture's RGB pixels too (the texture measures need them).
 */
export function figureFacts(src, { withPixels = true } = {}) {
  if (typeof src === "string") {
    const loaded = loadFigure(src);
    if (loaded.skip) return loaded;
    src = loaded.src;
  }
  const b = src;
  const info = readMdl(b);
  if (!info.bodyparts.some((p) => p.models.some((m) => m.meshes.some((x) => x.numtris))))
    return { skip: "no triangles (an animation or texture file)" };
  const list = bonesOf(b);
  const names = list.map((x) => x.name);
  const parents = list.map((x) => x.parent);
  const skeleton = skeletonOf(names, parents);
  if (!skeleton) return { skip: "no head, two hands and two feet among its bones" };
  const part = partsOf(parents, skeleton.bones);

  // as it stands: an idle's first frame (the game's activity for standing, or a name saying so), else the
  // first animation's, when the file holds it; else the bones at rest
  const seqs = sequences(b);
  let which = standingSeq(b);
  let shown;
  try {
    shown = posed(b, { seq: which >= 0 ? which : null, frame: 0 });
  } catch {
    shown = posed(b, { seq: null });
    which = -1;
  }
  const pose = which >= 0 ? seqs[which].name : "rest";
  const at = (bone) => [0, 1, 2].map((r) => shown.pose[bone][r][3]);
  const sk = skeleton.bones;

  // the body's frame: up from the feet to the head, across from right to left
  const feet = mid(at(sk.lFoot), at(sk.rFoot));
  const up = unit(sub(at(sk.head), feet));
  const thighs = sk.lThigh !== undefined && sk.rThigh !== undefined;
  const across = sub(thighs ? at(sk.lThigh) : at(sk.lHand), thighs ? at(sk.rThigh) : at(sk.rHand));
  let left = sub(
    across,
    up.map((v) => v * dot(across, up)),
  );
  if (Math.hypot(...left) < 1e-6) left = unit(cross(up, [1, 0, 0]));
  left = unit(left);
  const front = cross(up, left); // x left, y front, z up is right-handed when front = up × left
  const toBody = (p) => {
    const d = sub(p, feet);
    return [dot(d, left), dot(d, front), dot(d, up)];
  };
  const dirToBody = (n) => [dot(n, left), dot(n, front), dot(n, up)];

  // the triangles, but for what is carried; chrome textures have no place on the texture (the engine makes it)
  const carried = new Set(
    info.bodyparts.map((p, i) => (CARRIED.test(p.name) ? i : -1)).filter((i) => i >= 0),
  );
  const texIndex = new Map(info.textures.map((t, i) => [t.index, i]));
  const tris = [];
  for (const t of shown.tris) {
    if (carried.has(t.where.bodypart)) continue;
    const bone = t.c.map((c) => c.bone);
    const counts = {};
    for (const x of bone) counts[part[x]] = (counts[part[x]] ?? 0) + 1;
    const p = Object.entries(counts).sort((a, c) => c[1] - a[1])[0][0];
    const main = bone[0] === bone[1] || bone[0] === bone[2] ? bone[0] : bone[1];
    const m = shown.pose[main];
    tris.push({
      p: t.c.map((c) => toBody(c.p)),
      bone,
      part: p,
      tex: t.tex ? (texIndex.get(t.tex.index) ?? -1) : -1,
      uv: t.c.map((c) => [c.u, c.v]),
      axes: [0, 1, 2].map((k) => dirToBody([m[0][k], m[1][k], m[2][k]])),
    });
  }
  if (tris.length < LEAST_TRIANGLES) return { skip: "almost no triangles on the body" };
  let lo = Infinity,
    hi = -Infinity;
  for (const t of tris)
    for (const q of t.p) {
      lo = Math.min(lo, q[2]);
      hi = Math.max(hi, q[2]);
    }
  for (const t of tris) for (const q of t.p) q[2] -= lo;
  const height = hi - lo;
  if (!(height > 1)) return { skip: "no height" };
  const joints = Object.fromEntries(
    Object.entries(sk).map(([role, bone]) => {
      const q = toBody(at(bone));
      q[2] -= lo;
      return [role, q];
    }),
  );
  // a figure stands: its head high, its feet low, its legs a good part of it (a snark or a rat on a Biped's
  // bones does not)
  if (joints.head[2] < height * HEAD_ABOVE)
    return { skip: "its head is not high above its feet as it stands" };
  if (Math.max(joints.lFoot[2], joints.rFoot[2]) > height * FEET_UNDER)
    return { skip: "its feet are not on the ground as it stands" };
  const legOf = (s) =>
    joints[`${s}Thigh`] ? Math.hypot(...sub(joints[`${s}Thigh`], joints[`${s}Foot`])) : height;
  if (Math.max(legOf("l"), legOf("r")) < height * LEGS_LEAST)
    return { skip: "its legs are too short for a standing figure" };

  const textures = info.textures.map((t, i) => {
    const out = { name: t.name, width: t.width, height: t.height, flags: t.flags };
    if (withPixels) {
      const x = textureOf(b, i);
      out.index = x.pixels;
      out.rgb = new Uint8Array(x.pixels.length * 3);
      for (let k = 0; k < x.pixels.length; k++)
        out.rgb.set(x.palette.subarray(x.pixels[k] * 3, x.pixels[k] * 3 + 3), k * 3);
    }
    return out;
  });
  return {
    hash: createHash("sha1").update(b).digest("hex").slice(0, 16),
    by: skeleton.by,
    pose,
    height,
    bones: names.map((name, i) => ({ name, part: part[i] })),
    joints,
    tris,
    textures,
    mdl: b,
  };
}
