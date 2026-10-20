// The shape judge: a figure's shape (silhouettes.mjs: its silhouettes and its mesh) held against the shapes of
// a corpus of a game's figures, measure by measure, with the band of the body or the part at fault, and against
// a reference in the manner wanted (its masks: a screenshot's, or a set of models'), over the silhouette
// measures a picture has. It says what is off, in words, and what to do.
import { SHAPE_SAID, BANDS } from "./shape.mjs";
import { scaledBy, keysOf, corporaOf, separation, yardstick, medianOf, aucOf, spreadOf, LEAST_CORPUS } from "./stats.mjs"; // prettier-ignore
import { judgeAgainst, prepareNear, nearTo, weightsFrom } from "./compare.mjs";
import { label } from "../render.mjs";

const KEYS = Object.keys(SHAPE_SAID);
/** The measures of a silhouette (a reference that is a picture has these), and those that need the mesh. */
export const PICTURE_KEYS = KEYS.filter((k) => SHAPE_SAID[k][6] === "picture");
export const MESH_KEYS = KEYS.filter((k) => SHAPE_SAID[k][6] === "mesh");
/** A shape measure on the scale it is compared on. */
export const shapeScaled = scaledBy(SHAPE_SAID, 1e-6);

/** A value as said: a share in %, a count whole, else to two figures. */
export function shapeSaid(k, v) {
  if (v === undefined || v === null || Number.isNaN(v)) return "-";
  if (SHAPE_SAID[k][1] === "%") return `${(100 * v).toFixed(v < 0.1 ? 1 : 0)}%`;
  if (/^(holeCount|notch|cells)/.test(k)) return Math.floor(v).toString();
  if (Math.abs(v) >= 10) return v.toFixed(0);
  return v.toPrecision(2);
}
const pc = (v) => `${(100 * v).toFixed(v < 0.1 ? 1 : 0)}%`;

/** How far apart the corpora stand on each shape measure (`of`: one corpus from the others only). */
export const shapeSeparation = (data, { games, of } = {}) =>
  separation(data, SHAPE_SAID, shapeScaled, { games, of });
/** The middle half of each shape measure over every figure of the library: the yardstick. */
export const shapeYardstick = (data) => yardstick(data, SHAPE_SAID, shapeScaled);

/** Where on the body a finding falls: the band or the part most at fault, said (or ""). */
export function shapeWhere(k, x, other, otherName) {
  if ((k === "holes" || k === "holeCount" || k === "fineHoles") && x.bands) {
    // the holes of every size, or the small ones only
    const f = k === "holes" ? "holes" : "fine",
      word = k === "holes" ? "empty" : "empty in small holes";
    // against a reference, the band farthest from it; else every band
    if (!other)
      return `${word} by band: ${BANDS.map(([b]) => `${b} ${pc(x.bands[b]?.[f] ?? 0)}`).join(", ")}`;
    const worst = BANDS.map(([b]) => [b, x.bands[b]?.[f] ?? 0, other[b]?.[f] ?? 0]).sort((a, c) => Math.abs(c[2] - c[1]) - Math.abs(a[2] - a[1]))[0]; // prettier-ignore
    return `the ${worst[0]}${worst[0].endsWith("s") ? "'" : "'s"} silhouette is ${pc(worst[1])} ${word}, ${otherName}'s ${pc(worst[2])}`;
  }
  if (/^notch/.test(k) && x.bands) {
    const rows = BANDS.map(([b]) => [b, x.bands[b]?.notches ?? 0, other?.[b]?.notches]);
    return `notches (middle scale) by band: ${rows.map(([b, v, o]) => `${b} ${v.toFixed(0)}${o !== undefined ? ` (${otherName} ${o.toFixed(0)})` : ""}`).join(", ")}`; // prettier-ignore
  }
  if ((k === "layers" || k === "deep") && x.where?.layers) {
    return `surfaces a ray by band: ${Object.entries(x.where.layers)
      .map(([b, v]) => `${b} ${v}`)
      .join(", ")}`;
  }
  if (["boxes", "alike", "small", "pieceGini", "sizeRange"].includes(k) && x.where?.parts) {
    const [p, v] = Object.entries(x.where.parts).sort((a, c) => c[1].pieces - a[1].pieces)[0];
    return `${x.where.pieces} pieces, most on the ${p} (${v.pieces}, ${v.boxes} of them boxes)`;
  }
  return "";
}

