// Measures of a texture as painting: what makes a texture look made by hand (or baked from a detailed model)
// rather than stamped out. They read an atlas: texels (RGB), a mask of the texels that are painting (laid on the
// model, or not the ground of a picture), and the charts (UV islands) when known. An atlas comes from a model's
// texture (its UVs give the mask and the charts) or from a picture of one (a screenshot of an atlas on a plain
// ground, brought back to one pixel a texel). Each measure is told by TEX_SAID, as style.mjs' STYLE_SAID.

/** [what it is, unit, log scale, what to do when low, what to do when high, group]. */
export const TEX_SAID = {
  repeat: [
    "8x8 patches with a near-copy elsewhere, moved only",
    "%",
    false,
    "",
    "the same motif is stamped over and over: paint each chart for its own piece, vary or drop the repeated stamp",
    "motif",
  ],
  repeatAny: [
    "8x8 patches with a near-copy elsewhere, moved, mirrored or turned",
    "%",
    false,
    "",
    "much of the texture repeats (a mirrored atlas counts here): fine if mirrored halves, not if one stamp",
    "motif",
  ],
  marks: [
    "small isolated marks of strong contrast (glyphs, dots, dashes), per 1000 texels",
    "",
    true,
    "no markings where the game's have a few",
    "markings scattered everywhere: keep a few deliberate ones (a number, a logo, a label) where they mean something",
    "motif",
  ],
  lightMarks: [
    "small marks lighter than their ground (light glyphs: numbers, letters, highlights), per 1000 texels",
    "",
    true,
    "no light markings where the game's have a few",
    "light glyphs scattered everywhere: keep a few deliberate ones",
    "motif",
  ],
  flat: [
    "texels in a flat fill (3x3 of one colour)",
    "%",
    false,
    "no flat areas where the game's have them",
    "flat fills where the game's are shaded: give each panel a gradient, wear and occlusion",
    "light",
  ],
  ramp: [
    "texels on a smooth ramp (3+ steps the same way)",
    "%",
    false,
    "no gradients across panels: shade each panel (lighter to the light, darker into the crevices)",
    "the painting is soft gradients where the game's has hard detail",
    "light",
  ],
  speckle: [
    "texels unlike all four neighbours the same way (isolated pixels)",
    "%",
    false,
    "too clean: the game's are dense with single-texel detail (rivets, chips, baked noise)",
    "noisy at the texel's scale: fewer lone pixels",
    "light",
  ],
  grain: [
    "change from one texel to the next, mean",
    "",
    false,
    "smoother than the game's",
    "busier than the game's",
    "light",
  ],
  cluster: [
    "how unevenly detail is spread (Gini of edge density over 8x8 cells)",
    "",
    false,
    "detail spread evenly everywhere: keep large quiet areas and gather the detail at joints, edges and ends",
    "the detail is all in a few places",
    "hierarchy",
  ],
  quiet: [
    "8x8 cells with almost no edges (quiet areas)",
    "%",
    false,
    "no quiet areas: leave big panels plain (shaded, not detailed)",
    "mostly plain: add detail at the joints and edges",
    "hierarchy",
  ],
  diagonal: [
    "edge strength at a slant (22.5 to 67.5 degrees)",
    "%",
    false,
    "every line square to the texture: let lines follow the form (chevrons, struts, tapering panels)",
    "more slanted lines than the game's",
    "form",
  ],
  chartRect: [
    "charts' area over their bounding box (1: rectangles)",
    "",
    false,
    "",
    "the charts are rectangles: unfold each piece's own outline (a tapering plate, a strut) and paint to it",
    "form",
  ],
  charts: [
    "charts (UV islands of 16 texels or more) per 10,000 texels painted",
    "",
    true,
    "fewer, larger charts than the game's",
    "the texture is cut into many small charts: unfold whole pieces (a torso, a limb) into large islands and paint across them",
    "form",
  ],
  chartDiag: [
    "chart outlines at a slant",
    "%",
    false,
    "the charts' outlines are all square: the pieces are boxes laid flat",
    "",
    "form",
  ],
  value: [
    "brightness, median",
    "",
    false,
    "darker than the game's",
    "lighter than the game's: darken the ground, more mechanical near-black",
    "value",
  ],
  contrast: [
    "brightness spread (IQR)",
    "",
    false,
    "flatter than the game's",
    "more contrast than the game's: bring the panels' values together",
    "value",
  ],
  dark: [
    "texels near black",
    "%",
    false,
    "too few darks: the game's have near-black mechanism (joints, recesses, inner parts)",
    "more near-black than the game's",
    "value",
  ],
  colours: [
    "colours covering 90% of the texels",
    "",
    true,
    "fewer colours than the game's: more shades of each",
    "more colours than the game's",
    "value",
  ],
  sat: ["saturation, mean", "", false, "greyer than the game's", "more colourful than the game's", "value"],
  // from the model (texture-model.mjs)
  aoFollow: [
    "darker where the surface is hidden (texel brightness against occlusion, within charts; -correlation)",
    "",
    false,
    "the painting ignores the form: darken the texels in crevices and under overhangs (bake occlusion)",
    "",
    "form",
  ],
  aoFollowAll: [
    "darker where the surface is hidden, over the whole model (-correlation)",
    "",
    false,
    "hidden parts are no darker than open ones: paint recesses and inner parts darker",
    "",
    "form",
  ],
};

