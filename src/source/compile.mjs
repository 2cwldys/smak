// A QC compiled into a Source model by Valve's studiomdl, the one GMod ships (`GarrysMod/bin/win64/studiomdl.exe`).
//
//   findStudiomdl({ file, env })              the compiler: `file`, SMAK_STUDIOMDL, or GMod's in a Steam library
//   findGmod({ env })                         GMod's folder (the one with bin/ and garrysmod/), or null
//   compileQc(qcFile, { studiomdl, out, gmod, timeout })   -> { files, warnings, said, took }
//
// THE COMPILER IS NOT PART OF THIS KIT. It comes with the person's game (Windows only), as the map compilers are
// VHLT. It is run in a folder of its own: a game folder made for the run, whose gameinfo.txt searches it first
// and GMod's garrysmod/ after it (for a model or material the QC names from the game), so that what it writes
// goes there and nothing goes into the game. The files of the model are then copied to `out`
// (models/<the QC's $modelname>), and the run's folder is removed.
//
// A COMPILE IS A FAILURE when it ends with any code but 0, says a line of ERROR, or leaves no .mdl. Its
// WARNING lines are handed back, but for the one every run of GMod's gives (its mount.cfg, which a game folder of
// its own does not have).
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, copyFileSync, rmSync, writeFileSync, readFileSync, statSync } from "node:fs"; // prettier-ignore
import { join, dirname, resolve, basename } from "node:path";
import { tmpdir } from "node:os";
import { steamLibraries } from "../maps/games.mjs";

/** The environment variable that names the compiler. */
export const STUDIOMDL_VARIABLE = "SMAK_STUDIOMDL";
/** Where GMod keeps its compiler under its folder, most wanted first. */
const IN_GMOD = [["bin", "win64", "studiomdl.exe"], ["bin", "studiomdl.exe"]];
/** How long a compile may take, in milliseconds. */
const TIMEOUT = 300_000;
/** A line of the compiler's that spoils the compile. */
const ERROR_LINE = /^\s*ERROR\b/i;
const WARNING_LINE = /^\s*WARNING\b/i;
/** GMod's compiler's own warning in a game folder that is not GMod's: nothing of the model's. */
const MOUNT_WARNING = /mount\.cfg/i;
/** The files of a compiled model beside its .mdl. */
const MODEL_FILES = /\.(mdl|vvd|phy|ani|dx80\.vtx|dx90\.vtx|sw\.vtx|vtx)$/i;

const isFile = (file) => {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
};

/** GMod's folder in a Steam library of this machine: the one that holds garrysmod/ and bin/. Null when none. */
export function findGmod({ env = process.env } = {}) {
  for (const library of steamLibraries({ env })) {
    const folder = join(library, "steamapps", "common", "GarrysMod");
    if (existsSync(join(folder, "garrysmod")) && existsSync(join(folder, "bin"))) return folder;
  }
  return null;
}

/**
 * The Source compiler: `file` when given (it must be there), else SMAK_STUDIOMDL, else GMod's. It throws, saying
 * what it is and where to get it, when there is none.
 */
export function findStudiomdl({ file, env = process.env } = {}) {
  const told = file ?? env[STUDIOMDL_VARIABLE];
  if (told) {
    if (!isFile(told)) throw new Error(`no studiomdl at ${told}`);
    return resolve(told);
  }
  const gmod = findGmod({ env });
  for (const parts of gmod ? IN_GMOD : []) if (isFile(join(gmod, ...parts))) return join(gmod, ...parts);
  throw new Error(
    `no studiomdl: Source's model compiler, an outside program that comes with Garry's Mod (bin/win64/studiomdl.exe, Windows). Install GMod from Steam, or name the compiler with --studiomdl or ${STUDIOMDL_VARIABLE}`,
  );
}

/** What a QC names its model: the $modelname, under models/. */
function modelnameOf(qcText) {
  const found = qcText.match(/^\s*\$modelname\s+"?([^"\r\n]+?)"?\s*$/im);
  if (!found) throw new Error("the QC has no $modelname");
  return found[1].replace(/\\/g, "/");
}

