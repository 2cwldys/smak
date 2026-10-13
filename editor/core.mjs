// The editor's arithmetic, shared word for word by the page (in the browser) and by the server and the
// command line (in Node): what a project says an animation is, how its keys are interpolated into every-frame
// values, and every edit as a small patch on the project. Nothing here touches a file, a Buffer or the DOM.
//
//   a frame     for each bone, six numbers: x y z from its parent, then the turn about x, y, z in radians (as
//               smak's)
//   a key       one bone's six numbers at one frame
//   ctx         what is known of the source model: { bones: [{ name, parent, pos, rot }], seqs: [{ name, fps,
//               frames, loops, events }], base(n): the source animation's frames }
//   a patch     { what, set: [{ path: [..], value }] }; a value of null removes what is at the path
export const FORMAT = "smakproj 1";
export const DEG = Math.PI / 180;
// a cosine, or an entry of a matrix, this near 1: two turns are as good as one, or the angles are at the pole
// where two of the three turn about the same axis
const ALMOST_ONE = 0.9999995;
// thinning never asks for nearer than this: a tolerance of 0 would keep keys for the rounding alone
const LEAST_TOLERANCE = 1e-7;
// two values of a pose nearer than this are the same: pasting sets no key for such a bone
const SAME_VALUE = 1e-6;
// a sum of directions shorter than this points nowhere
const NO_LENGTH = 1e-6;
// the most an animation may have: frames, frames a second, letters in its name, letters in an event's text
const FRAMES_MOST = 2000;
const FPS_MOST = 1000;
const NAME_MOST = 31;
const EVENT_TEXT_MOST = 63;
const round7 = (v) => Math.round(v * 1e7) / 1e7;
export const round = (values) => values.map(round7);

// ── quaternions [x, y, z, w], and the engine's angles (about x, then y, then z) ──
export function qOf(rx, ry, rz) {
  // the sine and cosine of half the turn about x (r), about y (p) and about z (y)
  const sr = Math.sin(rx / 2);
  const cr = Math.cos(rx / 2);
  const sp = Math.sin(ry / 2);
  const cp = Math.cos(ry / 2);
  const sy = Math.sin(rz / 2);
  const cy = Math.cos(rz / 2);
  return [
    sr * cp * cy - cr * sp * sy,
    cr * sp * cy + sr * cp * sy,
    cr * cp * sy - sr * sp * cy,
    cr * cp * cy + sr * sp * sy,
  ];
}
export const qMul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
export const qInv = (q) => [-q[0], -q[1], -q[2], q[3]];
export const qDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
export const qUnit = (q) => {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
};
export const qAxis = (axis, angle) => {
  const s = Math.sin(angle / 2);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
};
/** From one turn to another the short way round. */
export function slerp(a, b, t) {
  let cosine = qDot(a, b);
  const sign = cosine < 0 ? -1 : 1;
  cosine = Math.abs(cosine);
  // nearly the same turn: a straight mix, made a unit again, is as good and divides by nothing small
  if (cosine > ALMOST_ONE) return qUnit(a.map((v, i) => v + (sign * b[i] - v) * t));
  const angle = Math.acos(cosine);
  const scale = 1 / Math.sin(angle);
  const weightA = Math.sin((1 - t) * angle) * scale;
  const weightB = Math.sin(t * angle) * scale * sign;
  return a.map((v, i) => v * weightA + b[i] * weightB);
}
/** The angle between two turns, in radians. */
export const qAngle = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(qDot(a, b))));
export function eulerOfQ(q) {
  const [x, y, z, w] = q;
  // the entries of the turn's matrix that the angles are read from: m20 is row 2, column 0
  const m20 = 2 * (x * z - w * y);
  const m21 = 2 * (y * z + w * x);
  const m22 = 1 - 2 * (x * x + y * y);
  const m10 = 2 * (x * y + w * z);
  const m00 = 1 - 2 * (y * y + z * z);
  if (Math.abs(m20) < ALMOST_ONE) return [Math.atan2(m21, m22), Math.asin(-m20), Math.atan2(m10, m00)];
  return [Math.atan2(-2 * (y * z - w * x), 1 - 2 * (x * x + z * z)), m20 < 0 ? Math.PI / 2 : -Math.PI / 2, 0];
}

