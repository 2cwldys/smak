// The figure judges on the command line: `smak figure-survey` (two corpora of fixture-figure.mjs's boxes into a
// library of the test's own), `figure-judge`, `figure-texture` (a picture of an atlas as the reference, read at
// 4 pixels a texel), `figure-shape` (a reference's masks; a pose module drawing the model as they see it; a
// picture with its mask), `figure-validate`, and what they refuse.
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as smak from "../src/index.mjs";
import { test, sure, tmp, runSmak, runRefused, SMAK_CLI } from "./helper.mjs";
import { figure, maskOf } from "./fixture-figure.mjs";

const library = join(tmp, "figure-commands.json");
const games = join(tmp, "figure-games");
// two games: one of shaded, mirrored figures, one of flat figures with gear on one side; five each
for (const [game, paint, lopsided] of [
  ["shaded", "panels", false],
  ["flat", "flat", true],
]) {
  mkdirSync(join(games, game, "models"), { recursive: true });
  for (let i = 0; i < 5; i++)
    writeFileSync(join(games, game, "models", `${game}${i}.mdl`), figure({ name: `${game}${i}.mdl`, paint, lopsided, seed: i + 1, limb: 2.5 + i * 0.3 }).src); // prettier-ignore
}
const judged = join(tmp, "figure-judged.mdl");
writeFileSync(judged, figure({ paint: "flat", seed: 9 }).src);

test("figure-survey: a game's figures into a library of the person's, beside another game's", () => {
  const first = runSmak("figure-survey", games, "--as", "shaded", "--library", library);
  sure(
    /shaded: 5 files, 5 figures measured, 0 skipped/.test(first) &&
      /keep the file out of any repository/.test(first),
    first,
  );
  const second = runSmak("figure-survey", join(games, "flat"), "--as", "flat", "--library", library);
  sure(/: shaded 5 figures, flat 5 figures/.test(second), second);
  const held = smak.figures.readLibrary(library);
  sure(
    Object.keys(held.shape.models).length === 10 && held.corpora.flat.from.endsWith("models"),
    "both corpora, every judge",
  );
});

test("figure-judge: a figure against a corpus by --against; the score and what is out", () => {
  const out = runSmak("figure-judge", judged, "--against", "shaded", "--library", library);
  sure(
    /figure-judged\.mdl against shaded: \d+ of 100/.test(out) && /most like: shaded:shaded\d\.mdl/.test(out),
    out,
  );
  const json = JSON.parse(
    runSmak("figure-judge", judged, "--against", "flat,shaded", "--library", library, "--json"),
  );
  sure(
    json.corpus.join() === "flat,shaded" && json.measures.rigid === 1 && Number.isFinite(json.score),
    "as JSON",
  );
});

test("figure-texture: a flat texture against shaded figures is told flat; a picture of an atlas read at 4 pixels a texel as the reference", () => {
  // the reference: a 20 by 20 atlas of shaded panels drawn 4 pixels a texel on a light ground
  const W = 120,
    rgba = new Uint8Array(W * W * 4);
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      const tx = Math.floor((x - 20) / 4),
        ty = Math.floor((y - 20) / 4);
      const inside = tx >= 0 && ty >= 0 && tx < 20 && ty < 20;
      const v = inside ? 40 + ((tx * 7 + ty * 13) % 9) * 12 + (tx % 5) * 6 : 210;
      rgba.set([v, v * 0.9, v * 0.8, 255], (y * W + x) * 4);
    }
  const atlas = join(tmp, "figure-atlas.png");
  writeFileSync(atlas, smak.png(W, W, rgba));
  const sheet = join(tmp, "figure-texture-sheet.png");
  const out = runSmak("figure-texture", judged, "--against", "shaded", "--library", library, "--reference", atlas, "--reference-scale", "4", "--sheet", sheet); // prettier-ignore
  sure(
    /texels in a flat fill \(3x3 of one colour\): \d+%; the corpus' .*: flat fills where the game's are shaded/.test(
      out,
    ),
    out,
  );
  sure(
    /against figure-atlas: distance [\d.]+/.test(out) && existsSync(sheet),
    "against the reference, and the sheet",
  );
  const picture = JSON.parse(
    runSmak("figure-texture", atlas, "--against", "shaded", "--library", library, "--json"),
  );
  sure(Math.abs(picture.scale - 4) < 0.05 && picture.measures.flat !== undefined, `read at ${picture.scale}`);
});

