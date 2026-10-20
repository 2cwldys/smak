// Measures of a figure's shape as geometry and silhouette: what gives a model away as built of closed boxes
// rather than a frame under plates. From a model (its silhouettes drawn by SMAK from several sides, and its
// mesh: pieces, their sizes and likeness, how many surfaces a ray crosses, left against right) or from a
// picture of a figure given a mask. Each measure is told by SHAPE_SAID, as style.mjs' STYLE_SAID.
// A silhouette is measured at one height (HEIGHT pixels), so a picture of any size is measured alike.

/** The height a silhouette is brought to before it is measured. */
export const HEIGHT = 400;
/** The bands of the figure's height a finding can name: [name, from, to] as shares from the top. */
export const BANDS = [
  ["head", 0, 0.16],
  ["torso", 0.16, 0.52],
  ["legs", 0.52, 1],
];

/**
 * [what it is, unit, log scale, what to do when low, what to do when high, group, from]. `from`: "picture"
 * (a silhouette, from a render or a screenshot; a reference has these) or "mesh" (needs the model).
 */
export const SHAPE_SAID = {
  holes: [
    "silhouette's inside that is empty (background seen through the figure)",
    "%",
    false,
    "the silhouette is closed: open the frame (struts with gaps between, a ribcage, plates that do not meet) so the ground shows through",
    "more see-through than the game's: close the frame with plates",
    "space",
    "picture",
  ],
  fineHoles: [
    "silhouette's inside empty in small holes (each under 1% of the silhouette: seen through a frame, not a loop of crossed limbs)",
    "%",
    false,
    "nothing is seen through the body: open the frame in many small places (between struts, ribs, under plates)",
    "more see-through in small holes than the game's",
    "space",
    "picture",
  ],
  holeCount: [
    "holes through the silhouette (each at least 0.6% of the height across)",
    "",
    true,
    "few holes through the figure: let the ground show in more, smaller places (between struts, under plates, between limb and body)",
    "riddled with holes: fewer, larger openings",
    "space",
    "picture",
  ],
  concave: [
    "the silhouette's convex hull left empty (1 - solidity)",
    "%",
    false,
    "a blocky outline that fills its hull: break it with parts that stand out and cut in",
    "a spiky outline",
    "contour",
    "picture",
  ],
  rough: [
    "the outline's length over its convex hull's",
    "×",
    false,
    "the outline is smooth and straight: notch it (plate edges, joints, steps between pieces)",
    "the outline goes in and out more: parts stand apart with gaps open to the outside; join them by frame and struts so the gaps close into holes inside the outline",
    "contour",
    "picture",
  ],
  notchS: [
    "small notches in the outline (closed at 0.5% of the height), per figure",
    "",
    true,
    "the outline has no small steps: let plates overlap and stand off each other",
    "the outline is jagged at the smallest scale",
    "contour",
    "picture",
  ],
  notchM: [
    "middle notches in the outline (closed at 1.25% of the height)",
    "",
    true,
    "no notches at the joints' scale: gaps at the joints, plates that stop short",
    "",
    "contour",
    "picture",
  ],
  notchL: [
    "large notches in the outline (closed at 3% of the height)",
    "",
    true,
    "the limbs and body read as one block: separate the masses",
    "",
    "contour",
    "picture",
  ],
  edges: [
    "internal edges: pixels of strong change inside the silhouette (a picture's proxy for layers)",
    "%",
    false,
    "the inside reads flat: more overlapping parts, gaps and steps between surfaces",
    "busier inside than the game's",
    "layers",
    "picture",
  ],
  cells: [
    "regions inside the silhouette bounded by edges (a picture's proxy for parts), per figure",
    "",
    true,
    "few large areas: break the surfaces into more parts",
    "",
    "parts",
    "picture",
  ],
  cellGini: [
    "how unequal those regions' sizes are (Gini)",
    "",
    false,
    "the regions are of one size: a few large plates among many small parts",
    "",
    "parts",
    "picture",
  ],
  asym: [
    "silhouette left against right (1 - overlap with its mirror)",
    "%",
    false,
    "mirrored left to right: let one side carry what the other does not (a pouch, an antenna, a plate)",
    "lopsided (often the pose: a weapon held)",
    "symmetry",
    "picture",
  ],
  // from the mesh
  pieceGini: [
    "how unequal the pieces' surfaces are (Gini)",
    "",
    false,
    "the pieces are of one size: a few large plates among many small parts (a heavy tail)",
    "a few pieces hold all the surface",
    "parts",
    "mesh",
  ],
  sizeRange: [
    "how far the pieces' sizes reach, large to small (the 90th over the 10th percentile across, in doublings)",
    "×2",
    false,
    "the pieces are all of a size: a few large plates, many small parts",
    "",
    "parts",
    "mesh",
  ],
  small: [
    "pieces under 4% of the height across",
    "%",
    false,
    "no small pieces: add the small hardware (bolts, pistons, cables, brackets) among the plates",
    "mostly small pieces",
    "parts",
    "mesh",
  ],
  layers: [
    "surfaces a ray from the front crosses through the body, mean",
    "",
    true,
    "one shell (front and back): put a frame under the plates, parts behind parts",
    "more layered than the game's",
    "layers",
    "mesh",
  ],
  deep: [
    "of the body seen from the front, the share where a ray crosses 6 surfaces or more",
    "%",
    false,
    "nothing lies behind anything: stack plates over frame over core",
    "",
    "layers",
    "mesh",
  ],
  mirror: [
    "surface whose mirror (left to right) is not on the model",
    "%",
    false,
    "the body is mirrored exactly: vary one side",
    "lopsided",
    "symmetry",
    "mesh",
  ],
  alike: [
    "pieces with a near twin of the same proportions and size (beyond its mirror)",
    "%",
    false,
    "",
    "the pieces repeat one design (the same box at different places): vary their proportions, taper them, cut their corners",
    "rhythm",
    "mesh",
  ],
  boxes: [
    "pieces that are boxes (8 corners or a hull filled to 85%)",
    "%",
    false,
    "",
    "the pieces are boxes: taper, bevel and cut them; make some frames and struts, not blocks",
    "rhythm",
    "mesh",
  ],
};

