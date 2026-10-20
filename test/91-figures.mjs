// The figure judges (src/figures/): a figure's facts, its 52 style measures, its texture as painting and its
// shape, each judge held against corpora made here (no game's figures: the boxes of fixture-figure.mjs, and
// measures written by hand), and pointing at the right fault: a flat atlas reads as flat, a closed silhouette as
// one with no holes, a mirrored body as mirrored, one-bone pieces as rigid. And the library a survey keeps.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as smak from "../src/index.mjs";
import { test, sure, near, tmp } from "./helper.mjs";
import { figure, picture, maskOf, seeded } from "./fixture-figure.mjs";

const F = smak.figures;

/** A library section of figures from measures: corpora by name, each a list of measures. */
function sectionOf(corpora) {
  const models = {};
  for (const [game, list] of Object.entries(corpora))
    list.forEach((measures, i) => {
      models[`${game}:f${i}.mdl`] = { game, file: `f${i}.mdl`, hash: `${game}${i}`, measures };
    });
  return { models };
}
/** A model of one bone and a few triangles: no figure. */
const crate = () =>
  smak.buildMdl({ name: "crate.mdl", bodyparts: [{ name: "b", models: [{ name: "b", meshes: [{ tris: [[{ p: [0, 0, 0], uv: [0, 0] }, { p: [9, 0, 0], uv: [1, 0] }, { p: [0, 9, 0], uv: [0, 1] }]], texture: picture("flat") }] }] }] }); // prettier-ignore
/** What a call refuses with, or "" when it does not. */
function refusal(call) {
  try {
    call();
  } catch (e) {
    return e.message;
  }
  return "";
}
/** Measures varied a little about `base` (each by up to `spread` of itself), seeded. */
function about(base, n, seed, spread = 0.15) {
  const r = seeded(seed);
  return Array.from({ length: n }, () =>
    Object.fromEntries(
      Object.entries(base).map(([k, v]) => [
        k,
        typeof v === "number" ? v * (1 - spread + 2 * spread * r()) : v,
      ]),
    ),
  );
}

test("figureFacts: a figure of boxes on a Biped's bones stands, its parts found; a figure that does not stand is skipped and why", () => {
  const f = F.figureFacts(figure().src);
  sure(!f.skip, `skipped: ${f.skip}`);
  sure(f.by === "biped" && f.pose === "idle", `${f.by}, ${f.pose}`);
  near(f.height, 71.2, 0.6, "its height");
  const parts = new Set(f.tris.map((t) => t.part));
  sure(
    ["head", "torso", "arm", "hand", "leg", "foot"].every((p) => parts.has(p)),
    `parts ${[...parts]}`,
  );
  // its head well above its feet, the left hand to its left (x is the body's left)
  sure(
    f.joints.head[2] > 60 && f.joints.lFoot[2] < 5 && f.joints.lHand[0] > 20 && f.joints.rHand[0] < -20,
    "the joints in the body's frame",
  );
  // a model of one bone has no body's bones
  const one = crate();
  sure(/no head, two hands and two feet/.test(F.figureFacts(one).skip), F.figureFacts(one).skip);
  // a skeleton found by plain words when it has no Biped names
  const words = F.skeletonOf(["root", "chest", "head", "arm_l", "hand_l", "arm_r", "hand_r", "leg_l", "foot_l", "leg_r", "foot_r"], [-1, 0, 1, 1, 3, 1, 5, 0, 7, 0, 9]); // prettier-ignore
  sure(words?.by === "words" && words.bones.lFoot === 8 && words.bones.rHand === 6, JSON.stringify(words));
});