test("figure-shape: against a reference's masks, in the reference's pose from a module, and a picture with its mask", () => {
  const masks = smak.figures.shapeOfModel(join(games, "flat", "models", "flat0.mdl"), {
    keep: true,
  }).pictures;
  const refs = [];
  for (const view of ["front", "threeq", "back"]) {
    const m = masks[view].mask;
    const file = join(tmp, `figure-mask-${view}.png`);
    const rgba = new Uint8Array(m.width * m.height * 4);
    for (let k = 0; k < m.data.length; k++)
      rgba.set(m.data[k] ? [255, 255, 255, 255] : [0, 0, 0, 255], k * 4);
    writeFileSync(file, smak.png(m.width, m.height, rgba));
    refs.push("--reference", `${view}=${file}`);
  }
  const out = runSmak("figure-shape", judged, "--against", "flat", "--library", library, ...refs);
  sure(/its shape against flat: measures one at a time \d+ of 100/.test(out), out);
  sure(
    /surface whose mirror \(left to right\) is not on the model: 0\.0%.*the body is mirrored exactly: vary one side/.test(
      out,
    ),
    out,
  );
  sure(/against the reference \(silhouette measures\): distance [\d.]+/.test(out), "against the masks");
  // the pose module: the bones at rest, and the cameras the masks were drawn from
  const pose = join(tmp, "figure-pose.mjs");
  writeFileSync(pose, `import { restPose } from ${JSON.stringify(pathToFileURL(join(SMAK_CLI, "../../src/index.mjs")).href)};\nexport const pose = (src) => restPose(src);\nexport const views = { front: { yaw: 0, pitch: 4 }, threeq: { yaw: 45, pitch: 4 }, back: { yaw: 150, pitch: 4 } };\n`); // prettier-ignore
  const posed = JSON.parse(runSmak("figure-shape", judged, "--against", "flat", "--library", library, ...refs, "--pose", pose, "--json")); // prettier-ignore
  sure(Number.isFinite(posed.refDistance) && posed.measures.mirror === 0, `posed: ${posed.refDistance}`);
  // a picture with its mask: a closed silhouette is told to open
  const m = maskOf();
  const rgba = new Uint8Array(m.width * m.height * 4);
  for (let k = 0; k < m.data.length; k++) rgba.set(m.data[k] ? [255, 255, 255, 255] : [0, 0, 0, 255], k * 4);
  const maskFile = join(tmp, "figure-closed.png");
  writeFileSync(maskFile, smak.png(m.width, m.height, rgba));
  const picture = runSmak(
    "figure-shape",
    maskFile,
    "--mask",
    maskFile,
    "--against",
    "flat",
    "--library",
    library,
  );
  sure(/its shape against flat/.test(picture), picture);
});

test("figure-validate: the two games told apart by each judge", () => {
  for (const judge of ["style", "texture", "shape"]) {
    const report = JSON.parse(runSmak("figure-validate", library, "--judge", judge, "--json"));
    const auc = judge === "style" ? report.auc : judge === "texture" ? report.auc : report.all.auc;
    sure(auc.shaded.flat >= 0.9 && auc.flat.shaded >= 0.9, `${judge}: ${JSON.stringify(auc)}`);
  }
});

test("the figure commands refuse in a sentence: no corpus asked, one the library lacks, a wrong judge, a picture without its mask", () => {
  const none = runRefused(SMAK_CLI, "figure-judge", judged, "--library", library);
  sure(
    none.code === 1 && /--mod <profile> \(msc, ts, halflife \.\.\.\) or --against/.test(none.err),
    none.err,
  );
  const lacking = runRefused(SMAK_CLI, "figure-judge", judged, "--mod", "ts", "--library", library);
  sure(
    lacking.code === 1 &&
      /has no style measures of ts \(it has shaded, flat\): survey the game first/.test(lacking.err),
    lacking.err,
  );
  const judge = runRefused(SMAK_CLI, "figure-validate", library, "--judge", "looks");
  sure(judge.code === 1 && /--judge style \| texture \| shape/.test(judge.err), judge.err);
  const picture = runRefused(
    SMAK_CLI,
    "figure-shape",
    join(tmp, "figure-closed.png"),
    "--against",
    "flat",
    "--library",
    library,
  );
  sure(picture.code === 1 && /a picture needs its mask/.test(picture.err), picture.err);
  const unknown = runRefused(SMAK_CLI, "figure-survey", games, "--mod", "quake", "--library", library);
  sure(unknown.code === 1 && /no profile quake/.test(unknown.err), unknown.err);
});
