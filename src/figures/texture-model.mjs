// The texture measures that need the model: does the painting follow the form? A cheap ambient occlusion of
// the surface (rays cast a short way out from each triangle: how many are stopped by the model itself) laid
// on the texture through the UVs, and set against the texels' brightness. A texture baked from a detailed
// model, or painted by a hand that knows the form, is darker in the crevices; a stamped one is not.
// Texel density and its spread over the body are the style measures' (style.mjs: texels, texelSpread).
import { atlasOfTexture, forTexels, textureMeasures } from "./texture.mjs";

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => {
  const l = Math.hypot(...a) || 1;
  return a.map((v) => v / l);
};

/** Directions spread over a sphere (a Fibonacci spiral). */
const DIRS = Array.from({ length: 24 }, (_, i) => {
  const z = 1 - (2 * (i + 0.5)) / 24,
    r = Math.sqrt(1 - z * z),
    a = i * Math.PI * (3 - Math.sqrt(5));
  return [r * Math.cos(a), r * Math.sin(a), z];
});

/** Whether a ray from `o` along `d` meets triangle `t` nearer than `far` (Möller–Trumbore). */
function hits(o, d, t, far) {
  const e1 = sub(t[1], t[0]),
    e2 = sub(t[2], t[0]);
  const p = cross(d, e2),
    det = dot(e1, p);
  if (Math.abs(det) < 1e-12) return false;
  const s = sub(o, t[0]),
    u = dot(s, p) / det;
  if (u < 0 || u > 1) return false;
  const q = cross(s, e1),
    v = dot(d, q) / det;
  if (v < 0 || u + v > 1) return false;
  const h = dot(e2, q) / det;
  return h > 1e-4 && h < far;
}

/**
 * The occlusion of points on a figure's triangles, 0 (open) to 1 (shut in): for each triangle, three points
 * (each corner drawn a third of the way in), each the share of rays out of the face (to `reach` of the
 * figure's height) that the model stops; of the face's two sides the more open one (the outside, whichever
 * way the file winds it). Returns an array of [a, b, c] per triangle.
 */
export function occlusionOf(f, { reach = 0.12 } = {}) {
  const R = reach * f.height;
  const tris = f.tris.map((t) => t.p);
  // a grid of cells a quarter of R wide, each listing the triangles whose box touches it; a ray tests only
  // the triangles of the cells it passes
  const C = R / 4;
  const grid = new Map();
  const cellOf = (v) => Math.floor(v / C);
  const key = (x, y, z) => (x + 2048) * 16777216 + (y + 2048) * 4096 + (z + 2048);
  tris.forEach((p, i) => {
    const lo = [0, 1, 2].map((a) => cellOf(Math.min(p[0][a], p[1][a], p[2][a])));
    const hi = [0, 1, 2].map((a) => cellOf(Math.max(p[0][a], p[1][a], p[2][a])));
    for (let x = lo[0]; x <= hi[0]; x++)
      for (let y = lo[1]; y <= hi[1]; y++)
        for (let z = lo[2]; z <= hi[2]; z++) {
          const k = key(x, y, z);
          const l = grid.get(k);
          if (l) l.push(i);
          else grid.set(k, [i]);
        }
  });
  const seen = new Int32Array(tris.length).fill(-1);
  let stamp = 0;
  const blocked = (o, d, self) => {
    stamp++;
    seen[self] = stamp;
    let last = NaN;
    // the cells along the ray, a third of a cell at a step (and their neighbours across a corner are missed:
    // a cheap occlusion, not a render)
    for (let s = 0; s <= R; s += C / 3) {
      const k = key(cellOf(o[0] + d[0] * s), cellOf(o[1] + d[1] * s), cellOf(o[2] + d[2] * s));
      if (k === last) continue;
      last = k;
      for (const j of grid.get(k) ?? []) {
        if (seen[j] === stamp) continue;
        seen[j] = stamp;
        if (hits(o, d, tris[j], R)) return true;
      }
    }
    return false;
  };
  return tris.map((p, i) => {
    const n = unit(cross(sub(p[1], p[0]), sub(p[2], p[0])));
    const c = [0, 1, 2].map((a) => (p[0][a] + p[1][a] + p[2][a]) / 3);
    return p.map((corner) => {
      const o0 = corner.map((v, a) => v + (c[a] - v) / 3);
      let best = 1;
      for (const side of [1, -1]) {
        const o = o0.map((v, a) => v + side * n[a] * 1e-3 * f.height);
        let out = 0,
          shut = 0;
        for (const d of DIRS) {
          if (side * dot(d, n) <= 0.05) continue;
          out++;
          if (blocked(o, d, i)) shut++;
        }
        if (out) best = Math.min(best, shut / out);
      }
      return best;
    });
  });
}