/**
 * A QC compiled. `out`: the folder the model's files go to, under models/ as the $modelname says (an addon's
 * folder). `gmod`: GMod's folder, for the game's own files the QC may name (found when not given; none needed).
 * Returns { files (the paths written), warnings, said (every line the compiler printed), took (ms) }; throws, with
 * the compiler's errors in it, when the compile failed.
 */
export function compileQc(qcFile, { studiomdl, out, gmod, timeout = TIMEOUT } = {}) {
  if (!out) throw new Error("compileQc: the folder the model goes to (out)");
  const compiler = studiomdl ?? findStudiomdl();
  const qcText = readFileSync(qcFile, "utf8");
  const modelname = modelnameOf(qcText);
  const game = gmod ?? findGmod();
  const run = mkdtempSync(join(tmpdir(), "smak-studiomdl-"));
  try {
    const searched = [`\t\t\tgame\t|gameinfo_path|.`];
    if (game && existsSync(join(game, "garrysmod"))) searched.push(`\t\t\tgame\t${JSON.stringify(join(game, "garrysmod").replace(/\\/g, "/"))}`); // prettier-ignore
    // GMod's pack, named as a search path names one (without _dir): its scripts/surfaceproperties.txt gives each
    // $surfaceprop its density, without which $automass weighs every material as "default"
    if (game && existsSync(join(game, "garrysmod", "garrysmod_dir.vpk"))) searched.push(`\t\t\tgame\t${JSON.stringify(join(game, "garrysmod", "garrysmod.vpk").replace(/\\/g, "/"))}`); // prettier-ignore
    writeFileSync(
      join(run, "gameinfo.txt"),
      `"GameInfo"\n{\n\tgame\t"smak"\n\tFileSystem\n\t{\n\t\tSteamAppId\t4000\n\t\tSearchPaths\n\t\t{\n${searched.join("\n")}\n\t\t}\n\t}\n}\n`,
    );
    const started = performance.now();
    const result = spawnSync(compiler, ["-nop4", "-game", run, resolve(qcFile)], {
      cwd: dirname(resolve(qcFile)),
      encoding: "latin1",
      timeout,
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024,
    });
    const took = performance.now() - started;
    const said = `${result.stdout ?? ""}${result.stderr ?? ""}`.split(/\r?\n/).filter((line) => line.trim());
    if (result.error?.code === "ETIMEDOUT" || result.signal)
      throw new Error(`studiomdl ran longer than ${Math.round(timeout / 1000)} s and was stopped`);
    if (result.error) throw new Error(`studiomdl could not be run (${compiler}): ${result.error.message}`);
    const errors = said.filter((line) => ERROR_LINE.test(line));
    const warnings = said.filter((line) => WARNING_LINE.test(line) && !MOUNT_WARNING.test(line)).map((line) => line.trim());
    const made = join(run, "models", dirname(modelname));
    const stem = basename(modelname).replace(/\.mdl$/i, "").toLowerCase();
    const outputs = existsSync(made)
      ? readdirSync(made).filter((file) => MODEL_FILES.test(file) && file.toLowerCase().startsWith(`${stem}.`))
      : [];
    if (result.status !== 0 || errors.length || !outputs.some((file) => /\.mdl$/i.test(file)))
      throw new Error(
        `studiomdl did not compile ${basename(qcFile)} (exit code ${result.status})${errors.length ? `: ${errors.map((line) => line.trim()).join("; ")}` : `; its last lines: ${said.slice(-5).join(" | ")}`}`,
      );
    const to = join(out, "models", dirname(modelname));
    mkdirSync(to, { recursive: true });
    const files = outputs.map((file) => {
      copyFileSync(join(made, file), join(to, file));
      return join(to, file);
    });
    return { files, warnings, said, took };
  } finally {
    rmSync(run, { recursive: true, force: true });
  }
}
