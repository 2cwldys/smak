// The style judge: a figure's 52 measures (style.mjs) held against a corpus of a game's own figures. It says
// where the figure would stand among them, measure by measure, which part or texture is out and what to do.
// Nothing is learnt but the corpora's spread, and how far apart the corpora stand on each measure (which
// measures tell one game's manner from another's, so they weigh more). The weights are the game's: its
// profile's `figureStyle.style.weights`, or worked out from the corpora a library holds (`weights: "library"`).
// The corpora are never in the kit: `surveyFigures` builds them from the games installed (library.mjs).
import { STYLE_SAID as SAID } from "./style.mjs";
import { quart, standing, separation as separationOf, scaledBy, aucOf, corporaOf } from "./stats.mjs";

/** The scale a measure is compared on: its log for those whose values multiply. */
export const scaled = scaledBy(SAID, 1e-9);

/** The figures of some games: `{ games, keys, of: { key: measures }, hash: { key: hash } }`. */
export function styleCorpus(data, games) {
  const keys = Object.keys(data.models).filter((k) => games.includes(data.models[k].game));
  return {
    games,
    keys,
    of: Object.fromEntries(keys.map((k) => [k, data.models[k].measures])),
    hash: Object.fromEntries(keys.map((k) => [k, data.models[k].hash])),
    textures: Object.fromEntries(keys.map((k) => [k, data.models[k].textures])),
    parts: Object.fromEntries(keys.map((k) => [k, data.models[k].parts])),
  };
}

/** The spread of each measure over a list of figures, on its compared scale: `{ key: sorted values }`. */
function spreadOf(corpus, keys) {
  const out = {};
  for (const k of Object.keys(SAID)) {
    const s = keys
      .map((n) => corpus.of[n][k])
      .filter((v) => v !== undefined)
      .map((v) => scaled(k, v))
      .sort((a, b) => a - b);
    if (s.length >= 3) out[k] = s;
  }
  return out;
}

/** How a measure is weighed: its group's share, so that the eighteen measures of parts count as a few. */
const GROUP = { shape: 1, proportion: 1, texture: 1, colour: 1, part: 1 / 3 };
/**
 * The groups the score is made of. Proportions and the parts' figures are told, not scored: the validation
 * (README) found that they tell characters apart, not manners (HL's HD pack remakes HL's characters at
 * HL's proportions, and on proportions alone its figures stood below foreign ones).
 */
export const SCORED = ["shape", "texture", "colour"];

/**
 * How far apart the games stand on each measure: for every two games of at least five figures, the distance
 * of their medians over their mean spread (the middle half), averaged. `{ key: number }`. A measure on which
 * every game's figures are alike tells no manner from another; one far apart tells them well. `of`: one game's
 * distance from each of the others only, what tells that game's manner (a profile's weights are these).
 */
export function styleSeparation(data, games = corporaOf(data), { of } = {}) {
  return separationOf(data, SAID, scaled, { games, of });
}

/**
 * The weight of each measure: its group's share times how well it tells games apart (`even`: the share
 * only). Measures of groups not in `groups` go in `__told`: judged and told, but not in the score.
 */
export function styleWeightsOf(sep, { even = false, least = 0.25, groups = SCORED } = {}) {
  const out = { __told: {} };
  for (const k of Object.keys(SAID)) {
    const s = sep?.[k];
    if (!even && s === undefined) continue;
    const w = even ? 1 : s < least ? 0 : s;
    if (!w) continue;
    if (groups.includes(SAID[k][5])) out[k] = w * GROUP[SAID[k][5]];
    else out.__told[k] = w * GROUP[SAID[k][5]];
  }
  return out;
}

/** The same mesh: a copy, a re-skin, or the same figure at another size (`sorc` and `sorc_big`). */
export const twins = (a, b) =>
  a.tris === b.tris && a.pieces === b.pieces && Math.abs(a.edge / b.edge - 1) < 1e-3;

