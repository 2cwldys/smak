// A GoldSrc model ported to Garry's Mod in one step: read from its file (with its <name>t.mdl and <name>01.mdl
// beside it), written as Source's compiler's files, compiled by GMod's studiomdl, the compiled model read back and
// held to the original, and drawn.
//
//   portToGmod(file, { out, name, folder, collision, surfaceprop, mass, studiomdl, gmod, compile, picture })
//     -> { passed, faults, warnings, said, qc, files, modelname, picture, physics }
//   surfacepropOfBuild(file)   what a model the kit built is made of, as Source names it, from <name>.built.json
//
// Under `out`: src/ (the QC and SMDs, kept: a person may change them and compile again) and addon/, which goes
// into garrysmod/addons/<name>/ as it is. `picture`: six views of the compiled model, read back from its own
// files as GMod would read them (a sheet's { width, height, rgba }).
import { readFileSync, existsSync } from "node:fs";
import { basename, join } from "node:path";
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
  const { materials = {}, parts = {} } = JSON.parse(readFileSync(record, "utf8"));
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
export function portToGmod(file, { out, name, folder, collision, surfaceprop, mass, studiomdl, gmod, compile = true, picture = true } = {}) {
  if (!out) throw new Error("portToGmod: the folder the port goes to (out)");
  const { src } = readStudio(file);
  const groups = sequenceGroups(src).length > 1 ? sequenceFilesOf(file, src) : undefined;
  // a model the kit built says what it is made of; one of a game's does not, and is "default" (or flesh, a ragdoll)
  const built = surfaceprop ? null : surfacepropOfBuild(file);
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
  const port = portToSource(src, { name: name ?? sourceName(basename(file)), folder, groups, collision, surfaceprop: material, mass, density: densityOf(material ?? "default", props) }); // prettier-ignore
  if (built) port.warnings.push(`made of ${built.base} the most, by its build's record: $surfaceprop "${built.surfaceprop}"`);
  const qc = writePort(port, out);
  const result = { passed: true, faults: [], warnings: [...port.warnings], said: [], qc, files: port.files.map((f) => join(out, f.path)), modelname: port.modelname, picture: null, physics: null }; // prettier-ignore
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
    result.said.push(`collides as ${phy.solids} ${phy.solids === 1 ? "solid" : "solids"}${phy.joints ? ` joined by ${phy.joints} joints (a ragdoll)` : ""}, ${phy.mass.toFixed(1)} kg, ${phy.surfaceprops.join(", ") || "default"}`); // prettier-ignore
  } else result.said.push("collides as nothing (no collision model)");
  if (picture) {
    const model = readSourceModel(`models/${port.modelname}`, sourceFiles({ folders: [addon] }));
    result.picture = renderSource(model, { sheet: true, size: 256 });
  }
  return result;
}
