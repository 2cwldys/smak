// How the texture and the shape judges hold one figure's measures against a corpus and against a reference:
// measure by measure inside or beyond the corpus' middle half (with what to do), and how far the figure stands
// from the reference in the corpora's yardstick, beside how far the corpus' own figures stand from it. And how
// near a figure stands to a corpus as a whole: its nearest few, over measures weighed by how well they tell
// the games apart.
import { quart, medianOf, keysOf, spreadOf, yardstick } from "./stats.mjs";

/** A finding is made of a measure beyond the corpus' middle half by more than this share of it. */
export const FINDING_BEYOND = 0.25;
/** A corpus' middle half is never narrower than this share of the yardstick's (a corpus that all agrees). */
const IQR_FLOOR = 4;
/** How many of a corpus' nearest figures a figure is held against, for its distance to the corpus. */
export const NEAREST = 3;

/**
 * One figure's measures judged. `x`: `{ measures, bands?, where? }`; `data`: the library's section; `games`:
 * the corpora it is held against; `ref`: the reference, `{ measures, bands? }` (or none). Of the judge:
 * `said` (the table of measures), `scaled`, `sayValue(key, value)`, `whereOf(key, x, refBands, refName)` (the
 * band or part at fault, or ""), `refKeys` (the measures the reference's distance is over: those a picture
 * has, for a reference that is a picture). `leave`: a figure's key not to compare with. `yard`: the yardstick
 * (unless told: the section's, every figure of every corpus). → `{ fit, findings, toward, refDistance,
 * refPlace, refCorpusMedian }`: `fit`, 0 to 100, the measures one at a time (inside the middle half counts
 * whole, nothing at two middle halves beyond); `findings` farthest first; `toward` the reference, measure by
 * measure in yardsticks, farthest first; `refDistance` over `refKeys`, `refPlace` the share of the corpus'
 * figures nearer the reference than the figure is, `refCorpusMedian` their median distance.
 */
export function judgeAgainst(x, data, games, ref, options) {
  const { said, scaled, sayValue, whereOf, refKeys = Object.keys(said), refName = "the reference" } = options;
  const m = x.measures;
  const keys = keysOf(data, games).filter((k) => k !== options.leave);
  const yard = options.yard ?? yardstick(data, said, scaled);
  const findings = [],
    toward = [];
  let fit = 0,
    had = 0;
  for (const k of Object.keys(said)) {
    if (m[k] === undefined || m[k] === null || !Number.isFinite(m[k])) continue;
    const s = spreadOf(data, keys, k, scaled);
    if (s.length < 3) continue;
    const v = scaled(k, m[k]);
    const q1 = quart(s, 0.25),
      q3 = quart(s, 0.75);
    const iqr = Math.max(q3 - q1, yard[k] / IQR_FLOOR);
    const beyond = v < q1 ? (q1 - v) / iqr : v > q3 ? (v - q3) / iqr : 0;
    fit += Math.max(0, 1 - beyond / 2);
    had++;
    const back = (y) => (said[k][2] ? 2 ** y : y);
    const [what, , , low, high] = said[k];
    if (beyond > FINDING_BEYOND) {
      const where = whereOf?.(k, x);
      findings.push({
        key: k,
        distance: +beyond.toFixed(2),
        said: `${what}: ${sayValue(k, m[k])}; the corpus' ${sayValue(k, back(q1))} to ${sayValue(k, back(q3))}`,
        ...(whereOf ? { where } : {}),
        advice: v > q3 ? high : low,
      });
    }
    const r = ref?.measures?.[k];
    if (r !== undefined && r !== null) {
      const d = (v - scaled(k, r)) / yard[k];
      const where = whereOf?.(k, x, ref.bands, refName);
      toward.push({
        key: k,
        d: +d.toFixed(2),
        said: `${what}: ${sayValue(k, m[k])}, ${refName}'s ${sayValue(k, r)}`,
        ...(whereOf ? { where } : {}),
        advice: (d > 0 ? high : low) || `${d > 0 ? "lower" : "raise"} it toward ${refName}`,
      });
    }
  }
  findings.sort((a, b) => b.distance - a.distance);
  toward.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  const out = { fit: had ? Math.round((100 * fit) / had) : NaN, findings, toward };
  if (ref) {
    // how far from the reference over the measures both have, and how many corpus figures stand nearer
    const dist = (y) => {
      let d = 0,
        n = 0;
      for (const k of refKeys)
        if (y[k] !== undefined && y[k] !== null && ref.measures[k] !== undefined) {
          d += ((scaled(k, y[k]) - scaled(k, ref.measures[k])) / yard[k]) ** 2;
          n++;
        }
      return n ? Math.sqrt(d / n) : NaN;
    };
    out.refDistance = +dist(m).toFixed(2);
    const others = keys.map((k) => dist(data.models[k].measures)).filter(Number.isFinite);
    out.refPlace = Math.round((100 * others.filter((d) => d < out.refDistance).length) / others.length);
    out.refCorpusMedian = +medianOf(others).toFixed(2);
  }
  return out;
}

/**
 * How near measures stand to a corpus: the mean distance to its nearest `NEAREST` figures (a figure's own key
 * and copies of it, by hash, left out), over the measures `only` that weigh (`weights`, each over the corpus'
 * middle half floored at a quarter of the yardstick's). → a prepared corpus `{ keys, scale }` from
 * `prepareNear`, then `nearTo(m, prepared, { leave, hash })`.
 */
export function prepareNear(data, game, { said, scaled, yard }) {
  const ks = keysOf(data, [game]);
  const scale = Object.fromEntries(
    Object.keys(said).map((k) => {
      const s = spreadOf(data, ks, k, scaled);
      return [k, Math.max(quart(s, 0.75) - quart(s, 0.25), yard[k] / IQR_FLOOR)];
    }),
  );
  return { keys: ks, scale };
}

/** The mean distance of measures `m` to the nearest few of a prepared corpus (see `prepareNear`). */
export function nearTo(m, prepared, data, { weights, only, scaled, leave, hash }) {
  const dist = (a, b) => {
    let d = 0,
      ww = 0;
    for (const k of only)
      if (weights[k] && a[k] !== undefined && a[k] !== null && b[k] !== undefined && b[k] !== null) {
        d += weights[k] * ((scaled(k, a[k]) - scaled(k, b[k])) / prepared.scale[k]) ** 2;
        ww += weights[k];
      }
    return ww ? Math.sqrt(d / ww) : Infinity;
  };
  const ds = prepared.keys
    .filter((k) => k !== leave && (hash === undefined || data.models[k].hash !== hash))
    .map((k) => dist(m, data.models[k].measures))
    .sort((a, b) => a - b);
  return ds.slice(0, NEAREST).reduce((s, d) => s + d, 0) / Math.min(NEAREST, ds.length);
}

/** Weights from how far apart the games stand: a measure under `least` dropped. */
export const weightsFrom = (sep, keys, least = 0.25) =>
  Object.fromEntries(keys.map((k) => [k, (sep[k] ?? 0) < least ? 0 : sep[k]]));