// ---- binary masks: { width, height, data: Uint8Array } ----

/** The largest (op = max) or least (min) over a square of radius r about each pixel. */
function morph(m, r, op) {
  const { width: W, height: H } = m;
  const tmp = new Uint8Array(W * H),
    out = new Uint8Array(W * H);
  const keep = op === "max" ? 1 : 0;
  // along rows then columns: a pixel takes `keep` when any within r does
  for (let y = 0; y < H; y++) {
    let last = -1e9;
    for (let x = 0; x < W; x++)
      if (m.data[y * W + x] === keep) last = x;
      else if (x - last <= r) tmp[y * W + x] = 2;
    last = 1e9;
    for (let x = W - 1; x >= 0; x--)
      if (m.data[y * W + x] === keep) last = x;
      else if (last - x <= r) tmp[y * W + x] = 2;
    for (let x = 0; x < W; x++) {
      const k = y * W + x;
      tmp[k] = m.data[k] === keep || tmp[k] === 2 ? keep : 1 - keep;
    }
  }
  for (let x = 0; x < W; x++) {
    let last = -1e9;
    for (let y = 0; y < H; y++)
      if (tmp[y * W + x] === keep) last = y;
      else if (y - last <= r) out[y * W + x] = 2;
    last = 1e9;
    for (let y = H - 1; y >= 0; y--)
      if (tmp[y * W + x] === keep) last = y;
      else if (last - y <= r) out[y * W + x] = 2;
    for (let y = 0; y < H; y++) {
      const k = y * W + x;
      out[k] = tmp[k] === keep || out[k] === 2 ? keep : 1 - keep;
    }
  }
  return { width: W, height: H, data: out };
}
export const dilate = (m, r) => morph(m, r, "max");
export const erode = (m, r) => {
  // outside the picture counts as empty
  const pad = {
    width: m.width + 2 * r,
    height: m.height + 2 * r,
    data: new Uint8Array((m.width + 2 * r) * (m.height + 2 * r)),
  };
  for (let y = 0; y < m.height; y++)
    pad.data.set(m.data.subarray(y * m.width, (y + 1) * m.width), (y + r) * pad.width + r);
  const e = morph(pad, r, "min");
  const out = new Uint8Array(m.width * m.height);
  for (let y = 0; y < m.height; y++)
    out.set(e.data.subarray((y + r) * pad.width + r, (y + r) * pad.width + r + m.width), y * m.width);
  return { width: m.width, height: m.height, data: out };
};
export const opening = (m, r) => dilate(erode(m, r), r);
export const closing = (m, r) => {
  // closed within a margin, so that what touches the picture's border is not cut
  const pad = {
    width: m.width + 4 * r,
    height: m.height + 4 * r,
    data: new Uint8Array((m.width + 4 * r) * (m.height + 4 * r)),
  };
  for (let y = 0; y < m.height; y++)
    pad.data.set(m.data.subarray(y * m.width, (y + 1) * m.width), (y + 2 * r) * pad.width + 2 * r);
  const c = erode(dilate(pad, r), r);
  const out = new Uint8Array(m.width * m.height);
  for (let y = 0; y < m.height; y++)
    out.set(
      c.data.subarray((y + 2 * r) * pad.width + 2 * r, (y + 2 * r) * pad.width + 2 * r + m.width),
      y * m.width,
    );
  return { width: m.width, height: m.height, data: out };
};

