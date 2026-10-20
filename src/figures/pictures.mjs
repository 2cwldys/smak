// Style measures of a picture of a figure: what can be said of a manner from pixels alone, so that a corpus
// can be pictures only (screenshots of a game whose models are not to hand). The figure is told from its
// ground by colour: a known one (a render), or one that changes evenly over the picture (a screenshot's
// backdrop, fitted to the picture's border).

/** [what it is, what a low one says, what a high one says]. */
export const PICTURE_SAID = {
  p_value: ["brightness of the figure, median", "darker", "lighter"],
  p_contrast: ["brightness spread (IQR)", "flatter light and paint", "more contrast"],
  p_sat: ["saturation, mean", "greyer", "more colourful"],
  p_accent: ["pixels of strong colour", "no accent colour", "more strong colour"],
  p_dark: ["pixels near black", "fewer darks", "more near-black"],
  p_colours: ["colours (5 bits a channel) covering 90% of the figure", "fewer colours", "more colours"],
  p_hard: [
    "share of the change from pixel to pixel that comes in hard steps",
    "soft gradients, filtered textures",
    "hard steps: unfiltered pixel art, panel lines",
  ],
  p_blocks: [
    "flat runs between hard steps across the figure's height (its texels as seen)",
    "large blocks: few texels across the figure",
    "small blocks: many texels across the figure",
  ],
  p_grain: ["change from one pixel to the next over the figure's height, mean", "smooth", "busy"],
};

/** A pixel's luminance, saturation and value, 0 to 1. */
function lsv(r, g, b) {
  const mx = Math.max(r, g, b),
    mn = Math.min(r, g, b);
  return [(0.299 * r + 0.587 * g + 0.114 * b) / 255, mx ? (mx - mn) / mx : 0, mx / 255];
}

/**
 * Which pixels are the figure: those far from the ground. `ground`: an [r, g, b] the picture was drawn on
 * (a render), or none, to fit an even change of colour to the picture's border (a screenshot). `box`:
 * [x0, y0, x1, y1] to look within.
 */
export function figureMask(
  { width, height, rgba },
  { ground, box = [0, 0, width, height], least = 28 } = {},
) {
  const [x0, y0, x1, y1] = box;
  const mask = new Uint8Array(width * height);
  let fit = null;
  if (!ground) {
    // least squares of each channel against (1, x, y) over the box's border
    const A = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ],
      B = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ];
    const add = (x, y) => {
      const v = [1, x / width, y / height],
        o = (y * width + x) * 4;
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) A[i][j] += v[i] * v[j];
        for (let c = 0; c < 3; c++) B[c][i] += v[i] * rgba[o + c];
      }
    };
    for (let x = x0; x < x1; x++) {
      add(x, y0);
      add(x, y1 - 1);
    }
    for (let y = y0; y < y1; y++) {
      add(x0, y);
      add(x1 - 1, y);
    }
    fit = B.map((b) => solve3(A, b));
  }
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const o = (y * width + x) * 4;
      const g = ground ?? fit.map((f) => f[0] + (f[1] * x) / width + (f[2] * y) / height);
      const d = Math.abs(rgba[o] - g[0]) + Math.abs(rgba[o + 1] - g[1]) + Math.abs(rgba[o + 2] - g[2]);
      if (ground ? d > 0 : d > least) mask[y * width + x] = 1;
    }
  return mask;
}

function solve3(A, b) {
  const m = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < 3; i++) {
    let p = i;
    for (let r = i + 1; r < 3; r++) if (Math.abs(m[r][i]) > Math.abs(m[p][i])) p = r;
    [m[i], m[p]] = [m[p], m[i]];
    for (let r = 0; r < 3; r++)
      if (r !== i) {
        const f = m[r][i] / (m[i][i] || 1e-9);
        for (let c = i; c < 4; c++) m[r][c] -= f * m[i][c];
      }
  }
  return m.map((r, i) => r[3] / (r[i] || 1e-9));
}

/** The picture measures of the figure's pixels: `{ key: number }`. */
export function pictureMeasures(img, mask) {
  const { width, height, rgba } = img;
  const L = new Float32Array(width * height);
  const Ls = [];
  let sat = 0,
    accent = 0,
    dark = 0,
    top = height,
    bottom = 0;
  const counts = new Map();
  for (let i = 0; i < width * height; i++) {
    if (!mask[i]) continue;
    const r = rgba[i * 4],
      g = rgba[i * 4 + 1],
      b = rgba[i * 4 + 2];
    const [l, s, v] = lsv(r, g, b);
    L[i] = l;
    Ls.push(l);
    sat += s;
    if (s > 0.6 && v > 0.4) accent++;
    if (l < 0.15) dark++;
    const c = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    counts.set(c, (counts.get(c) ?? 0) + 1);
    const y = Math.floor(i / width);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
  const n = Ls.length;
  if (n < 100) return null;
  Ls.sort((a, b) => a - b);
  const sorted = [...counts.values()].sort((a, b) => b - a);
  let run = 0,
    k = 0;
  while (run < 0.9 * n) run += sorted[k++];
  // the change from pixel to pixel along rows and columns inside the figure: how much of it comes in hard
  // steps, and how long the flat runs between hard steps are
  const HARD = 0.06,
    FLAT = 0.015;
  let total = 0,
    hard = 0,
    pairs = 0;
  const runs = [];
  for (const [step, lines, along] of [
    [1, height, width],
    [width, width, height],
  ]) {
    for (let line = 0; line < lines; line++) {
      let flat = 0;
      for (let a = 0; a + 1 < along; a++) {
        const i = step === 1 ? line * width + a : a * width + line;
        const j = i + step;
        if (!mask[i] || !mask[j]) {
          flat = 0;
          continue;
        }
        const d = Math.abs(L[j] - L[i]);
        total += d;
        pairs++;
        if (d > HARD) {
          hard += d;
          if (flat) runs.push(flat + 1);
          flat = 0;
        } else if (d < FLAT) flat++;
      }
    }
  }
  runs.sort((a, b) => a - b);
  const tall = bottom - top + 1;
  return {
    p_value: Ls[n >> 1],
    p_contrast: Ls[Math.floor(n * 0.75)] - Ls[Math.floor(n * 0.25)],
    p_sat: sat / n,
    p_accent: accent / n,
    p_dark: dark / n,
    p_colours: k,
    p_hard: total ? hard / total : 0,
    p_blocks: runs.length ? tall / runs[runs.length >> 1] : NaN,
    p_grain: pairs ? (total / pairs) * tall : NaN,
  };
}