// ── matrices: 12 numbers, three rows of four, a bone's space to the model's ──
/** A bone's matrix from its six values: the turn about x, then y, then z, and the place. */
export function matOf(values) {
  const sx = Math.sin(values[3]);
  const cx = Math.cos(values[3]);
  const sy = Math.sin(values[4]);
  const cy = Math.cos(values[4]);
  const sz = Math.sin(values[5]);
  const cz = Math.cos(values[5]);
  return [
    cy * cz,
    sx * sy * cz - cx * sz,
    cx * sy * cz + sx * sz,
    values[0],
    cy * sz,
    sx * sy * sz + cx * cz,
    cx * sy * sz - sx * cz,
    values[1],
    -sy,
    sx * cy,
    cx * cy,
    values[2],
  ];
}
/** Two matrices as one: `b` done first, then `a`. */
export function mmul(a, b) {
  const out = new Array(12);
  for (let r = 0; r < 12; r += 4) {
    for (let c = 0; c < 4; c++) out[r + c] = a[r] * b[c] + a[r + 1] * b[4 + c] + a[r + 2] * b[8 + c];
    out[r + 3] += a[r + 3];
  }
  return out;
}
/** The matrix that undoes one made of a turn and a move. */
export const minv = (m) => [
  m[0],
  m[4],
  m[8],
  -(m[0] * m[3] + m[4] * m[7] + m[8] * m[11]),
  m[1],
  m[5],
  m[9],
  -(m[1] * m[3] + m[5] * m[7] + m[9] * m[11]),
  m[2],
  m[6],
  m[10],
  -(m[2] * m[3] + m[6] * m[7] + m[10] * m[11]),
];
/** A point taken through a matrix. */
export const mpt = (m, p) => [
  m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3],
  m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7],
  m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11],
];
export function eulerOfMat(m) {
  if (Math.abs(m[8]) < ALMOST_ONE) return [Math.atan2(m[9], m[10]), Math.asin(-m[8]), Math.atan2(m[4], m[0])];
  return [Math.atan2(-m[6], m[5]), m[8] < 0 ? Math.PI / 2 : -Math.PI / 2, 0];
}
export const qOfMat = (m) => qOf(...eulerOfMat(m));
/** Every bone's matrix for a frame's values. */
export function worldOf(bones, values) {
  const out = [];
  for (let i = 0; i < bones.length; i++) {
    const local = matOf(values[i]);
    out.push(bones[i].parent < 0 ? local : mmul(out[bones[i].parent], local));
  }
  return out;
}
/** The skeleton's rest pose as a frame's values. */
export const restValues = (bones) => bones.map((bone) => [...bone.pos, ...bone.rot]);

// ── keys and what lies between them ────────────────────────────────────────
/**
 * A bone's keys ({ frame: six numbers }) laid out for evaluating: frames in order, values, and turns each on
 * the side of the one before.
 */
export function trackOf(keys) {
  const frames = Object.keys(keys)
    .map(Number)
    .sort((a, b) => a - b);
  const values = frames.map((k) => keys[k]);
  const turns = [];
  values.forEach((value, i) => {
    let turn = qOf(value[3], value[4], value[5]);
    if (i && qDot(turn, turns[i - 1]) < 0) turn = turn.map((t) => -t);
    turns.push(turn);
  });
  return { frames, values, turns };
}
/**
 * A track at a frame: { p, q, key (the key's number in the track when the frame is one, else -1) }. Before
 * the first key and after the last it holds. `smooth`: a curve through the keys (Catmull-Rom by the keys' own
 * spacing); otherwise straight.
 */
export function evalPQ(track, frame, smooth) {
  const count = track.frames.length;
  const atKey = (index) => ({ p: track.values[index].slice(0, 3), q: track.turns[index], key: index });
  if (frame <= track.frames[0]) return atKey(0);
  if (frame >= track.frames[count - 1]) return atKey(count - 1);
  // the two keys the frame lies between, found by halving
  let lo = 0;
  let hi = count - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (track.frames[mid] <= frame) lo = mid;
    else hi = mid;
  }
  if (track.frames[lo] === frame) return atKey(lo);
  const left = lo;
  const right = lo + 1;
  const gap = track.frames[right] - track.frames[left];
  const share = (frame - track.frames[left]) / gap;
  if (!smooth)
    return {
      p: [0, 1, 2].map(
        (a) => track.values[left][a] + (track.values[right][a] - track.values[left][a]) * share,
      ),
      q: slerp(track.turns[left], track.turns[right], share),
      key: -1,
    };
  // a cubic through the two keys (Hermite's four weights), its slope at each key that of the line through the
  // keys either side of it
  const t2 = share * share;
  const t3 = t2 * share;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + share;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  const outerLeft = Math.max(left - 1, 0);
  const outerRight = Math.min(right + 1, count - 1);
  const spanLeft = track.frames[right] - track.frames[outerLeft];
  const spanRight = track.frames[outerRight] - track.frames[left];
  const curve = (get) => {
    const atLeft = get(left);
    const atRight = get(right);
    return (
      h00 * atLeft +
      (h10 * gap * (atRight - get(outerLeft))) / spanLeft +
      h01 * atRight +
      (h11 * gap * (get(outerRight) - atLeft)) / spanRight
    );
  };
  return {
    p: [0, 1, 2].map((a) => curve((k) => track.values[k][a])),
    q: qUnit([0, 1, 2, 3].map((a) => curve((k) => track.turns[k][a]))),
    key: -1,
  };
}
/** The same as six numbers: a key's own, to the digit, at a key. */
export function evalTrack(track, frame, smooth) {
  const made = evalPQ(track, frame, smooth);
  return made.key >= 0 ? track.values[made.key].slice() : [...made.p, ...eulerOfQ(made.q)];
}
/** Two frames' values of one bone mixed: what the engine shows between two frames. */
export function mix(a, b, share) {
  if (!share) return a;
  return [
    a[0] + (b[0] - a[0]) * share,
    a[1] + (b[1] - a[1]) * share,
    a[2] + (b[2] - a[2]) * share,
    ...eulerOfQ(slerp(qOf(a[3], a[4], a[5]), qOf(b[3], b[4], b[5]), share)),
  ];
}