/** The middle half of each measure over a corpus, floored (a corpus that all agrees still allows a little). */
function scaleOf(spread, weights) {
  const out = {};
  for (const k of Object.keys(weights))
    if (!k.startsWith("__") && spread[k])
      out[k] = Math.max(quart(spread[k], 0.75) - quart(spread[k], 0.25), weights.__floor?.[k] ?? 0, 1e-6);
  return out;
}

/** How unlike two figures are over the weighed measures, each over the corpus' middle half. */
function distanceOf(a, b, weights, scale) {
  let d = 0,
    had = 0,
    all = 0;
  for (const k of Object.keys(scale)) {
    const w = weights[k];
    all += w;
    if (a[k] === undefined || b[k] === undefined) continue;
    d += w * ((scaled(k, a[k]) - scaled(k, b[k])) / scale[k]) ** 2;
    had += w;
  }
  return had ? Math.sqrt((d * all) / had) : Infinity;
}

/** How many of the nearest figures a figure is held against: fewer in a small corpus. */
const nearCount = (n) => (n >= 20 ? 3 : n >= 10 ? 2 : 1);

/**
 * A corpus made ready to judge against: its scale, and each of its figures' distance to its nearest others
 * (leaving out copies and twins of it): how far a figure of the game's own stands from the rest.
 */
export function prepareStyle(corpus, weights) {
  const scale = scaleOf(spreadOf(corpus, corpus.keys), weights);
  const prep = { corpus, weights, scale, own: {} };
  for (const k of corpus.keys)
    prep.own[k] = nearOf(corpus.of[k], prep, othersOf(corpus.of[k], prep, k, corpus.hash[k])).distance;
  return prep;
}

/** The corpus' figures a figure is compared with: not itself, nor a copy or twin of it. */
function othersOf(m, prep, leave, hash) {
  const { corpus } = prep;
  return corpus.keys.filter(
    (k) => k !== leave && (!hash || corpus.hash[k] !== hash) && !twins(m, corpus.of[k]),
  );
}

/** The nearest of `others` to the measures `m`, and its mean distance to the nearest few. */
function nearOf(m, prep, others) {
  const list = others
    .map((n) => ({ figure: n, distance: distanceOf(m, prep.corpus.of[n], prep.weights, prep.scale) }))
    .sort((a, b) => a.distance - b.distance);
  const k = nearCount(others.length + 1);
  return {
    list,
    distance: list.slice(0, k).reduce((s, x) => s + x.distance, 0) / Math.max(1, Math.min(k, list.length)),
  };
}

/**
 * The judge's word on one figure's measures against a prepared corpus: `{ score, place, fit, findings,
 * nearest, left }`.
 * `score`, 0 to 100: how near the figure stands to the corpus' figures, against how near they stand to each
 * other. Its distance to the nearest few of them (over the weighed measures) is placed among the corpus'
 * own figures' distances to their nearest others: as near as the nearer half of them is 100, as far as the
 * farthest is 0. `place`: that share itself, 0 to 100 (where it would stand among them; 50 a middling
 * figure of the game's). `fit`: the measures one at a time, 0 to 100: one inside the corpus' middle half
 * counts whole, one beyond it less the farther it is (nothing at two middle halves beyond).
 * `findings`: the measures beyond the middle half, the farthest (by weight) first, `distance` in middle
 * halves, each with the corpus' quartiles, the part or texture most at fault and what to do.
 * `nearest`: the corpus' figures most like it. `left`: those left out as copies or twins of it (the same
 * mesh), and `leave`, a figure's key not to compare it with.
 */
