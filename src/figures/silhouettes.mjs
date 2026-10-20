// A figure's shape as the shape judge reads it: its silhouettes from several sides (drawn by `render`, or given
// as masks: a reference's, cut from a screenshot) measured (shape.mjs), their summary over the views a
// reference has too, and its mesh's measures. And a model drawn in a reference's own pose and views, framed as
// the reference's figure stands in its pictures, so that the silhouettes compare like with like.
import { render, framing } from "../render.mjs";
import { figureFacts, loadFigure, standingSeq } from "./facts.mjs";
import { silhouetteMeasures, meshMeasures, maskOnViewport, SHAPE_SAID } from "./shape.mjs";

/** The views a model is drawn from: [name, yaw]; the summary is over SUMMARY_VIEWS. */
export const VIEWS = [
  ["front", 0],
  ["threeq", 45],
  ["side", 90],
  ["back", 150],
];
export const SUMMARY_VIEWS = ["front", "threeq", "back"];
/** The ground the silhouettes are drawn on, a colour no figure wears; a pixel is the figure when this far from it. */
const GROUND = [255, 0, 255];
const FIGURE_FROM = 192;
/** The size a view is drawn at, how far down it looks and how close. */
const DRAWN = { width: 560, height: 900, pitch: 4, zoom: 1.6 };

/** The mask of a picture drawn on GROUND: the figure's pixels. */
function maskOfDrawn(img) {
  const data = new Uint8Array(img.width * img.height);
  for (let k = 0; k < data.length; k++) {
    // half or more of the figure (the edges are blended with the ground)
    const d = Math.abs(img.rgba[k * 4] - GROUND[0]) + Math.abs(img.rgba[k * 4 + 1] - GROUND[1]) + Math.abs(img.rgba[k * 4 + 2] - GROUND[2]); // prettier-ignore
    data[k] = d > FIGURE_FROM ? 1 : 0;
  }
  return { width: img.width, height: img.height, data };
}

/**
 * A model's silhouettes from each view (`views`: [[name, yaw]], VIEWS unless told), standing in its idle's first
 * frame, drawn with both sides of every face and what it carries, measured: `{ views: { name: { measures,
 * bands } }, pictures }`, `pictures` (with `keep`) each view's mask and the mask as measured.
 */
export function modelSilhouettes(src, { views = VIEWS, keep = false, groups } = {}) {
  if (typeof src === "string") {
    const loaded = loadFigure(src);
    if (loaded.skip) throw new Error(loaded.skip);
    src = loaded.src;
  }
  const seq = standingSeq(src);
  const opts = { seq: seq >= 0 ? seq : null, frame: 0, groups };
  const within = framing(src, [opts]);
  const out = {},
    pictures = {};
  for (const [name, yaw] of views) {
    const img = render(src, { ...opts, ...DRAWN, yaw, within, background: GROUND, cull: false });
    const mask = maskOfDrawn(img);
    const s = silhouetteMeasures(mask, img);
    if (!s) continue;
    out[name] = { measures: s.measures, bands: s.bands };
    if (keep) pictures[name] = { mask, at: s.at };
  }
  return { views: out, pictures };
}

/**
 * The picture measures averaged over the summary views (counts on a log scale averaged as such), and the
 * holes and notches by band likewise: `{ measures, bands }`. `names`: the views to average (SUMMARY_VIEWS, or
 * those a reference has).
 */
export function summary(views, names = SUMMARY_VIEWS) {
  const kept = names.filter((v) => views[v]);
  const keys = Object.keys(SHAPE_SAID).filter((k) => kept.some((v) => views[v].measures[k] !== undefined));
  const measures = {};
  for (const k of keys) {
    const vals = kept.map((v) => views[v].measures[k]).filter((x) => x !== undefined);
    measures[k] = SHAPE_SAID[k][2]
      ? 2 ** (vals.reduce((s, x) => s + Math.log2(x), 0) / vals.length)
      : vals.reduce((s, x) => s + x, 0) / vals.length;
  }
  const bands = {};
  for (const v of kept)
    for (const [band, x] of Object.entries(views[v].bands)) {
      bands[band] = bands[band] ?? { holes: 0, fine: 0, notches: 0 };
      bands[band].holes += x.holes / kept.length;
      bands[band].fine += x.fine / kept.length;
      bands[band].notches += x.notches / kept.length;
    }
  return { measures, bands };
}