/** Connected regions of a mask (8 or 4 neighbours): labels (-1 outside) and each one's size. */
export function components(m, eight = true) {
  const { width: W, height: H, data } = m;
  const label = new Int32Array(W * H).fill(-1),
    sizes = [];
  const stack = [];
  for (let s = 0; s < W * H; s++) {
    if (!data[s] || label[s] >= 0) continue;
    const n = sizes.length;
    let size = 0;
    label[s] = n;
    stack.push(s);
    while (stack.length) {
      const k = stack.pop(),
        x = k % W,
        y = (k - x) / W;
      size++;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if ((!dx && !dy) || (!eight && dx && dy)) continue;
          const nx = x + dx,
            ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (data[j] && label[j] < 0) {
            label[j] = n;
            stack.push(j);
          }
        }
    }
    sizes.push(size);
  }
  return { label, sizes };
}

/** Only the largest region of a mask (8 neighbours). */
export function largest(m) {
  const { label, sizes } = components(m);
  if (!sizes.length) return m;
  const top = sizes.indexOf(Math.max(...sizes));
  return { ...m, data: Uint8Array.from(label, (l) => (l === top ? 1 : 0)) };
}

/** A mask with its holes filled: what the ground does not reach from the border (4 neighbours). */
export function filled(m) {
  const { width: W, height: H, data } = m;
  const out = new Uint8Array(W * H).fill(1),
    stack = [];
  const seed = (k) => {
    if (!data[k] && out[k]) {
      out[k] = 0;
      stack.push(k);
    }
  };
  for (let x = 0; x < W; x++) {
    seed(x);
    seed((H - 1) * W + x);
  }
  for (let y = 0; y < H; y++) {
    seed(y * W);
    seed(y * W + W - 1);
  }
  while (stack.length) {
    const k = stack.pop(),
      x = k % W;
    if (x > 0) seed(k - 1);
    if (x + 1 < W) seed(k + 1);
    if (k >= W) seed(k - W);
    if (k + W < W * H) seed(k + W);
  }
  return { width: W, height: H, data: out };
}

/** Holes of a mask smaller than `least` pixels filled in (specks of the figure taken for ground). */
export function fillSmallHoles(m, least) {
  const f = filled(m);
  const hole = { ...m, data: Uint8Array.from(f.data, (v, k) => (v && !m.data[k] ? 1 : 0)) };
  const { label, sizes } = components(hole, false);
  return {
    ...m,
    data: Uint8Array.from(m.data, (v, k) => (v || (label[k] >= 0 && sizes[label[k]] < least) ? 1 : 0)),
  };
}

/**
 * A mask (and the picture under it, when given: RGBA) cut to the figure's box and brought to `height` pixels
 * tall by averaging (a pixel is the figure when half of it is), with a margin about it.
 */
export function toHeight(m, height = HEIGHT, img = null, margin = 16) {
  const { width: W, height: H, data } = m;
  let x0 = W,
    y0 = H,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (data[y * W + x]) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
  if (x1 < 0) return null;
  const k = (y1 - y0 + 1) / height;
  const w = Math.ceil((x1 - x0 + 1) / k);
  const OW = w + 2 * margin,
    OH = height + 2 * margin;
  const out = new Uint8Array(OW * OH),
    rgba = img ? new Uint8Array(OW * OH * 4) : null;
  for (let ty = 0; ty < height; ty++)
    for (let tx = 0; tx < w; tx++) {
      // the source pixels this one covers
      const sx0 = x0 + tx * k,
        sy0 = y0 + ty * k;
      let inside = 0,
        n = 0;
      const c = [0, 0, 0];
      for (let sy = Math.floor(sy0); sy < Math.min(y1 + 1, Math.ceil(sy0 + k)); sy++)
        for (let sx = Math.floor(sx0); sx < Math.min(x1 + 1, Math.ceil(sx0 + k)); sx++) {
          const s = sy * W + sx;
          n++;
          if (data[s]) {
            inside++;
            if (img) for (let j = 0; j < 3; j++) c[j] += img.rgba[s * 4 + j];
          }
        }
      const o = (ty + margin) * OW + tx + margin;
      if (n && inside * 2 >= n) {
        out[o] = 1;
        if (rgba) {
          for (let j = 0; j < 3; j++) rgba[o * 4 + j] = c[j] / inside;
          rgba[o * 4 + 3] = 255;
        }
      }
    }
  return { mask: { width: OW, height: OH, data: out }, img: rgba ? { width: OW, height: OH, rgba } : null };
}