const lum = (rgb, k) => (0.299 * rgb[k * 3] + 0.587 * rgb[k * 3 + 1] + 0.114 * rgb[k * 3 + 2]) / 255;

/** Connected regions of a mask (4-neighbours): an Int32Array of labels (-1 outside) and their count. */
export function regions(width, height, mask) {
  const label = new Int32Array(width * height).fill(-1);
  let n = 0;
  const stack = [];
  for (let s = 0; s < width * height; s++) {
    if (!mask[s] || label[s] >= 0) continue;
    label[s] = n;
    stack.push(s);
    while (stack.length) {
      const k = stack.pop(),
        x = k % width;
      for (const j of [x > 0 ? k - 1 : -1, x + 1 < width ? k + 1 : -1, k - width, k + width])
        if (j >= 0 && j < width * height && mask[j] && label[j] < 0) {
          label[j] = n;
          stack.push(j);
        }
    }
    n++;
  }
  return { label, count: n };
}

/**
 * The period of a picture's pixels: how many screen pixels one texel is drawn as (an atlas shown enlarged,
 * unfiltered), and where its cells begin. From the strength of the change between neighbours along each axis:
 * hard texel edges come every `scale` pixels. `{ scale, phase: [x, y], strength }`.
 */
export function periodOf({ width, height, rgba }, mask) {
  const L = (k) => (0.299 * rgba[k * 4] + 0.587 * rgba[k * 4 + 1] + 0.114 * rgba[k * 4 + 2]) / 255;
  const px = new Float64Array(width),
    py = new Float64Array(height);
  for (let y = 0; y + 1 < height; y++)
    for (let x = 0; x + 1 < width; x++) {
      const k = y * width + x;
      if (!mask[k]) continue;
      if (mask[k + 1]) px[x] += Math.abs(L(k + 1) - L(k));
      if (mask[k + width]) py[y] += Math.abs(L(k + width) - L(k));
    }
  const best = (p) => {
    let top = { s: 1, m: 0, angle: 0 };
    for (let s = 1.5; s <= 12; s += 0.01) {
      let c = 0,
        q = 0;
      for (let i = 0; i < p.length; i++) {
        c += p[i] * Math.cos((2 * Math.PI * i) / s);
        q += p[i] * Math.sin((2 * Math.PI * i) / s);
      }
      const m = Math.hypot(c, q);
      // a longer period wins a near tie: a texel of 4 pixels also has strength at 2
      if (m > top.m * 1.02 || (m > top.m * 0.9 && s > top.s * 1.5)) top = { s, m, angle: Math.atan2(q, c) };
    }
    const total = p.reduce((a, b) => a + b, 0) || 1;
    // edges sit at angle/2π of a period after 0: a cell begins one pixel later
    const edge = ((top.angle / (2 * Math.PI)) * top.s + top.s) % top.s;
    // the share of the change that falls on the cells' borders: near all of it for an enlarged atlas, about
    // 1/s for a picture at one pixel a texel
    let on = 0;
    for (let i = 0; i < p.length; i++) {
      const d = Math.abs((((i - edge) % top.s) + top.s) % top.s);
      if (Math.min(d, top.s - d) < 0.5) on += p[i];
    }
    return { s: top.s, phase: (edge + 1) % top.s, strength: on / total };
  };
  const bx = best(px),
    by = best(py);
  const strength = Math.min(bx.strength, by.strength);
  // not enlarged (or not cleanly): one pixel a texel
  if (strength < Math.max(0.5, 2 / Math.min(bx.s, by.s))) return { scale: 1, phase: [0, 0], strength };
  const scale = Math.abs(bx.s - by.s) < 0.1 ? (bx.s + by.s) / 2 : Math.min(bx.s, by.s);
  return { scale, phase: [bx.phase, by.phase], strength };
}

