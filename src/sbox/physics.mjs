// What a port collides as in s&box: Source's port's collision model (a convex hull, or a ragdoll's pieces and
// joints) as ModelDoc's physics nodes.
//
//   physicsOf(collision, data, bones, rest, { base, nameOf })   -> { shapes, bodies, joints, trimmed, files, warnings }
//   surfaceOf(surfaceprop)                    -> { surface, kept }: s&box's surface for GMod's
//   jointOf(limits)                           -> { kind: "hinge" | "cone", axis, ... }
//   restOf(bones, rest), anchorOf(placed, above, bone, axis)   -> a joint's { origin, angles } on the piece above
//   insideLimits(limits, rest, pose, above, bone)  how far inside its limits a joint is in a pose (degrees)
//   jointStretch(rest, pose, above, bone)          how far a pose moves a joint's bone off the piece above
//   hullsMeet(a, b, margin), trimApart(hulls, names, joints)   pieces that meet at rest, trimmed apart
//
// MEASURED IN s&box's EDITOR (Half-Life's barney and can, s&box's citizen; 2026-10-26):
// - A PhysicsHullFile reads its file in the model's space, as it is drawn at rest, and puts the hull on its
//   parent_bone, in that bone's frame. A body is made for each bone a hull is on. A skinned file with no
//   parent_bone is one body on no bone, whatever its vertices are on (HullPerElement makes a hull of each piece,
//   all on that one body), so a ragdoll is a file and a node for each piece.
// - A joint's anchor (anchor_origin, anchor_angles: Source's pitch, yaw, roll) is its frame on the parent body. A
//   revolute joint turns about the frame's z axis, its min_angle to max_angle from the frame (s&box keeps it as
//   the frame turned to the middle, and half the range each way). A conical joint twists about its z axis too:
//   citizen's anchors have z along the bone, its cone about it (its spine's anchor, the bone's own frame turned
//   [0, -90, -90]). Tried on barney's poses inside his limits: cones about the frames' z held 93 of 95 (the other
//   two his animations stretch, which no joint holds), about their x 68. A cone is round: Source's limits are a box an axis, so a pose near two of them at once
//   is outside it (barney's upper arm in shootgun, 87 degrees of swing against 86).
// - Bones' frames are GoldSrc's (no turn: dmx.mjs), so the limits Source's port measured about a bone's own x, y,
//   z are about the same axes here.
// - s&box pushes a ragdoll's pieces that start inside each other apart, where Source's physics let them be:
//   barney's arms out of his chest, his hands 13 units off (in a world of the model's physics), 10 to 44 units a
//   piece as a game's ragdoll (ModelPhysics). A joint keeps its two pieces from colliding; two that are not joined
//   and meet at rest are trimmed apart (trimApart). A PhysicsJointNull would keep them from colliding as they are,
//   but s&box's code cannot read a model that has one ("Unhandled joint type: NULL_JOINT").
import { dmxOf } from "./dmx.mjs";
import { sub, dot, cross } from "../vec.mjs";
import { convexHull } from "../source/hull.mjs";

/** s&box's surfaces (core/surfaces/*.surface): a GMod surfaceprop that starts with one of these is that one. */
export const SBOX_SURFACES = ["cardboard", "ceramic", "default", "dirt", "fabric", "flesh", "glass", "grass", "metal", "plastic", "rubber", "water", "wood"]; // prettier-ignore
/** GMod's names for s&box's surfaces that do not start with them. */
const SURFACE_KIN = {
  alienflesh: "flesh",
  antlion: "flesh",
  armorflesh: "flesh",
  bloodyflesh: "flesh",
  zombieflesh: "flesh",
  watermelon: "flesh",
  paper: "cardboard",
  papercup: "cardboard",
  porcelain: "ceramic",
  tile: "ceramic",
  pottery: "ceramic",
  mud: "dirt",
  sand: "dirt",
  gravel: "dirt",
  slime: "water",
  computer: "metal",
  canister: "metal",
  chain: "metal",
  chainlink: "metal",
  combine_metal: "metal",
  floating_metal_barrel: "metal",
  grenade: "metal",
  gunship: "metal",
  solidmetal: "metal",
  weapon: "metal",
  carpet: "fabric",
  cloth: "fabric",
  jalopytire: "rubber",
  item: "plastic",
};

