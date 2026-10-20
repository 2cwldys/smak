// The texture judge: a model's textures (or a picture of an atlas) measured as painting (texture.mjs,
// texture-model.mjs) and held against the textures of a corpus of a game's figures, measure by measure, and
// against a reference in the manner wanted: a picture of an atlas measured at its own pixels a texel (a
// screenshot of an editor's UV view at 4 pixels a texel), or a set of models whose measures' medians stand
// for the manner. It says what is off, in words, and what to do.
import { TEX_SAID } from "./texture.mjs";
import { atlasOfPicture, textureMeasures } from "./texture.mjs";
import { modelTextureMeasures } from "./texture-model.mjs";
import { figureFacts } from "./facts.mjs";
import { scaledBy, keysOf, corporaOf, separation, yardstick, medianOf, aucOf, quart, spreadOf, LEAST_CORPUS } from "./stats.mjs"; // prettier-ignore
import { judgeAgainst, prepareNear, nearTo, weightsFrom } from "./compare.mjs";
import { label } from "../render.mjs";

const KEYS = Object.keys(TEX_SAID);
/** A texture measure on the scale it is compared on. */
export const texScaled = scaledBy(TEX_SAID, 1e-6);

/** A value as said: a share in %, else to two figures. */
export function texSaid(k, v) {
  if (v === undefined || v === null || Number.isNaN(v)) return "-";
  if (TEX_SAID[k][1] === "%") return `${(100 * v).toFixed(v < 0.1 ? 1 : 0)}%`;
  if (Math.abs(v) >= 10) return v.toFixed(0);
  return v.toPrecision(2);
}

/** How far apart the corpora stand on each texture measure (`of`: one corpus from the others only). */
export const textureSeparation = (data, { games, of } = {}) =>
  separation(data, TEX_SAID, texScaled, { games, of });
/** The middle half of each texture measure over every figure of the library: the yardstick. */
export const textureYardstick = (data) => yardstick(data, TEX_SAID, texScaled);

/**
 * One texture's measures judged against a corpus (`games`) and a reference's measures (`ref`: `{ measures }`
 * or the measures themselves). → `{ fit, findings, toward, refDistance, refPlace, refCorpusMedian }`
 * (`judgeAgainst`); `refName` names the reference in the words.
 */
export function judgeTexture(measures, data, games, ref, { leave, refName = "the reference", yard } = {}) {
  const r = ref && !ref.measures ? { measures: ref } : ref;
  return judgeAgainst({ measures }, data, games, r, { said: TEX_SAID, scaled: texScaled, sayValue: texSaid, leave, refName, yard }); // prettier-ignore
}

/** A model's texture measures: its facts' (`figureFacts`) atlases measured, with the occlusion. `{ measures, atlases }`. */
export function textureOfModel(src) {
  const f = typeof src === "object" && src.tris ? src : figureFacts(src);
  if (f.skip) throw new Error(`not a figure: ${f.skip}`);
  const { measures, atlases } = modelTextureMeasures(f);
  return { measures, atlases };
}

/**
 * A picture of an atlas measured: `img` ({ width, height, rgba }, as `unpng` reads it), `box` [x0, y0, x1, y1]
 * the atlas in it, `scale` its pixels a texel (found from its hard steps when not given), `ground` the colour
 * round the painting (the commonest of the box's border when not given). `{ measures, atlases, scale }`.
 */
export function textureOfPicture(img, { box, scale, ground, tolerance } = {}) {
  const atlas = atlasOfPicture(img, { box: box ?? [0, 0, img.width, img.height], scale, ground, tolerance });
  return { measures: textureMeasures([atlas]), atlases: [atlas], scale: atlas.scale };
}

/** A reference of several figures (a set of the game's own, or of the manner wanted): each measure's median. */
export function referenceOfMeasures(list) {
  const keys = [...new Set(list.flatMap((m) => Object.keys(m)))];
  return Object.fromEntries(
    keys.map((k) => [k, medianOf(list.map((m) => m[k]).filter((v) => v !== undefined))]),
  );
}

/** The texture judge's word as text: the corpus' findings, then the reference's. */
export function textureTold(name, v, games, refName = "the reference") {
  const lines = [`${name}: its texture against ${games.join("+")}: measures one at a time ${v.fit} of 100`];
  for (const f of v.findings.slice(0, 10))
    lines.push(
      `  ${f.distance >= 1.5 ? "far " : f.distance >= 0.75 ? "out " : "edge"} ${f.said}${f.advice ? `: ${f.advice}` : ""}`,
    );
  if (v.refDistance !== undefined) {
    lines.push(`against ${refName}: distance ${v.refDistance} (in the corpora's middle halves; the corpus' figures' median ${v.refCorpusMedian}, ${v.refPlace}% of them nearer)`); // prettier-ignore
    for (const t of v.toward.filter((x) => Math.abs(x.d) >= 0.75).slice(0, 10))
      lines.push(`  ${t.d > 0 ? "+" : ""}${t.d.toFixed(1)}  ${t.said}: ${t.advice}`);
  }
  return lines.join("\n");
}