export function judgeStyle(m, prep, { leave, hash, textures, parts, top = 5 } = {}) {
  const { corpus, weights } = prep;
  const others = othersOf(m, prep, leave, hash);
  const left = corpus.keys.filter((k) => k !== leave && !others.includes(k));
  const spread = spreadOf(corpus, others);
  let total = 0,
    weight = 0;
  const findings = [];
  const told = new Set(Object.keys(weights.__told ?? {}));
  for (const [k, w] of [...Object.entries(weights), ...Object.entries(weights.__told ?? {})]) {
    if (k.startsWith("__") || m[k] === undefined || !spread[k]) continue;
    const s = spread[k];
    const v = scaled(k, m[k]);
    const q1 = quart(s, 0.25),
      q3 = quart(s, 0.75);
    const iqr = Math.max(q3 - q1, weights.__floor?.[k] ?? 0, 1e-6);
    const beyond = v < q1 ? (q1 - v) / iqr : v > q3 ? (v - q3) / iqr : 0;
    if (!told.has(k)) {
      total += w * Math.max(0, 1 - beyond / 2);
      weight += w;
    }
    if (beyond > 0.25)
      findings.push({
        ...findingOf(k, m, corpus, others, s, v, beyond, w, textures, parts),
        told: told.has(k),
      });
  }
  findings.sort((a, b) => a.told - b.told || b.distance * b.weight - a.distance * a.weight);
  const near = nearOf(m, prep, others);
  const own = others.map((k) => prep.own[k]);
  const share = own.length ? own.filter((d) => d >= near.distance).length / own.length : 0;
  return {
    score: Math.round(100 * Math.min(1, 2 * share)),
    place: Math.round(100 * share),
    fit: weight ? Math.round((100 * total) / weight) : NaN,
    distance: +near.distance.toFixed(2),
    findings,
    nearest: near.list.slice(0, top).map((x) => ({ figure: x.figure, distance: +x.distance.toFixed(2) })),
    left,
  };
}

/** Floors for the middle half, from all games together: what a corpus that all agrees still allows. */
export function styleFloors(data, games = corporaOf(data)) {
  const all = styleCorpus(data, games);
  const s = spreadOf(all, all.keys);
  return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, (quart(v, 0.75) - quart(v, 0.25)) / 4]));
}

/** A value as said: a share in %, a log measure by its size. */
function said(k, v) {
  if (v === undefined || Number.isNaN(v)) return "-";
  const unit = SAID[k][1];
  if (unit === "%") return `${(100 * v).toFixed(v < 0.1 ? 1 : 0)}%`;
  if (k === "heads") return `1/${v.toFixed(1)} of the height`;
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toPrecision(2);
}
const back = (k, v) => (SAID[k][2] ? 2 ** v : v);

/** One finding: what is out, by how much, where, and what to do. */
function findingOf(k, m, corpus, others, s, v, beyond, w, textures, parts) {
  const q1 = back(k, quart(s, 0.25)),
    q3 = back(k, quart(s, 0.75)),
    med = back(k, quart(s, 0.5));
  const high = v > quart(s, 0.75);
  const [what, , log, low, hi] = SAID[k];
  let how = "";
  if (log) {
    const r = m[k] / med;
    how =
      r >= 1 ? ` (${r.toFixed(1)}× the corpus' median)` : ` (1/${(1 / r).toFixed(1)} of the corpus' median)`;
  }
  // the part or texture at fault
  let where = null;
  const part =
    k.match(/^[dtv]_(\w+)$/)?.[1] ??
    { heads: "head", hand: "hand", armLen: "arms", legLen: "legs", shoulders: "shoulders", bulk: "torso" }[k];
  if (part) where = `the ${part}`;
  else if (textures && ["value", "sat", "accent", "texels"].includes(k)) {
    const field = k === "texels" ? "texels" : k;
    const list = Object.entries(textures).filter(([, t]) => t.share >= 0.05 && t[field] !== undefined);
    if (list.length > 1) {
      const pick = list.sort((a, b) => (high ? b[1][field] - a[1][field] : a[1][field] - b[1][field]))[0];
      where = `texture ${pick[0]} (${pick[1].size}, ${(100 * pick[1].share).toFixed(0)}% of the painted texels, ${said(k, pick[1][field])})`;
    }
  } else if (["tris", "edge"].includes(k)) {
    // the part whose share of the triangles is farthest from the corpus' for it, the way the whole is out
    let best = null;
    for (const p of ["head", "torso", "arm", "hand", "leg", "foot"]) {
      const sp = others
        .map((n) => corpus.of[n][`t_${p}`])
        .filter((x) => x !== undefined)
        .sort((a, b) => a - b);
      if (!sp.length || m[`t_${p}`] === undefined) continue;
      const dev = (m[`t_${p}`] - quart(sp, 0.5)) * (high === (k === "tris") ? 1 : -1);
      if (!best || dev > best.dev) best = { p, dev, med: quart(sp, 0.5) };
    }
    if (best && best.dev > 0.03)
      where = `the ${best.p} most: ${(100 * m[`t_${best.p}`]).toFixed(0)}% of the triangles, the corpus' ${(100 * best.med).toFixed(0)}%`;
  } else if (parts && ["hard", "boxy", "rigid", "open"].includes(k)) {
    // the part (of a tenth of the triangles or more) farthest the way the whole is out
    const list = Object.entries(parts).filter(
      ([p, x]) => p !== "other" && x.share >= 0.1 && x[k] !== undefined,
    );
    if (list.length > 1) {
      const [p, x] = list.sort((a, b) => (high ? b[1][k] - a[1][k] : a[1][k] - b[1][k]))[0];
      where = `the ${p} most (${said(k, x[k])})`;
    }
  }
  return {
    key: k,
    what,
    value: m[k],
    typical: [q1, q3],
    distance: +beyond.toFixed(2),
    weight: +w.toFixed(2),
    standing: standing(s, v),
    where,
    said:
      k === "heads"
        ? `the head is 1/${m[k].toFixed(1)} of the height; the corpus' 1/${q1.toFixed(1)} to 1/${q3.toFixed(1)}`
        : `${what}: ${said(k, m[k])}${how}; the corpus' ${said(k, q1)} to ${said(k, q3)}`,
    advice: high ? hi : low,
  };
}