/** The mesh's measures of a model, or null when it is no standing figure. */
function meshOf(src) {
  const f = figureFacts(src, { withPixels: false });
  return f.skip ? null : meshMeasures(f);
}

/**
 * A model's shape: its silhouettes, their summary and its mesh's measures, `{ measures, bands, views, where,
 * pictures }`. `src`: its bytes (textures inside) or a file. With `masks` (what `masksLikeReference` gives:
 * `{ view: { mask, img } }`) its silhouettes are those, not its idle's drawn from VIEWS: a model in a
 * reference's pose. `summaryViews`: the views averaged (unless told, SUMMARY_VIEWS, or the masks' own).
 */
export function shapeOfModel(src, { masks, summaryViews, keep = false, groups } = {}) {
  if (typeof src === "string") {
    const loaded = loadFigure(src);
    if (loaded.skip) throw new Error(loaded.skip);
    src = loaded.src;
  }
  let views, pictures;
  if (masks) ({ views, pictures } = shapeOfMasks(masks, { keep }));
  else ({ views, pictures } = modelSilhouettes(src, { keep, groups }));
  const mesh = meshOf(src);
  const s = summary(views, summaryViews ?? (masks ? Object.keys(masks) : SUMMARY_VIEWS));
  return {
    measures: { ...s.measures, ...(mesh?.measures ?? {}) },
    bands: s.bands,
    views,
    where: mesh?.where,
    pictures,
  };
}

/**
 * Silhouettes given as masks, each view `{ mask, img }` (`mask` { width, height, data } with 1 for the figure;
 * `img`, the picture under it at its size, for the inside's edges, or none): `{ views, pictures }`.
 */
export function shapeOfMasks(masks, { keep = false } = {}) {
  const views = {},
    pictures = {};
  for (const [name, { mask, img }] of Object.entries(masks)) {
    const s = silhouetteMeasures(
      mask,
      img && img.width === mask.width && img.height === mask.height ? img : null,
    );
    if (!s) continue;
    views[name] = { measures: s.measures, bands: s.bands };
    if (keep) pictures[name] = { mask, at: s.at };
  }
  return { views, pictures };
}

/** A reference's shape from masks (`shapeOfMasks`), summarised over its own views: `{ measures, bands, views }`. */
export function shapeOfReference(masks, { keep = false } = {}) {
  const { views, pictures } = shapeOfMasks(masks, { keep });
  const s = summary(views, Object.keys(views));
  return { measures: s.measures, bands: s.bands, views, pictures };
}

/**
 * The figure in each box of a screenshot of an editor's viewport (`maskOnViewport`, its settings by view):
 * `views` `{ name: { box: [x0, y0, x1, y1], ...settings } }`. → `{ name: { mask, img } }` at the boxes' sizes,
 * for `shapeOfReference`.
 */
export function masksOnViewport(img, views) {
  const out = {};
  for (const [view, { box, ...opts }] of Object.entries(views)) {
    const mask = maskOnViewport(img, box, opts);
    const W = box[2] - box[0],
      H = box[3] - box[1];
    const rgba = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++)
      rgba.set(
        img.rgba.subarray(((box[1] + y) * img.width + box[0]) * 4, ((box[1] + y) * img.width + box[2]) * 4),
        y * W * 4,
      );
    out[view] = { mask, img: { width: W, height: H, rgba } };
  }
  return out;
}