/**
 * Every figure against every corpus, and the measures by how far apart they put the games: `{ text, report }`.
 * `refs`: references by name (measures), each against each corpus. `weights`: per measure (unless told: the
 * library's own separation, under 0.25 dropped). `alike`: corpora taken as one when counting who is right.
 */
export function validateTexture(data, { refs = {}, weights, games, alike = [] } = {}) {
  const lines = [],
    report = {};
  const sep = textureSeparation(data, { games });
  report.separation = sep;
  lines.push(
    "Measures by how far apart they put the games (distance of medians over the middle half, averaged over pairs):",
  );
  lines.push(
    Object.entries(sep)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${v.toFixed(2)}`)
      .join(", "),
  );
  const kept = (games ?? corporaOf(data)).filter((g) => keysOf(data, [g]).length >= LEAST_CORPUS);
  lines.push("\nMedians by game:");
  lines.push(`${"measure".padEnd(13)}${kept.map((g) => g.padStart(11)).join("")}${Object.keys(refs).map((r) => r.padStart(12)).join("")}`); // prettier-ignore
  report.medians = {};
  for (const k of KEYS) {
    report.medians[k] = Object.fromEntries(kept.map((g) => [g, medianOf(keysOf(data, [g]).map((n) => data.models[n].measures[k]).filter((v) => v !== undefined))])); // prettier-ignore
    const row = kept.map((g) => {
      const v = report.medians[k][g];
      return (Number.isFinite(v) ? +v.toPrecision(3) : "-").toString().padStart(11);
    });
    lines.push(`${k.padEnd(13)}${row.join("")}${Object.values(refs).map((r) => (r[k] === undefined ? "-" : +r[k].toPrecision(3)).toString().padStart(12)).join("")}`); // prettier-ignore
  }
  // own against foreign: each figure's distance to each corpus (mean of its 3 nearest, itself and copies
  // left out), over the measures weighed by separation, each in that corpus' middle half
  const yard = textureYardstick(data);
  const w = weights ?? weightsFrom(sep, KEYS);
  const preps = Object.fromEntries(kept.map((g) => [g, prepareNear(data, g, { said: TEX_SAID, scaled: texScaled, yard })])); // prettier-ignore
  const near = (m, g, leave, hash) => nearTo(m, preps[g], data, { weights: w, only: KEYS, scaled: texScaled, leave, hash }); // prettier-ignore
  const D = {};
  for (const [k, x] of Object.entries(data.models))
    if (kept.includes(x.game))
      D[k] = Object.fromEntries(kept.map((g) => [g, near(x.measures, g, k, x.hash)]));
  lines.push("\nOwn figures nearer each corpus than foreign ones (AUC; 1 perfect, 0.5 a coin):");
  lines.push(`${"corpus \\ foreign".padEnd(17)}${kept.map((g) => g.padStart(11)).join("")}`);
  report.auc = {};
  const of = (g) => Object.keys(D).filter((k) => data.models[k].game === g);
  for (const g of kept) {
    report.auc[g] = {};
    // nearer is better: the chance an own figure's distance is under a foreign one's
    const own = of(g).map((k) => -D[k][g]);
    const row = kept.map((f) => {
      if (f === g) return "-".padStart(11);
      const v = aucOf(
        own,
        of(f).map((k) => -D[k][g]),
      );
      report.auc[g][f] = +v.toFixed(2);
      return v.toFixed(2).padStart(11);
    });
    lines.push(`${g.padEnd(17)}${row.join("")}`);
  }
  const conf = {};
  let right = 0,
    n = 0;
  // the corpus a figure stands best in: the share of that corpus' own figures (each against the rest) at
  // least as far as it (distances are not comparable between corpora: a varied one is nearer to everything)
  const ownD = Object.fromEntries(kept.map((g) => [g, of(g).map((k) => D[k][g])]));
  const place = (k, g) => ownD[g].filter((d) => d >= D[k][g]).length / ownD[g].length;
  const oneOf = (a, b) => a === b || alike.some((set) => set.includes(a) && set.includes(b));
  for (const k of Object.keys(D)) {
    const g = data.models[k].game;
    const best = kept.reduce((b, x) => (place(k, x) > place(k, b) ? x : b), kept[0]);
    conf[g] = conf[g] ?? {};
    conf[g][best] = (conf[g][best] ?? 0) + 1;
    n++;
    if (oneOf(best, g)) right++;
  }
  report.confusion = conf;
  report.right = +(right / n).toFixed(2);
  const asOne = alike.length ? ` (${alike.map((set) => set.join(" and ")).join(", ")} as one)` : "";
  lines.push(`\nEach figure's game against the corpus it stands best in (the share of that corpus' own figures it is nearer than): right ${((100 * right) / n).toFixed(0)}% of ${n}${asOne}`); // prettier-ignore
  for (const g of kept)
    lines.push(`  ${g.padEnd(11)} ${kept.map((x) => `${x} ${conf[g]?.[x] ?? 0}`).join(", ")}`);
  lines.push("\nThe references' distance to each corpus (as a figure's), and where the corpus' own stand:");
  report.refs = {};
  for (const [name, m] of Object.entries(refs)) {
    report.refs[name] = Object.fromEntries(kept.map((g) => [g, +near(m, g).toFixed(2)]));
    lines.push(`  ${name.padEnd(12)} ${kept.map((g) => `${g} ${report.refs[name][g]} (own median ${medianOf(ownD[g]).toFixed(2)})`).join(", ")}`); // prettier-ignore
  }
  return { text: lines.join("\n"), report };
}

/**
 * The sheet: atlases side by side at one texel scale (3 pixels a texel), and every measure as a bar over the
 * library's spread (5 to 95% grey, the middle half lighter, the median white), each item's mark in its ink.
 * `items`: `[{ name, measures, atlases }]`, up to three. → an image `{ width, height, rgba }`.
 */
export function textureSheet(items, data) {
  const GROUND = [52, 54, 60],
    K = 3;
  const tiles = items.map(({ atlases }) =>
    atlases.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b)),
  );
  const pad = 20,
    top = 40;
  const atlasW = tiles.reduce((s, a) => s + a.width * K + pad, pad);
  const atlasH = Math.max(...tiles.map((a) => a.height * K)) + top + pad;
  const rows = KEYS.filter((k) => items.some((it) => it.measures[k] !== undefined));
  const barX = 260,
    barW = 480,
    rowH = 26;
  const W = Math.max(atlasW, barX + barW + 260),
    H = atlasH + 40 + rows.length * rowH + pad;
  const img = { width: W, height: H, rgba: new Uint8Array(W * H * 4) };
  const put = (x, y, c) => {
    if (x >= 0 && y >= 0 && x < W && y < H) img.rgba.set([...c, 255], (y * W + x) * 4);
  };
  const rect = (x0, y0, w, h, c) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) put(x, y, c);
  };
  rect(0, 0, W, H, [28, 29, 33]);
  const INKS = [
    [255, 170, 60],
    [90, 210, 255],
    [160, 255, 120],
  ];
  let x = pad;
  tiles.forEach((a, i) => {
    for (let ty = 0; ty < a.height; ty++)
      for (let tx = 0; tx < a.width; tx++) {
        const k = ty * a.width + tx;
        const c = a.mask[k] ? [a.rgb[k * 3], a.rgb[k * 3 + 1], a.rgb[k * 3 + 2]] : GROUND;
        rect(x + tx * K, top + ty * K, K, K, c);
      }
    label(img, `${items[i].name} ${a.width}X${a.height}`, x, 14, 2, INKS[i]);
    x += a.width * K + pad;
  });
  let y = atlasH + 10;
  label(img, `BARS: THE CORPORA'S 5 TO 95% (GREY), THE MIDDLE HALF (LIGHT), MEDIAN (WHITE)`, pad, y, 2);
  y += 30;
  const all = Object.keys(data.models);
  for (const k of rows) {
    const s = spreadOf(data, all, k, texScaled);
    const vals = items.map((it) => (it.measures[k] === undefined ? undefined : texScaled(k, it.measures[k])));
    const seen = vals.filter((v) => v !== undefined);
    let lo = Math.min(quart(s, 0.05), ...seen),
      hi = Math.max(quart(s, 0.95), ...seen);
    if (hi - lo < 1e-9) hi = lo + 1;
    const X = (v) => barX + Math.round(((v - lo) / (hi - lo)) * (barW - 1));
    label(img, k.toUpperCase(), pad, y + 4, 2);
    rect(X(quart(s, 0.05)), y + 6, X(quart(s, 0.95)) - X(quart(s, 0.05)) + 1, 10, [70, 72, 80]);
    rect(X(quart(s, 0.25)), y + 6, X(quart(s, 0.75)) - X(quart(s, 0.25)) + 1, 10, [120, 124, 134]);
    rect(X(quart(s, 0.5)), y + 4, 2, 14, [240, 240, 240]);
    vals.forEach((v, i) => {
      if (v !== undefined) rect(X(v) - 2, y + i * 6, 5, 6 + (i ? 6 : 0) + 8, INKS[i]);
    });
    label(
      img,
      items
        .map((it) => texSaid(k, it.measures[k]))
        .join("  ")
        .replace(/%/g, " PC"),
      barX + barW + 16,
      y + 4,
      2,
    );
    y += rowH;
  }
  return img;
}