test("style: the 52 measures said; a figure of one-bone boxes is rigid, boxy and mirrored, and judged against skinned figures says to join its pieces", () => {
  sure(Object.keys(F.STYLE_SAID).length === 52, `${Object.keys(F.STYLE_SAID).length} measures`);
  const f = F.figureFacts(figure().src);
  const { measures, by } = F.styleMeasures(f);
  sure(
    measures.rigid === 1 && measures.boxy === 1 && measures.sym === 1 && measures.pieces === 15,
    JSON.stringify(measures).slice(0, 200),
  );
  sure(by.parts.torso && by.textures["panels.bmp"], "by part and by texture");
  // a game of skinned figures (rigid near nothing) and one of rigid figures, both otherwise like it
  const r = seeded(21);
  const skinned = about(measures, 8, 3).map((m) => ({ ...m, rigid: 0.02 + 0.06 * r() }));
  const rigid = about(measures, 8, 4);
  const data = sectionOf({ skinned, rigid });
  const { weights } = F.styleSetup(data, { weights: { rigid: 3, tris: 1, hard: 1, boxy: 1 } });
  const onSkinned = F.judgeStyle(measures, F.prepareStyle(F.styleCorpus(data, ["skinned"]), weights), {
    parts: by.parts,
  });
  const first = onSkinned.findings[0];
  sure(
    first.key === "rigid" && /join the pieces into one skin/.test(first.advice),
    `${first.key}: ${first.advice}`,
  );
  const onRigid = F.judgeStyle(measures, F.prepareStyle(F.styleCorpus(data, ["rigid"]), weights), {});
  sure(onRigid.score > onSkinned.score && onRigid.score >= 50, `${onRigid.score} against ${onSkinned.score}`);
  sure(
    /surface in pieces each moved by one bone: 100%/.test(F.styleTold("figure.mdl", onSkinned, ["skinned"])),
    "said in words",
  );
});

test("style: separation, weights by group (proportions told, not scored), and the validation's AUC between two manners", () => {
  const base = F.styleMeasures(F.figureFacts(figure().src)).measures;
  const a = about({ ...base, tris: 400, hard: 0.2, legLen: 0.4 }, 8, 5),
    b = about({ ...base, tris: 4000, hard: 0.6, legLen: 0.55 }, 8, 6);
  const data = sectionOf({ a, b });
  const sep = F.styleSeparation(data);
  sure(sep.tris === 3 && sep.hard === 3 && sep.legLen > 1 && sep.heads < 0.25, `tris ${sep.tris}, hard ${sep.hard}, legs ${sep.legLen}, heads ${sep.heads}`); // prettier-ignore
  // one corpus' own separation, from the others only
  near(F.styleSeparation(data, ["a", "b"], { of: "a" }).tris, 3, 1e-9, "of a");
  const w = F.styleWeightsOf(sep);
  sure(w.tris && !w.legLen && w.__told.legLen > 1 && !w.heads && w.__told.heads === undefined, "the legs told, not scored; the heads dropped"); // prettier-ignore
  const { weights } = F.styleSetup(data);
  const { report, text } = F.validateStyle(data, { weights, sep });
  sure(report.auc.a.b >= 0.9 && report.auc.b.a >= 0.9, JSON.stringify(report.auc));
  sure(report.confusion.a.a + report.confusion.b.b >= 14, JSON.stringify(report.confusion));
  sure(/AUC/.test(text), "the table said");
  sure(F.aucOf([3, 4], [1, 2]) === 1 && F.aucOf([1], [1]) === 0.5, "aucOf");
});

test("texture: a flat atlas reads as flat, noise as speckle; judged against painted figures, the flat one is told to shade its fills", () => {
  // a picture as an atlas, every texel painting and one chart
  const atlasOf = (kind, seed) => {
    const t = picture(kind, seed);
    const rgb = new Uint8Array(t.pixels.length * 3);
    for (let k = 0; k < t.pixels.length; k++)
      rgb.set(t.palette.subarray(t.pixels[k] * 3, t.pixels[k] * 3 + 3), k * 3);
    return {
      width: 64,
      height: 64,
      rgb,
      mask: new Uint8Array(64 * 64).fill(1),
      charts: new Int32Array(64 * 64).fill(0),
      chartCount: 1,
    };
  };
  const flat = F.textureMeasures([atlasOf("flat")]);
  const noise = F.textureMeasures([atlasOf("noise", 2)]);
  sure(
    flat.flat > 0.99 && flat.speckle === 0 && flat.colours === 1,
    `flat ${flat.flat}, speckle ${flat.speckle}, colours ${flat.colours}`,
  );
  sure(noise.flat < 0.05 && noise.speckle > 0.1, `noise: flat ${noise.flat}, speckle ${noise.speckle}`);
  const painted = [1, 2, 3, 4, 5, 6].map((seed) => F.textureMeasures([atlasOf("panels", seed)]));
  const data = sectionOf({ painted });
  const v = F.judgeTexture(flat, data, ["painted"], noise, { refName: "the noise" });
  const fault = v.findings.find((x) => x.key === "flat");
  sure(
    fault && /flat fills where the game's are shaded/.test(fault.advice),
    JSON.stringify(v.findings.map((x) => x.key)),
  );
  sure(
    v.refDistance > 0 && v.toward.some((t) => t.key === "speckle" && t.d < 0),
    "toward the reference: more speckle",
  );
  sure(
    /its texture against painted/.test(F.textureTold("flat.mdl", v, ["painted"], "the noise")),
    "said in words",
  );
  // from a model: its UVs give the mask and the charts, and the flat painting shows
  const fromModel = F.textureOfModel(figure({ paint: "flat" }).src).measures;
  sure(fromModel.flat > 0.75 && fromModel.contrast === 0 && fromModel.charts > 0, JSON.stringify(fromModel));
});