/** The convex hull of the mask's pixels (their corners), as [[x, y], ...], and its area and perimeter. */
function hullOf(m) {
  const pts = [];
  for (let y = 0; y < m.height; y++) {
    let a = -1,
      b = -1;
    for (let x = 0; x < m.width; x++)
      if (m.data[y * m.width + x]) {
        if (a < 0) a = x;
        b = x;
      }
    if (a >= 0) pts.push([a, y], [a, y + 1], [b + 1, y], [b + 1, y + 1]);
  }
  pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [],
    upper = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop();
    lower.push(p);
  }
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop();
    upper.push(p);
  }
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  let area = 0,
    perimeter = 0;
  hull.forEach((p, i) => {
    const q = hull[(i + 1) % hull.length];
    area += p[0] * q[1] - q[0] * p[1];
    perimeter += Math.hypot(q[0] - p[0], q[1] - p[1]);
  });
  return { hull, area: Math.abs(area) / 2, perimeter };
}

/** The length of a mask's outline: its pixels' borders with the ground, as a curve would measure (π/4 of the steps). */
function outlineOf(m) {
  const { width: W, height: H, data } = m;
  let steps = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!data[y * W + x]) continue;
      if (x === 0 || !data[y * W + x - 1]) steps++;
      if (x === W - 1 || !data[y * W + x + 1]) steps++;
      if (y === 0 || !data[(y - 1) * W + x]) steps++;
      if (y === H - 1 || !data[(y + 1) * W + x]) steps++;
    }
  return (steps * Math.PI) / 4;
}

/** The Gini of some sizes (0: all alike, near 1: one holds all). */
export function gini(values) {
  const s = values.filter((v) => v > 0).sort((a, b) => a - b);
  const n = s.length,
    total = s.reduce((a, b) => a + b, 0);
  if (n < 2 || !total) return 0;
  let acc = 0;
  s.forEach((v, i) => {
    acc += (2 * (i + 1) - n - 1) * v;
  });
  return acc / (n * total);
}

const lumAt = (rgba, k) => (0.299 * rgba[k * 4] + 0.587 * rgba[k * 4 + 1] + 0.114 * rgba[k * 4 + 2]) / 255;

/**
 * The silhouette measures of a figure: a mask (any size; it is brought to HEIGHT) and, when given, the
 * picture under it (RGBA, for the inside's edges and regions). `{ measures, bands, at }`: `bands` the holes'
 * share and notches by band of the height (head, torso, legs); `at` the mask as measured (for a sheet).
 */