/** Pearson correlation of two lists. */
function corr(a, b) {
  const n = a.length;
  if (n < 16) return NaN;
  let ma = 0,
    mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let ab = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma,
      y = b[i] - mb;
    ab += x * y;
    aa += x * x;
    bb += y * y;
  }
  return aa && bb ? ab / Math.sqrt(aa * bb) : NaN;
}

/**
 * A figure's textures as atlases (chrome left out: the engine paints it), and its occlusion laid on them:
 * `{ atlases, ao: [Float32Array per atlas, NaN where no triangle lies] }`.
 */
export function atlasesOf(f, { withAO = true } = {}) {
  const used = [...new Set(f.tris.map((t) => t.tex))].filter(
    (i) => i >= 0 && f.textures[i].rgb && !(f.textures[i].flags & 2),
  );
  const occ = withAO ? occlusionOf(f) : null;
  const atlases = [],
    ao = [];
  for (const ti of used) {
    const tx = f.textures[ti];
    const mine = f.tris.map((t, i) => [t, i]).filter(([t]) => t.tex === ti);
    atlases.push(
      atlasOfTexture(
        tx,
        mine.map(([t]) => t),
      ),
    );
    if (!occ) continue;
    const sum = new Float32Array(tx.width * tx.height),
      cnt = new Float32Array(tx.width * tx.height);
    for (const [t, i] of mine)
      forTexels(t.uv, tx.width, tx.height, (k, w0, w1, w2) => {
        sum[k] += w0 * occ[i][0] + w1 * occ[i][1] + w2 * occ[i][2];
        cnt[k]++;
      });
    ao.push(sum.map((s, k) => (cnt[k] ? s / cnt[k] : NaN)));
  }
  return { atlases, ao };
}

/**
 * The model's texture measures: those of texture.mjs over its atlases, and how far the painting follows the
 * occlusion. `aoFollow`: within each chart, texels darker where more shut in (minus the correlation of the
 * texels' brightness, less the chart's mean, with their occlusion, less the chart's mean); `aoFollowAll`: the
 * same over the whole model (material dark in recesses counts too).
 */
export function modelTextureMeasures(f) {
  const { atlases, ao } = atlasesOf(f);
  const out = textureMeasures(atlases);
  const L = [],
    A = [],
    dL = [],
    dA = [];
  atlases.forEach((a, ai) => {
    const sums = new Map();
    for (let k = 0; k < a.width * a.height; k++) {
      if (!a.mask[k] || !Number.isFinite(ao[ai][k])) continue;
      const l = (0.299 * a.rgb[k * 3] + 0.587 * a.rgb[k * 3 + 1] + 0.114 * a.rgb[k * 3 + 2]) / 255;
      L.push(l);
      A.push(ao[ai][k]);
      const s = sums.get(a.charts[k]) ?? { n: 0, l: 0, a: 0, ks: [] };
      s.n++;
      s.l += l;
      s.a += ao[ai][k];
      s.ks.push(L.length - 1);
      sums.set(a.charts[k], s);
    }
    for (const s of sums.values()) {
      if (s.n < 8) continue;
      for (const j of s.ks) {
        dL.push(L[j] - s.l / s.n);
        dA.push(A[j] - s.a / s.n);
      }
    }
  });
  const within = corr(dL, dA),
    all = corr(L, A);
  if (Number.isFinite(within)) out.aoFollow = -within;
  if (Number.isFinite(all)) out.aoFollowAll = -all;
  return { measures: out, atlases, ao };
}