test("texture: a picture of an atlas drawn 4 pixels a texel is read back at 4, its painting told from its ground", () => {
  const T = 24,
    K = 4,
    W = T * K + 40;
  const rgba = new Uint8Array(W * W * 4);
  const r = seeded(9);
  const texels = Array.from({ length: T * T }, () => [40 + r() * 160, 40 + r() * 160, 40 + r() * 160]);
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      const tx = Math.floor((x - 20) / K),
        ty = Math.floor((y - 20) / K);
      const c = tx >= 0 && ty >= 0 && tx < T && ty < T ? texels[ty * T + tx] : [200, 200, 200];
      rgba.set([...c.map(Math.round), 255], (y * W + x) * 4);
    }
  const read = F.textureOfPicture({ width: W, height: W, rgba });
  near(read.scale, 4, 0.05, "pixels a texel");
  sure(Math.abs(read.atlases[0].width - (T + 10)) <= 2 && read.atlases[0].mask.reduce((s, v) => s + v, 0) >= T * T * 0.9, `${read.atlases[0].width} texels across`); // prettier-ignore
  // told the scale, it is used
  sure(F.textureOfPicture({ width: W, height: W, rgba }, { scale: 4 }).scale === 4, "as told");
});

test("shape: a closed silhouette has no holes and is told to open its frame; a frame of small holes reads as see-through", () => {
  const closed = F.silhouetteMeasures(maskOf()).measures;
  const frame = F.silhouetteMeasures(maskOf({ hole: 6, every: 14 })).measures;
  sure(closed.holes === 0 && closed.fineHoles === 0 && closed.holeCount === 0.5, JSON.stringify(closed));
  sure(frame.fineHoles > 0.02 && frame.holeCount > 10, `frame: ${frame.fineHoles}, ${frame.holeCount}`);
  const frames = [6, 5, 7, 6, 5, 7].map((hole, i) => ({
    ...F.silhouetteMeasures(maskOf({ hole, every: 13 + i })).measures,
  }));
  const data = sectionOf({ frames });
  const v = F.judgeShape({ measures: closed }, data, ["frames"], { measures: frame }, "the frame");
  const fault = v.findings.find((x) => x.key === "fineHoles");
  sure(
    fault && /open the frame in many small places/.test(fault.advice),
    JSON.stringify(v.findings.map((x) => x.key)),
  );
  sure(
    v.toward[0] && ["holes", "fineHoles", "holeCount"].includes(v.toward[0].key) && v.toward[0].d < 0,
    JSON.stringify(v.toward[0]),
  );
  sure(
    /against the frame \(silhouette measures\)/.test(F.shapeTold("closed", v, ["frames"], "the frame")),
    "said in words",
  );
});

test("shape: a mirrored body reads as mirrored and is told to vary one side; one with gear on one side does not", () => {
  const even = F.meshMeasures(F.figureFacts(figure().src)).measures;
  const lopsided = F.meshMeasures(F.figureFacts(figure({ lopsided: true }).src)).measures;
  sure(even.mirror === 0 && even.boxes === 1, `even: mirror ${even.mirror}, boxes ${even.boxes}`);
  sure(lopsided.mirror > 0.1, `lopsided: mirror ${lopsided.mirror}`);
  const data = sectionOf({ lopsided: about(lopsided, 6, 11) });
  const v = F.judgeShape({ measures: even }, data, ["lopsided"], null);
  const fault = v.findings.find((x) => x.key === "mirror");
  sure(
    fault && /the body is mirrored exactly: vary one side/.test(fault.advice),
    JSON.stringify(v.findings.map((x) => x.key)),
  );
  sure(
    !F.judgeShape({ measures: lopsided }, data, ["lopsided"], null).findings.some((x) => x.key === "mirror"),
    "the lopsided one is not told so",
  );
});