/** s&box's surface for a GMod surfaceprop: { surface, kept } (kept false: none like it, so "default"). */
export function surfaceOf(surfaceprop = "default") {
  const name = String(surfaceprop).toLowerCase();
  const like = SURFACE_KIN[name] ?? SBOX_SURFACES.find((s) => name.startsWith(s));
  return { surface: like ?? "default", kept: Boolean(like) };
}

/**
 * How a joint whose limits ([[lo, hi] about x, y, z], degrees, against its rest) are kept in s&box: a bone that
 * turns about one axis only (a knee, an elbow) on a revolute joint about it, { kind: "hinge", axis, min, max };
 * else a conical one about its x (along a GoldSrc bone, to its child), twisting as about x and swinging as far as
 * it turns about y or z either way, CONE_MOST at most, { kind: "cone", axis: 0, twist: [lo, hi], swing, wider }
 * (wider: the swing its limits had, when more).
 */
export function jointOf(limits) {
  const free = [0, 1, 2].filter((axis) => limits[axis][1] - limits[axis][0] > 0);
  if (free.length === 1)
    return { kind: "hinge", axis: free[0], min: limits[free[0]][0], max: limits[free[0]][1] };
  const swing = Math.max(...[1, 2].flatMap((axis) => limits[axis].map(Math.abs)));
  return { kind: "cone", axis: 0, twist: limits[0], swing: Math.min(swing, CONE_MOST), wider: swing > CONE_MOST ? swing : undefined }; // prettier-ignore
}
/**
 * The widest swing s&box's conical joint holds, in degrees: hgrunt's upper arm, its cone 125, held swung 90 and
 * flipped when swung 100 or more (the solver turned it 45, 24, 90 degrees off). A shoulder or hip Source's port
 * lets swing further is held to it.
 */
export const CONE_MOST = 90;

/** A bone's turn from its six values (roll about x, then pitch about y, then yaw about z), as source/port.mjs's. */
function turnOf([, , , x, y, z]) {
  const [sx, cx, sy, cy, sz, cz] = [x, y, z].flatMap((a) => [Math.sin(a), Math.cos(a)]);
  return [
    [cy * cz, sx * sy * cz - cx * sz, cx * sy * cz + sx * sz],
    [cy * sz, sx * sy * sz + cx * cz, cx * sy * sz - sx * cz],
    [-sy, sx * cy, cx * cy],
  ];
}
const times33 = (a, b) =>
  a.map((row) => [0, 1, 2].map((c) => row[0] * b[0][c] + row[1] * b[1][c] + row[2] * b[2][c]));
const across33 = (m) => [0, 1, 2].map((c) => m.map((row) => row[c]));
const turnPoint = (m, p) => m.map((row) => row[0] * p[0] + row[1] * p[1] + row[2] * p[2]);
const DEGREES = 180 / Math.PI;

/** Each bone's turn and place in the model's space at rest, from the rest frame's six values a bone. */
export function restOf(bones, rest) {
  const placed = [];
  bones.forEach((bone, i) => {
    const turn = turnOf(rest[i]);
    const at = rest[i].slice(0, 3);
    if (bone.parent < 0) placed.push({ turn, at });
    else {
      const up = placed[bone.parent];
      placed.push({ turn: times33(up.turn, turn), at: turnPoint(up.turn, at).map((v, k) => v + up.at[k]) });
    }
  });
  return placed;
}