// ── what a project says an animation is ────────────────────────────────────
/** A bone's number for a number or a name, or an error that lists the bones there are. */
export const boneAt = (ctx, bone) => {
  const index =
    typeof bone === "number"
      ? bone
      : ctx.bones.findIndex((x) => x.name.toLowerCase() === String(bone).toLowerCase());
  if (!ctx.bones[index])
    throw new Error(`no bone ${bone}: there are ${ctx.bones.map((x, i) => `${i} ${x.name}`).join(", ")}`);
  return index;
};
/** The animation's number for a number or a name (the project's added animations included), or an error. */
export function animAt(project, ctx, which) {
  const list = animList(project, ctx);
  const number = /^\d+$/.test(String(which))
    ? Number(which)
    : (list.find((a) => a.name.toLowerCase() === String(which).toLowerCase())?.n ?? -1);
  if (!list.some((a) => a.n === number))
    throw new Error(`no animation ${which}: there are ${list.map((a) => `${a.n} ${a.name}`).join(", ")}`);
  return number;
}
/** Every animation the baked model will have, in order: the source's, then the project's added ones. */
export function animList(project, ctx) {
  const anims = project.anims ?? {};
  const list = ctx.seqs.map((seq, n) => ({
    n,
    name: seq.name,
    fps: anims[n]?.fps ?? seq.fps,
    frames: anims[n]?.frames ?? seq.frames,
    loops: anims[n]?.loops ?? seq.loops,
    added: false,
    outside: Boolean(seq.group),
    edited: Boolean(anims[n]),
  }));
  for (const n of Object.keys(anims)
    .map(Number)
    .filter((k) => k >= ctx.seqs.length)
    .sort((a, b) => a - b)) {
    const entry = anims[n];
    const seq = ctx.seqs[entry.copyOf];
    if (seq)
      list.push({
        n,
        name: entry.name,
        fps: entry.fps ?? seq.fps,
        frames: entry.frames ?? seq.frames,
        loops: entry.loops ?? seq.loops,
        added: true,
        outside: false,
        edited: true,
      });
  }
  return list;
}
/**
 * One animation as the project has it: its settings, its keys by bone name, its events, and the source frames
 * under it.
 */
export function animOf(project, ctx, number) {
  const entry = project.anims?.[number] ?? {};
  const added = number >= ctx.seqs.length;
  const baseN = added ? entry.copyOf : number;
  const seq = ctx.seqs[baseN];
  if (!seq) throw new Error(`no animation ${number}`);
  const base = ctx.base(baseN);
  return {
    n: number,
    name: entry.name ?? seq.name,
    added,
    baseN,
    base,
    fps: entry.fps ?? seq.fps,
    loops: entry.loops ?? seq.loops,
    count: entry.frames ?? base.length,
    smooth: (entry.interp ?? "smooth") !== "linear",
    keys: entry.keys ?? {},
    events: entry.events ?? seq.events ?? [],
    entry: project.anims?.[number],
  };
}
/**
 * One bone of the source animation at a frame of the project's: the same frame, or, when the length was
 * changed, the same moment.
 */
export function baseAt(anim, frame, bone) {
  const sourceCount = anim.base.length;
  if (anim.count === sourceCount) return anim.base[frame][bone];
  const moment = anim.count > 1 ? (frame * (sourceCount - 1)) / (anim.count - 1) : 0;
  const first = Math.min(sourceCount - 1, Math.floor(moment));
  return mix(anim.base[first][bone], anim.base[Math.min(first + 1, sourceCount - 1)][bone], moment - first);
}
/** One bone's values at every frame: from its keys when it has any, else the source's. */
export function bakeBone(anim, ctx, bone) {
  const keys = anim.keys[ctx.bones[bone].name];
  if (!keys || !Object.keys(keys).length)
    return Array.from({ length: anim.count }, (_, frame) => baseAt(anim, frame, bone).slice());
  const track = trackOf(keys);
  return Array.from({ length: anim.count }, (_, frame) => evalTrack(track, frame, anim.smooth));
}
/** The animation as the file wants it: frames[frame][bone] = six numbers. */
export function bakeAnim(anim, ctx) {
  const columns = ctx.bones.map((_, bone) => bakeBone(anim, ctx, bone));
  return Array.from({ length: anim.count }, (_, frame) => columns.map((column) => column[frame]));
}
/** A bone that has no keys yet, given one at every frame: how an animation opens. */
export function denseKeys(anim, ctx, bone) {
  const column = bakeBone(anim, ctx, bone);
  return Object.fromEntries(column.map((values, frame) => [frame, round(values)]));
}

/**
 * The fewest keys that give a bone's every-frame values back within `rot` (radians) and `pos` (units), by the
 * animation's own way of interpolating. The first and last frames always stay (a bone that does not move
 * keeps those two: a key put between them later bends it there and lets it come back).
 */
