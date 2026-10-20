// The library the judges hold a figure against: corpora of a game's own figures, measured from the game as it is
// installed on this machine, kept in a file of the person's (never in the kit: the kit ships no game's files
// and no measures of them). `surveyFigures` measures every figure of a models folder for the style, texture
// and shape judges at once; the file keeps each corpus under its name, so the games surveyed sit side by side,
// and what tells their manners apart can be worked out between them.
//
// The file: `{ kind: "smak figure library", version, corpora: { name: { from, made, figures, skipped } },
// style: { models, skipped }, texture: { models }, shape: { models } }`, each section's `models` keyed
// "corpus:path/in/models.mdl" with `{ game: corpus, file, hash, measures, ... }`: what each judge reads.
import { readdirSync, statSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { homedir } from "node:os";
import { figureFacts, loadFigure } from "./facts.mjs";
import { styleMeasures } from "./style.mjs";
import { modelTextureMeasures } from "./texture-model.mjs";
import { shapeOfModel } from "./silhouettes.mjs";

export const LIBRARY_KIND = "smak figure library";
export const LIBRARY_VERSION = 1;
/** The judges a survey measures for, unless told fewer. */
export const JUDGES = ["style", "texture", "shape"];

/**
 * Where the library is kept unless told: SMAK_FIGURES (an environment variable), else `.smak/figures.json` in
 * the person's home folder. Outside the kit, and outside any repository of theirs.
 */
export const libraryFile = () => process.env.SMAK_FIGURES || join(homedir(), ".smak", "figures.json");

/** An empty library. */
export const emptyLibrary = () => ({
  kind: LIBRARY_KIND,
  version: LIBRARY_VERSION,
  corpora: {},
  style: { models: {}, skipped: {} },
  texture: { models: {} },
  shape: { models: {} },
});

/** A library read from its file (an empty one when there is none); one that is not a library is refused. */
export function readLibrary(file = libraryFile()) {
  if (!existsSync(file)) return emptyLibrary();
  const read = JSON.parse(readFileSync(file, "utf8"));
  if (read.kind !== LIBRARY_KIND)
    throw new Error(`${file} is not a figure library (a file surveyFigures or \`smak figure-survey\` wrote)`);
  return { ...emptyLibrary(), ...read };
}

/** A library written to its file, its folder made. */
export function writeLibrary(library, file = libraryFile()) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(library));
  return file;
}

/** The corpora a library holds, with how many figures each judge has of them. */
export function libraryCorpora(library) {
  return Object.fromEntries(
    Object.entries(library.corpora).map(([name, c]) => [
      name,
      { ...c, ...Object.fromEntries(JUDGES.map((j) => [j, Object.values(library[j].models).filter((m) => m.game === name).length])) }, // prettier-ignore
    ]),
  );
}

/** Every .mdl under a folder. */
function mdlsUnder(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...mdlsUnder(p));
    else if (/\.mdl$/i.test(name)) out.push(p);
  }
  return out.sort();
}

const rounded = (o) =>
  JSON.parse(JSON.stringify(o, (k, v) => (typeof v === "number" ? +v.toPrecision(4) : v)));

/**
 * Every figure of a models folder measured into the library, as corpus `corpus` (what it held of that corpus
 * before is replaced). A file of another's textures (`<name>t.mdl`) or animations (`<name>01.mdl`) is no figure;
 * a model that is no standing figure (no Biped bones nor plain-word head, hands and feet; a snark; almost no
 * triangles) is kept in `skipped` with why. `judges`: which judges' measures (all three unless told: the
 * shape's draws each figure from four sides, the slowest). `log(line)`: told each corpus' progress.
 * → the library, changed in place.
 */
export function surveyFigures(
  folder,
  { corpus, judges = JUDGES, library = emptyLibrary(), log = () => {} } = {},
) {
  if (!corpus) throw new Error("surveyFigures: the corpus' name (a game's folder: valve, ts, msc)");
  if (!existsSync(folder) || !statSync(folder).isDirectory())
    throw new Error(`surveyFigures: no folder ${folder}`);
  for (const j of judges)
    if (!JUDGES.includes(j)) throw new Error(`surveyFigures: a judge is ${JUDGES.join(", ")}, not ${j}`);
  for (const j of JUDGES) {
    for (const key of Object.keys(library[j].models))
      if (library[j].models[key].game === corpus) delete library[j].models[key];
    if (library[j].skipped) for (const key of Object.keys(library[j].skipped)) if (key.split(":")[0] === corpus) delete library[j].skipped[key]; // prettier-ignore
  }
  const files = mdlsUnder(folder);
  const names = new Set(files.map((f) => f.toLowerCase()));
  const t0 = Date.now();
  let kept = 0,
    skipped = 0;
  for (const file of files) {
    const rel = relative(folder, file).replace(/\\/g, "/");
    const key = `${corpus}:${rel}`;
    const skip = (why) => {
      library.style.skipped[key] = why;
      skipped++;
    };
    // a model's textures (name + t) or animations (name + 01) kept in a file of their own
    const base = file.toLowerCase().replace(/(t|\d\d)\.mdl$/, ".mdl");
    if (base !== file.toLowerCase() && names.has(base)) {
      skip(/t\.mdl$/i.test(file) ? "textures of another file" : "animations of another file");
      continue;
    }
    try {
      const loaded = loadFigure(file);
      if (loaded.skip) {
        skip(loaded.skip);
        continue;
      }
      const f = figureFacts(loaded.src);
      if (f.skip) {
        skip(f.skip);
        continue;
      }
      const head = { game: corpus, file: rel, hash: f.hash };
      if (judges.includes("style")) {
        const { measures, by } = styleMeasures(f);
        library.style.models[key] = { ...head, by: f.by, pose: f.pose, height: +f.height.toFixed(1), measures, textures: by.textures, parts: by.parts }; // prettier-ignore
      }
      if (judges.includes("texture"))
        library.texture.models[key] = { ...head, measures: modelTextureMeasures(f).measures };
      if (judges.includes("shape")) {
        const { pictures, ...s } = shapeOfModel(loaded.src);
        library.shape.models[key] = rounded({ ...head, ...s });
      }
      kept++;
    } catch (e) {
      skip(`broken: ${e.message.slice(0, 120)}`);
    }
  }
  library.corpora[corpus] = {
    from: folder,
    made: new Date().toISOString().slice(0, 10),
    figures: kept,
    skipped,
    judges,
  };
  log(
    `${corpus}: ${files.length} files, ${kept} figures measured, ${skipped} skipped (${((Date.now() - t0) / 1000).toFixed(0)} s)`,
  );
  return library;
}

/**
 * The models folder of a corpus under a folder the person names: `<given>/<corpus folder>/models` (the
 * Half-Life folder), `<given>/models` (the game's folder), or the given folder itself (a models folder).
 */
export function modelsFolderOf(given, folder) {
  for (const each of [folder && join(given, folder, "models"), join(given, "models")])
    if (each && existsSync(each) && statSync(each).isDirectory()) return each;
  return given;
}