/** A turn as Source's angles, [pitch, yaw, roll] in degrees (MatrixAngles: its x forward, y left, z up). */
export function anglesOf(m) {
  const forward = [m[0][0], m[1][0], m[2][0]];
  const left = [m[0][1], m[1][1], m[2][1]];
  const up = [m[0][2], m[1][2], m[2][2]];
  const flat = Math.hypot(forward[0], forward[1]);
  if (flat > 0.001)
    return [Math.atan2(-forward[2], flat), Math.atan2(forward[1], forward[0]), Math.atan2(left[2], up[2])].map((a) => a * DEGREES); // prettier-ignore
  return [Math.atan2(-forward[2], flat), Math.atan2(-left[0], left[1]), 0].map((a) => a * DEGREES);
}

/** A turn as degrees about each of its own axes (its logarithm), as source/port.mjs measures a joint's limits. */
function degreesOf(m) {
  const angle = Math.acos(Math.max(-1, Math.min(1, (m[0][0] + m[1][1] + m[2][2] - 1) / 2)));
  const s = Math.sin(angle);
  const k = (s > 1e-6 ? angle / (2 * s) : 0.5) * DEGREES;
  return [m[2][1] - m[1][2], m[0][2] - m[2][0], m[1][0] - m[0][1]].map((v) => v * k);
}

/**
 * How far inside its joint a bone is in a pose, in degrees (negative: outside), as s&box's joint holds it
 * (jointOf of its limits): the child's turn against the piece above, from its turn at rest, about each of its
 * axes, as the limits were measured. A hinge's angle about its axis within min to max, a cone's twist (about x)
 * within its range and its swing (about y and z together) within the cone; an axis held still ([0, 0]: a knee's
 * but one) may turn STILL_SLACK either way. `rest` and `pose` are each bone's turn in the model's space.
 */
export function insideLimits(limits, rest, pose, above, bone) {
  const against = (turns) => times33(across33(turns[above]), turns[bone]);
  const turn = degreesOf(times33(across33(against(rest)), against(pose)));
  // an axis held still is inside by any margin while it turns less than STILL_SLACK
  const within = (v, [lo, hi]) =>
    hi > lo ? Math.min(v - lo, hi - v) : Math.abs(v) <= STILL_SLACK ? Infinity : STILL_SLACK - Math.abs(v);
  const joint = jointOf(limits);
  if (joint.kind === "hinge")
    return Math.min(
      ...[0, 1, 2].map((axis) => within(turn[axis], axis === joint.axis ? [joint.min, joint.max] : [0, 0])),
    );
  // a cone splits the turn as a ball joint does: a twist about x, then a swing of x away from where it was
  const [qx, , , qw] = quaternionOfTurn(times33(across33(against(rest)), against(pose)));
  const twist = 2 * Math.atan2(qx, qw) * DEGREES;
  const twisted = ((twist + 540) % 360) - 180;
  const x = times33(across33(against(rest)), against(pose)).map((row) => row[0]);
  const swing = Math.acos(Math.max(-1, Math.min(1, x[0]))) * DEGREES;
  return Math.min(within(twisted, joint.twist), joint.swing - swing);
}
/** How far an axis a joint holds still may turn in a pose and the pose still be inside, in degrees: what Source's
 * port takes for still (TURN_STILL). */
export const STILL_SLACK = 1;

/**
 * How far a pose moves a joint's bone from where the piece above holds it (its place at rest against that piece),
 * in units: GoldSrc's animations move bones as well as turn them (barney's head 2 units off his neck in smlflinch),
 * which no ragdoll's joint holds. `rest` is restOf's; `pose` each bone's [turn, place] in the model's space.
 */
export function jointStretch(rest, pose, above, bone) {
  const back = across33(rest[above].turn);
  const offset = turnPoint(
    back,
    rest[bone].at.map((v, k) => v - rest[above].at[k]),
  );
  const held = turnPoint(pose[above].turn, offset).map((v, k) => v + pose[above].at[k]);
  return Math.hypot(...held.map((v, k) => v - pose[bone].at[k]));
}