/** A mask's top, bottom and middle across (the mean of its figure's columns): where a figure stands in a box. */
function standingIn(mask) {
  let top = Infinity,
    bottom = -1,
    sx = 0,
    n = 0;
  for (let y = 0; y < mask.height; y++)
    for (let x = 0; x < mask.width; x++)
      if (mask.data[y * mask.width + x]) {
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
        sx += x;
        n++;
      }
  return { top, bottom, cx: sx / n };
}

/** How much larger than the reference's box a view is first drawn, before it is brought down to it. */
const LARGE = 2;
const WIDER = 1.4;

/**
 * A model drawn as a reference's figure is seen: in `pose` (bones' matrices, as `render` takes them: a pose
 * made to match the reference's) from each of the reference's views, in perspective, and framed as the
 * reference's figure stands in its mask (its top, bottom and middle across the same). `views`: `{ name: { mask,
 * yaw, pitch, dist, fov, target } }`, `mask` the reference's for that view ({ width, height, data }), the camera
 * where the reference's looked from (yaw 0 at the front; `dist` from `target`, `fov` in degrees; unless told,
 * the middle of the model as posed, three times its reach and 36°). `background`: the ground the pictures are
 * shaded on. → `{ name: { mask, img } }` at the reference masks' sizes (times `scale`: a larger picture to look
 * at), for `shapeOfModel(src, { masks })`.
 */
export function masksLikeReference(
  src,
  { pose, views, background = [64, 64, 64], light = true, groups, scale = 1 } = {},
) {
  const out = {};
  const standing = standingSeq(src);
  const shown = pose ? { pose } : { seq: standing >= 0 ? standing : null, frame: 0, groups };
  const frame = framing(src, [shown]);
  for (const [name, v] of Object.entries(views)) {
    const target = v.target ?? frame.mid;
    const dist = v.dist ?? frame.far * 3;
    const fov = v.fov ?? 36;
    const k = scale;
    const W = Math.round(v.mask.width * k),
      H = Math.round(v.mask.height * k);
    const BW = Math.round(W * LARGE * WIDER),
      BH = Math.round(H * LARGE);
    const draw = (w, h, ground) =>
      render(src, { ...shown, yaw: v.yaw ?? 0, pitch: v.pitch ?? 0, dist, fov: fov * (w / h), target, width: w, height: h, background: ground, light, cull: false }); // prettier-ignore
    const g = draw(BW, BH, GROUND);
    const data = maskOfDrawn(g).data;
    const ours = standingIn({ width: BW, height: BH, data });
    const ref = standingIn(v.mask);
    const s = ((ref.bottom - ref.top) * k) / (ours.bottom - ours.top);
    const shaded = draw(BW, BH, background);
    const img = { width: W, height: H, rgba: new Uint8Array(W * H * 4) };
    const mask = { width: W, height: H, data: new Uint8Array(W * H) };
    // each pixel the mean of the large picture's pixels under it
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const sx0 = (x - ref.cx * k) / s + ours.cx,
          sy0 = (y - ref.top * k) / s + ours.top;
        const n = Math.max(1, Math.round(1 / s));
        const c = [0, 0, 0];
        let m = 0,
          cnt = 0;
        for (let dy = 0; dy < n; dy++)
          for (let dx = 0; dx < n; dx++) {
            const X = Math.floor(sx0 + dx / s / n),
              Y = Math.floor(sy0 + dy / s / n);
            cnt++;
            if (X < 0 || Y < 0 || X >= BW || Y >= BH) {
              c[0] += background[0];
              c[1] += background[1];
              c[2] += background[2];
              continue;
            }
            const i = Y * BW + X;
            c[0] += shaded.rgba[i * 4];
            c[1] += shaded.rgba[i * 4 + 1];
            c[2] += shaded.rgba[i * 4 + 2];
            m += data[i];
          }
        img.rgba.set([c[0] / cnt, c[1] / cnt, c[2] / cnt, 255], (y * W + x) * 4);
        mask.data[y * W + x] = m * 2 >= cnt ? 1 : 0;
      }
    out[name] = { mask, img };
  }
  return out;
}