/**
 * One figure's shape judged: `x` `{ measures, bands, where }` (`shapeOfModel`, `shapeOfReference`) against a
 * corpus (`games`) measure by measure, and against a reference's `{ measures, bands }` over the silhouette
 * measures. → `{ fit, findings, toward, refDistance, refPlace, refCorpusMedian }` (`judgeAgainst`).
 */
export function judgeShape(x, data, games, ref, refName = "the reference", { leave, yard } = {}) {
  return judgeAgainst(x, data, games, ref, { said: SHAPE_SAID, scaled: shapeScaled, sayValue: shapeSaid, whereOf: shapeWhere, refKeys: PICTURE_KEYS, refName, leave, yard }); // prettier-ignore
}

/** The shape judge's word as text: the corpus' findings, then the reference's. */
export function shapeTold(name, v, games, refName = "the reference") {
  const lines = [`${name}: its shape against ${games.join("+")}: measures one at a time ${v.fit} of 100`];
  for (const f of v.findings.slice(0, 12))
    lines.push(`  ${f.distance >= 1.5 ? "far " : f.distance >= 0.75 ? "out " : "edge"} ${f.said}${f.where ? ` — ${f.where}` : ""}${f.advice ? `: ${f.advice}` : ""}`); // prettier-ignore
  if (v.refDistance !== undefined) {
    lines.push(`against ${refName} (silhouette measures): distance ${v.refDistance} (in the corpora's middle halves; the corpus' figures' median ${v.refCorpusMedian}, ${v.refPlace}% of them nearer)`); // prettier-ignore
    for (const t of v.toward.filter((y) => Math.abs(y.d) >= 0.5).slice(0, 10))
      lines.push(
        `  ${t.d > 0 ? "+" : ""}${t.d.toFixed(1)}  ${t.said}${t.where ? ` — ${t.where}` : ""}: ${t.advice}`,
      );
  }
  return lines.join("\n");
}

/**
 * Every figure against every corpus, the measures by how far apart they put the games, and the references and
 * other figures (`refs`, `ours`: by name, `{ measures, bands }`) against each corpus and against one reference
 * (`reference`, a name of `refs`): `{ text, report }`. `weights`: per measure (unless told: the library's
 * separation, under 0.25 dropped). `alike`: corpora taken as one when counting who is right.
 */