/** The judge's word as text. */
export function styleTold(name, verdict, games, { most = 12 } = {}) {
  const lines = [
    `${name} against ${games.join("+")}: ${verdict.score} of 100 (nearer the game's figures than ${verdict.place}% of them are to each other; its measures one at a time: ${verdict.fit} of 100)`,
  ];
  if (verdict.among) lines.push(`  the corpus' own figures, each against the rest: ${verdict.among}`);
  lines.push(`  most like: ${verdict.nearest.map((n) => `${n.figure} (${n.distance})`).join(", ")}`);
  if (verdict.left.length) lines.push(`  left out as the same mesh: ${verdict.left.join(", ")}`);
  for (const f of verdict.findings.slice(0, most))
    lines.push(
      `  ${f.distance >= 1.5 ? "far " : f.distance >= 0.75 ? "out " : "edge"}${f.told ? "*" : " "} ${f.said}${f.where ? ` — ${f.where}` : ""}${f.advice ? `: ${f.advice}` : ""}`,
    );
  if (verdict.findings.length > most)
    lines.push(`  and ${verdict.findings.length - most} more beyond the middle half (--all)`);
  if (verdict.findings.some((f) => f.told)) lines.push("  (* proportions and parts: told, not in the score)");
  return lines.join("\n");
}

/**
 * The weights the judge goes by, with the floors of the middle half: `weights` a profile's (`{ key: how far the
 * game stands from the others }`, `figureStyle.style.weights`), or "library" (every two corpora the library
 * holds, as the research weighed them), or "even" (each group its share only). `groups`: the groups scored
 * (the rest are told, not scored); `least`: a measure weighing less is dropped. The floors are always the
 * library's, all its figures together.
 */
export function styleSetup(data, { weights = "library", groups = SCORED, least = 0.25 } = {}) {
  const even = weights === "even";
  const sep = weights === "library" || even ? styleSeparation(data) : weights;
  const out = styleWeightsOf(sep, { even, groups, least });
  out.__floor = styleFloors(data);
  return { weights: out, sep };
}

/** Each of a prepared corpus' figures judged against the rest of it: `{ key: verdict }`. */
export function styleLeaveOneOut(prep) {
  const c = prep.corpus;
  return Object.fromEntries(
    c.keys.map((k) => [
      k,
      judgeStyle(c.of[k], prep, { leave: k, hash: c.hash[k], textures: c.textures[k], parts: c.parts[k] }),
    ]),
  );
}

