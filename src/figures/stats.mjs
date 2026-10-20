// What the three judges (style, texture, shape) share: quartiles, where a value stands among others, a measure
// on the scale it is compared on, how far apart a library's corpora stand on each measure, the yardstick
// distances are told in, and the chance one list stands above another (AUC).
//
// A judge reads a library's section as `data`: `{ models: { "corpus:file": { game, file, hash, measures, ... } } }`,
// `game` the corpus a figure is of (a game's folder: valve, ts, msc). `said`: the measures' table (STYLE_SAID,
// TEX_SAID, SHAPE_SAID), whose third field says a measure is read on a log scale.

/** A quantile of sorted values, between neighbours (NaN for none). */
export const quart = (sorted, q) => {
  if (!sorted.length) return NaN;
  const x = q * (sorted.length - 1),
    i = Math.floor(x);
  return sorted[i] + (sorted[Math.min(i + 1, sorted.length - 1)] - sorted[i]) * (x - i);
};

/** The median of values, the unfinished left out. */
export const medianOf = (values) =>
  quart(
    [...values].filter(Number.isFinite).sort((x, y) => x - y),
    0.5,
  );

/** Where `value` stands among `sorted`, 0 to 100 (ties at their middle). */
export function standing(sorted, value) {
  if (!sorted.length) return 50;
  let below = 0,
    same = 0;
  for (const v of sorted)
    if (v < value) below++;
    else if (v === value) same++;
  return Math.round((100 * (below + same / 2)) / sorted.length);
}

/** A measure on the scale it is compared on: its log (base 2) for those whose values multiply. */
export const scaledBy = (said, least) => (key, value) =>
  said[key]?.[2] ? Math.log2(Math.max(value, least)) : value;

/** The keys of the figures of some corpora. */
export const keysOf = (data, games) =>
  Object.keys(data.models).filter((k) => games.includes(data.models[k].game));

/** The corpora a library's section holds, in the order their figures first come. */
export const corporaOf = (data) => [...new Set(Object.values(data.models).map((m) => m.game))];

/** The scaled values of a measure over some figures, sorted. */
export const spreadOf = (data, keys, key, scaled) =>
  keys
    .map((n) => data.models[n].measures[key])
    .filter((v) => v !== undefined && v !== null && Number.isFinite(v))
    .map((v) => scaled(key, v))
    .sort((a, b) => a - b);

/** A corpus counts toward how far apart corpora stand when it has at least this many figures. */
export const LEAST_CORPUS = 5;
/** How far apart two corpora stand on a measure counts no more than this many middle halves. */
const SEPARATION_MOST = 3;

/** How far apart two corpora's sorted values stand: the distance of their medians over their mean middle half. */
function apart(a, b) {
  const iqr = (quart(a, 0.75) - quart(a, 0.25) + quart(b, 0.75) - quart(b, 0.25)) / 2;
  const all = [...a, ...b].sort((x, y) => x - y);
  const floor = (quart(all, 0.75) - quart(all, 0.25)) / 4 || 1e-6;
  return Math.min(SEPARATION_MOST, Math.abs(quart(a, 0.5) - quart(b, 0.5)) / Math.max(iqr, floor));
}

/**
 * How far apart the corpora stand on each measure: for every two of at least five figures, the distance of
 * their medians over their mean spread (the middle half, floored at a quarter of both's), averaged:
 * `{ key: number }`. A measure on which every game's figures are alike tells no manner from another; one far
 * apart tells them well. `games`: the corpora (unless told, all the section holds). `of`: one corpus' own
 * separation, its distance from each of the others averaged, not every pair's: what tells THAT game's manner.
 */
export function separation(data, said, scaled, { games = corporaOf(data), of } = {}) {
  const kept = games.filter((g) => keysOf(data, [g]).length >= LEAST_CORPUS);
  const out = {};
  for (const k of Object.keys(said)) {
    const spreads = kept.map((g) => spreadOf(data, keysOf(data, [g]), k, scaled));
    let sum = 0,
      n = 0;
    for (let i = 0; i < kept.length; i++)
      for (let j = i + 1; j < kept.length; j++) {
        if (of !== undefined && kept[i] !== of && kept[j] !== of) continue;
        const a = spreads[i],
          b = spreads[j];
        if (a.length < 3 || b.length < 3) continue;
        sum += apart(a, b);
        n++;
      }
    if (n) out[k] = sum / n;
  }
  return out;
}

/** The middle half of each measure over every figure of the section: the yardstick distances are told in. */
export function yardstick(data, said, scaled) {
  const all = Object.keys(data.models);
  return Object.fromEntries(
    Object.keys(said).map((k) => {
      const s = spreadOf(data, all, k, scaled);
      return [k, Math.max(quart(s, 0.75) - quart(s, 0.25), 1e-6)];
    }),
  );
}

/** The chance a value of `high` stands above one of `low` (ties half): 1 a perfect judge, 0.5 a coin. */
export function aucOf(high, low) {
  let win = 0;
  for (const a of high) for (const b of low) win += a > b ? 1 : a === b ? 0.5 : 0;
  return high.length && low.length ? win / (high.length * low.length) : NaN;
}