export function silhouetteMeasures(mask, img = null) {
  const t = toHeight(mask, HEIGHT, img);
  if (!t) return null;
  const m = t.mask,
    { width: W, height: H } = m;
  const top = 16; // toHeight's margin: the figure's rows are top .. top + HEIGHT
  const fill = filled(m);
  const area = fill.data.reduce((s, v) => s + v, 0);
  const out = {};
  // holes: the inside the ground shows through, each at least 0.6% of the height across (an area of 6 px)
  const LEAST_HOLE = 6;
  const hole = { ...m, data: Uint8Array.from(fill.data, (v, k) => (v && !m.data[k] ? 1 : 0)) };
  const hc = components(hole, false);
  let holeArea = 0,
    holeCount = 0,
    fineArea = 0;
  const bandHole = BANDS.map(() => 0),
    bandFine = BANDS.map(() => 0),
    bandArea = BANDS.map(() => 0);
  // a fine hole: under 1% of the filled silhouette (the ground seen through a frame), not a loop closed by
  // two limbs crossing or a hand on the hip
  const fineMost = area * 0.01;
  const bandOf = (k) => {
    const f = (Math.floor(k / W) - top) / HEIGHT;
    return BANDS.findIndex(([, a, b]) => f >= a && f < b);
  };
  for (let k = 0; k < W * H; k++) {
    if (!fill.data[k]) continue;
    const b = bandOf(k);
    if (b >= 0) bandArea[b]++;
    const size = hc.label[k] >= 0 ? hc.sizes[hc.label[k]] : 0;
    if (size >= LEAST_HOLE) {
      holeArea++;
      if (b >= 0) bandHole[b]++;
    }
    if (size >= LEAST_HOLE && size < fineMost) {
      fineArea++;
      if (b >= 0) bandFine[b]++;
    }
  }
  for (const s of hc.sizes) if (s >= LEAST_HOLE) holeCount++;
  out.holes = holeArea / area;
  out.fineHoles = fineArea / area;
  out.holeCount = holeCount + 0.5; // half a hole, so that none is a number on a log scale
  // the outline against its hull
  const hull = hullOf(fill);
  out.concave = 1 - area / hull.area;
  out.rough = outlineOf(fill) / hull.perimeter;
  // notches: what a closing at each scale fills in the outline, counted as regions of at least r² pixels
  const bandNotch = {};
  for (const [key, r] of [
    ["notchS", 2],
    ["notchM", 5],
    ["notchL", 12],
  ]) {
    const c = closing(fill, r);
    const res = { ...m, data: Uint8Array.from(c.data, (v, k) => (v && !fill.data[k] ? 1 : 0)) };
    const { sizes, label } = components(res, false);
    out[key] = sizes.filter((s) => s >= r * r).length + 0.5;
    if (key === "notchM") {
      const counted = new Set();
      const per = BANDS.map(() => 0);
      for (let k = 0; k < W * H; k++) {
        const l = label[k];
        if (l >= 0 && sizes[l] >= r * r && !counted.has(l)) {
          counted.add(l);
          const b = bandOf(k);
          if (b >= 0) per[b]++;
        }
      }
      BANDS.forEach(([name], i) => {
        bandNotch[name] = per[i];
      });
    }
  }
  // left against right: the filled silhouette against its mirror about its middle (the mean column)
  let sx = 0;
  for (let k = 0; k < W * H; k++) if (fill.data[k]) sx += k % W;
  const mid = sx / area;
  let both = 0,
    either = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const a = fill.data[y * W + x];
      const mx = Math.round(2 * mid - x);
      const b = mx >= 0 && mx < W ? fill.data[y * W + mx] : 0;
      if (a && b) both++;
      if (a || b) either++;
    }
  out.asym = 1 - both / either;
  // the inside, from the picture: strong changes away from the outline, and the regions between them
  if (t.img) {
    const inner = erode(m, 2);
    const edge = new Uint8Array(W * H);
    let n = 0,
      e = 0;
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const k = y * W + x;
        if (!inner.data[k]) continue;
        n++;
        const gx = lumAt(t.img.rgba, k + 1) - lumAt(t.img.rgba, k - 1),
          gy = lumAt(t.img.rgba, k + W) - lumAt(t.img.rgba, k - W);
        if (Math.hypot(gx, gy) > 0.12) {
          edge[k] = 1;
          e++;
        }
      }
    out.edges = n ? e / n : 0;
    const cellMask = { ...m, data: Uint8Array.from(inner.data, (v, k) => (v && !edge[k] ? 1 : 0)) };
    const sizes = components(cellMask, false).sizes.filter((s) => s >= 4);
    out.cells = sizes.length + 0.5;
    out.cellGini = gini(sizes);
  }
  const bands = Object.fromEntries(
    BANDS.map(([name], i) => [
      name,
      {
        holes: bandArea[i] ? bandHole[i] / bandArea[i] : 0,
        fine: bandArea[i] ? bandFine[i] / bandArea[i] : 0,
        notches: bandNotch[name],
      },
    ]),
  );
  return { measures: out, bands, at: m };
}

// ---- the mesh ----

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);

/** The pieces of a figure's mesh (triangles joined by a corner): for each, its triangles and corners. */
export function piecesOf(f) {
  const q = f.height * 2e-4;
  const ids = new Map(),
    pts = [];
  const idOf = (p) => {
    const k = `${Math.round(p[0] / q)},${Math.round(p[1] / q)},${Math.round(p[2] / q)}`;
    if (!ids.has(k)) {
      ids.set(k, ids.size);
      pts.push(p);
    }
    return ids.get(k);
  };
  const tv = f.tris.map((t) => t.p.map(idOf));
  const parent = Array.from({ length: ids.size }, (_, i) => i);
  const root = (x) => {
    while (parent[x] !== x) x = parent[x] = parent[parent[x]];
    return x;
  };
  for (const [a, b, c] of tv) {
    parent[root(b)] = root(a);
    parent[root(c)] = root(a);
  }
  const byRoot = new Map();
  tv.forEach((v, i) => {
    const r = root(v[0]);
    if (!byRoot.has(r)) byRoot.set(r, { tris: [], corners: new Set() });
    const p = byRoot.get(r);
    p.tris.push(i);
    v.forEach((c) => p.corners.add(c));
  });
  return [...byRoot.values()].map((p) => ({ tris: p.tris, corners: [...p.corners].map((c) => pts[c]) }));
}