/**
 * An atlas from a picture of one: the painting told from its ground (a given [r, g, b], or the commonest
 * colour of the box's border), brought back to one pixel a texel (`scale` given or found by periodOf).
 * `{ width, height, rgb, mask, charts, scale }`; charts are the painting's separate islands.
 */
export function atlasOfPicture(
  img,
  { box = [0, 0, img.width, img.height], ground, scale, tolerance = 28 } = {},
) {
  const [x0, y0, x1, y1] = box;
  const W = x1 - x0,
    H = y1 - y0;
  const rgba = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++)
    rgba.set(img.rgba.subarray(((y0 + y) * img.width + x0) * 4, ((y0 + y) * img.width + x1) * 4), y * W * 4);
  if (!ground) {
    const counts = new Map();
    const add = (x, y) => {
      const o = (y * W + x) * 4;
      const c = `${rgba[o] >> 2},${rgba[o + 1] >> 2},${rgba[o + 2] >> 2}`;
      counts.set(c, (counts.get(c) ?? 0) + 1);
    };
    for (let x = 0; x < W; x++) {
      add(x, 0);
      add(x, H - 1);
    }
    for (let y = 0; y < H; y++) {
      add(0, y);
      add(W - 1, y);
    }
    ground = [...counts]
      .sort((a, b) => b[1] - a[1])[0][0]
      .split(",")
      .map((v) => (+v << 2) + 2);
  }
  const fg = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++)
    fg[k] =
      Math.abs(rgba[k * 4] - ground[0]) +
        Math.abs(rgba[k * 4 + 1] - ground[1]) +
        Math.abs(rgba[k * 4 + 2] - ground[2]) >
      tolerance
        ? 1
        : 0;
  const period = scale ? { scale, phase: [0, 0] } : periodOf({ width: W, height: H, rgba }, fg);
  const s = period.scale < 1.3 ? 1 : period.scale;
  const [fx, fy] = s === 1 ? [0, 0] : period.phase;
  const w = Math.floor((W - fx) / s),
    h = Math.floor((H - fy) / s);
  const rgb = new Uint8Array(w * h * 3),
    mask = new Uint8Array(w * h);
  for (let ty = 0; ty < h; ty++)
    for (let tx = 0; tx < w; tx++) {
      // the pixel at the cell's middle; the cell is painting when most of it is
      const cx = Math.min(W - 1, Math.floor(fx + (tx + 0.5) * s)),
        cy = Math.min(H - 1, Math.floor(fy + (ty + 0.5) * s));
      const o = (cy * W + cx) * 4,
        k = ty * w + tx;
      rgb[k * 3] = rgba[o];
      rgb[k * 3 + 1] = rgba[o + 1];
      rgb[k * 3 + 2] = rgba[o + 2];
      let on = 0,
        all = 0;
      for (let y = Math.floor(fy + ty * s); y < Math.floor(fy + (ty + 1) * s) && y < H; y++)
        for (let x = Math.floor(fx + tx * s); x < Math.floor(fx + (tx + 1) * s) && x < W; x++) {
          all++;
          on += fg[y * W + x];
        }
      mask[k] = on * 2 > all && fg[cy * W + cx] ? 1 : 0;
    }
  const charts = regions(w, h, mask);
  return { width: w, height: h, rgb, mask, charts: charts.label, chartCount: charts.count, scale: s, ground };
}

/**
 * An atlas from a model's texture: `tex` { width, height, rgb } and the triangles that wear it, each with
 * `uv` [[u, v] ×3] in texels. The mask is the texels the triangles cover; the charts are the UV islands
 * (triangles joined by a shared UV corner), each texel the island's that covers it.
 */