/** A turn as a quaternion [x, y, z, w]. */
export function quaternionOfTurn(m) {
  const trace = m[0][0] + m[1][1] + m[2][2];
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    return [(m[2][1] - m[1][2]) * s, (m[0][2] - m[2][0]) * s, (m[1][0] - m[0][1]) * s, 0.25 / s];
  }
  const i = m[0][0] > m[1][1] && m[0][0] > m[2][2] ? 0 : m[1][1] > m[2][2] ? 1 : 2;
  const [j, k] = [(i + 1) % 3, (i + 2) % 3];
  const s = 2 * Math.sqrt(1 + m[i][i] - m[j][j] - m[k][k]);
  const q = [];
  q[i] = 0.25 * s;
  q[j] = (m[j][i] + m[i][j]) / s;
  q[k] = (m[k][i] + m[i][k]) / s;
  q[3] = (m[k][j] - m[j][k]) / s;
  return q;
}

/** The turns that put a joint's z axis on a bone's x, y or z: [0, -90, -90] (citizen's), [0, 0, -90], none. */
const ONTO_AXIS = [
  [
    [0, 0, 1],
    [-1, 0, 0],
    [0, -1, 0],
  ],
  [
    [1, 0, 0],
    [0, 0, 1],
    [0, -1, 0],
  ],
  [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
];

/**
 * A joint's anchor on the piece above (`above`, a bone index): the child bone's place and turn at rest in that
 * piece's frame, turned so its z axis is the bone's `axis` (0 x, 1 y, 2 z). `rest` is restOf's.
 */
export function anchorOf(rest, above, bone, axis) {
  const back = across33(rest[above].turn);
  const origin = turnPoint(
    back,
    rest[bone].at.map((v, k) => v - rest[above].at[k]),
  );
  return { origin, angles: anglesOf(times33(times33(back, rest[bone].turn), ONTO_AXIS[axis])) };
}

const neg = (a) => [-a[0], -a[1], -a[2]];
const far = (points, d) => points.reduce((best, p) => (dot(p, d) > dot(best, d) ? p : best), points[0]);
/** a b c with a the newest: the side of the simplex the origin is on, and the way on to it (GJK's cases) */
const tripleCross = (a, b, c) => cross(cross(a, b), c);

/**
 * Whether two convex sets of points (their hulls) come within `margin` of each other: GJK on their difference,
 * one of them grown by a ball of `margin`.
 */
export function hullsMeet(a, b, margin = 0) {
  const support = (d) => {
    const length = Math.hypot(...d) || 1;
    const p = far(a, d);
    const q = far(b, neg(d));
    return [0, 1, 2].map((k) => p[k] + (margin * d[k]) / length - q[k]);
  };
  let d = sub(a[0], b[0]);
  if (!Math.hypot(...d)) d = [1, 0, 0];
  let simplex = [support(d)];
  d = neg(simplex[0]);
  for (let step = 0; step < 64; step++) {
    if (Math.hypot(...d) < 1e-9) return true;
    const p = support(d);
    if (dot(p, d) < 0) return false;
    simplex = [p, ...simplex];
    // the simplex cut to the part nearest the origin, and the way from it to the origin
    const [s0, s1, s2, s3] = simplex;
    const ao = neg(s0);
    if (simplex.length === 2) {
      const ab = sub(s1, s0);
      if (dot(ab, ao) > 0) d = tripleCross(ab, ao, ab);
      else [simplex, d] = [[s0], ao];
    } else if (simplex.length === 3) {
      const ab = sub(s1, s0);
      const ac = sub(s2, s0);
      const n = cross(ab, ac);
      if (dot(cross(n, ac), ao) > 0) {
        if (dot(ac, ao) > 0) [simplex, d] = [[s0, s2], tripleCross(ac, ao, ac)];
        else [simplex, d] = dot(ab, ao) > 0 ? [[s0, s1], tripleCross(ab, ao, ab)] : [[s0], ao];
      } else if (dot(cross(ab, n), ao) > 0) {
        [simplex, d] = dot(ab, ao) > 0 ? [[s0, s1], tripleCross(ab, ao, ab)] : [[s0], ao];
      } else if (dot(n, ao) > 0) d = n;
      else [simplex, d] = [[s0, s2, s1], neg(n)];
    } else {
      // a tetrahedron: the origin is inside it, or outside one of its faces with the newest point
      const ab = sub(s1, s0);
      const ac = sub(s2, s0);
      const ad = sub(s3, s0);
      const faces = [
        [cross(ab, ac), s1, s2, ad],
        [cross(ac, ad), s2, s3, ab],
        [cross(ad, ab), s3, s1, ac],
      ];
      const outside = faces.find(([n, , , other]) => {
        const toward = dot(n, other) > 0 ? neg(n) : n;
        return dot(toward, ao) > 0;
      });
      if (!outside) return true;
      const [n, x, y, other] = outside;
      simplex = [s0, x, y];
      d = dot(n, other) > 0 ? neg(n) : n;
    }
  }
  return true;
}

/**
 * The physics of a port, from Source's port's `collision` (its parts.collision) and its SMD's data (`data`:
 * { triangles } in the model's space, each on its piece's bone), for bones named as s&box keeps them (`bones`:
 * [{ name, parent }], `rest` their six values at rest; `nameOf` a GoldSrc bone's name to its s&box one). `base` is
 * where its files go (models/<folder>/<name>).
 * Returns { shapes: [{ name, file, bone, surface, points }], bodies: [{ bone, mass, inertia, damping, rotdamping }], joints: [{ parent, child,
 * ...jointOf, origin, angles }], trimmed: [[bone, bone, units]], files: [{ path, data }], warnings }; a shape's
 * points are its hull's, in the model's space at rest.
 */
export function physicsOf(collision, data, bones, rest, { base, nameOf }) {
  const warnings = [];
  const index = new Map(collision.pieces.map((piece) => [piece.bone, nameOf(piece.bone)]));
  const at = (name) => bones.findIndex((b) => b.name === index.get(name));
  const { surface, kept } = surfaceOf(collision.surfaceprop);
  if (!kept) warnings.push(`its surfaceprop ${collision.surfaceprop} is none of s&box's: "default"`);
  const placed = restOf(bones, rest);
  const joints = collision.joints.map((joint) => {
    const kept = jointOf(joint.limits);
    const anchor = anchorOf(placed, at(joint.above), at(joint.bone), kept.axis);
    return { parent: index.get(joint.above), child: index.get(joint.bone), ...kept, ...anchor };
  });
  const capped = joints.filter((j) => j.wider);
  if (capped.length)
    warnings.push(`${capped.length === 1 ? "a joint swings" : `${capped.length} joints swing`} ${CONE_MOST} degrees at most, the widest s&box's cone holds: ${capped.map((j) => `${j.child} (${j.wider.toFixed(0)})`).join(", ")}`); // prettier-ignore
  // each piece's hull, in the model's space; one flat (a model of one plane, its box flat) THINNEST thick
  const hulls = collision.pieces.map((piece) => {
    const bone = at(piece.bone);
    const own = collision.pieces.length > 1 ? data.triangles.filter((t) => t.corners[0].bone === bone) : data.triangles; // prettier-ignore
    const points = own.flatMap((t) => t.corners.map((c) => c.p));
    const hull = convexHull(points);
    if (hull) return hull;
    warnings.push(`${index.get(piece.bone)}'s hull is flat: made ${THINNEST} thick`);
    const box = [0, 1, 2].map((a) => {
      const [lo, hi] = [Math.min(...points.map((p) => p[a])), Math.max(...points.map((p) => p[a]))];
      return hi - lo < THINNEST ? [(lo + hi - THINNEST) / 2, (lo + hi + THINNEST) / 2] : [lo, hi];
    });
    return convexHull(
      [0, 1, 2, 3, 4, 5, 6, 7].map((k) => box.map(([lo, hi], a) => ((k >> a) & 1 ? hi : lo))),
    );
  });
  const { trimmed, left } = trimApart(
    hulls,
    collision.pieces.map((piece) => index.get(piece.bone)),
    joints,
  );
  if (left.length)
    warnings.push(`pieces of its ragdoll that meet at rest and could not be trimmed apart (s&box will push them): ${left.map(([a, b]) => `${a} and ${b}`).join(", ")}`); // prettier-ignore
  if (trimmed.length)
    warnings.push(`${trimmed.length} pairs of its ragdoll's pieces that are not joined met at rest, and were trimmed apart (s&box pushes such pieces away from each other; Source let them be): ${trimmed.map(([a, b, depth]) => `${a} and ${b} by ${depth.toFixed(1)}`).join(", ")}`); // prettier-ignore
  // each hull of HULL_CORNERS corners at most, which s&box's physics takes
  const insets = [];
  hulls.forEach((hull, k) => {
    const { hull: kept, inset } = simplifyHull(hull);
    hulls[k] = kept;
    if (inset > SIMPLIFIED_SAID) insets.push(`${index.get(collision.pieces[k].bone)} ${inset.toFixed(1)}`);
  });
  if (insets.length)
    warnings.push(`hulls kept to ${HULL_CORNERS} corners (s&box's physics takes no more), cut in by up to: ${insets.join(", ")} units`); // prettier-ignore
  const files = [];
  const shapes = collision.pieces.map((piece, k) => {
    const bone = at(piece.bone);
    const name = collision.pieces.length > 1 ? `physics_${bones[bone].name}` : "physics";
    const file = `${base}/physics/${name}.dmx`;
    const triangles = hulls[k].faces.map((face) => {
      const [a, b, c] = face.map((i) => hulls[k].points[i]);
      const m = cross(sub(b, a), sub(c, a));
      const n = m.map((v) => v / (Math.hypot(...m) || 1));
      return { material: "physics", corners: [a, b, c].map((p) => ({ bone, p, n, uv: [0, 0] })) };
    });
    files.push({ path: file, data: dmxOf({ ...data, bones, triangles }, { name }) });
    return { name, file, bone: bones[bone].name, surface, points: hulls[k].points };
  });
  // a ragdoll's weight shared among its pieces by their volume, as Source's compiler shares $mass
  const volume = collision.pieces.reduce((sum, piece) => sum + piece.volume, 0);
  const bodies =
    collision.mass === undefined || !(volume > 0)
      ? []
      : collision.pieces.map((piece) => ({ bone: index.get(piece.bone), mass: (collision.mass * piece.volume) / volume, ...collision.body })); // prettier-ignore
  const raised = evenOut(bodies, joints);
  if (raised.length)
    warnings.push(`${raised.length === 1 ? "a piece" : `${raised.length} pieces`} of its ragdoll made ${MASS_LEAST * 100}% of its weight and a ${MASS_RATIO}th of the piece joined to it at least (s&box's joints give between pieces of weights far apart, and presses a light one through the floor): ${raised.join(", ")}`); // prettier-ignore
  return { shapes, bodies, joints, trimmed, files, warnings };
}

/**
 * The most one piece of a ragdoll may outweigh another joined to it. Shared by volume, a small piece weighs little:
 * 5 times at most across any of barney's, hgrunt's, scientist's joints, which hold; 31 to 1366 times across one of
 * agrunt's, loader's, nihilanth's, big_mom's, islave's, forklift's, osprey's, which dropped would not come to rest,
 * or came apart at a joint (loader thrown thousands of units).
 */
export const MASS_RATIO = 10;

/**
 * The least share of a ragdoll's whole weight one piece weighs. Lighter, a piece is pressed through the floor by
 * the rest dropped on it, and its joint pulled apart: archer's fin (0.2% of it) 1.1 units through, big_mom's Bone26
 * (0.08%) its joint 3.4 units apart and the body 3.8 through; at 1% both came to rest within 0.4 of the floor.
 */
export const MASS_LEAST = 0.01;

/**
 * A ragdoll's pieces' weights evened out (`bodies` changed in place): a piece lighter than MASS_LEAST of the whole
 * made that, then one lighter than a MASS_RATIO th of one joined to it made that, until none is, and all of them
 * then scaled to weigh what they weighed together. Returns the pieces made heavier.
 */
export function evenOut(bodies, joints) {
  if (!bodies.length) return [];
  const total = bodies.reduce((sum, b) => sum + b.mass, 0);
  const of = new Map(bodies.map((b) => [b.bone, b]));
  const raised = new Set();
  for (const b of bodies)
    if (b.mass < total * MASS_LEAST) {
      b.mass = total * MASS_LEAST;
      raised.add(b.bone);
    }
  for (let changed = true, rounds = 0; changed && rounds < bodies.length + 1; rounds++) {
    changed = false;
    for (const j of joints) {
      const [a, b] = [of.get(j.parent), of.get(j.child)];
      if (!a || !b) continue;
      const [light, heavy] = a.mass < b.mass ? [a, b] : [b, a];
      if (light.mass * MASS_RATIO < heavy.mass * (1 - 1e-9)) {
        light.mass = heavy.mass / MASS_RATIO;
        raised.add(light.bone);
        changed = true;
      }
    }
  }
  const scale = total / bodies.reduce((sum, b) => sum + b.mass, 0);
  for (const b of bodies) b.mass *= scale;
  return [...raised];
}

/**
 * The most corners a hull keeps. s&box's physics refuses a hull of more than 255 half-edges ("Hull Too Complex for
 * Runtime (62 verts, 272 edges, 76 faces)", houndeye's spine, and drops it); a hull of triangles has 6 n - 12, so
 * 44 corners fit. Its compiler's own simplifying (QEM) left hulls 0.5 to 14 units off theirs (nihilanth's head), so
 * the port simplifies them itself and has them made exactly.
 */
export const HULL_CORNERS = 44;
/** How far a hull may be cut in by simplifying before it is said, in units. */
const SIMPLIFIED_SAID = 0.5;

/**
 * A hull of HULL_CORNERS corners at most: the corner that stands least above its neighbours (the plane through
 * them, facing as its faces do) let go, one by one. Returns { hull, inset }: how far inside the new hull's faces
 * the farthest of the old corners was cut off, in units.
 */
export function simplifyHull(hull, most = HULL_CORNERS) {
  let current = hull;
  while (current.points.length > most) {
    const normals = current.faces.map((face) => {
      const [a, b, c] = face.map((i) => current.points[i]);
      const m = cross(sub(b, a), sub(c, a));
      return m.map((v) => v / (Math.hypot(...m) || 1));
    });
    const around = current.points.map(() => ({ ring: new Set(), facing: [0, 0, 0] }));
    current.faces.forEach((face, f) =>
      face.forEach((i) => {
        face.forEach((j) => j !== i && around[i].ring.add(j));
        around[i].facing = around[i].facing.map((v, a) => v + normals[f][a]);
      }),
    );
    let least = null;
    current.points.forEach((p, i) => {
      const ring = [...around[i].ring].map((j) => current.points[j]);
      const middle = [0, 1, 2].map((a) => ring.reduce((sum, q) => sum + q[a], 0) / ring.length);
      const n = around[i].facing.map((v) => v / (Math.hypot(...around[i].facing) || 1));
      const height = dot(n, sub(p, middle));
      if (!least || height < least.height) least = { i, height };
    });
    const next = convexHull(current.points.filter((_, i) => i !== least.i));
    if (!next) break;
    current = next;
  }
  // how far outside the new hull the old corners are: the most any is in front of a face
  const planes = current.faces.map((face) => {
    const [a, b, c] = face.map((i) => current.points[i]);
    const m = cross(sub(b, a), sub(c, a));
    const n = m.map((v) => v / (Math.hypot(...m) || 1));
    return [n, dot(n, a)];
  });
  const inset = Math.max(0, ...hull.points.map((p) => Math.max(...planes.map(([n, d]) => dot(n, p) - d))));
  return { hull: current, inset };
}

/** How thin a hull may be, in units: a flat one is made this thick (Source's port's THINNEST_PIECE). */
const THINNEST = 0.5;

/** How far apart trimApart leaves two pieces, in units. */
export const TRIM_GAP = 0.1;

/** A hull cut by a plane: what of it is on the side `n` . p <= d, as a hull (null if nothing is). */
function cutHull(hull, n, d) {
  const kept = hull.points.filter((p) => dot(n, p) <= d);
  const edges = new Set();
  for (const face of hull.faces)
    face.forEach((i, k) => {
      const j = face[(k + 1) % 3];
      edges.add(i < j ? `${i}/${j}` : `${j}/${i}`);
    });
  for (const edge of edges) {
    const [p, q] = edge.split("/").map((i) => hull.points[Number(i)]);
    const [sp, sq] = [dot(n, p) - d, dot(n, q) - d];
    if ((sp < 0 && sq > 0) || (sp > 0 && sq < 0)) {
      const t = sp / (sp - sq);
      kept.push(p.map((v, a) => v + (q[a] - v) * t));
    }
  }
  return convexHull(kept);
}

/**
 * A ragdoll's pieces that meet at rest and are not joined, trimmed apart: each pair cut along the plane across
 * which they reach into each other least (the faces' of either, or the line between their middles), each kept on
 * its side of it, TRIM_GAP apart. `hulls` are changed in place. Returns { trimmed: [[bone, bone, how far they
 * reached]], left: [[bone, bone]] (two that could not be cut and keep THINNEST of each) }.
 */
export function trimApart(hulls, names, joints) {
  const joined = new Set(joints.flatMap((j) => [`${j.parent}/${j.child}`, `${j.child}/${j.parent}`]));
  const trimmed = [];
  const left = [];
  const middle = (hull) =>
    [0, 1, 2].map((a) => hull.points.reduce((sum, p) => sum + p[a], 0) / hull.points.length);
  const span = (hull, n) => {
    const along = hull.points.map((p) => dot(n, p));
    return [Math.min(...along), Math.max(...along)];
  };
  for (let i = 0; i < hulls.length; i++)
    for (let j = i + 1; j < hulls.length; j++) {
      if (joined.has(`${names[i]}/${names[j]}`) || !hulls[i] || !hulls[j]) continue;
      if (!hullsMeet(hulls[i].points, hulls[j].points, TRIM_GAP)) continue;
      // the way from i to j along which they reach into each other least
      const facing = (hull) =>
        hull.faces.map((face) => {
          const [a, b, c] = face.map((k) => hull.points[k]);
          const m = cross(sub(b, a), sub(c, a));
          return m.map((v) => v / (Math.hypot(...m) || 1));
        });
      const toward = sub(middle(hulls[j]), middle(hulls[i]));
      const ways = [
        toward.map((v) => v / (Math.hypot(...toward) || 1)),
        ...facing(hulls[i]),
        ...facing(hulls[j]).map(neg),
      ];
      let best = null;
      for (const n of ways) {
        if (dot(n, toward) <= 0) continue;
        const depth = span(hulls[i], n)[1] - span(hulls[j], n)[0];
        if (!best || depth < best.depth) best = { n, depth };
      }
      // cut halfway through where they reach into each other; a piece mostly inside the other (forklift's joints in
      // its body) keeps THINNEST of itself at least, the other giving up the more
      const [a0, a1] = span(hulls[i], best.n);
      const [b0, b1] = span(hulls[j], best.n);
      const [least, most] = [a0 + THINNEST + TRIM_GAP / 2, b1 - THINNEST - TRIM_GAP / 2];
      if (least > most) {
        left.push([names[i], names[j]]);
        continue;
      }
      const cut = Math.min(most, Math.max(least, (a1 + b0) / 2));
      const a = cutHull(hulls[i], best.n, cut - TRIM_GAP / 2);
      const b = cutHull(hulls[j], neg(best.n), -(cut + TRIM_GAP / 2));
      if (!a || !b) {
        left.push([names[i], names[j]]);
        continue;
      }
      hulls[i] = a;
      hulls[j] = b;
      trimmed.push([names[i], names[j], best.depth + TRIM_GAP]);
    }
  return { trimmed, left };
}