test("shape: a model's silhouettes from four sides with their summary and its mesh; drawn again as a reference's figure stands", () => {
  const { src } = figure({ lopsided: true });
  const shape = F.shapeOfModel(src, { keep: true });
  sure(Object.keys(shape.views).join() === "front,threeq,side,back", Object.keys(shape.views).join());
  sure(
    shape.measures.mirror > 0 && shape.measures.asym > 0 && shape.bands.torso,
    "picture and mesh measures, by band",
  );
  // its own front view, as a reference's mask half the size: the model framed into it stands where it stands
  const front = shape.pictures.front.mask;
  const half = {
    width: front.width >> 1,
    height: front.height >> 1,
    data: new Uint8Array((front.width >> 1) * (front.height >> 1)),
  };
  for (let y = 0; y < half.height; y++)
    for (let x = 0; x < half.width; x++)
      half.data[y * half.width + x] = front.data[2 * y * front.width + 2 * x];
  const masks = F.masksLikeReference(src, { views: { front: { mask: half, yaw: 0, pitch: 4 } } });
  const rows = (m) => {
    const ys = [];
    for (let y = 0; y < m.height; y++)
      if (m.data.subarray(y * m.width, (y + 1) * m.width).some(Boolean)) ys.push(y);
    return [ys[0], ys.at(-1)];
  };
  const [t0, b0] = rows(half),
    [t1, b1] = rows(masks.front.mask);
  sure(
    masks.front.mask.width === half.width && Math.abs(t0 - t1) <= 2 && Math.abs(b0 - b1) <= 2,
    `top ${t0}/${t1}, bottom ${b0}/${b1}`,
  );
  const posed = F.shapeOfModel(src, { masks });
  sure(
    Object.keys(posed.views).join() === "front" && posed.measures.mirror === shape.measures.mirror,
    "its silhouette from the masks, its mesh as ever",
  );
});

test("library: a folder surveyed into a corpus (a texture file and a figure that does not stand skipped, and why), kept, read back, replaced", () => {
  const dir = join(tmp, "figures-game", "models");
  mkdirSync(join(dir, "player"), { recursive: true });
  writeFileSync(join(dir, "soldier.mdl"), figure({ seed: 1 }).src);
  writeFileSync(join(dir, "player", "scout.mdl"), figure({ seed: 2, lopsided: true }).src);
  writeFileSync(join(dir, "soldiert.mdl"), figure({ seed: 3 }).src);
  writeFileSync(join(dir, "crate.mdl"), crate());
  const lines = [];
  const library = F.surveyFigures(dir, { corpus: "mine", log: (l) => lines.push(l) });
  sure(
    Object.keys(library.style.models).join() === "mine:player/scout.mdl,mine:soldier.mdl",
    Object.keys(library.style.models).join(),
  );
  sure(library.texture.models["mine:soldier.mdl"].measures.flat !== undefined && library.shape.models["mine:soldier.mdl"].measures.holes !== undefined, "all three judges"); // prettier-ignore
  sure(library.style.skipped["mine:soldiert.mdl"] === "textures of another file" && /no head/.test(library.style.skipped["mine:crate.mdl"]), JSON.stringify(library.style.skipped)); // prettier-ignore
  sure(/mine: 4 files, 2 figures measured, 2 skipped/.test(lines[0]), lines[0]);
  const file = join(tmp, "figures-library.json");
  F.writeLibrary(library, file);
  const back = F.readLibrary(file);
  sure(
    back.corpora.mine.figures === 2 && F.libraryCorpora(back).mine.shape === 2,
    JSON.stringify(back.corpora),
  );
  // surveyed again with the style judge only: what it held of the corpus is replaced
  F.surveyFigures(dir, { corpus: "mine", judges: ["style"], library: back });
  sure(
    Object.keys(back.texture.models).length === 0 && Object.keys(back.style.models).length === 2,
    "replaced",
  );
  sure(
    F.modelsFolderOf(join(tmp, "figures-game")) === dir && F.modelsFolderOf(tmp, "figures-game") === dir,
    "the models folder found",
  );
  writeFileSync(join(tmp, "not-a-library.json"), "{}");
  sure(/not a figure library/.test(refusal(() => F.readLibrary(join(tmp, "not-a-library.json")))), "refused");
});