/** Eigenvectors of a symmetric 3x3 (Jacobi): `{ values, vectors }` (vectors as columns, largest first). */
function eigen3(A) {
  const a = A.map((r) => [...r]);
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let sweep = 0; sweep < 30; sweep++) {
    for (const [p, q] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ]) {
      if (Math.abs(a[p][q]) < 1e-12) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1),
        s = t * c;
      for (let k = 0; k < 3; k++) {
        const akp = a[k][p],
          akq = a[k][q];
        a[k][p] = c * akp - s * akq;
        a[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p][k],
          aqk = a[q][k];
        a[p][k] = c * apk - s * aqk;
        a[q][k] = s * apk + c * aqk;
      }
      for (let k = 0; k < 3; k++) {
        const vkp = v[k][p],
          vkq = v[k][q];
        v[k][p] = c * vkp - s * vkq;
        v[k][q] = s * vkp + c * vkq;
      }
    }
  }
  const order = [0, 1, 2].sort((i, j) => a[j][j] - a[i][i]);
  return { values: order.map((i) => a[i][i]), vectors: order.map((i) => [v[0][i], v[1][i], v[2][i]]) };
}

/** A piece's design in a few numbers: its extents along its own axes, how boxy, its size and surface. */
function pieceShape(f, piece) {
  const P = piece.corners;
  const c = [0, 1, 2].map((a) => P.reduce((s, p) => s + p[a], 0) / P.length);
  const C = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (const p of P) {
    const d = sub(p, c);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j];
  }
  const { vectors } = eigen3(C);
  const ext = vectors.map((ax) => {
    let lo = Infinity,
      hi = -Infinity;
    for (const p of P) {
      const t = dot(sub(p, c), ax);
      lo = Math.min(lo, t);
      hi = Math.max(hi, t);
    }
    return hi - lo;
  });
  let area = 0,
    square = 0;
  for (const i of piece.tris) {
    const t = f.tris[i];
    const n = cross3(sub(t.p[1], t.p[0]), sub(t.p[2], t.p[0]));
    const a = len(n) / 2;
    area += a;
    if (a > 0 && vectors.some((ax) => Math.abs(dot(ax, n)) / (2 * a) > 0.985)) square += a;
  }
  const [e1, e2, e3] = ext.map((e) => Math.max(e, f.height * 1e-3));
  const boxVol = e1 * e2 * e3;
  // a box: few corners, or a surface near a box's (its faces square to its own axes and its area near the box's)
  const boxArea = 2 * (e1 * e2 + e2 * e3 + e1 * e3);
  const box = P.length <= 8 || (square / (area || 1) > 0.85 && area / boxArea > 0.8);
  return {
    size: Math.hypot(e1, e2, e3) / f.height,
    area,
    shape: [Math.log(e2 / e1), Math.log(e3 / e1), square / (area || 1)],
    box,
    vol: boxVol,
    count: piece.tris.length,
    middle: c,
  };
}

/** How many surfaces cross each cell of a grid seen from the front (x across, z up): Uint16Array and grid size. */
function layersFromFront(f, cells = 160) {
  const H = f.height;
  let x0 = Infinity,
    x1 = -Infinity;
  for (const t of f.tris)
    for (const p of t.p) {
      x0 = Math.min(x0, p[0]);
      x1 = Math.max(x1, p[0]);
    }
  const s = cells / H;
  const W = Math.ceil((x1 - x0) * s) + 2,
    R = cells + 2;
  const count = new Uint16Array(W * R);
  for (const t of f.tris) {
    const v = t.p.map((p) => [(p[0] - x0) * s + 0.5, (H - p[2]) * s + 0.5]);
    const area2 = (v[1][0] - v[0][0]) * (v[2][1] - v[0][1]) - (v[2][0] - v[0][0]) * (v[1][1] - v[0][1]);
    if (Math.abs(area2) < 1e-9) continue;
    const bx0 = Math.max(0, Math.floor(Math.min(v[0][0], v[1][0], v[2][0]))),
      bx1 = Math.min(W - 1, Math.ceil(Math.max(v[0][0], v[1][0], v[2][0])));
    const by0 = Math.max(0, Math.floor(Math.min(v[0][1], v[1][1], v[2][1]))),
      by1 = Math.min(R - 1, Math.ceil(Math.max(v[0][1], v[1][1], v[2][1])));
    for (let y = by0; y <= by1; y++)
      for (let x = bx0; x <= bx1; x++) {
        const px = x + 0.5,
          py = y + 0.5;
        // the cell's middle inside the triangle (either winding)
        const w0 = (v[1][0] - px) * (v[2][1] - py) - (v[2][0] - px) * (v[1][1] - py);
        const w1 = (v[2][0] - px) * (v[0][1] - py) - (v[0][0] - px) * (v[2][1] - py);
        const w2 = (v[0][0] - px) * (v[1][1] - py) - (v[1][0] - px) * (v[0][1] - py);
        if ((w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0)) count[y * W + x]++;
      }
  }
  return { count, width: W, height: R };
}

