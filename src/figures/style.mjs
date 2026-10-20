// The style measures of a figure (52 of them), from its facts (facts.mjs): its shape, its proportions, how its
// texture lies on it, its colours, and the same per part of the body. Lengths are in the figure's heights, so a
// model of any scale is measured alike; texture by texels per height, so a texture of any size is too. Each
// measure is told by STYLE_SAID: what it is, its unit, whether it is read on a log scale, what to do when it is
// low and when it is high, and its group (shape, proportion, texture, colour, part). Which of them tell one
// game's manner from another's, and how much each weighs, is the game's: its profile's `figureStyle`.
import { PARTS } from "./facts.mjs";

/** [what it is, unit, log scale, what to do when low, what to do when high, group]. */
// prettier-ignore
export const STYLE_SAID = {
  tris: ["triangles", "", true, "add triangles where the outline is seen: the silhouette is cut coarser than the game's", "take triangles away: the game's are cut coarser, its outlines more angular", "shape"],
  edge: ["a triangle's edge, median, in heights", "H", true, "the triangles are smaller than the game's: fewer, larger faces", "the triangles are larger than the game's: cut the big faces", "shape"],
  edgeSpread: ["how much triangle sizes differ (edge IQR over median)", "", false, "every face is of one size: the game's mix large plates with small detail", "a few big faces among many small: the game's are more even", "shape"],
  pieces: ["separate pieces of mesh", "", true, "the game's figures are built of more separate pieces (plates, pouches, parts that overlap)", "too many separate pieces: the game's are fewer, more of one skin", "shape"],
  rigid: ["surface in pieces each moved by one bone", "%", false, "the game's figures are of rigid pieces, each on one bone: cut the skin into pieces at the joints", "the game's figures are skinned across the joints: join the pieces into one skin", "shape"],
  open: ["edges open (a border of the mesh)", "%", false, "the game's meshes have more open borders (plates, cards, cut-off pieces)", "too many open borders: close the meshes, or fewer loose plates", "shape"],
  hard: ["edges between faces meeting at over 45°", "%", false, "too smooth for the game: its forms are cut with hard edges", "too many hard edges: the game's forms are rounder", "shape"],
  boxy: ["surface facing along its bone's axes (within 10°)", "%", false, "the game's figures are boxier: plates and blocks set square to their bones", "too boxy for the game: round off the blocks", "shape"],
  sym: ["head and torso mirrored left to right", "%", false, "the head and torso are lopsided where the game's are mirrored", "more mirrored than the game's: they vary side to side", "shape"],
  heads: ["height in heads", "heads", false, "the head is too big for the game", "the head is too small for the game", "proportion"],
  shoulders: ["shoulder width over height", "", false, "the shoulders are narrower than the game's", "the shoulders are broader than the game's", "proportion"],
  bulk: ["the torso's width over height", "", false, "the body is slighter than the game's", "the body is bulkier than the game's", "proportion"],
  armLen: ["arm's length over height", "", false, "the arms are shorter than the game's", "the arms are longer than the game's", "proportion"],
  legLen: ["leg's length over height", "", false, "the legs are shorter than the game's", "the legs are longer than the game's", "proportion"],
  hand: ["a hand's size over height", "", false, "the hands are smaller than the game's", "the hands are bigger than the game's", "proportion"],
  texels: ["texels across one height, median", "texels/H", true, "the texture is coarser on the body than the game's: enlarge the textures or the UVs", "the texture is finer than the game's: halve the textures, or shrink the UVs", "texture"],
  texelSpread: ["how much texel density varies over the body (IQR, in doublings)", "×2", false, "density is even everywhere where the game's varies (a face finer than the boots)", "density varies over the body more than the game's: even out the UVs", "texture"],
  textures: ["textures used", "", false, "fewer textures than the game's: split the atlas", "more textures than the game's: put them in fewer", "texture"],
  texSize: ["a texture's longer side, largest", "texels", true, "the textures are smaller than the game's", "the textures are larger than the game's", "texture"],
  used: ["share of the textures' texels laid on the model", "%", false, "much of the textures is unused: pack the UVs", "the textures are packed fuller than the game's", "texture"],
  reuse: ["surface texels over texels laid (texture shared between faces)", "×", true, "each face has its own texels where the game's share them (mirrored halves, repeated plates)", "the texture is shared between faces more than the game's", "texture"],
  mirrored: ["surface whose texture is laid mirrored", "%", false, "the game mirrors the texture (one half painted, laid on both sides): mirror the UVs", "less is mirrored in the game: paint both sides", "texture"],
  stretch: ["texels stretched one way against the other, median", "×", true, "", "the texture is stretched: lay the UVs square to the surface", "texture"],
  chrome: ["surface with chrome textures", "%", false, "", "more chrome than the game's", "texture"],
  colours: ["colours covering 90% of the painted texels", "", true, "fewer colours than the game's: the painting is flatter", "more colours than the game's: fewer, flatter colours", "colour"],
  value: ["brightness, median", "", false, "darker than the game's figures", "lighter than the game's figures", "colour"],
  contrast: ["brightness spread (IQR)", "", false, "less contrast than the game's: darken the shadows, light the edges", "more contrast than the game's", "colour"],
  sat: ["saturation, mean", "", false, "greyer than the game's figures", "more colourful than the game's figures", "colour"],
  accent: ["texels of strong colour (saturated and bright)", "%", false, "no accent colour where the game's have one (a stripe, a light, a badge)", "more strong colour than the game's: keep it to one accent", "colour"],
  dark: ["texels near black", "%", false, "", "more near-black than the game's", "colour"],
  hues: ["hues used (30° bins holding 4% of the colourful texels)", "", false, "fewer hues than the game's", "more hues than the game's: keep to its few", "colour"],
  grain: ["change from one texel to the next, mean", "", false, "smoother than the game's: add detail at the texel's scale (seams, wear, noise)", "noisier than the game's: smooth the painting", "colour"],
  detail: ["texel-scale change against change over 3 texels", "", false, "the painting is in smooth gradients where the game's has texel-scale detail", "the painting is noise at the texel's scale where the game's is in shapes", "colour"],
  flat: ["neighbouring texels of exactly one colour", "%", false, "no flat areas where the game's has them (pixel art, flat fills)", "flat fills where the game's are painted", "colour"],
};
for (const p of PARTS.filter((p) => p !== "other")) {
  STYLE_SAID[`d_${p}`] = [
    `the ${p}'s texel density against the body's`,
    "×",
    true,
    `the ${p}'s texture is coarser than the rest of the body, unlike the game's: enlarge its UVs`,
    `the ${p}'s texture is finer than the rest of the body, unlike the game's: shrink its UVs, or give the rest more`,
    "part",
  ];
  STYLE_SAID[`t_${p}`] = [
    `the ${p}'s share of the triangles`,
    "%",
    false,
    `the ${p} is cut coarser than the game's`,
    `the ${p} has more triangles than the game's give it`,
    "part",
  ];
  STYLE_SAID[`v_${p}`] = [
    `the ${p}'s brightness against the body's`,
    "",
    false,
    `the ${p} is darker against the body than the game's`,
    `the ${p} is lighter against the body than the game's`,
    "part",
  ];
}