/** Scores as a range: the lower quartile to the upper, and the median. */
export function rangeOf(scores) {
  const s = [...scores].sort((a, b) => a - b);
  return `${s[Math.floor(s.length / 4)]} to ${s[Math.floor((3 * s.length) / 4)]}, median ${s[s.length >> 1]}`;
}

/**
 * Does the style judge tell one game's manner from another's? Every figure of every corpus judged against every
 * corpus (its own without it, nor any copy or twin of it): `{ text, report }`, with
 *   - `medians`: the median score of each corpus' figures on each corpus
 *   - `auc`, `aucFit`: each corpus' own figures against foreign ones judged on it, as the chance an own figure
 *     stands nearer than a foreign one (1 perfect, 0.5 a coin), by the judge's distance and by the measures one
 *     at a time
 *   - `pairs`: the same characters in two manners (`remakes`: [[old, remade], ...], by file name)
 *   - `confusion`, `confusionNearest`: each figure's game against the corpus it stands best in, and the game
 *     of the one figure nearest it among all
 *   - `separation`: the measures by how far apart they put the games (`sep`, when given)
 * `weights`: as `styleSetup` gives them; or `weightsFor(game)`, each corpus judged with its own (a profile's
 * each). `alike`: corpora counted as one in the confusion's second count ([["msc", "msr"]]: one game's two
 * releases).
 */