export function validateShape(data, { refs = {}, ours = {}, reference, weights, games, alike = [] } = {}) {
  const lines = [],
    report = {};
  const sep = shapeSeparation(data, { games });
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
  lines.push("\nMedians by game, the references and ours:");
  const cols = [...kept, ...Object.keys(refs), ...Object.keys(ours)];
  lines.push(`${"measure".padEnd(11)}${cols.map((g) => g.padStart(11)).join("")}`);
  report.medians = {};
  for (const k of KEYS) {
    report.medians[k] = Object.fromEntries(
      kept.map((g) => [g, medianOf(keysOf(data, [g]).map((n) => data.models[n].measures[k]))]),
    );
    const vals = [...kept.map((g) => report.medians[k][g]), ...Object.values(refs).map((r) => r.measures[k]), ...Object.values(ours).map((r) => r.measures[k])]; // prettier-ignore
    lines.push(`${k.padEnd(11)}${vals.map((v) => (v === undefined || v === null || !Number.isFinite(v) ? "-" : shapeSaid(k, v)).padStart(11)).join("")}`); // prettier-ignore
  }
  const yard = shapeYardstick(data);
  const w = weights ?? weightsFrom(sep, KEYS);
  const preps = Object.fromEntries(kept.map((g) => [g, prepareNear(data, g, { said: SHAPE_SAID, scaled: shapeScaled, yard })])); // prettier-ignore
  const oneOf = (a, b) => a === b || alike.some((set) => set.includes(a) && set.includes(b));
  const asOne = alike.length ? ` (${alike.map((set) => set.join(" and ")).join(", ")} as one)` : "";
  const run = (only, title) => {
    const near = (m, g, leave, hash) =>
      nearTo(m, preps[g], data, { weights: w, only, scaled: shapeScaled, leave, hash });
    const D = {};
    for (const [k, x] of Object.entries(data.models))
      if (kept.includes(x.game))
        D[k] = Object.fromEntries(kept.map((g) => [g, near(x.measures, g, k, x.hash)]));
    const of = (g) => Object.keys(D).filter((k) => data.models[k].game === g);
    lines.push(`\n${title}: own figures nearer each corpus than foreign ones (AUC; 1 perfect, 0.5 a coin):`);
    lines.push(`${"corpus \\ foreign".padEnd(17)}${kept.map((g) => g.padStart(11)).join("")}`);
    const out = { auc: {} };
    for (const g of kept) {
      out.auc[g] = {};
      const own = of(g).map((k) => -D[k][g]);
      const row = kept.map((f) => {
        if (f === g) return "-".padStart(11);
        const v = aucOf(
          own,
          of(f).map((k) => -D[k][g]),
        );
        out.auc[g][f] = +v.toFixed(2);
        return v.toFixed(2).padStart(11);
      });
      lines.push(`${g.padEnd(17)}${row.join("")}`);
    }
    const ownD = Object.fromEntries(kept.map((g) => [g, of(g).map((k) => D[k][g])]));
    const place = (d, g) => ownD[g].filter((x) => x >= d).length / ownD[g].length;
    let right = 0,
      n = 0;
    for (const k of Object.keys(D)) {
      const g = data.models[k].game;
      const best = kept.reduce((b, x) => (place(D[k][x], x) > place(D[k][b], b) ? x : b), kept[0]);
      n++;
      if (oneOf(best, g)) right++;
    }
    out.right = +(right / n).toFixed(2);
    lines.push(
      `Each figure to the corpus it stands best in: right ${((100 * right) / n).toFixed(0)}% of ${n}${asOne}`,
    );
    // the references and ours against each corpus
    out.others = {};
    for (const [name, x] of [...Object.entries(refs), ...Object.entries(ours)]) {
      if (!only.some((k) => x.measures[k] !== undefined)) continue;
      out.others[name] = Object.fromEntries(kept.map((g) => [g, { d: +near(x.measures, g).toFixed(2), place: Math.round(100 * place(near(x.measures, g), g)) }])); // prettier-ignore
      lines.push(`  ${name.padEnd(11)} ${kept.map((g) => `${g} ${out.others[name][g].d} (${out.others[name][g].place})`).join(", ")}`); // prettier-ignore
    }
    lines.push("  (each: distance to the corpus' nearest 3, and in brackets the share of the corpus' own figures standing at least as far)"); // prettier-ignore
    return out;
  };
  report.all = run(KEYS, "All shape measures");
  report.picture = run(PICTURE_KEYS, "Silhouette measures only");
  report.mesh = run(MESH_KEYS, "Mesh measures only");
  // ours against the reference, measure by measure, and where the corpus' figures stand from it
  const ref = reference ? refs[reference] : null;
  if (ref) {
    const all = Object.keys(data.models);
    lines.push(`\nOurs against ${reference}, silhouette measures (apart: in the ${all.length} figures' middle half; place: among all ${all.length}, 0 to 100):`); // prettier-ignore
    lines.push(`${"measure".padEnd(11)}${reference.padStart(12)}${Object.keys(ours).map((o) => `${o.padStart(9)} apart place`).join("")}  ref. place`); // prettier-ignore
    report.vsReference = {};
    for (const k of PICTURE_KEYS) {
      const s = spreadOf(data, all, k, shapeScaled);
      const placeOf = (v) => Math.round((100 * s.filter((y) => y < shapeScaled(k, v)).length) / s.length);
      report.vsReference[k] = { reference: ref.measures[k], refPlace: placeOf(ref.measures[k]) };
      let row = `${k.padEnd(11)}${shapeSaid(k, ref.measures[k]).padStart(12)}`;
      for (const [o, x] of Object.entries(ours)) {
        const d = (shapeScaled(k, x.measures[k]) - shapeScaled(k, ref.measures[k])) / yard[k];
        report.vsReference[k][o] = { v: x.measures[k], apart: +d.toFixed(2), place: placeOf(x.measures[k]) };
        row += `${shapeSaid(k, x.measures[k]).padStart(9)} ${(d > 0 ? "+" : "") + d.toFixed(1)}`.padEnd(15) + `${placeOf(x.measures[k])}`.padStart(5); // prettier-ignore
      }
      lines.push(`${row}  ${String(placeOf(ref.measures[k])).padStart(6)}`);
    }
    lines.push(
      "\nHoles by band (share of the band's filled silhouette that is empty: all holes / small holes only), summary views:",
    );
    for (const [name, x] of [[reference, ref], ...Object.entries(ours)])
      lines.push(
        `  ${name.padEnd(11)} ${BANDS.map(([b]) => `${b} ${pc(x.bands[b].holes)} / ${pc(x.bands[b].fine)}`).join(", ")}`,
      );
    const corpusBands = Object.fromEntries(BANDS.map(([b]) => [b, [medianOf(all.map((k) => data.models[k].bands?.[b]?.holes).filter((v) => v !== undefined)), medianOf(all.map((k) => data.models[k].bands?.[b]?.fine).filter((v) => v !== undefined))]])); // prettier-ignore
    lines.push(`  ${"corpus med.".padEnd(11)} ${BANDS.map(([b]) => `${b} ${pc(corpusBands[b][0])} / ${pc(corpusBands[b][1])}`).join(", ")}`); // prettier-ignore
    lines.push(`\nDistance to ${reference} over the silhouette measures (as the judge's), and the share of the corpus' figures nearer:`); // prettier-ignore
    report.refDistance = {};
    for (const [name, x] of Object.entries(ours)) {
      const v = judgeShape(x, data, games ?? corporaOf(data), ref, reference, { yard });
      report.refDistance[name] = { d: v.refDistance, nearer: v.refPlace, corpusMedian: v.refCorpusMedian };
      lines.push(
        `  ${name}: ${v.refDistance} (${v.refPlace}% of the ${all.length} nearer; their median ${v.refCorpusMedian})`,
      );
    }
    const nearest = all
      .map((k) => {
        let d = 0,
          n = 0;
        for (const q of PICTURE_KEYS)
          if (data.models[k].measures[q] !== undefined && data.models[k].measures[q] !== null) {
            d +=
              ((shapeScaled(q, data.models[k].measures[q]) - shapeScaled(q, ref.measures[q])) / yard[q]) ** 2;
            n++;
          }
        return [k, Math.sqrt(d / n)];
      })
      .sort((a, b) => a[1] - b[1])
      .slice(0, 6);
    lines.push(
      `  the corpus' nearest to ${reference}: ${nearest.map(([k, d]) => `${k} ${d.toFixed(2)}`).join(", ")}`,
    );
    report.nearestToReference = nearest;
  }
  return { text: lines.join("\n"), report };
}