export function thinTrack(dense, rot, pos, smooth) {
  const count = dense.length;
  const turns = dense.map((v) => qOf(v[3], v[4], v[5]));
  const rotLimit = Math.max(rot, LEAST_TOLERANCE);
  const posLimit = Math.max(pos, LEAST_TOLERANCE);
  const keep = new Set([0, count - 1]);
  // between each two keys kept, the frame furthest out of tolerance becomes a key too, until none is out
  for (;;) {
    const kept = [...keep].sort((a, b) => a - b);
    const track = trackOf(Object.fromEntries(kept.map((k) => [k, dense[k]])));
    let added = false;
    for (let span = 0; span + 1 < kept.length; span++) {
      // an error of 1 is the tolerance itself
      let worst = 1;
      let worstAt = -1;
      for (let frame = kept[span] + 1; frame < kept[span + 1]; frame++) {
        const made = evalPQ(track, frame, smooth);
        const error = Math.max(
          Math.hypot(made.p[0] - dense[frame][0], made.p[1] - dense[frame][1], made.p[2] - dense[frame][2]) /
            posLimit,
          qAngle(made.q, turns[frame]) / rotLimit,
        );
        if (error > worst) {
          worst = error;
          worstAt = frame;
        }
      }
      if (worstAt >= 0) {
        keep.add(worstAt);
        added = true;
      }
    }
    if (!added) break;
  }
  return Object.fromEntries([...keep].sort((a, b) => a - b).map((k) => [k, round(dense[k])]));
}
/**
 * How far two versions of an animation are apart at their worst: { units (a bone's origin, in the model's
 * space), degrees (a bone's turn, in the model's space), frame, bone }. Both have to have the same number of
 * frames.
 */
export function poseError(bones, first, second) {
  const worst = { units: 0, degrees: 0, frame: 0, bone: "" };
  for (let frame = 0; frame < Math.min(first.length, second.length); frame++) {
    const worldA = worldOf(bones, first[frame]);
    const worldB = worldOf(bones, second[frame]);
    for (let bone = 0; bone < bones.length; bone++) {
      const apart = Math.hypot(
        worldA[bone][3] - worldB[bone][3],
        worldA[bone][7] - worldB[bone][7],
        worldA[bone][11] - worldB[bone][11],
      );
      const turned = qAngle(qOfMat(worldA[bone]), qOfMat(worldB[bone])) / DEG;
      if (apart > worst.units) {
        worst.units = apart;
        worst.frame = frame;
        worst.bone = bones[bone].name;
      }
      if (turned > worst.degrees) worst.degrees = turned;
    }
  }
  return worst;
}

// ── left and right ─────────────────────────────────────────────────────────
// How a bone's name says which side it is on, and how the other side's name is made from it: a lone L or R
// between spaces, underscores or dots ("Bip01 L Hand"), or the words left and right.
const SIDES = [
  [/(^|[ _.])L([ _.]|$)/, "$1R$2", /(^|[ _.])R([ _.]|$)/, "$1L$2"],
  [/left/i, "right", /right/i, "left"],
];
/** For each bone, the bone of the other side by its name (itself when it has none). */
export function mirrorMap(bones) {
  const indexOf = new Map(bones.map((bone, i) => [bone.name.toLowerCase(), i]));
  return bones.map((bone, i) => {
    for (const [left, toRight, right, toLeft] of SIDES)
      for (const [from, to] of [
        [left, toRight],
        [right, toLeft],
      ])
        if (from.test(bone.name)) {
          const other = indexOf.get(bone.name.replace(from, to).toLowerCase());
          if (other !== undefined && other !== i) return other;
        }
    return i;
  });
}
/**
 * The plane the skeleton is alike on both sides of, from where its paired bones rest: { n, o, m (the
 * reflection in it, as a matrix) }. With no pairs: the model's own middle, y = 0.
 */
export function mirrorPlane(bones) {
  const rest = worldOf(bones, restValues(bones));
  const pair = mirrorMap(bones);
  let normal = [0, 0, 0];
  let point = [0, 0, 0];
  let count = 0;
  pair.forEach((other, i) => {
    if (other <= i) return;
    const left = [rest[i][3], rest[i][7], rest[i][11]];
    const right = [rest[other][3], rest[other][7], rest[other][11]];
    const across = [right[0] - left[0], right[1] - left[1], right[2] - left[2]];
    // every pair's line from left to right is summed the same way round, whichever of the two comes first
    const sign = across[0] * normal[0] + across[1] * normal[1] + across[2] * normal[2] < 0 ? -1 : 1;
    normal = normal.map((v, k) => v + sign * across[k]);
    point = point.map((v, k) => v + (left[k] + right[k]) / 2);
    count++;
  });
  const length = Math.hypot(...normal);
  // no pairs, or pairs whose lines cancel out: the model's own middle
  if (!count || length < NO_LENGTH) {
    normal = [0, 1, 0];
    point = [0, 0, 0];
  } else {
    normal = normal.map((v) => v / length);
    point = point.map((v) => v / count);
  }
  // how far the plane is from the origin, along its normal
  const offset = normal[0] * point[0] + normal[1] * point[1] + normal[2] * point[2];
  return {
    n: normal,
    o: point,
    m: [0, 1, 2].flatMap((r) => [
      ...[0, 1, 2].map((c) => (r === c ? 1 : 0) - 2 * normal[r] * normal[c]),
      2 * offset * normal[r],
    ]),
  };
}
/**
 * A pose with left and right changed over: each bone takes the other side's motion from rest, mirrored in the
 * skeleton's middle plane. A bone with no other side that hangs from one that has (a weapon in a hand) keeps
 * its own values.
 */