/** The median (or another quantile) of values, each with a weight. */
export function wq(values, weights, q = 0.5) {
  const order = values
    .map((_, i) => i)
    .filter((i) => Number.isFinite(values[i]) && weights[i] > 0)
    .sort((a, b) => values[a] - values[b]);
  if (!order.length) return NaN;
  const total = order.reduce((s, i) => s + weights[i], 0);
  let run = 0;
  for (const i of order) {
    run += weights[i];
    if (run >= q * total) return values[i];
  }
  return values[order.at(-1)];
}
const quant = (values, q) =>
  wq(
    values,
    values.map(() => 1),
    q,
  );

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const dist = (a, b) => len(sub(a, b));

/** Hue (degrees), saturation and value (0 to 1) of an RGB colour, and its luminance. */
function hsv(r, g, b) {
  const mx = Math.max(r, g, b),
    mn = Math.min(r, g, b),
    d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx / 255, (0.299 * r + 0.587 * g + 0.114 * b) / 255];
}

/** The shape measures. */
function shape(f, out) {
  const H = f.height;
  const q = H * 2e-4;
  const ids = new Map();
  const idOf = (p) => {
    const k = `${Math.round(p[0] / q)},${Math.round(p[1] / q)},${Math.round(p[2] / q)}`;
    if (!ids.has(k)) ids.set(k, ids.size);
    return ids.get(k);
  };
  const tv = f.tris.map((t) => t.p.map(idOf));
  const area = f.tris.map((t) => len(cross(sub(t.p[1], t.p[0]), sub(t.p[2], t.p[0]))) / 2);
  const normal = f.tris.map((t) => {
    const n = cross(sub(t.p[1], t.p[0]), sub(t.p[2], t.p[0]));
    const l = len(n) || 1;
    return n.map((v) => v / l);
  });
  const total = area.reduce((s, a) => s + a, 0) || 1;
  out.tris = f.tris.length;
  const edges = f.tris
    .flatMap((t) => [dist(t.p[0], t.p[1]), dist(t.p[1], t.p[2]), dist(t.p[2], t.p[0])])
    .filter((e) => e > 0);
  const med = quant(edges, 0.5);
  out.edge = med / H;
  out.edgeSpread = (quant(edges, 0.75) - quant(edges, 0.25)) / med;

  // pieces: triangles joined by a corner
  const parent = Array.from({ length: ids.size }, (_, i) => i);
  const root = (x) => {
    while (parent[x] !== x) x = parent[x] = parent[parent[x]];
    return x;
  };
  for (const [a, b, c] of tv) {
    parent[root(b)] = root(a);
    parent[root(c)] = root(a);
  }
  const pieceOf = tv.map((v) => root(v[0]));
  const bonesOfPiece = new Map();
  f.tris.forEach((t, i) => {
    const s = bonesOfPiece.get(pieceOf[i]) ?? new Set();
    t.bone.forEach((b) => s.add(b));
    bonesOfPiece.set(pieceOf[i], s);
  });
  out.pieces = bonesOfPiece.size;
  out.rigid =
    f.tris.reduce((s, t, i) => s + (bonesOfPiece.get(pieceOf[i]).size === 1 ? area[i] : 0), 0) / total;

  // edges: open, and how sharply two faces meet
  const byEdge = new Map();
  tv.forEach((v, i) => {
    for (let k = 0; k < 3; k++) {
      const a = v[k],
        b = v[(k + 1) % 3];
      if (a === b) continue;
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      const l = byEdge.get(key);
      if (l) l.push(i);
      else byEdge.set(key, [i]);
    }
  });
  let open = 0,
    shared = 0,
    hard = 0;
  // the same by part, so that a finding can say where: { part: { area, rigid, boxy, edges, hard, open } }
  const parts = Object.fromEntries(
    PARTS.map((p) => [p, { tris: 0, area: 0, rigid: 0, boxy: 0, edges: 0, hard: 0, open: 0 }]),
  );
  for (const l of byEdge.values()) {
    const at = parts[f.tris[l[0]].part];
    at.edges++;
    if (l.length === 1) {
      open++;
      at.open++;
    } else if (l.length === 2) {
      shared++;
      if (dot(normal[l[0]], normal[l[1]]) < Math.cos(Math.PI / 4)) {
        hard++;
        at.hard++;
      }
    }
  }
  out.open = open / (byEdge.size || 1);
  out.hard = hard / (shared || 1);
  const square = Math.cos((10 * Math.PI) / 180);
  const isBoxy = (t, i) => t.axes.some((a) => Math.abs(dot(a, normal[i])) / (len(a) || 1) > square);
  out.boxy = f.tris.reduce((s, t, i) => s + (isBoxy(t, i) ? area[i] : 0), 0) / total;
  f.tris.forEach((t, i) => {
    const at = parts[t.part];
    at.tris++;
    at.area += area[i];
    if (bonesOfPiece.get(pieceOf[i]).size === 1) at.rigid += area[i];
    if (isBoxy(t, i)) at.boxy += area[i];
  });
  for (const at of Object.values(parts)) {
    if (!at.tris) continue;
    Object.assign(at, {
      rigid: at.rigid / at.area,
      boxy: at.boxy / at.area,
      hard: at.hard / Math.max(1, at.edges - at.open),
      open: at.open / Math.max(1, at.edges),
      share: at.tris / f.tris.length,
    });
  }

  // mirrored left to right: the head's and torso's corners with one across the middle
  const cell = H * 0.015;
  const grid = new Map();
  const key = (p) => `${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)},${Math.floor(p[2] / cell)}`;
  const pts = [];
  for (const t of f.tris) if (t.part === "head" || t.part === "torso") for (const p of t.p) pts.push(p);
  for (const p of pts) {
    const k = key(p);
    const l = grid.get(k);
    if (l) l.push(p);
    else grid.set(k, [p]);
  }
  let mirrored = 0;
  for (const p of pts) {
    const m = [-p[0], p[1], p[2]];
    const [cx, cy, cz] = m.map((v) => Math.floor(v / cell));
    let found = false;
    for (let dx = -1; dx <= 1 && !found; dx++)
      for (let dy = -1; dy <= 1 && !found; dy++)
        for (let dz = -1; dz <= 1 && !found; dz++)
          for (const o of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? [])
            if (dist(o, m) < cell) {
              found = true;
              break;
            }
    if (found) mirrored++;
  }
  out.sym = pts.length ? mirrored / pts.length : NaN;

  // per part: share of the triangles
  for (const p of PARTS)
    if (p !== "other") out[`t_${p}`] = f.tris.filter((t) => t.part === p).length / f.tris.length;
  return { area, total, parts };
}