/**
 * The silhouette sheet: figures black on white, each at one height (the masks as measured, `at`), labelled,
 * seven to a row. `items`: `[{ name, at, note }]`. → an image `{ width, height, rgba }`.
 */
export function shapeSheet(items) {
  const pad = 24,
    top = 34,
    k = 0.75; // the masks are HEIGHT (400) + margins; drawn at 3/4
  const tiles = items.map((it) => ({
    ...it,
    w: Math.round(it.at.width * k),
    h: Math.round(it.at.height * k),
  }));
  const perRow = 7;
  const rows = [];
  for (let i = 0; i < tiles.length; i += perRow) rows.push(tiles.slice(i, i + perRow));
  const W = Math.max(...rows.map((r) => r.reduce((s, t) => s + Math.max(t.w, 220) + pad, pad)));
  const rowH = Math.max(...tiles.map((t) => t.h)) + top + 30;
  const H = rows.length * rowH + pad;
  const img = { width: W, height: H, rgba: new Uint8Array(W * H * 4).fill(255) };
  let y = pad;
  for (const row of rows) {
    let x = pad;
    for (const t of row) {
      for (let ty = 0; ty < t.h; ty++)
        for (let tx = 0; tx < t.w; tx++) {
          const sx = Math.min(t.at.width - 1, Math.floor(tx / k)),
            sy = Math.min(t.at.height - 1, Math.floor(ty / k));
          if (t.at.data[sy * t.at.width + sx])
            img.rgba.set([0, 0, 0, 255], ((y + top + ty) * W + x + tx) * 4);
        }
      label(img, t.name.toUpperCase().slice(0, 18), x, y + 4, 2, [20, 20, 120]);
      if (t.note) label(img, t.note.toUpperCase().slice(0, 18), x, y + top + t.h + 4, 2, [150, 30, 30]);
      x += Math.max(t.w, 220) + pad;
    }
    y += rowH;
  }
  return img;
}