/**
 * The mesh measures of a figure's facts (`figureFacts`): pieces and their sizes, layers, left against right, how
 * alike the pieces are. `{ measures, where }`: `where` names the parts most at fault for the findings.
 */
export function meshMeasures(f) {
  const out = {},
    where = {};
  const H = f.height;
  const pieces = piecesOf(f).map((p) => ({ ...p, ...pieceShape(f, p) }));
  const areas = pieces.map((p) => p.area);
  out.pieceGini = gini(areas);
  out.small = pieces.filter((p) => p.size < 0.04).length / pieces.length;
  // how far the sizes reach: the 90th percentile across over the 10th, in doublings
  const across = pieces.map((p) => p.size).sort((a, b) => a - b);
  out.sizeRange = Math.log2(
    across[Math.floor(0.9 * (across.length - 1))] / across[Math.floor(0.1 * (across.length - 1))],
  );
  // layers seen from the front
  const L = layersFromFront(f);
  let covered = 0,
    sum = 0,
    deep = 0;
  const bandL = BANDS.map(() => [0, 0]);
  for (let y = 0; y < L.height; y++)
    for (let x = 0; x < L.width; x++) {
      const c = L.count[y * L.width + x];
      if (!c) continue;
      covered++;
      sum += c;
      if (c >= 6) deep++;
      const fr = y / (L.height - 2);
      const b = BANDS.findIndex(([, a, z]) => fr >= a && fr < z);
      if (b >= 0) {
        bandL[b][0] += c;
        bandL[b][1]++;
      }
    }
  out.layers = covered ? sum / covered : 0;
  out.deep = covered ? deep / covered : 0;
  where.layers = Object.fromEntries(
    BANDS.map(([n], i) => [n, bandL[i][1] ? +(bandL[i][0] / bandL[i][1]).toFixed(2) : 0]),
  );
  // left against right: points over the surface, about one to each square of 1% of the height (so a large
  // triangle is sampled as densely as a small one), each mirrored (x is the body's left) and looked for among
  // the others within 1.5% of the height
  const pts = [];
  const step = H * 0.01;
  for (const t of f.tris) {
    const n = Math.min(
      400,
      Math.max(1, Math.round(len(cross3(sub(t.p[1], t.p[0]), sub(t.p[2], t.p[0]))) / 2 / (step * step))),
    );
    for (let i = 0; i < n; i++) {
      // spread evenly over the triangle (a low-discrepancy sequence, folded into the triangle)
      let a = (0.5 + i * 0.7548776662) % 1,
        b = (0.5 + i * 0.569840291) % 1;
      if (a + b > 1) {
        a = 1 - a;
        b = 1 - b;
      }
      pts.push([0, 1, 2].map((k) => t.p[0][k] + a * (t.p[1][k] - t.p[0][k]) + b * (t.p[2][k] - t.p[0][k])));
    }
  }
  const reach = H * 0.015;
  const grid = new Map();
  const key = (p) => `${Math.floor(p[0] / reach)},${Math.floor(p[1] / reach)},${Math.floor(p[2] / reach)}`;
  for (const p of pts) {
    const k = key(p);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(p);
  }
  // the body's middle across: where its surface balances
  const midX = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  let lone = 0;
  for (const p of pts) {
    const m = [2 * midX - p[0], p[1], p[2]];
    const [gx, gy, gz] = [Math.floor(m[0] / reach), Math.floor(m[1] / reach), Math.floor(m[2] / reach)];
    let found = false;
    for (let dx = -1; dx <= 1 && !found; dx++)
      for (let dy = -1; dy <= 1 && !found; dy++)
        for (let dz = -1; dz <= 1 && !found; dz++)
          for (const q of grid.get(`${gx + dx},${gy + dy},${gz + dz}`) ?? [])
            if (len(sub(q, m)) < reach) {
              found = true;
              break;
            }
    if (!found) lone++;
  }
  out.mirror = pts.length ? lone / pts.length : 0;
  // alike: pieces of three triangles or more, compared by their proportions, squareness and size; a piece's
  // mirror (as far on the other side) is not its twin
  const big = pieces.filter((p) => p.count >= 4);
  let twinned = 0;
  for (const p of big) {
    const has = big.some(
      (q) =>
        q !== p &&
        Math.hypot(p.shape[0] - q.shape[0], p.shape[1] - q.shape[1], 2 * (p.shape[2] - q.shape[2])) < 0.2 &&
        Math.abs(Math.log(p.size / q.size)) < 0.2 &&
        !(
          Math.abs(p.middle[0] + q.middle[0] - 2 * midX) < H * 0.03 &&
          Math.abs(p.middle[2] - q.middle[2]) < H * 0.03
        ),
    );
    if (has) twinned++;
  }
  out.alike = big.length ? twinned / big.length : 0;
  out.boxes = pieces.length ? pieces.filter((p) => p.box).length / pieces.length : 0;
  // where: the part with the most pieces and the most boxes
  const partOf = (p) => {
    const c = {};
    for (const i of p.tris) c[f.tris[i].part] = (c[f.tris[i].part] ?? 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
  };
  const byPart = {};
  for (const p of pieces) {
    const k = partOf(p);
    byPart[k] = byPart[k] ?? { pieces: 0, boxes: 0 };
    byPart[k].pieces++;
    if (p.box) byPart[k].boxes++;
  }
  where.parts = byPart;
  where.pieces = pieces.length;
  return { measures: out, where };
}

// ---- a picture of a figure on a busy viewport (a screenshot of a 3D editor) ----

/**
 * The figure in a box of a screenshot of an editor's viewport: a neutral grey ground with a grid, coloured
 * axis lines, wire boxes and gizmos. A pixel is the figure when it is coloured, darker or lighter than the
 * ground's band (`ground`: [lo, hi] of brightness, `grey`: the most a ground pixel's channels differ); thin
 * lines (`lines` px wide or less) are opened away; the largest region is kept with its holes, specks of the
 * figure taken for ground (under `speck` pixels) filled. `exclude`: boxes [x0, y0, x1, y1] (in the box's
 * pixels) taken out by hand; `include`: boxes put in. `{ width, height, data }` at the box's size.
 */
export function maskOnViewport(
  img,
  box,
  { ground = [57, 74], grey = 3, lines = 1, speck = 60, exclude = [], include = [], keep = 1 } = {},
) {
  const [x0, y0, x1, y1] = box;
  const W = x1 - x0,
    H = y1 - y0;
  const data = new Uint8Array(W * H),
    axis = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const o = ((y0 + y) * img.width + x0 + x) * 4;
      const r = img.rgba[o],
        g = img.rgba[o + 1],
        b = img.rgba[o + 2];
      const L = (r + g + b) / 3,
        chroma = Math.max(r, g, b) - Math.min(r, g, b);
      if (chroma > grey || L < ground[0] || L > ground[1]) data[y * W + x] = 1;
      // the editor's axis lines: green, or red (strongly)
      if ((g - r > 6 && g > b) || r - g > 15) axis[y * W + x] = 1;
    }
  // an axis line is thin: what of that colour is wide (a red part of the figure) stays
  const wide = dilate(opening({ width: W, height: H, data: axis }, 4), 2);
  for (let k = 0; k < W * H; k++) if (axis[k] && !wide.data[k]) data[k] = 0;
  let m = { width: W, height: H, data };
  for (const [a, b, c, d] of exclude)
    for (let y = Math.max(0, b); y < Math.min(H, d); y++)
      for (let x = Math.max(0, a); x < Math.min(W, c); x++) m.data[y * W + x] = 0;
  m = opening(m, lines);
  for (const [a, b, c, d] of include)
    for (let y = Math.max(0, b); y < Math.min(H, d); y++)
      for (let x = Math.max(0, a); x < Math.min(W, c); x++) m.data[y * W + x] = 1;
  // the largest region, or the `keep` largest (a figure cut in two by an exclusion)
  const { label, sizes } = components(m);
  const top = sizes
    .map((s, i) => [s, i])
    .sort((a, b) => b[0] - a[0])
    .slice(0, keep)
    .map(([, i]) => i);
  m = { ...m, data: Uint8Array.from(label, (l) => (top.includes(l) ? 1 : 0)) };
  return fillSmallHoles(m, speck);
}
