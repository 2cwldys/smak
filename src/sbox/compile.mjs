// A .vmdl compiled by s&box's own resourcecompiler (`sbox/bin/win64/resourcecompiler.exe`), as s&box's tests run
// it: no editor, nothing drawn.
//
//   findSbox({ folder, env })                        s&box's folder: `folder`, SMAK_SBOX, FACEPUNCH_ENGINE, or a
//                                                    Steam library's; throws when there is none
//   compileVmdl(assets, vmdl, { sbox, timeout })     -> { compiled, said, notes, took }
//
// THE COMPILER IS NOT PART OF THIS KIT. It comes with s&box (Windows). It reads the .vmdl and everything it names
// from `assets` (a project's Assets folder, or any folder laid out as one) and s&box's core, and writes each file's
// compiled form beside it (.vmdl_c, .vmat_c, the textures' .vtex_c). Nothing is written into s&box's folder: it runs
// without its renderer (-skiprendersystem), which would keep a shader cache there.
//
// A COMPILE IS A FAILURE when it ends with any code but 0, its summary says a file failed, or it leaves no .vmdl_c.
// What it says of the model (its lines "models/...: ...") is handed back as its notes: a node it could not resolve,
// a file it could not read.
import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import { join, resolve } from "node:path";
import { steamLibraries } from "../maps/games.mjs";

/** The environment variable that names s&box's folder. s&box's launcher sets FACEPUNCH_ENGINE too. */
export const SBOX_VARIABLE = "SMAK_SBOX";
const COMPILER = ["bin", "win64", "resourcecompiler.exe"];
/** How long a compile may take, in milliseconds. */
const TIMEOUT = 300_000;
/** The compiler's summary: "OK: 1 compiled, 0 failed, 0 skipped" or "ERROR: 0 compiled, 1 failed...". */
const SUMMARY = /^\s*(OK|WARNING|ERROR):\s*(\d+) compiled, (\d+) failed/;
/** The lines of the vulkan layers and the like a run prints whatever it compiles. */
const NOISE = /^(Layer |VK_EXT|Writing Vulkan|Unable to rename|CDataModel|Leaking )/;

const isFile = (file) => {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
};

/** s&box's folder (the one with sbox.exe and bin/win64/resourcecompiler.exe). Throws, saying where to get it. */
export function findSbox({ folder, env = process.env } = {}) {
  const told = folder ?? env[SBOX_VARIABLE] ?? env.FACEPUNCH_ENGINE;
  if (told) {
    if (!isFile(join(told, ...COMPILER)))
      throw new Error(`no s&box at ${told} (no ${COMPILER.join("/")} in it)`);
    return resolve(told);
  }
  for (const library of steamLibraries({ env })) {
    const found = join(library, "steamapps", "common", "sbox");
    if (isFile(join(found, ...COMPILER))) return found;
  }
  throw new Error(`no s&box: its model compiler comes with s&box (Steam, Windows). Install it, or name its folder with --sbox or ${SBOX_VARIABLE}`); // prettier-ignore
}

/**
 * The .vmdl at `vmdl` (a path under `assets`, as the model names its files: models/smak/barney.vmdl) compiled.
 * Returns { compiled (the .vmdl_c's path), said (every line the compiler printed, but its noise), notes (what it
 * said of the model), took (ms) }; throws, with the compiler's words, when the compile failed.
 */
export function compileVmdl(assets, vmdl, { sbox, timeout = TIMEOUT } = {}) {
  const engine = sbox ?? findSbox();
  const source = join(resolve(assets), vmdl);
  if (!isFile(source)) throw new Error(`compileVmdl: no ${source}`);
  const started = performance.now();
  const result = spawnSync(
    join(engine, ...COMPILER),
    ["-f", "-noassert", "-skiprendersystem", "-searchpaths", `core|${resolve(assets)}`, source],
    {
      cwd: engine,
      encoding: "latin1",
      timeout,
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  const took = performance.now() - started;
  const said = `${result.stdout ?? ""}${result.stderr ?? ""}`
    .split(/\r?\n/)
    .filter((line) => line.trim() && !NOISE.test(line));
  if (result.error?.code === "ETIMEDOUT" || result.signal) throw new Error(`resourcecompiler ran longer than ${Math.round(timeout / 1000)} s and was stopped`); // prettier-ignore
  if (result.error) throw new Error(`resourcecompiler could not be run (${engine}): ${result.error.message}`);
  const notes = said.filter((line) => /^\s*models\/.*:\s/.test(line)).map((line) => line.trim());
  const summary = said.map((line) => line.match(SUMMARY)).find(Boolean);
  const compiled = `${source}_c`;
  if (result.status !== 0 || !summary || Number(summary[3]) > 0 || !isFile(compiled))
    throw new Error(`resourcecompiler did not compile ${vmdl} (exit code ${result.status})${notes.length ? `: ${notes.slice(0, 8).join("; ")}` : `; its last lines: ${said.slice(-5).join(" | ")}`}`); // prettier-ignore
  return { compiled, said, notes, took };
}
