// Small standing figures for the figure judges' cases (91-figures.mjs, 92-figure-commands.mjs), made here from
// boxes on a Biped's bones: no game's model is read. A figure of 72 units stands in its rest pose (arms out), each
// box wholly on one bone, its faces laid on a cell of one picture. The picture is painted as asked: one flat
// colour, noise at the texel's scale, or panels shaded across.
import * as smak from "../src/index.mjs";

const S = smak.solids;

/** A Biped's bones, at rest: [name, parent, place from the parent (x front, y left, z up)]. */
export const BONES = [
  ["Bip01 Pelvis", -1, [0, 0, 36]],
  ["Bip01 Spine", 0, [0, 0, 6]],
  ["Bip01 Neck", 1, [0, 0, 22]],
  ["Bip01 Head", 2, [0, 0, 3]],
  ["Bip01 L Clavicle", 2, [0, 3, -1]],
  ["Bip01 L UpperArm", 4, [0, 5, 0]],
  ["Bip01 L Forearm", 5, [0, 11, 0]],
  ["Bip01 L Hand", 6, [0, 10, 0]],
  ["Bip01 R Clavicle", 2, [0, -3, -1]],
  ["Bip01 R UpperArm", 8, [0, -5, 0]],
  ["Bip01 R Forearm", 9, [0, -11, 0]],
  ["Bip01 R Hand", 10, [0, -10, 0]],
  ["Bip01 L Thigh", 0, [0, 4, 0]],
  ["Bip01 L Calf", 12, [0, 0, -17]],
  ["Bip01 L Foot", 13, [0, 0, -16]],
  ["Bip01 R Thigh", 0, [0, -4, 0]],
  ["Bip01 R Calf", 15, [0, 0, -17]],
  ["Bip01 R Foot", 16, [0, 0, -16]],
];

/** Where each bone stands at rest, in model space. */
export const AT = (() => {
  const at = [];
  BONES.forEach(([, parent, pos], i) => {
    at[i] = parent < 0 ? pos : pos.map((v, k) => v + at[parent][k]);
  });
  return at;
})();
const bone = (name) => BONES.findIndex(([n]) => n === name);
const mid = (a, b) => a.map((v, k) => (v + b[k]) / 2);

/** A seeded random number from 0 to 1. */
export function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** The picture a figure wears, 64 by 64: "flat" one colour, "noise" each texel its own, "panels" shaded blocks. */
export function picture(kind, seed = 1) {
  const W = 64,
    rgb = new Uint8Array(W * W * 3);
  const r = seeded(seed);
  const blocks = Array.from({ length: 64 }, () => [60 + r() * 120, 50 + r() * 100, 40 + r() * 80]);
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      let c;
      if (kind === "flat") c = [120, 96, 72];
      else if (kind === "noise") c = [r() * 255, r() * 255, r() * 255];
      else {
        const b = blocks[(y >> 3) * 8 + (x >> 3)];
        const shade = 0.6 + 0.05 * (x % 8) + 0.02 * (y % 8);
        c = b.map((v) => v * shade + (r() - 0.5) * 30);
      }
      rgb.set(
        c.map((v) => Math.max(0, Math.min(255, Math.round(v)))),
        (y * W + x) * 3,
      );
    }
  return smak.indexed({ width: W, height: W, rgb }, `${kind}.bmp`);
}

/**
 * A box between two points (or about one) on a bone, its triangles with UVs: each face laid on the cell `cell`
 * of an 8 by 8 grid of the picture, by the face's own two axes.
 */
function boxOn(boneName, from, to, thick, cell, deep = thick) {
  const axis = to.map((v, k) => v - from[k]);
  const length = Math.hypot(...axis);
  const pl = S.place(
    mid(from, to),
    axis,
    Math.abs(axis[2]) > Math.abs(axis[0]) + Math.abs(axis[1]) ? [1, 0, 0] : [0, 0, 1],
  );
  const tris = S.trisOf(S.box(pl, thick, deep, length));
  const [cx, cy] = [cell % 8, Math.floor(cell / 8) % 8];
  const lo = [0, 1, 2].map((k) => Math.min(...tris.flatMap((t) => t.map((c) => c.p[k])))),
    hi = [0, 1, 2].map((k) => Math.max(...tris.flatMap((t) => t.map((c) => c.p[k]))));
  return tris.map((t) => {
    const n = smak.cross(smak.sub(t[1].p, t[0].p), smak.sub(t[2].p, t[0].p)).map(Math.abs);
    const drop = n.indexOf(Math.max(...n));
    const [a, b] = [0, 1, 2].filter((k) => k !== drop);
    return t.map((c) => ({
      p: c.p,
      bone: boneName,
      uv: [
        (cx + 0.1 + 0.8 * ((c.p[a] - lo[a]) / (hi[a] - lo[a] || 1))) / 8,
        (cy + 0.1 + 0.8 * ((c.p[b] - lo[b]) / (hi[b] - lo[b] || 1))) / 8,
      ],
    }));
  });
}

