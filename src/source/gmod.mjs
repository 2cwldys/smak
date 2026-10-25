// A GoldSrc model ported to Garry's Mod in one step: read from its file (with its <name>t.mdl and <name>01.mdl
// beside it), written as Source's compiler's files, compiled by GMod's studiomdl, the compiled model read back and
// held to the original, and drawn.
//
//   portToGmod(file, { out, name, folder, collision, studiomdl, gmod, compile, picture })
//     -> { passed, faults, warnings, said, qc, files, modelname, picture }
//
// Under `out`: src/ (the QC and SMDs, kept: a person may change them and compile again) and addon/, which goes
// into garrysmod/addons/<name>/ as it is. `picture`: six views of the compiled model, read back from its own
// files as GMod would read them (a sheet's { width, height, rgba }).
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { readStudio, sequenceFilesOf } from "../studio-file.mjs";
import { sequenceGroups } from "../mdl.mjs";
import { portToSource, writePort, sourceName } from "./port.mjs";
import { compileQc, findGmod } from "./compile.mjs";
import { readSourceMdl } from "./mdl.mjs";
import { readVvd, readVtx, sourceTriangles } from "./mesh.mjs";
import { comparePort } from "./check.mjs";
import { sourceFiles, readSourceModel, renderSource } from "./draw.mjs";

/**
 * The whole port of one model. `compile: false` writes the files only (no compiler needed; nothing is checked
 * then). `picture: false` draws nothing. Throws when the model cannot be read or the compiler fails.
 */
export function portToGmod(file, { out, name, folder, collision, studiomdl, gmod, compile = true, picture = true } = {}) {
  if (!out) throw new Error("portToGmod: the folder the port goes to (out)");
  const { src } = readStudio(file);
  const groups = sequenceGroups(src).length > 1 ? sequenceFilesOf(file, src) : undefined;
  const port = portToSource(src, { name: name ?? sourceName(basename(file)), folder, groups, collision });
  const qc = writePort(port, out);
  const result = { passed: true, faults: [], warnings: [...port.warnings], said: [], qc, files: port.files.map((f) => join(out, f.path)), modelname: port.modelname, picture: null }; // prettier-ignore
  if (!compile) return result;

  const addon = join(out, "addon");
  const made = compileQc(qc, { studiomdl, out: addon, gmod: gmod ?? findGmod() ?? undefined });
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
  if (picture) {
    const model = readSourceModel(`models/${port.modelname}`, sourceFiles({ folders: [addon] }));
    result.picture = renderSource(model, { sheet: true, size: 256 });
  }
  return result;
}