export function validateStyle(
  data,
  { weights, sep, weightsFor, games = corporaOf(data), remakes = [], alike = [] } = {},
) {
  const lines = [];
  const say = (line = "") => lines.push(line);
  const own = (g) => (weightsFor ? weightsFor(g) : weights);
  const corpora = Object.fromEntries(games.map((g) => [g, styleCorpus(data, [g])]));
  const preps = Object.fromEntries(games.map((g) => [g, prepareStyle(corpora[g], own(g))]));
  const keys = Object.keys(data.models).filter((k) => games.includes(data.models[k].game));
  const gameOf = (k) => data.models[k].game;
  const score = {},
    place = {},
    fit = {},
    near = {};
  const pooled = prepareStyle(styleCorpus(data, games), weights ?? own(games[0]));
  for (const k of keys) {
    const m = data.models[k];
    const v = Object.fromEntries(
      games.map((g) => [g, judgeStyle(m.measures, preps[g], { leave: k, hash: m.hash })]),
    );
    score[k] = Object.fromEntries(games.map((g) => [g, v[g].score]));
    place[k] = Object.fromEntries(games.map((g) => [g, v[g].place]));
    fit[k] = Object.fromEntries(games.map((g) => [g, v[g].fit]));
    near[k] = judgeStyle(m.measures, pooled, { leave: k, hash: m.hash, top: 1 }).nearest[0]?.figure;
  }
  const pad = (s, n) => String(s).padStart(n);
  const median = (a) => {
    const s = [...a].sort((x, y) => x - y);
    return s[s.length >> 1];
  };
  const head = (first) => say(`${first.padEnd(16)}${games.map((g) => pad(g, 11)).join("")}`);
  const shown = weights ?? {};
  const report = {
    separation: sep,
    weights: Object.fromEntries(Object.entries(shown).filter(([k]) => !k.startsWith("__"))),
  };
  say(`weights: ${weightsFor ? "each corpus its own" : "as given"}\n`);
  say("The judge's score on each corpus (median of each game's figures; on its own, each left out):");
  head("figures \\ on");
  report.medians = {};
  for (const a of games) {
    const ks = keys.filter((k) => gameOf(k) === a);
    report.medians[a] = Object.fromEntries(games.map((g) => [g, median(ks.map((k) => score[k][g]))]));
    say(`${`${a} (${ks.length})`.padEnd(16)}${games.map((g) => pad(report.medians[a][g], 11)).join("")}`);
  }
  const aucTable = (of, title) => {
    say(`\n${title} (AUC; 1 perfect, 0.5 a coin):`);
    head("corpus \\ foreign");
    const out = {};
    for (const g of games) {
      const mine = keys.filter((k) => gameOf(k) === g).map((k) => of[k][g]);
      out[g] = {};
      const row = games.map((f) => {
        if (f === g) return pad("-", 11);
        const foreign = keys.filter((k) => gameOf(k) === f).map((k) => of[k][g]);
        out[g][f] = +aucOf(mine, foreign).toFixed(2);
        return pad(out[g][f].toFixed(2), 11);
      });
      say(`${g.padEnd(16)}${row.join("")}`);
    }
    return out;
  };
  report.auc = aucTable(place, "Own figures nearer each corpus than foreign ones, by the judge's distance");
  report.aucFit = aucTable(fit, "The same by the measures one at a time");
  report.pairs = [];
  if (remakes.length) say("\nThe same characters in two manners (the judge's score):");
  for (const [sd, hd] of remakes) {
    if (!games.includes(sd) || !games.includes(hd)) continue;
    for (const k of keys.filter((x) => gameOf(x) === hd)) {
      const twin = `${sd}:${data.models[k].file}`;
      if (!data.models[twin]) continue;
      const row = { figure: data.models[k].file, sdOnSd: score[twin][sd], sdOnHd: score[twin][hd], hdOnHd: score[k][hd], hdOnSd: score[k][sd] }; // prettier-ignore
      report.pairs.push({ sd, hd, ...row });
      say(`  ${`${sd}/${hd} ${row.figure}`.padEnd(44)} SD on its own ${pad(row.sdOnSd, 3)}, on HD ${pad(row.sdOnHd, 3)};  HD on its own ${pad(row.hdOnHd, 3)}, on SD ${pad(row.hdOnSd, 3)}`); // prettier-ignore
    }
  }
  const oneOf = (a, b) => a === b || alike.some((set) => set.includes(a) && set.includes(b));
  const confusion = (pick, title) => {
    say(`\n${title}`);
    say(`${"game \\ judged".padEnd(16)}${games.map((g) => pad(g, 11)).join("")}   right`);
    const out = {};
    let right = 0;
    for (const a of games) {
      const ks = keys.filter((k) => gameOf(k) === a);
      out[a] = Object.fromEntries(games.map((g) => [g, 0]));
      for (const k of ks) out[a][pick(k)]++;
      right += out[a][a];
      say(
        `${a.padEnd(16)}${games.map((g) => pad(out[a][g], 11)).join("")}   ${((100 * out[a][a]) / ks.length).toFixed(0)}%`,
      );
    }
    const loose = keys.filter((k) => oneOf(pick(k), gameOf(k))).length;
    const asOne = alike.length ? `; ${alike.map((set) => set.join(" and ")).join(", ")} taken as one: ${((100 * loose) / keys.length).toFixed(0)}%` : ""; // prettier-ignore
    say(`  right: ${((100 * right) / keys.length).toFixed(0)}% of ${keys.length}${asOne}`);
    return out;
  };
  report.confusion = confusion((k) => games.reduce((b, g) => (place[k][g] > place[k][b] ? g : b), games[0]), "Confusion: each figure's game against the corpus it stands best in (the judge's place):"); // prettier-ignore
  report.confusionNearest = confusion((k) => gameOf(near[k]), "Confusion: each figure's game against the game of the one figure nearest it (copies and twins left out):"); // prettier-ignore
  if (sep) {
    say(
      "\nMeasures by how far apart they put the games (distance of medians over the middle half, averaged over pairs):",
    );
    const order = Object.entries(sep).sort((a, b) => b[1] - a[1]);
    say(order.map(([k, v]) => `${k} ${v.toFixed(2)}${shown[k] ? "" : " (dropped)"}`).join(", "));
    say("\nThe medians of the twenty that tell most:");
    say(`${"measure".padEnd(13)}${games.map((g) => pad(g, 11)).join("")}`);
    for (const [k] of order.slice(0, 20)) {
      const row = games.map((g) => {
        const v = median(corpora[g].keys.map((n) => corpora[g].of[n][k]).filter((x) => x !== undefined));
        return pad(v === undefined ? "-" : +v.toPrecision(3), 11);
      });
      say(`${k.padEnd(13)}${row.join("")}   ${SAID[k][0]}`);
    }
  }
  Object.assign(report, { score, place, fit, nearest: near });
  return { text: lines.join("\n"), report };
}