/** The proportions, from the joints and the parts' extents. */
function proportions(f, out) {
  const H = f.height,
    j = f.joints;
  const extent = (part, axis) => {
    let lo = Infinity,
      hi = -Infinity;
    for (const t of f.tris)
      if (t.part === part)
        for (const p of t.p) {
          lo = Math.min(lo, p[axis]);
          hi = Math.max(hi, p[axis]);
        }
    return hi > lo ? hi - lo : NaN;
  };
  const head = extent("head", 2);
  out.heads = H / head;
  if (j.lUpper && j.rUpper) out.shoulders = dist(j.lUpper, j.rUpper) / H;
  out.bulk = extent("torso", 0) / H;
  const chain = (...roles) =>
    roles.every((r) => j[r]) ? roles.slice(1).reduce((s, r, i) => s + dist(j[roles[i]], j[r]), 0) / H : NaN;
  const arms = [chain("lUpper", "lFore", "lHand"), chain("rUpper", "rFore", "rHand")].filter(Number.isFinite);
  if (arms.length) out.armLen = arms.reduce((s, v) => s + v, 0) / arms.length;
  const legs = [chain("lThigh", "lCalf", "lFoot"), chain("rThigh", "rCalf", "rFoot")].filter(Number.isFinite);
  if (legs.length) out.legLen = legs.reduce((s, v) => s + v, 0) / legs.length;
  // a hand: how far its triangles reach on from the wrist, along the forearm (not back up it), either side
  const reach = [];
  for (const side of ["l", "r"]) {
    const wrist = j[`${side}Hand`],
      elbow = j[`${side}Fore`];
    if (!elbow) continue;
    const along = sub(wrist, elbow);
    const l = len(along) || 1;
    let r = 0;
    for (const t of f.tris)
      if (t.part === "hand")
        for (const p of t.p) {
          const d = sub(p, wrist);
          if (len(d) < H * 0.25) r = Math.max(r, dot(d, along) / l);
        }
    if (r) reach.push(r);
  }
  if (reach.length) out.hand = reach.reduce((s, v) => s + v, 0) / reach.length / H;
}

