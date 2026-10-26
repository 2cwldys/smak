// A GoldSrc model ported to Garry's Mod in one step: read from its file (with its <name>t.mdl and <name>01.mdl
// beside it), written as Source's compiler's files, compiled by GMod's studiomdl, the compiled model read back and
// held to the original, and drawn.
//
//   portToGmod(file, { out, name, folder, collision, surfaceprop, mass, kind, handRoll, upper, sounds, studiomdl,
//     gmod, compile, picture })   (kind "player" for a model under models/player/, unless told)
//     -> { passed, faults, warnings, said, qc, files, modelname, picture, physics }
//   builtToGmod(mdl, { pictures, record, out, name, ... })   the same for a model the kit built for Source
//     (buildModelSpec with engine "source"): its pictures in full colour, its surfaceprop from its record
//   surfacepropOfBuild(file)   what a model the kit built is made of, as Source names it, from <name>.built.json
//   surfacepropOfRecord(record)  the same from the record itself (summaryOf's)
//
// Under `out`: src/ (the QC and SMDs, kept: a person may change them and compile again) and addon/, which goes
// into garrysmod/addons/<name>/ as it is. `picture`: six views of the compiled model, read back from its own
// files as GMod would read them (a sheet's { width, height, rgba }). The sounds its events play are copied into
// addon/sound/<folder>/ from the game's sound/ folders (`sounds`: where to look; beside the model's mod, and
// valve's, unless told).
import { readFileSync, existsSync, mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import { readWav, writeWav, resample, RATES } from "../audio/wav.mjs";
import { basename, dirname, join, resolve } from "node:path";
import { readStudio, sequenceFilesOf } from "../studio-file.mjs";
import { sequenceGroups } from "../mdl.mjs";
import { portToSource, writePort, sourceName } from "./port.mjs";
import { compileQc, findGmod } from "./compile.mjs";
import { readSourceMdl } from "./mdl.mjs";
import { readVvd, readVtx, sourceTriangles } from "./mesh.mjs";
import { comparePort } from "./check.mjs";
import { sourceFiles, gmodFiles, readSourceModel, renderSource } from "./draw.mjs";
import { readPhy } from "./phy.mjs";
import { readSurfaceProps, densityOf, SURFACEPROP_OF_BASE } from "./surfaceprops.mjs";

/**
 * What a model the kit built from a spec is made of, to Source: the base of the material whose parts have the
 * most surface (their boxes'), from the record its build wrote beside it (<name>.built.json). Null when there is
 * no record, or it says no part's material.
 */
export function surfacepropOfBuild(file) {
  const record = file.replace(/\.mdl$/i, ".built.json");
  if (!existsSync(record)) return null;
  return surfacepropOfRecord(JSON.parse(readFileSync(record, "utf8")));
}

/** What a built model is made of, from its record ({ materials, parts }, summaryOf's): see surfacepropOfBuild. */
export function surfacepropOfRecord({ materials = {}, parts = {} } = {}) {
  const area = {};
  for (const part of Object.values(parts)) {
    const base = materials[part.material]?.base ?? part.material;
    if (!base || !part.from || !part.to) continue;
    const [x, y, z] = part.to.map((v, i) => Math.abs(v - part.from[i]));
    area[base] = (area[base] ?? 0) + 2 * (x * y + y * z + z * x);
  }
  const most = Object.entries(area).sort((a, b) => b[1] - a[1])[0];
  return most ? { surfaceprop: SURFACEPROP_OF_BASE[most[0]] ?? "default", base: most[0] } : null;
}

/**
 * The whole port of one model. `compile: false` writes the files only (no compiler needed; nothing is checked
 * then). `picture: false` draws nothing. Throws when the model cannot be read or the compiler fails.
 */
export function portToGmod(file, { out, name, folder, collision, surfaceprop, mass, kind, handRoll, upper, sounds, studiomdl, gmod, compile = true, picture = true } = {}) {
  if (!out) throw new Error("portToGmod: the folder the port goes to (out)");
  const { src } = readStudio(file);
  const groups = sequenceGroups(src).length > 1 ? sequenceFilesOf(file, src) : undefined;
  // a model the kit built says what it is made of; one of a game's does not, and is "default" (or flesh, a ragdoll)
  const built = surfaceprop ? null : surfacepropOfBuild(file);
  // a player is one of the game's players' folders (models/player/<name>/); a view or held model is known by
  // its file's name (v_, p_), whatever name the port is given
  const own = basename(file);
  const madeAs = kind ?? (/[\\/]models[\\/]player[\\/]/i.test(resolve(file)) ? "player" : /^v_/i.test(own) ? "view" : /^p_/i.test(own) ? "held" : undefined); // prettier-ignore
  return toGmod(src, { name: name ?? sourceName(basename(file)), folder, groups, collision, surfaceprop, mass, kind: madeAs, handRoll, upper, built, out, studiomdl, gmod, compile, picture, sounds: sounds ?? soundFoldersOf(file) }); // prettier-ignore
}

/** The rate a sound Source would not play is written at. */
export const SOURCE_WAV_RATE = 44100;

/**
 * A sound file as Source plays it. Source's mixer plays 8 or 16-bit PCM at 11025, 22050 or 44100 Hz only; a file
 * at another rate it plays silently (stevenlafl's finding: The Specialists' block.wav, at 48000, was never heard
 * though emitted). Such a file, or one of another depth or format, is rewritten as 16-bit PCM at 44100, one
 * channel (the mean of its channels), its loop point moved with it.
 * Returns {} for a file Source plays as it is; { bytes, was: "48000 Hz 16-bit, 2 channels" } for one rewritten;
 * { unread: "why" } for one not read as a WAVE file (copied as it is).
 */
export function sourceWav(bytes) {
  let wav;
  try {
    wav = readWav(bytes);
  } catch (error) {
    return { unread: error.message };
  }
  if (wav.format === 1 && (wav.bits === 8 || wav.bits === 16) && RATES.includes(wav.rate)) return {};
  const x = wav.rate === SOURCE_WAV_RATE ? wav.x : resample(wav.x, wav.rate, SOURCE_WAV_RATE);
  const loop = wav.cue?.length ? Math.round((wav.cue[0] * SOURCE_WAV_RATE) / wav.rate) : null;
  const was = `${wav.rate} Hz ${wav.bits}-bit${wav.format === 3 ? " float" : ""}${wav.channels > 1 ? `, ${wav.channels} channels` : ""}`; // prettier-ignore
  return { bytes: writeWav(x, { rate: SOURCE_WAV_RATE, bits: 16, loop }), was };
}

/**
 * Where a GoldSrc model's sounds are: the sound/ folder of the mod it is under (the folder that holds its models/),
 * then valve's beside it, whose sounds every mod plays. Those that are there.
 */
export function soundFoldersOf(file) {
  let mod = dirname(resolve(file));
  while (basename(mod).toLowerCase() !== "models" && dirname(mod) !== mod) mod = dirname(mod);
  if (basename(mod).toLowerCase() !== "models") return [];
  mod = dirname(mod);
  return [...new Set([join(mod, "sound"), join(dirname(mod), "valve", "sound")])].filter((folder) => existsSync(folder));
}

/**
 * A model the kit built for Source (buildModelSpec with engine "source": `mdl`, its `pictures` in full colour,
 * `baseFile`, a character's base, beside which the animations it keeps apart are, and `record`, summaryOf's of the
 * build, for what it is made of) made Source's compiler's files, compiled, held to itself and drawn, as portToGmod
 * does for a file.
 */
export function builtToGmod(mdl, { pictures, record, baseFile, out, name, folder, collision, surfaceprop, mass, studiomdl, gmod, compile = true, picture = true } = {}) {
  if (!out) throw new Error("builtToGmod: the folder the model goes to (out)");
  if (!name) throw new Error("builtToGmod: the model's name in Source (name)");
  const built = surfaceprop || !record ? null : surfacepropOfRecord(record);
  const groups = baseFile && sequenceGroups(mdl).length > 1 ? sequenceFilesOf(baseFile, mdl) : undefined;
  // bound in the stance it was built in, its base's first frame: at the bones' rest a body made in that stance is
  // out of shape (a robot built on Half-Life's grunt stood with a leg kicked out)
  return toGmod(mdl, { name, folder, groups, pictures, bind: { seq: 0, frame: 0 }, collision, surfaceprop, mass, built, out, studiomdl, gmod, compile, picture }); // prettier-ignore
}

/** What portToGmod and builtToGmod share: the port written, compiled, read back, held to what it was, and drawn. */
function toGmod(src, { name, folder, groups, pictures, bind, collision, surfaceprop, mass, kind, handRoll, upper, built, out, studiomdl, gmod, compile, picture, sounds = [] }) {
  const material = surfaceprop ?? built?.surfaceprop;
  // its density from GMod's own surfaceproperties.txt (the kit's table where GMod is not): GMod's studiomdl
  // weighs everything as "default", so the port weighs it
  const game = gmod ?? findGmod();
  let props;
  try {
    const files = game ? gmodFiles(game) : null;
    if (files?.has("scripts/surfaceproperties.txt")) props = readSurfaceProps(files.read("scripts/surfaceproperties.txt").toString("latin1")); // prettier-ignore
  } catch {
    // a pack that is not read: the kit's own table
  }
  const port = portToSource(src, { name, folder, groups, pictures, bind, collision, surfaceprop: material, mass, kind, handRoll, upper, densities: (prop) => densityOf(prop, props) }); // prettier-ignore
  if (built) port.warnings.push(`made of ${built.base} the most, by its build's record: $surfaceprop "${built.surfaceprop}"`);
  const qc = writePort(port, out);
  const result = { passed: true, faults: [], warnings: [...port.warnings], said: [], qc, files: port.files.map((f) => join(out, f.path)), modelname: port.modelname, picture: null, physics: null, sounds: [] }; // prettier-ignore
  // the sounds its events play, from the game into the addon; one the game has not is said (the event plays nothing)
  const unfound = [];
  // those Source would not play as they are, rewritten; those not read, copied as they were
  const rewritten = [];
  const unread = [];
  for (const { from, to } of port.sounds) {
    const found = sounds.map((folder) => join(folder, from)).find((path) => existsSync(path));
    if (!found) {
      unfound.push(from);
      continue;
    }
    const copy = join(out, "addon", "sound", to);
    mkdirSync(dirname(copy), { recursive: true });
    const playable = sourceWav(readFileSync(found));
    if (playable.bytes) {
      writeFileSync(copy, playable.bytes);
      rewritten.push(`${from} (${playable.was})`);
    } else copyFileSync(found, copy);
    if (playable.unread) unread.push(`${from} (${playable.unread})`);
    result.files.push(copy);
    result.sounds.push(to);
  }
  if (rewritten.length)
    result.warnings.push(`${rewritten.length === 1 ? "a sound" : `${rewritten.length} sounds`} Source would not play as ${rewritten.length === 1 ? "it was" : "they were"} (it plays 8 or 16-bit PCM at 11025, 22050 or 44100 Hz only, and a file at another rate silently), written as 16-bit PCM at ${SOURCE_WAV_RATE} Hz, one channel: ${rewritten.slice(0, 4).join(", ")}${rewritten.length > 4 ? ` and ${rewritten.length - 4} more` : ""}`); // prettier-ignore
  if (unread.length)
    result.warnings.push(`${unread.length === 1 ? "a sound" : `${unread.length} sounds`} not read as a WAVE file, copied as ${unread.length === 1 ? "it was" : "they were"} (Source may not play ${unread.length === 1 ? "it" : "them"}): ${unread.slice(0, 4).join(", ")}`); // prettier-ignore
  if (unfound.length)
    result.warnings.push(`${unfound.length === 1 ? "a sound" : `${unfound.length} sounds`} its events play not found in ${sounds.length ? sounds.join(", ") : "no sound folder"}, so ${unfound.length === 1 ? "it plays" : "they play"} nothing: ${unfound.slice(0, 4).join(", ")}${unfound.length > 4 ? ` and ${unfound.length - 4} more` : ""}`); // prettier-ignore
  if (!compile) return result;

  const addon = join(out, "addon");
  const made = compileQc(qc, { studiomdl, out: addon, gmod: game ?? undefined });
  result.files.push(...made.files);
  result.warnings.push(...made.warnings.map((line) => `studiomdl: ${line}`));
  const stem = made.files.find((f) => /\.mdl$/i.test(f)).replace(/\.mdl$/i, "");
  const mdl = readSourceMdl(readFileSync(`${stem}.mdl`));
  const vtx = [".dx90.vtx", ".dx80.vtx", ".vtx"].map((ext) => `${stem}${ext}`).find((f) => made.files.includes(f));
  const triangles = sourceTriangles(mdl, readVvd(readFileSync(`${stem}.vvd`)), readVtx(readFileSync(vtx)));
  const compared = comparePort(port.facts, mdl, triangles);
  result.passed = compared.passed;
  result.faults = compared.faults;
  result.said = [...compared.said, `compiled in ${(made.took / 1000).toFixed(1)} s`];
  if (result.sounds.length) result.said.push(`${result.sounds.length} ${result.sounds.length === 1 ? "sound" : "sounds"} its events play, under sound/${sourceName(folder ?? "smak")}/`); // prettier-ignore
  // what it collides as: the .phy the compiler wrote, when the QC asked for one
  const asked = port.files.some((f) => /_physics.smd$/.test(f.path));
  const phyFile = made.files.find((f) => /.phy$/i.test(f));
  if (asked && !phyFile) {
    result.passed = false;
    result.faults.push("no .phy: the compiler made nothing to collide with of its collision model");
  }
  if (phyFile) {
    const phy = readPhy(readFileSync(phyFile));
    result.physics = phy;
    result.said.push(`collides as ${phy.solids} ${phy.solids === 1 ? "solid" : "solids"}${phy.joints ? ` joined by ${phy.joints} ${phy.joints === 1 ? "joint" : "joints"} (a ragdoll)` : ""}, ${phy.mass.toFixed(1)} kg, ${phy.surfaceprops.join(", ") || "default"}`); // prettier-ignore
  } else result.said.push("collides as nothing (no collision model)");
  if (picture) {
    const model = readSourceModel(`models/${port.modelname}`, sourceFiles({ folders: [addon] }));
    result.picture = renderSource(model, { sheet: true, size: 256 });
  }
  return result;
}
