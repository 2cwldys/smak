// Figures in another game's manner, for the figure judges: a figure of one-bone pieces judged against a game of
// skinned figures, a flat atlas against painted ones, a closed silhouette against frames full of holes, a
// mirrored body against lopsided ones; and the judges' own validation, which must say a coin when two corpora
// are one manner. The corpora are made here from the boxes of fixture-figure.mjs: no game's figure is read, so
// no case waits on the installed game.
//
// A judge gives a score and findings, no PASS or FAIL: what it fails a figure for here is a finding FAR from the
// corpus (beyond one and a half middle halves, what styleTold marks "far"). A defect of one kind moves several
// measures together (a flat picture has no grain and no contrast either), so those cases let the other far
// findings be, and ask that the one broken is among them and that the twin has none.
import * as smak from "../../src/index.mjs";
import { figure, picture, maskOf, seeded } from "../fixture-figure.mjs";
import { broken } from "./case.mjs";

const F = smak.figures;
/** The distance in middle halves from which a finding is far. */
const FAR = 1.5;

/** A library section of figures from measures: corpora by name, each a list of measures. */
function sectionOf(corpora) {
  const models = {};
  for (const [game, list] of Object.entries(corpora))
    list.forEach((measures, i) => {
      models[`${game}:f${i}.mdl`] = { game, file: `f${i}.mdl`, hash: `${game}${i}`, measures };
    });
  return { models };
}
/** Measures varied a little about `base` (each by up to `spread` of itself), seeded. */
const about = (base, n, seed, spread = 0.15) => {
  const r = seeded(seed);
  return Array.from({ length: n }, () => Object.fromEntries(Object.entries(base).map(([k, v]) => [k, typeof v === "number" ? v * (1 - spread + 2 * spread * r()) : v]))); // prettier-ignore
};
/** A verdict's far findings, as `key: what to do`. */
const far = (verdict) => verdict.findings.filter((finding) => finding.distance >= FAR && !finding.told).map((finding) => `${finding.key}: ${finding.advice}`); // prettier-ignore

// ── judgeStyle ──

const boxes = F.styleMeasures(F.figureFacts(figure().src));
// a game of skinned figures (rigid near nothing) and one of rigid figures, both otherwise like the boxes
const random = seeded(21);
const styles = sectionOf({
  skinned: about(boxes.measures, 8, 3).map((m) => ({ ...m, rigid: 0.02 + 0.06 * random() })),
  rigid: about(boxes.measures, 8, 4),
});
const { weights } = F.styleSetup(styles, { weights: { rigid: 3, tris: 1, hard: 1, boxy: 1 } });
const styleOn = (game) => F.judgeStyle(boxes.measures, F.prepareStyle(F.styleCorpus(styles, [game]), weights), { parts: boxes.by.parts }); // prettier-ignore

broken("judgeStyle", "a figure of one-bone pieces judged against a game of skinned figures", {
  said: /^rigid: .*join the pieces into one skin/,
  broken: () => far(styleOn("skinned")),
  whole: () => far(styleOn("rigid")),
});

// ── judgeTexture ──

/** A picture as an atlas, every texel painted, one chart. */
const atlasOf = (kind, seed) => {
  const t = picture(kind, seed);
  const rgb = new Uint8Array(t.pixels.length * 3);
  for (let k = 0; k < t.pixels.length; k++) rgb.set(t.palette.subarray(t.pixels[k] * 3, t.pixels[k] * 3 + 3), k * 3);
  return { width: 64, height: 64, rgb, mask: new Uint8Array(64 * 64).fill(1), charts: new Int32Array(64 * 64).fill(0), chartCount: 1 }; // prettier-ignore
};
const painted = sectionOf({ painted: [1, 2, 3, 4, 5, 6].map((seed) => F.textureMeasures([atlasOf("panels", seed)])) });

broken("judgeTexture", "an atlas of flat fills judged against painted figures", {
  said: /^flat: .*flat fills where the game's are shaded/,
  others: true,
  broken: () => far(F.judgeTexture(F.textureMeasures([atlasOf("flat")]), painted, ["painted"], null)),
  whole: () => far(F.judgeTexture(F.textureMeasures([atlasOf("panels", 7)]), painted, ["painted"], null)),
});

// ── judgeShape ──

const frames = sectionOf({ frames: [6, 5, 7, 6, 5, 7].map((hole, i) => F.silhouetteMeasures(maskOf({ hole, every: 13 + i })).measures) }); // prettier-ignore
broken("judgeShape", "a closed silhouette judged against frames full of small holes", {
  said: /^fineHoles: .*open the frame in many small places/,
  others: true,
  broken: () => far(F.judgeShape({ measures: F.silhouetteMeasures(maskOf()).measures }, frames, ["frames"], null)),
  whole: () => far(F.judgeShape({ measures: F.silhouetteMeasures(maskOf({ hole: 6, every: 15 })).measures }, frames, ["frames"], null)), // prettier-ignore
});

const lopsided = F.meshMeasures(F.figureFacts(figure({ lopsided: true }).src)).measures;
const lopsidedOnes = sectionOf({ lopsided: about(lopsided, 6, 11) });
broken("judgeShape", "a body mirrored exactly judged against lopsided ones", {
  said: /^mirror: the body is mirrored exactly: vary one side/,
  others: true,
  broken: () => far(F.judgeShape({ measures: F.meshMeasures(F.figureFacts(figure().src)).measures }, lopsidedOnes, ["lopsided"], null)), // prettier-ignore
  whole: () => far(F.judgeShape({ measures: lopsided }, lopsidedOnes, ["lopsided"], null)),
});

// ── validateStyle: does the judge tell two manners apart ──

/** The pairs of corpora the style judge tells apart no better than this (AUC; 0.5 is a coin). */
const COIN = 0.8;
const blurred = (data) => {
  const { report } = F.validateStyle(data, { weights: F.styleSetup(data).weights });
  return Object.entries(report.auc).flatMap(([own, against]) => Object.entries(against).filter(([, auc]) => auc < COIN).map(([foreign, auc]) => `${own} on ${foreign}: AUC ${auc.toFixed(2)}`)); // prettier-ignore
};
broken("validateStyle", "two corpora of one manner, which no judge can tell apart", {
  said: /^[ab] on [ab]: AUC 0\.[0-7]\d$/,
  broken: () => blurred(sectionOf({ a: about(boxes.measures, 8, 5), b: about(boxes.measures, 8, 6) })),
  whole: () => blurred(sectionOf({ a: about({ ...boxes.measures, tris: 400, hard: 0.2 }, 8, 5), b: about({ ...boxes.measures, tris: 4000, hard: 0.6 }, 8, 6) })), // prettier-ignore
});