/** The texture measures: how texels lie on the surface, and the painting of the texels laid. */
function texture(f, out, { area, total }, by) {
  const H = f.height;
  const isChrome = (t) => t.tex >= 0 && f.textures[t.tex].flags & 2;
  const dens = [],
    w = [],
    stretch = [],
    partOf = [],
    texOf = [];
  let mirroredArea = 0,
    laidArea = 0,
    chromeArea = 0,
    texelArea = 0;
  f.tris.forEach((t, i) => {
    if (t.tex < 0) return;
    if (isChrome(t)) {
      chromeArea += area[i];
      return;
    }
    if (!(area[i] > 0)) return;
    // the map from the surface to the texture, in the triangle's own plane
    const e1 = sub(t.p[1], t.p[0]),
      e2 = sub(t.p[2], t.p[0]);
    const l1 = len(e1);
    const x = e1.map((v) => v / l1);
    const px = dot(e2, x);
    const py = (2 * area[i]) / l1;
    const d1 = [t.uv[1][0] - t.uv[0][0], t.uv[1][1] - t.uv[0][1]];
    const d2 = [t.uv[2][0] - t.uv[0][0], t.uv[2][1] - t.uv[0][1]];
    // J = [d1 d2] · inverse([[l1, px], [0, py]])
    const a = d1[0] / l1,
      c = d1[1] / l1;
    const b = (d2[0] - a * px) / py,
      d = (d2[1] - c * px) / py;
    const det = a * d - b * c;
    const uvArea = Math.abs(det) * area[i];
    if (!(uvArea > 0)) return;
    texelArea += uvArea;
    laidArea += area[i];
    if (det > 0) mirroredArea += area[i];
    dens.push(Math.sqrt(Math.abs(det)) * H);
    w.push(area[i]);
    partOf.push(t.part);
    texOf.push(t.tex);
    // the singular values of J
    const s1 = a * a + b * b + c * c + d * d;
    const root = Math.sqrt(Math.max(0, s1 * s1 - 4 * det * det));
    stretch.push(Math.sqrt((s1 + root) / (s1 - root || 1e-12)));
  });
  // which way is mirrored: the lesser share, whichever sign the game's tools gave the rest
  out.mirrored = laidArea ? Math.min(mirroredArea, laidArea - mirroredArea) / laidArea : NaN;
  out.chrome = chromeArea / total;
  out.texels = wq(dens, w);
  out.texelSpread = Math.log2(wq(dens, w, 0.75) / wq(dens, w, 0.25));
  out.stretch = wq(stretch, w);
  for (const p of PARTS)
    if (p !== "other") {
      const pick = dens.map((_, i) => (partOf[i] === p ? w[i] : 0));
      const m = wq(dens, pick);
      if (Number.isFinite(m)) out[`d_${p}`] = m / out.texels;
    }

  // the texels laid: each triangle drawn on its texture, marking the part it is of
  const used = [...new Set(f.tris.filter((t) => t.tex >= 0).map((t) => t.tex))];
  out.textures = used.length;
  out.texSize = Math.max(...used.map((i) => Math.max(f.textures[i].width, f.textures[i].height)), 0);
  let laid = 0,
    size = 0;
  const pix = { L: [], part: [], tex: [], rgb: [] };
  let grain = 0,
    grain3 = 0,
    pairs = 0,
    pairs3 = 0,
    same = 0;
  for (const ti of used) {
    const tx = f.textures[ti];
    if (!tx.rgb) continue;
    const W = tx.width,
      Ht = tx.height;
    size += W * Ht;
    const mark = new Int8Array(W * Ht).fill(-1);
    for (const t of f.tris) {
      if (t.tex !== ti) continue;
      const pi = PARTS.indexOf(t.part);
      const [A, B, C] = t.uv;
      const x0 = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0]))),
        x1 = Math.min(W - 1, Math.ceil(Math.max(A[0], B[0], C[0])));
      const y0 = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1]))),
        y1 = Math.min(Ht - 1, Math.ceil(Math.max(A[1], B[1], C[1])));
      const area2 = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
      for (const q of [A, B, C]) {
        const x = Math.min(W - 1, Math.max(0, Math.floor(q[0]))),
          y = Math.min(Ht - 1, Math.max(0, Math.floor(q[1])));
        mark[y * W + x] = pi;
      }
      if (!area2) continue;
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const px = x + 0.5,
            py = y + 0.5;
          const w0 = ((B[0] - px) * (C[1] - py) - (B[1] - py) * (C[0] - px)) / area2;
          const w1 = ((C[0] - px) * (A[1] - py) - (C[1] - py) * (A[0] - px)) / area2;
          if (w0 >= -1e-6 && w1 >= -1e-6 && 1 - w0 - w1 >= -1e-6) mark[y * W + x] = pi;
        }
    }
    const L = new Float32Array(W * Ht);
    for (let k = 0; k < W * Ht; k++)
      L[k] = (0.299 * tx.rgb[k * 3] + 0.587 * tx.rgb[k * 3 + 1] + 0.114 * tx.rgb[k * 3 + 2]) / 255;
    for (let k = 0; k < W * Ht; k++) {
      if (mark[k] < 0) continue;
      laid++;
      pix.L.push(L[k]);
      pix.part.push(mark[k]);
      pix.tex.push(ti);
      pix.rgb.push(k * 3);
      const x = k % W;
      if (x + 1 < W && mark[k + 1] >= 0) {
        grain += Math.abs(L[k + 1] - L[k]);
        pairs++;
        if (tx.index[k] === tx.index[k + 1]) same++;
      }
      if (k + W < W * Ht && mark[k + W] >= 0) {
        grain += Math.abs(L[k + W] - L[k]);
        pairs++;
        if (tx.index[k] === tx.index[k + W]) same++;
      }
      if (x + 3 < W && mark[k + 3] >= 0) {
        grain3 += Math.abs(L[k + 3] - L[k]);
        pairs3++;
      }
      if (k + 3 * W < W * Ht && mark[k + 3 * W] >= 0) {
        grain3 += Math.abs(L[k + 3 * W] - L[k]);
        pairs3++;
      }
    }
  }
  out.used = size ? laid / size : NaN;
  out.reuse = laid ? texelArea / laid : NaN;
  out.grain = pairs ? grain / pairs : NaN;
  out.detail = pairs3 && grain3 ? grain / pairs / (grain3 / pairs3) : NaN;
  out.flat = pairs ? same / pairs : NaN;
  if (!laid) return;

  // the colours of the texels laid
  const n = pix.L.length;
  const counts = new Map();
  const hueBins = new Array(12).fill(0);
  let colourful = 0,
    satSum = 0,
    accent = 0,
    dark = 0;
  const V = new Float32Array(n);
  const partV = PARTS.map(() => []);
  const texStats = new Map();
  for (let i = 0; i < n; i++) {
    const tx = f.textures[pix.tex[i]].rgb,
      o = pix.rgb[i];
    const r = tx[o],
      g = tx[o + 1],
      b = tx[o + 2];
    const [h, s, v, l] = hsv(r, g, b);
    V[i] = l;
    satSum += s;
    const isAccent = s > 0.6 && v > 0.4;
    if (isAccent) accent++;
    if (l < 0.15) dark++;
    if (s > 0.25 && v > 0.15) {
      colourful++;
      hueBins[Math.floor(h / 30) % 12]++;
    }
    const c = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    counts.set(c, (counts.get(c) ?? 0) + 1);
    partV[pix.part[i]].push(l);
    const ts = texStats.get(pix.tex[i]) ?? { n: 0, l: 0, s: 0, accent: 0 };
    ts.n++;
    ts.l += l;
    ts.s += s;
    ts.accent += isAccent;
    texStats.set(pix.tex[i], ts);
  }
  const sorted = [...counts.values()].sort((a, b) => b - a);
  let run = 0,
    k = 0;
  while (run < 0.9 * n) run += sorted[k++];
  out.colours = k;
  const Vs = Array.from(V).sort((a, b) => a - b);
  out.value = Vs[Math.floor(n / 2)];
  out.contrast = Vs[Math.floor(n * 0.75)] - Vs[Math.floor(n * 0.25)];
  out.sat = satSum / n;
  out.accent = accent / n;
  out.dark = dark / n;
  out.hues = colourful ? hueBins.filter((c) => c >= 0.04 * colourful).length : 0;
  PARTS.forEach((p, i) => {
    if (p !== "other" && partV[i].length >= 16)
      out[`v_${p}`] = partV[i].sort((a, b) => a - b)[partV[i].length >> 1] - out.value;
  });
  by.textures = Object.fromEntries(
    [...texStats].map(([ti, s]) => {
      const texels = wq(
        dens,
        dens.map((_, i) => (texOf[i] === ti ? w[i] : 0)),
      );
      return [
        f.textures[ti].name,
        {
          share: s.n / n,
          value: s.l / s.n,
          sat: s.s / s.n,
          accent: s.accent / s.n,
          texels: Number.isFinite(texels) ? texels : undefined,
          size: `${f.textures[ti].width}x${f.textures[ti].height}`,
        },
      ];
    }),
  );
}

/**
 * The style measures of a figure's facts: `{ measures: { key: number }, by: { textures } }`. A measure that
 * cannot be taken (no hands found, no texture) is left out.
 */
export function styleMeasures(f) {
  const out = {};
  const by = {};
  const s = shape(f, out);
  by.parts = Object.fromEntries(
    Object.entries(s.parts)
      .filter(([, v]) => v.tris)
      .map(([p, v]) => [
        p,
        {
          share: +v.share.toFixed(4),
          rigid: +v.rigid.toFixed(3),
          boxy: +v.boxy.toFixed(3),
          hard: +v.hard.toFixed(3),
          open: +v.open.toFixed(3),
        },
      ]),
  );
  proportions(f, out);
  texture(f, out, s, by);
  for (const k of Object.keys(out)) if (!Number.isFinite(out[k])) delete out[k];
  return { measures: out, by };
}