export function mirrorPose(bones, values) {
  const rest = worldOf(bones, restValues(bones));
  const world = worldOf(bones, values);
  const pair = mirrorMap(bones);
  const mirror = mirrorPlane(bones).m;
  const flip = (matrix) => mmul(mmul(mirror, matrix), mirror);
  const under = bones.map((bone) => {
    for (let ancestor = bone.parent; ancestor >= 0; ancestor = bones[ancestor].parent)
      if (pair[ancestor] !== ancestor) return true;
    return false;
  });
  const out = [];
  const worldNow = [];
  bones.forEach((bone, i) => {
    if (pair[i] === i && under[i]) {
      worldNow.push(mmul(worldNow[bone.parent], matOf(values[i])));
      out.push(values[i].slice());
      return;
    }
    const other = pair[i];
    const mirrored = mmul(flip(mmul(world[other], minv(rest[other]))), rest[i]);
    const local = bone.parent < 0 ? mirrored : mmul(minv(worldNow[bone.parent]), mirrored);
    worldNow.push(mirrored);
    out.push(round([local[3], local[7], local[11], ...eulerOfMat(local)]));
  });
  return out;
}

// ── patches ────────────────────────────────────────────────────────────────
/** A copy of anything a project holds, through JSON; what is not there is null. */
const clone = (value) => (value === undefined ? null : JSON.parse(JSON.stringify(value)));
/**
 * A project with a patch's changes made: { project (a new one), inverse (the `set` that puts back what was
 * there) }.
 */
export function applyPatch(project, set) {
  const changed = clone(project);
  const inverse = [];
  for (const { path, value } of set) {
    let node = changed;
    const last = String(path[path.length - 1]);
    for (const key of path.slice(0, -1)) {
      if (node[key] === null || typeof node[key] !== "object") {
        if (value === null || value === undefined) {
          node = null;
          break;
        }
        node[key] = {};
      }
      node = node[key];
    }
    if (!node) {
      inverse.unshift({ path, value: null });
      continue;
    }
    inverse.unshift({ path, value: clone(node[last]) });
    if (value === null || value === undefined) delete node[last];
    else node[last] = clone(value);
  }
  return { project: changed, inverse };
}
/** What every patch on an animation starts with: its name written down the first time it is touched. */
const nameOnFirstTouch = (project, anim) =>
  project.anims?.[anim.n] ? [] : [{ path: ["anims", anim.n, "name"], value: anim.name }];
/** A frame the animation has, or an error that says which it has. */
export const checkFrame = (anim, frame) => {
  if (!Number.isInteger(frame) || frame < 0 || frame >= anim.count)
    throw new Error(`${anim.name} has frames 0 to ${anim.count - 1}, not ${frame}`);
};

/**
 * A key for a bone at a frame. `spread` (frames): the same change, fading out, on the bone's other keys
 * within that many frames either side, so that a change made where every frame is a key is carried through
 * the frames about it.
 */
export function opKey(project, ctx, which, bone, frame, values, spread = 0) {
  const number = animAt(project, ctx, which);
  const anim = animOf(project, ctx, number);
  const boneIndex = boneAt(ctx, bone);
  const name = ctx.bones[boneIndex].name;
  const had = anim.keys[name] && Object.keys(anim.keys[name]).length;
  checkFrame(anim, frame);
  const keys = had ? { ...anim.keys[name] } : denseKeys(anim, ctx, boneIndex);
  const set = nameOnFirstTouch(project, anim);
  if (spread > 0) {
    const track = trackOf(keys);
    const old = evalTrack(track, frame, anim.smooth);
    const turnChange = qMul(qOf(values[3], values[4], values[5]), qInv(qOf(old[3], old[4], old[5])));
    const moveChange = [0, 1, 2].map((axis) => values[axis] - old[axis]);
    for (const keyFrame of track.frames) {
      const distance = Math.abs(keyFrame - frame);
      if (!distance || distance >= spread) continue;
      // all of the change at the frame itself, none `spread` frames away, a cosine's fall between
      const weight = 0.5 + 0.5 * Math.cos((Math.PI * distance) / spread);
      const key = keys[keyFrame];
      keys[keyFrame] = round([
        key[0] + moveChange[0] * weight,
        key[1] + moveChange[1] * weight,
        key[2] + moveChange[2] * weight,
        ...eulerOfQ(qMul(slerp([0, 0, 0, 1], turnChange, weight), qOf(key[3], key[4], key[5]))),
      ]);
    }
  }
  keys[frame] = round(values);
  set.push(
    had && !spread
      ? { path: ["anims", number, "keys", name, String(frame)], value: keys[frame] }
      : { path: ["anims", number, "keys", name], value: keys },
  );
  return { what: `key: ${anim.name} / ${name} / frame ${frame}${spread ? ` (spread ${spread})` : ""}`, set };
}
/** A bone's values at a frame, as the project has them now. */
export function valuesAt(project, ctx, which, bone, frame) {
  const anim = animOf(project, ctx, animAt(project, ctx, which));
  const boneIndex = boneAt(ctx, bone);
  const keys = anim.keys[ctx.bones[boneIndex].name];
  return keys && Object.keys(keys).length
    ? evalTrack(trackOf(keys), frame, anim.smooth)
    : baseAt(anim, frame, boneIndex).slice();
}
/**
 * The key a turn about the bone's own axes (degrees, the engine's order) and a move (units, in its parent's
 * space) from where it is make.
 */