export function atlasOfTexture(tex, tris) {
  const W = tex.width,
    H = tex.height;
  const mask = new Uint8Array(W * H);
  const charts = new Int32Array(W * H).fill(-1);
  // islands: triangles joined where their UV corners meet
  const ids = new Map();
  const idOf = (q) => {
    const k = `${Math.round(q[0] * 8)},${Math.round(q[1] * 8)}`;
    if (!ids.has(k)) ids.set(k, ids.size);
    return ids.get(k);
  };
  const tv = tris.map((t) => t.uv.map(idOf));
  const parent = Array.from({ length: ids.size }, (_, i) => i);
  const root = (x) => {
    while (parent[x] !== x) x = parent[x] = parent[parent[x]];
    return x;
  };
  for (const [a, b, c] of tv) {
    parent[root(b)] = root(a);
    parent[root(c)] = root(a);
  }
  const island = new Map();
  tris.forEach((t, i) => {
    const r = root(tv[i][0]);
    if (!island.has(r)) island.set(r, island.size);
    const id = island.get(r);
    forTexels(t.uv, W, H, (k) => {
      mask[k] = 1;
      charts[k] = id;
    });
  });
  return { width: W, height: H, rgb: tex.rgb, mask, charts, chartCount: island.size, scale: 1 };
}

/** Calls `fn(k, w0, w1, w2)` for each texel whose middle lies in the UV triangle (and its corners' texels). */
export function forTexels(uv, W, H, fn) {
  const [A, B, C] = uv;
  const area2 = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
  if (area2) {
    const x0 = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0]))),
      x1 = Math.min(W - 1, Math.ceil(Math.max(A[0], B[0], C[0])));
    const y0 = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1]))),
      y1 = Math.min(H - 1, Math.ceil(Math.max(A[1], B[1], C[1])));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5,
          py = y + 0.5;
        const w0 = ((B[0] - px) * (C[1] - py) - (B[1] - py) * (C[0] - px)) / area2;
        const w1 = ((C[0] - px) * (A[1] - py) - (C[1] - py) * (A[0] - px)) / area2;
        const w2 = 1 - w0 - w1;
        if (w0 >= -1e-6 && w1 >= -1e-6 && w2 >= -1e-6) fn(y * W + x, w0, w1, w2);
      }
  }
  const clampX = (v) => Math.min(W - 1, Math.max(0, Math.floor(v))),
    clampY = (v) => Math.min(H - 1, Math.max(0, Math.floor(v)));
  fn(clampY(A[1]) * W + clampX(A[0]), 1, 0, 0);
  fn(clampY(B[1]) * W + clampX(B[0]), 0, 1, 0);
  fn(clampY(C[1]) * W + clampX(C[0]), 0, 0, 1);
}

/** Gini coefficient of non-negative values: 0 all equal, 1 all in one. */
function gini(values) {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length,
    sum = s.reduce((a, b) => a + b, 0);
  if (!n || !sum) return 0;
  let acc = 0;
  s.forEach((v, i) => {
    acc += (2 * (i + 1) - n - 1) * v;
  });
  return acc / (n * sum);
}

/** The eight ways to lay an 8x8 patch (turns and mirrors): index maps. */
const T = 8;
const LAYS = (() => {
  const out = [];
  for (let m = 0; m < 8; m++) {
    const map = new Int8Array(T * T);
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        let u = x,
          v = y;
        if (m & 1) u = T - 1 - u;
        if (m & 2) v = T - 1 - v;
        if (m & 4) [u, v] = [v, u];
        map[y * T + x] = v * T + u;
      }
    out.push(map);
  }
  return out;
})();

/**
 * The measures of one or more atlases (a model's textures), the texels of all pooled: `{ key: number }`.
 * Thresholds are in brightness 0 to 1.
 */
