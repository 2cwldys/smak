// Pieces laid out on one picture (src/unwrap.mjs): nets unfolded at their true size, packed by shape with no two
// islands on one texel, corners on whole texels inside the picture, a piece's mirrored half on the same texels
// as the half laid out, and pieces of one share on one set of texels.
import * as smak from "../src/index.mjs";
import { test, sure, near } from "./helper.mjs";

const S = smak.solids;
const up = S.place([0, 0, 0], [0, 0, 1], [1, 0, 0]);
const tris = (solid) => S.trisOf(solid);
const pieces = [
  { name: "slab", tris: tris(S.box(up, 10, 6, 4, { bevel: 0.5 })) },
  { name: "drum", tris: tris(S.cyl(S.place([20, 0, 0], [1, 0, 0]), 2, 0, 5, { n: 8 })), axis: [1, 0, 0] },
  // a plate across the middle (y = 0), laid out by its +y half
  { name: "chest", tris: tris(S.plate(S.place([0, 30, 0], [0, 0, 1], [1, 0, 0]), S.ngon(8, 4, 3, 0), 1, { bevel: 0.3 })), mirror: { n: [0, 1, 0], at: [0, 30, 0] } }, // prettier-ignore
  // a left and a right of one share
  { name: "left", tris: tris(S.box(S.place([0, -20, 0], [0, 0, 1], [1, 0, 0]), 3, 2, 5)), share: "pad" },
  { name: "right", tris: tris(S.box(S.place([0, -40, 0], [0, 0, 1], [1, 0, 0]), 3, 2, 5)), share: "pad" },
];
const layout = smak.unwrap(pieces, { density: 3, width: 128 });
const area3 = ([a, b, c]) => S.len(S.cross(S.sub(b, a), S.sub(c, a))) / 2;
const area2 = ([a, b, c]) => Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;

test("unwrap: corners on whole texels inside the picture, its height a power of two", () => {
  sure(
    layout.width === 128 && layout.height >= 8 && layout.height <= 512,
    `${layout.width} by ${layout.height}`,
  );
  sure(Number.isInteger(Math.log2(layout.height)), `height ${layout.height}`);
  layout.pieces.forEach((p, n) =>
    p.uv.forEach((t, i) =>
      t.forEach(([u, v]) =>
        sure(
          Number.isInteger(u) &&
            Number.isInteger(v) &&
            u >= 0 &&
            v >= 0 &&
            u <= layout.width &&
            v <= layout.height,
          `${pieces[n].name} triangle ${i}: ${u}, ${v}`,
        ),
      ),
    ),
  );
  const done = smak.withUV(pieces, layout);
  sure(
    done[0].tris[0][0].uv.every((v) => v >= 0 && v <= 1) && done[0].tris[0][0].p,
    "withUV: 0 to 1, the corners kept",
  );
});

test("unwrap: no texel in two islands", () => {
  const owner = new Int32Array(layout.width * layout.height).fill(-1);
  let clash = 0;
  for (const isl of layout.islands) {
    const own = new Set();
    for (const i of isl.tris) {
      const T = layout.pieces[isl.piece].uv[i];
      const side = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
      const whole = side(T[0], T[1], T[2]);
      for (let y = 0; y < layout.height; y++)
        for (let x = 0; x < layout.width; x++) {
          const c = [x + 0.5, y + 0.5];
          const a = side(T[0], T[1], c),
            b = side(T[1], T[2], c),
            d = side(T[2], T[0], c);
          if (whole > 0 ? a > 0 && b > 0 && d > 0 : a < 0 && b < 0 && d < 0) own.add(y * layout.width + x);
        }
    }
    for (const t of own) {
      if (owner[t] >= 0) clash++;
      owner[t] = isl.id;
    }
  }
  sure(clash === 0, `${clash} texels in two islands`);
  sure(layout.islands.length >= 3, `${layout.islands.length} islands`);
});

test("unwrap: the texels a unit are the density asked, over each piece laid out", () => {
  for (const n of [0, 1]) {
    let world = 0,
      picture = 0;
    pieces[n].tris.forEach((t, i) => {
      world += area3(t.map((c) => c.p));
      picture += area2(layout.pieces[n].uv[i]);
    });
    near(picture / world, 9, 9 * 0.06, `${pieces[n].name}: texels a square unit`);
  }
});

test("unwrap: the mirrored half on the texels of the half laid out; a share on the first one's", () => {
  const chest = pieces[2].tris.map((t) => t.map((c) => c.p));
  const uv = layout.pieces[2].uv;
  const plus = chest.map((t, i) => i).filter((i) => chest[i].every((p) => p[1] >= 30 - 1e-6));
  const minus = chest
    .map((t, i) => i)
    .filter((i) => chest[i].every((p) => p[1] <= 30 + 1e-6) && !plus.includes(i));
  sure(
    plus.length >= 10 && minus.length === plus.length,
    `${plus.length} triangles on one side, ${minus.length} on the other`,
  );
  // each corner of the other half wears a texel its mirror point wears on the half laid out (a point on a seam
  // between two islands wears one in each)
  const laid = new Map();
  for (const i of plus)
    chest[i].forEach((p, k) => {
      const at = p.map((v) => Math.round(v * 1e4)).join();
      laid.set(at, (laid.get(at) ?? new Set()).add(uv[i][k].join()));
    });
  for (const i of minus)
    chest[i].forEach((p, k) => {
      const wears = laid.get([p[0], 60 - p[1], p[2]].map((v) => Math.round(v * 1e4)).join());
      sure(
        wears?.has(uv[i][k].join()),
        `triangle ${i} corner ${k}: ${uv[i][k]}, its mirror ${[...(wears ?? [])]}`,
      );
    });
  sure(
    !layout.islands.some((isl) => isl.piece === 2 && isl.tris.some((i) => minus.includes(i))),
    "only one half laid out",
  );
  sure(
    layout.pieces[4].uv === layout.pieces[3].uv && !layout.pieces[4].primary,
    "the right wears the left's",
  );
  sure(!layout.islands.some((isl) => isl.piece === 4), "and has no islands of its own");
});

test("unwrap: an island too large for the picture is refused", () => {
  let said = "";
  try {
    smak.unwrap([{ tris: tris(S.box(up, 60, 60, 2)) }], { density: 3, width: 64, rows: 64 });
  } catch (e) {
    said = e.message;
  }
  sure(/unwrap: /.test(said), `it said: ${said}`);
});