/**
 * A standing figure: `{ src }`, a studio model of boxes on BONES. `paint`: the picture's kind; `limb`: how thick
 * the limbs are; `lopsided`: a pouch on the left thigh and a plate on the left shoulder the right has not; `seed`
 * varies the boxes a little (so a corpus of them is not one figure many times).
 */
export function figure({ name = "figure.mdl", paint = "panels", limb = 3, lopsided = false, seed = 1 } = {}) {
  const r = seeded(seed * 7919);
  const v = (x) => x * (0.9 + 0.2 * r());
  const at = (n) => AT[bone(n)];
  const tris = [];
  let cell = 0;
  const put = (b, from, to, thick, deep) =>
    tris.push(...boxOn(b, from, to, v(thick), cell++, deep && v(deep)));
  put("Bip01 Pelvis", [0, 0, 33], [0, 0, 41], 8, 6);
  put("Bip01 Spine", [0, 0, 42], [0, 0, 62], 12, 7);
  put("Bip01 Head", at("Bip01 Head"), [0, 0, 72], 6);
  for (const s of ["L", "R"]) {
    put(`Bip01 ${s} UpperArm`, at(`Bip01 ${s} UpperArm`), at(`Bip01 ${s} Forearm`), limb);
    put(`Bip01 ${s} Forearm`, at(`Bip01 ${s} Forearm`), at(`Bip01 ${s} Hand`), limb * 0.9);
    put(
      `Bip01 ${s} Hand`,
      at(`Bip01 ${s} Hand`),
      at(`Bip01 ${s} Hand`).map((x, k) => x + [0, s === "L" ? 4 : -4, 0][k]),
      limb * 0.8,
    );
    put(`Bip01 ${s} Thigh`, at(`Bip01 ${s} Thigh`), at(`Bip01 ${s} Calf`), limb * 1.4);
    put(`Bip01 ${s} Calf`, at(`Bip01 ${s} Calf`), at(`Bip01 ${s} Foot`), limb * 1.2);
    put(`Bip01 ${s} Foot`, at(`Bip01 ${s} Foot`).map((x, k) => x + [0, 0, -1][k]), at(`Bip01 ${s} Foot`).map((x, k) => x + [5, 0, -1][k]), 2.5, 3); // prettier-ignore
  }
  if (lopsided) {
    put("Bip01 L Thigh", [2.5, 7, 30], [2.5, 7, 24], 4, 4);
    put("Bip01 L UpperArm", [0, 8, 66], [0, 14, 66], 6, 6);
    put("Bip01 L Clavicle", [2, 5, 69], [2, 9, 69], 5, 5);
  }
  const src = smak.buildMdl({
    name,
    bones: BONES.map(([n, parent, pos]) => ({ name: n, parent, pos })),
    bodyparts: [
      { name: "body", models: [{ name: "body", meshes: [{ tris, texture: picture(paint, seed) }] }] },
    ],
  });
  return { src };
}

/** A silhouette mask W by H: a body (a box) with holes of `hole` pixels on a grid `every` apart, or none. */
export function maskOf({ width = 120, height = 400, hole = 0, every = 16 } = {}) {
  const data = new Uint8Array(width * height);
  for (let y = 20; y < height - 20; y++)
    for (let x = 30; x < width - 30; x++) {
      const inHole = hole && (x - 38) % every < hole && (y - 40) % every < hole && x > 36 && x < width - 40 && y > 40 && y < height - 60; // prettier-ignore
      data[y * width + x] = inHole ? 0 : 1;
    }
  return { width, height, data };
}