export function opNudge(
  project,
  ctx,
  which,
  bone,
  frame,
  { rot = [0, 0, 0], move = [0, 0, 0] } = {},
  spread = 0,
) {
  // refused here, in words, before the frame's values are looked for
  checkFrame(animOf(project, ctx, animAt(project, ctx, which)), frame);
  const values = valuesAt(project, ctx, which, bone, frame);
  const turn = qMul(qOf(values[3], values[4], values[5]), qOf(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG));
  return opKey(
    project,
    ctx,
    which,
    bone,
    frame,
    [values[0] + move[0], values[1] + move[1], values[2] + move[2], ...eulerOfQ(turn)],
    spread,
  );
}
/**
 * One key less (the bone is interpolated there instead); `frame` "all": the bone goes back to the source's
 * frames.
 */
export function opDeleteKey(project, ctx, which, bone, frame) {
  const number = animAt(project, ctx, which);
  const anim = animOf(project, ctx, number);
  const boneIndex = boneAt(ctx, bone);
  const name = ctx.bones[boneIndex].name;
  if (frame === "all")
    return {
      what: `bone back to the source: ${anim.name} / ${name}`,
      set: anim.keys[name] ? [{ path: ["anims", number, "keys", name], value: null }] : [],
    };
  checkFrame(anim, frame);
  const had = anim.keys[name] && Object.keys(anim.keys[name]).length;
  const keys = had ? anim.keys[name] : denseKeys(anim, ctx, boneIndex);
  if (!(frame in keys)) throw new Error(`${name} has no key at frame ${frame} of ${anim.name}`);
  if (Object.keys(keys).length < 2)
    throw new Error(
      `${name} has one key left in ${anim.name}: remove them all ("all") to give the bone back to the source`,
    );
  if (had)
    return {
      what: `key removed: ${anim.name} / ${name} / frame ${frame}`,
      set: [{ path: ["anims", number, "keys", name, String(frame)], value: null }],
    };
  const rest = { ...keys };
  delete rest[frame];
  return {
    what: `key removed: ${anim.name} / ${name} / frame ${frame}`,
    set: [...nameOnFirstTouch(project, anim), { path: ["anims", number, "keys", name], value: rest }],
  };
}
/** A key taken to another frame (whatever key was there is replaced). */
export function opMoveKey(project, ctx, which, bone, from, to) {
  const number = animAt(project, ctx, which);
  const anim = animOf(project, ctx, number);
  const boneIndex = boneAt(ctx, bone);
  const name = ctx.bones[boneIndex].name;
  checkFrame(anim, from);
  checkFrame(anim, to);
  const keys =
    anim.keys[name] && Object.keys(anim.keys[name]).length
      ? { ...anim.keys[name] }
      : denseKeys(anim, ctx, boneIndex);
  if (!(from in keys)) throw new Error(`${name} has no key at frame ${from} of ${anim.name}`);
  keys[to] = keys[from];
  if (to !== from) delete keys[from];
  return {
    what: `key moved: ${anim.name} / ${name} / frame ${from} to ${to}`,
    set: [...nameOnFirstTouch(project, anim), { path: ["anims", number, "keys", name], value: keys }],
  };
}
/**
 * A whole pose (six numbers a bone) put at a frame: a key for every bone it changes, and none for those it
 * leaves as they are.
 */
export function opPaste(project, ctx, which, frame, pose, spread = 0) {
  const number = animAt(project, ctx, which);
  const anim = animOf(project, ctx, number);
  let work = project;
  let count = 0;
  const set = [];
  ctx.bones.forEach((_, boneIndex) => {
    const current = valuesAt(work, ctx, number, boneIndex, frame);
    if (current.every((v, k) => Math.abs(v - pose[boneIndex][k]) < SAME_VALUE)) return;
    const op = opKey(work, ctx, number, boneIndex, frame, pose[boneIndex], spread);
    set.push(...op.set);
    work = applyPatch(work, op.set).project;
    count++;
  });
  return { what: `pose pasted: ${anim.name} / frame ${frame} (${count} bones)`, set };
}
/**
 * Keys thinned: each bone (or those named) keeps the fewest keys that give its present motion back within
 * `rot` degrees and `pos` units.
 */