export function textureMeasures(atlases) {
  const EDGE = 0.06; // a step this big is an edge
  let n = 0,
    flat = 0,
    ramp = 0,
    speckle = 0,
    grainSum = 0,
    pairs = 0,
    diagE = 0,
    allE = 0,
    colourful = 0,
    satSum = 0,
    dark = 0;
  let marks = 0,
    lightMarks = 0,
    outlineDiag = 0,
    outlineAll = 0;
  const Ls = [],
    cells = [],
    counts = new Map(),
    patches = [],
    charts = [];
  atlases.forEach((a, ai) => {
    const { width: W, height: H, rgb, mask } = a;
    const L = new Float32Array(W * H);
    for (let k = 0; k < W * H; k++) L[k] = lum(rgb, k);
    const on = (x, y) => x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x];
    const onRamp = new Uint8Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const k = y * W + x;
        if (!mask[k]) continue;
        n++;
        Ls.push(L[k]);
        const r = rgb[k * 3],
          g = rgb[k * 3 + 1],
          b = rgb[k * 3 + 2];
        const mx = Math.max(r, g, b),
          mn = Math.min(r, g, b);
        satSum += mx ? (mx - mn) / mx : 0;
        if (L[k] < 0.15) dark++;
        const c = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
        counts.set(c, (counts.get(c) ?? 0) + 1);
        // flat: the 3x3 about it within 8 of a channel's level
        let lo = [255, 255, 255],
          hi = [0, 0, 0],
          inside = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (!on(x + dx, y + dy)) continue;
            inside++;
            const j = ((y + dy) * W + x + dx) * 3;
            for (let ch = 0; ch < 3; ch++) {
              lo[ch] = Math.min(lo[ch], rgb[j + ch]);
              hi[ch] = Math.max(hi[ch], rgb[j + ch]);
            }
          }
        if (inside >= 6 && hi.every((h, ch) => h - lo[ch] <= 8)) flat++;
        // neighbours: grain, and a lone texel unlike all four the same way
        const nb = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]
          .filter(([dx, dy]) => on(x + dx, y + dy))
          .map(([dx, dy]) => L[k + dy * W + dx] - L[k]);
        if (on(x + 1, y)) {
          grainSum += Math.abs(L[k + 1] - L[k]);
          pairs++;
        }
        if (on(x, y + 1)) {
          grainSum += Math.abs(L[k + W] - L[k]);
          pairs++;
        }
        if (nb.length === 4 && (nb.every((d) => d > 0.02) || nb.every((d) => d < -0.02))) speckle++;
        // edges' slant: Sobel inside the painting
        if (on(x - 1, y - 1) && on(x + 1, y + 1) && on(x - 1, y + 1) && on(x + 1, y - 1)) {
          const at = (dx, dy) => L[k + dy * W + dx];
          const gx = at(1, -1) + 2 * at(1, 0) + at(1, 1) - at(-1, -1) - 2 * at(-1, 0) - at(-1, 1);
          const gy = at(-1, 1) + 2 * at(0, 1) + at(1, 1) - at(-1, -1) - 2 * at(0, -1) - at(1, -1);
          const m = Math.hypot(gx, gy);
          if (m > 4 * EDGE) {
            const ang = ((Math.atan2(gy, gx) * 180) / Math.PI + 360) % 90;
            allE += m;
            if (ang > 22.5 && ang < 67.5) diagE += m;
          }
        }
        // the chart's outline: the slant of the mask's own edge
        if (x > 0 && y > 0 && x + 1 < W && y + 1 < H) {
          const M = (dx, dy) => mask[k + dy * W + dx];
          const gx = M(1, -1) + 2 * M(1, 0) + M(1, 1) - M(-1, -1) - 2 * M(-1, 0) - M(-1, 1);
          const gy = M(-1, 1) + 2 * M(0, 1) + M(1, 1) - M(-1, -1) - 2 * M(0, -1) - M(1, -1);
          if (gx || gy) {
            const ang = ((Math.atan2(gy, gx) * 180) / Math.PI + 360) % 90;
            outlineAll++;
            if (ang > 22.5 && ang < 67.5) outlineDiag++;
          }
        }
      }
    // ramps: runs of 3+ small steps the same way, along rows and columns
    for (const [step, lines, along, at] of [
      [1, H, W, (l, i) => l * W + i],
      [W, W, H, (l, i) => i * W + l],
    ]) {
      for (let l = 0; l < lines; l++) {
        let run = 0,
          sign = 0;
        for (let i = 0; i + 1 < along; i++) {
          const k = at(l, i),
            j = k + step;
          const d = mask[k] && mask[j] ? L[j] - L[k] : 0;
          const s = Math.abs(d) > 0.004 && Math.abs(d) < EDGE ? Math.sign(d) : 0;
          if (s && s === sign) run++;
          else {
            run = s ? 1 : 0;
            sign = s;
          }
          if (run >= 3) for (let b = 0; b <= run; b++) onRamp[at(l, i + 1 - b)] = 1;
        }
      }
    }
    for (let k = 0; k < W * H; k++) if (mask[k] && onRamp[k]) ramp++;

    // detail spread: edge density over 8x8 cells mostly painting
    for (let cy = 0; cy + 8 <= H; cy += 8)
      for (let cx = 0; cx + 8 <= W; cx += 8) {
        let inside = 0,
          edges = 0,
          pp = 0;
        for (let y = cy; y < cy + 8; y++)
          for (let x = cx; x < cx + 8; x++) {
            const k = y * W + x;
            if (!mask[k]) continue;
            inside++;
            if (x + 1 < cx + 8 && mask[k + 1]) {
              pp++;
              if (Math.abs(L[k + 1] - L[k]) > EDGE) edges++;
            }
            if (y + 1 < cy + 8 && mask[k + W]) {
              pp++;
              if (Math.abs(L[k + W] - L[k]) > EDGE) edges++;
            }
          }
        if (inside >= 48 && pp) cells.push(edges / pp);
      }

    // marks: small blobs far from their 9x9 surround's mean, standing alone
    const sum = new Float64Array((W + 1) * (H + 1)),
      cnt = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const k = y * W + x,
          o = (y + 1) * (W + 1) + x + 1;
        sum[o] = sum[o - 1] + sum[o - W - 1] - sum[o - W - 2] + (mask[k] ? L[k] : 0);
        cnt[o] = cnt[o - 1] + cnt[o - W - 1] - cnt[o - W - 2] + (mask[k] ? 1 : 0);
      }
    const box = (A, x0, y0, x1, y1) =>
      A[y1 * (W + 1) + x1] - A[y0 * (W + 1) + x1] - A[y1 * (W + 1) + x0] + A[y0 * (W + 1) + x0];
    const strong = new Uint8Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const k = y * W + x;
        if (!mask[k]) continue;
        const x0 = Math.max(0, x - 4),
          y0 = Math.max(0, y - 4),
          x1 = Math.min(W, x + 5),
          y1 = Math.min(H, y + 5);
        const c = box(cnt, x0, y0, x1, y1);
        const d = L[k] - box(sum, x0, y0, x1, y1) / c;
        if (c >= 40 && Math.abs(d) > 0.18) strong[k] = d > 0 ? 1 : 2;
      }
    const blobs = regions(W, H, strong);
    const size = new Int32Array(blobs.count),
      light = new Int32Array(blobs.count),
      bx0 = new Int32Array(blobs.count).fill(1e9),
      bx1 = new Int32Array(blobs.count).fill(-1),
      by0 = new Int32Array(blobs.count).fill(1e9),
      by1 = new Int32Array(blobs.count).fill(-1);
    for (let k = 0; k < W * H; k++) {
      const b = blobs.label[k];
      if (b < 0) continue;
      const x = k % W,
        y = (k - x) / W;
      size[b]++;
      if (strong[k] === 1) light[b]++;
      bx0[b] = Math.min(bx0[b], x);
      bx1[b] = Math.max(bx1[b], x);
      by0[b] = Math.min(by0[b], y);
      by1[b] = Math.max(by1[b], y);
    }
    for (let b = 0; b < blobs.count; b++)
      if (size[b] >= 2 && size[b] <= 15 && bx1[b] - bx0[b] < 6 && by1[b] - by0[b] < 7) {
        marks++;
        if (light[b] * 2 > size[b]) lightMarks++;
      }

    // charts: their fill of their bounding box
    if (a.charts) {
      const m = a.chartCount;
      const area = new Int32Array(m),
        x0 = new Int32Array(m).fill(1e9),
        x1 = new Int32Array(m).fill(-1),
        y0 = new Int32Array(m).fill(1e9),
        y1 = new Int32Array(m).fill(-1);
      for (let k = 0; k < W * H; k++) {
        const c = a.charts[k];
        if (c < 0) continue;
        const x = k % W,
          y = (k - x) / W;
        area[c]++;
        x0[c] = Math.min(x0[c], x);
        x1[c] = Math.max(x1[c], x);
        y0[c] = Math.min(y0[c], y);
        y1[c] = Math.max(y1[c], y);
      }
      for (let c = 0; c < m; c++)
        if (area[c] >= 16) charts.push([area[c], area[c] / ((x1[c] - x0[c] + 1) * (y1[c] - y0[c] + 1))]);
    }

    // patches for repetition: 8x8, every 4 texels, wholly painting and with something drawn in them
    for (let y = 0; y + T <= H; y += 4)
      for (let x = 0; x + T <= W; x += 4) {
        const p = new Float32Array(T * T);
        let ok = true,
          mean = 0,
          lo = 1,
          hi = 0;
        for (let j = 0; j < T && ok; j++)
          for (let i = 0; i < T; i++) {
            const k = (y + j) * W + x + i;
            if (!mask[k]) {
              ok = false;
              break;
            }
            p[j * T + i] = L[k];
            mean += L[k];
            lo = Math.min(lo, L[k]);
            hi = Math.max(hi, L[k]);
          }
        if (!ok || hi - lo < 0.08) continue;
        mean /= T * T;
        for (let i = 0; i < T * T; i++) p[i] -= mean;
        patches.push({ a: ai, x, y, p });
      }
  });
  if (!n) return {};

  // repetition: patches hashed by a coarse sign picture (4x4 of 2x2 means, three levels), checked closely
  const sig = (p, map) => {
    let s = "";
    for (let j = 0; j < 4; j++)
      for (let i = 0; i < 4; i++) {
        let v = 0;
        for (const [dx, dy] of [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ])
          v += p[map[(2 * j + dy) * T + 2 * i + dx]];
        v /= 4;
        s += v > 0.04 ? "+" : v < -0.04 ? "-" : "0";
      }
    return s;
  };
  const near = (p, q, map) => {
    let d = 0;
    for (let i = 0; i < T * T; i++) d += Math.abs(p[map[i]] - q[i]);
    return d / (T * T) < 0.03;
  };
  const apart = (A, B) => A.a !== B.a || Math.abs(A.x - B.x) >= T || Math.abs(A.y - B.y) >= T;
  const byMoved = new Map();
  patches.forEach((P, i) => {
    P.s = sig(P.p, LAYS[0]);
    const l = byMoved.get(P.s);
    if (l) l.push(i);
    else byMoved.set(P.s, [i]);
  });
  let repeat = 0,
    repeatAny = 0;
  patches.forEach((P) => {
    let moved = false,
      any = false;
    for (const j of byMoved.get(P.s)) {
      const Q = patches[j];
      if (Q !== P && apart(P, Q) && near(P.p, Q.p, LAYS[0])) {
        moved = any = true;
        break;
      }
    }
    for (let m = 1; m < 8 && !any; m++) {
      const s = sig(P.p, LAYS[m]);
      for (const j of byMoved.get(s) ?? []) {
        const Q = patches[j];
        if (Q !== P && apart(P, Q) && near(P.p, Q.p, LAYS[m])) {
          any = true;
          break;
        }
      }
    }
    repeat += moved;
    repeatAny += any;
  });

  Ls.sort((a, b) => a - b);
  const sorted = [...counts.values()].sort((a, b) => b - a);
  let run = 0,
    k = 0;
  while (run < 0.9 * n) run += sorted[k++];
  const chartArea = charts.reduce((s, c) => s + c[0], 0);
  const out = {
    repeat: patches.length >= 8 ? repeat / patches.length : NaN,
    repeatAny: patches.length >= 8 ? repeatAny / patches.length : NaN,
    marks: (1000 * Math.max(marks, 0.5)) / n,
    lightMarks: (1000 * Math.max(lightMarks, 0.5)) / n,
    flat: flat / n,
    ramp: ramp / n,
    speckle: speckle / n,
    grain: pairs ? grainSum / pairs : NaN,
    cluster: cells.length >= 8 ? gini(cells) : NaN,
    quiet: cells.length >= 8 ? cells.filter((c) => c < 0.05).length / cells.length : NaN,
    diagonal: allE ? diagE / allE : NaN,
    chartRect: chartArea ? charts.reduce((s, c) => s + c[0] * c[1], 0) / chartArea : NaN,
    charts: charts.length ? (10000 * charts.length) / n : NaN,
    chartDiag: outlineAll >= 40 ? outlineDiag / outlineAll : NaN,
    value: Ls[n >> 1],
    contrast: Ls[Math.floor(n * 0.75)] - Ls[Math.floor(n * 0.25)],
    dark: dark / n,
    colours: k,
    sat: satSum / n,
  };
  for (const key of Object.keys(out)) if (!Number.isFinite(out[key])) delete out[key];
  return out;
}