export function opThin(project, ctx, which, { rot = 0.5, pos = 0.02, bones: only } = {}) {
  const number = animAt(project, ctx, which);
  const anim = animOf(project, ctx, number);
  const set = nameOnFirstTouch(project, anim);
  const names = only?.map((x) => ctx.bones[boneAt(ctx, x)].name);
  let before = 0;
  let after = 0;
  ctx.bones.forEach((bone, boneIndex) => {
    if (names && !names.includes(bone.name)) return;
    const keys = thinTrack(bakeBone(anim, ctx, boneIndex), rot * DEG, pos, anim.smooth);
    const had = anim.keys[bone.name];
    before += had && Object.keys(had).length ? Object.keys(had).length : anim.count;
    after += Object.keys(keys).length;
    set.push({ path: ["anims", number, "keys", bone.name], value: keys });
  });
  return {
    what: `keys thinned: ${anim.name} within ${rot} degrees and ${pos} units, ${before} keys to ${after}`,
    set,
    before,
    after,
  };
}
/**
 * The animation's length (its keys and events keep their moment: the whole of it is stretched), rate,
 * looping, and way of interpolating.
 */
export function opSettings(project, ctx, which, { frames, fps, loops, interp } = {}) {
  const number = animAt(project, ctx, which);
  const anim = animOf(project, ctx, number);
  const set = nameOnFirstTouch(project, anim);
  const said = [];
  if (frames !== undefined && frames !== anim.count) {
    if (!Number.isInteger(frames) || frames < 1 || frames > FRAMES_MOST)
      throw new Error(`frames: a whole number from 1 to ${FRAMES_MOST}`);
    const stretch = (frames - 1) / Math.max(1, anim.count - 1);
    for (const [name, keys] of Object.entries(anim.keys)) {
      const moved = {};
      for (const frame of Object.keys(keys)
        .map(Number)
        .sort((x, y) => x - y)) {
        // two keys that land on one frame: the earlier stays
        const movedTo = Math.round(frame * stretch);
        if (!(movedTo in moved)) moved[movedTo] = keys[frame];
      }
      set.push({ path: ["anims", number, "keys", name], value: moved });
    }
    if (anim.events.length)
      set.push({
        path: ["anims", number, "events"],
        value: anim.events.map((event) => ({ ...event, frame: Math.round(event.frame * stretch) })),
      });
    set.push({ path: ["anims", number, "frames"], value: frames });
    said.push(`${anim.count} frames to ${frames}`);
  }
  if (fps !== undefined && fps !== anim.fps) {
    if (!(fps > 0 && fps <= FPS_MOST)) throw new Error("fps: a number above 0");
    set.push({ path: ["anims", number, "fps"], value: fps });
    said.push(`${anim.fps} fps to ${fps}`);
  }
  if (loops !== undefined && Boolean(loops) !== anim.loops) {
    set.push({ path: ["anims", number, "loops"], value: Boolean(loops) });
    said.push(loops ? "loops" : "plays once");
  }
  if (interp !== undefined && (interp !== "linear") !== anim.smooth) {
    set.push({ path: ["anims", number, "interp"], value: interp === "linear" ? "linear" : "smooth" });
    said.push(interp === "linear" ? "straight between keys" : "curved through keys");
  }
  return { what: `${anim.name}: ${said.join(", ") || "nothing changed"}`, set: said.length ? set : [] };
}
/** The animation again under another name, after the last one: its number is the returned `n`. */
export function opDuplicate(project, ctx, which, name) {
  const from = animAt(project, ctx, which);
  const anim = animOf(project, ctx, from);
  const list = animList(project, ctx);
  const number = list[list.length - 1].n + 1;
  name = String(name ?? "").trim();
  if (!name || name.length > NAME_MOST)
    throw new Error(`the new animation needs a name of 1 to ${NAME_MOST} letters`);
  if (list.some((x) => x.name.toLowerCase() === name.toLowerCase()))
    throw new Error(`there is an animation called ${name} already`);
  const entry = {
    name,
    copyOf: anim.baseN,
    fps: anim.fps,
    loops: anim.loops,
    interp: anim.smooth ? "smooth" : "linear",
    keys: clone(anim.keys),
    events: clone(anim.events),
  };
  if (anim.count !== anim.base.length) entry.frames = anim.count;
  return {
    what: `${anim.name} duplicated as ${name} (animation ${number})`,
    set: [{ path: ["anims", number], value: entry }],
    n: number,
  };
}
/** The animation's events, all of them: [{ frame, event, options, type }]. */
export function opEvents(project, ctx, which, list) {
  const number = animAt(project, ctx, which);
  const anim = animOf(project, ctx, number);
  const events = list
    .map((event) => ({
      frame: Math.max(0, Math.min(anim.count - 1, Math.round(Number(event.frame) || 0))),
      event: Math.round(Number(event.event) || 0),
      type: Math.round(Number(event.type) || 0),
      options: String(event.options ?? "").slice(0, EVENT_TEXT_MOST),
    }))
    .sort((x, y) => x.frame - y.frame);
  return {
    what: `events of ${anim.name}: ${events.length ? events.map((event) => `${event.frame}:${event.event} ${event.options}`).join(", ") : "none"}`,
    set: [...nameOnFirstTouch(project, anim), { path: ["anims", number, "events"], value: events }],
  };
}

// ── a texture's colours changed through its palette ────────────────────────
/** How bright a colour looks, by the usual weights of red, green and blue. */
const lumaOf = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
// colourGap: what is added to a brightness before a colour's tone is taken as a share of it, so that the tone
// of a near black is not all noise; twice the brightness of white, so that brightness counts by half; and the
// scale that makes a tolerance of 20 a useful one
const TONE_FLOOR = 32;
const TWICE_WHITE = 510;
const GAP_SCALE = 100;
// a colour exactly at the tolerance is taken, whatever the last digit of the sum
const TOLERANCE_SLACK = 1e-9;
// a contrast of 100 would be a slope without end
const CONTRAST_MOST = 99;
/**
 * How far two colours are apart for a selection, 0 upwards: their tone (the hue and how strong it is,
 * whatever the brightness) counted in full, their brightness by half. So the light and the dark shades of one
 * metal are near each other and a grey of the same brightness is far: a brass and its shadows within 20, a
 * steel beside it past 40.
 */
export function colourGap(a, b) {
  // a colour as four numbers: how far each of red, green and blue is from its brightness, as a share of that
  // brightness, and the brightness itself, 0 to a half
  const tone = (colour) => {
    const luma = lumaOf(colour[0], colour[1], colour[2]);
    return [
      (colour[0] - luma) / (luma + TONE_FLOOR),
      (colour[1] - luma) / (luma + TONE_FLOOR),
      (colour[2] - luma) / (luma + TONE_FLOOR),
      luma / TWICE_WHITE,
    ];
  };
  const toneA = tone(a);
  const toneB = tone(b);
  return (
    GAP_SCALE * Math.hypot(toneA[0] - toneB[0], toneA[1] - toneB[1], toneA[2] - toneB[2], toneA[3] - toneB[3])
  );
}
/**
 * Which of a palette's 256 colours a selection takes, a 1 or a 0 for each: { colour: [r, g, b], tolerance (0:
 * that colour alone; see colourGap), invert (true: every colour but those) }. No selection: all of them. With
 * `masked`, never the last (the hole's).
 */
export function selectedBy(palette, select, masked = false) {
  const on = new Uint8Array(256);
  for (let i = 0; i < (masked ? 255 : 256); i++)
    on[i] =
      !select ||
      colourGap(select.colour, [palette[i * 3], palette[i * 3 + 1], palette[i * 3 + 2]]) <=
        (select.tolerance ?? 0) + TOLERANCE_SLACK !==
        Boolean(select.invert)
        ? 1
        : 0;
  return on;
}
/**
 * { brightness, contrast, saturation (each -100 to 100), hue (degrees), tint [r, g, b] (multiplied in),
 * tintAmount (0 to 100) } on 768 bytes of palette; with `masked`, the last colour (the hole's) is left alone.
 * `select` (see selectedBy): only the colours it takes are changed.
 */
export function adjustPalette(
  palette,
  {
    brightness = 0,
    contrast = 0,
    saturation = 0,
    hue = 0,
    tint = [255, 255, 255],
    tintAmount = 0,
    select = null,
  } = {},
  masked = false,
) {
  const out = Uint8Array.from(palette);
  // contrast as a slope about mid grey: -100 flat, 0 as it is (the tangent of 45 degrees), 100 a step
  const gain = Math.tan(
    (((Math.max(-CONTRAST_MOST, Math.min(CONTRAST_MOST, contrast)) + 100) / 200) * Math.PI) / 2,
  );
  const saturate = 1 + saturation / 100;
  const turn = hue * DEG;
  const cosHue = Math.cos(turn);
  const sinHue = Math.sin(turn);
  const tintShare = tintAmount / 100;
  const on = select ? selectedBy(palette, select, masked) : null;
  for (let i = 0; i < (masked ? 255 : 256); i++) {
    if (on && !on[i]) continue;
    let [r, g, b] = [palette[i * 3] / 255, palette[i * 3 + 1] / 255, palette[i * 3 + 2] / 255];
    if (hue) {
      // the colour turned about the line of greys (r = g = b)
      const rootThird = Math.sqrt(1 / 3);
      [r, g, b] = [
        r * (cosHue + (1 - cosHue) / 3) +
          g * ((1 - cosHue) / 3 - rootThird * sinHue) +
          b * ((1 - cosHue) / 3 + rootThird * sinHue),
        r * ((1 - cosHue) / 3 + rootThird * sinHue) +
          g * (cosHue + (1 - cosHue) / 3) +
          b * ((1 - cosHue) / 3 - rootThird * sinHue),
        r * ((1 - cosHue) / 3 - rootThird * sinHue) +
          g * ((1 - cosHue) / 3 + rootThird * sinHue) +
          b * (cosHue + (1 - cosHue) / 3),
      ];
    }
    const grey = lumaOf(r, g, b);
    // each of red, green and blue: away from its grey (saturation), away from mid grey (contrast), up or down
    // (brightness), then the tint multiplied in
    [r, g, b] = [r, g, b].map((v, k) => {
      v = grey + (v - grey) * saturate;
      v = (v - 0.5) * gain + 0.5 + brightness / 200;
      return v * (1 - tintShare + (tintShare * tint[k]) / 255);
    });
    out[i * 3] = Math.max(0, Math.min(255, Math.round(r * 255)));
    out[i * 3 + 1] = Math.max(0, Math.min(255, Math.round(g * 255)));
    out[i * 3 + 2] = Math.max(0, Math.min(255, Math.round(b * 255)));
  }
  return out;
}
