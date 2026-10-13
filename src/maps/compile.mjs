// A `.map` compiled into the `.bsp` the game loads, by the four programs every GoldSrc map goes through:
//
//   hlcsg   cuts the brushes against each other and looks every texture up in the .wad files
//   hlbsp   builds the tree the engine draws and collides with, and finds LEAKS
//   hlvis   works out what can be seen from where (slow on a large open map; `fast` for a draft)
//   hlrad   lights it: light entities, texture lights, the sky
//
// THE COMPILERS ARE NOT PART OF THIS KIT. They are an outside program the person installs once: VHLT, also
// known as Vluzacn's ZHLT v34 (hlcsg, hlbsp, hlvis and hlrad, with their zhlt.wad). `findCompilers` looks for
// them in a folder you name, in the folder the VHLT_DIR environment variable names, and on the PATH, and
// says in one sentence what is missing. Nothing here works without them, and each function says so.
//
// WHY A .bsp ON THE DISK IS NOT ENOUGH. The four programs end with code 0 in cases that are no success: a
// leak leaves hlvis nothing to do and the whole map is drawn at once, and hlrad then lights every face the
// same. So what they print is read as well, and any line of error or leak makes the compile a failure. The
// work is done in a folder of its own, and the `.bsp` is put where it was asked for only when all of it
// went well: a failed compile leaves no half-made result behind.
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  rmSync,
} from "node:fs";
import { join, resolve, dirname, basename, delimiter } from "node:path";
import { tmpdir } from "node:os";
import { readMap } from "./source.mjs";

/** The four programs, in the order they run. */
export const COMPILERS = ["hlcsg", "hlbsp", "hlvis", "hlrad"];
/** The environment variable that names the compilers' folder. */
export const COMPILERS_VARIABLE = "VHLT_DIR";
/** The names a compiler's file may have, most wanted first: `hlcsg` gives hlcsg_x64.exe, hlcsg.exe... */
const FILE_NAMES = (tool) => [`${tool}_x64.exe`, `${tool}.exe`, `${tool}_x64`, tool];
/** What the compilers are, said wherever they are missing. */
const WHAT_THEY_ARE =
  "the map compilers VHLT (Vluzacn's ZHLT v34: hlcsg, hlbsp, hlvis, hlrad), an outside program that is not part of this kit";
/** Where to put them, said with it. */
const HOW_TO_GIVE = `install them and name their folder: findCompilers({ folder }), or the ${COMPILERS_VARIABLE} environment variable, or put them on the PATH`;

/**
 * The lines that make a compile count for nothing though the program ended with code 0: an error, a leak,
 * a brush the compiler had to mend or drop, a map with no visibility, a face of mixed contents.
 */
export const BAD_LINE = /\b(error|leak|warning: brush|no visibility|mixed face contents)\b/i;
/** A line that warns without spoiling the result. */
const WARNING_LINE = /^\s*warning\b/i;
/**
 * hlbsp's word for a leak (`Warning: === LEAK in hull 0 ===`), the lines of the explanation it prints after
 * it, which are no errors of their own, and the entity it names: `Entity light @ (  10, -20,  30)`.
 */
const LEAK_FOUND = /===\s*leak\b/i;
const LEAK_TALK = /\bleak\b|listed in the error|^error:?\s*$/i;
const LEAK_ENTITY = /Entity\s+(\S+)\s*@\s*\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/i;
/** hlcsg's words for a texture that is in none of the .wad files. */
const MISSING_TEXTURE = /texture\s+(\S+)\s+not found/i;
/** How long each program may run, in milliseconds, before it is stopped. */
const TIMEOUTS = { hlcsg: 120_000, hlbsp: 120_000, hlvis: 900_000, hlrad: 900_000 };
/** The compilers print in the machine's old code page; latin1 keeps every byte. */
const LOG_ENCODING = "latin1";
/** How much a program may print before it is cut off. */
const LOG_LIMIT = 64 * 1024 * 1024;

/**
 * Looks for the four compilers: in `folder` when given, then in the folder the VHLT_DIR environment
 * variable names, then in every folder of the PATH. It returns
 *   { found, tools: { hlcsg, hlbsp, hlvis, hlrad }, folder, missing, searched, message }
 * `tools` holds each program's path (all four from one folder: the first that has them all), `missing` the
 * names not found, `searched` where it looked, and `message` one sentence that says what was found, or what
 * is missing and what to do about it. It never throws.
 */
export function findCompilers({ folder, env = process.env } = {}) {
  const places = [];
  if (folder) places.push(resolve(folder));
  if (env[COMPILERS_VARIABLE]) places.push(resolve(env[COMPILERS_VARIABLE]));
  for (const place of (env.PATH ?? env.Path ?? "").split(delimiter)) if (place) places.push(place);
  const searched = [...new Set(places)];
  /** The compilers a folder has: `{ hlcsg: path, ... }` for those that are there. */
  const toolsIn = (place) => {
    const tools = {};
    for (const tool of COMPILERS) {
      const file = FILE_NAMES(tool)
        .map((name) => join(place, name))
        .find((path) => existsSync(path));
      if (file) tools[tool] = file;
    }
    return tools;
  };
  let best = { tools: {}, folder: null };
  for (const place of searched) {
    const tools = toolsIn(place);
    if (Object.keys(tools).length > Object.keys(best.tools).length) best = { tools, folder: place };
    if (Object.keys(tools).length === COMPILERS.length) break;
  }
  const missing = COMPILERS.filter((tool) => !best.tools[tool]);
  const found = !missing.length;
  const named = [
    folder && `the folder ${resolve(folder)}`,
    env[COMPILERS_VARIABLE] && `${COMPILERS_VARIABLE} (${env[COMPILERS_VARIABLE]})`,
    "the PATH",
  ]
    .filter(Boolean)
    .join(", ");
  let message;
  if (found) message = `the compilers are in ${best.folder}`;
  else if (!best.folder)
    message = `this needs ${WHAT_THEY_ARE}, and none of them was found (looked in ${named}): ${HOW_TO_GIVE}`;
  else
    message = `this needs ${WHAT_THEY_ARE}, and ${best.folder} has no ${missing.join(", ")}: ${HOW_TO_GIVE}`;
  return { found, tools: best.tools, folder: best.folder, missing, searched, message };
}

/** The points of a leak's trail, from the file hlbsp leaves: one `x y z` a line (a .lin has two a line). */
function trailOf(text) {
  const points = [];
  for (const line of text.split(/\r?\n/)) {
    const numbers = (line.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi) ?? []).map(Number);
    for (let at = 0; at + 2 < numbers.length; at += 3) points.push(numbers.slice(at, at + 3));
  }
  return points;
}

/** The entities of a map's text that have a place: `[{ classname, origin, targetname }]`; none when unread. */
function placedEntities(mapText) {
  let map;
  try {
    map = readMap(mapText);
  } catch {
    return [];
  }
  const placed = [];
  for (const one of map.entities) {
    const origin = (one.origin ?? "").trim().split(/\s+/).map(Number);
    if (origin.length === 3 && origin.every(Number.isFinite))
      placed.push({ classname: one.classname, origin, targetname: one.targetname });
  }
  return placed;
}

/** The box round a map's world brushes, from the points its planes are written with; null when unread. */
function worldBox(mapText) {
  let map;
  try {
    map = readMap(mapText);
  } catch {
    return null;
  }
  const points = map.brushes.flatMap((brush) => brush.faces.flatMap((face) => face.points));
  if (!points.length) return null;
  return {
    min: [0, 1, 2].map((i) => Math.min(...points.map((point) => point[i]))),
    max: [0, 1, 2].map((i) => Math.max(...points.map((point) => point[i]))),
  };
}

/**
 * What is known of a leak: the entity hlbsp names, the trail it wrote from that entity out to the void, and
 * the entity of the map nearest to where the trail leaves the world.
 */
function leakOf(log, workBase, mapText) {
  const named = LEAK_ENTITY.exec(log);
  let points = [];
  for (const ending of [".pts", ".lin"]) {
    if (points.length || !existsSync(workBase + ending)) continue;
    points = trailOf(readFileSync(workBase + ending, "utf8"));
  }
  const entity = named
    ? { classname: named[1], origin: [Number(named[2]), Number(named[3]), Number(named[4])] }
    : null;
  // The trail starts where the entity's own space ends (the first opening on the way out, which in a
  // simple room is the hole itself) and wanders on through the void. Put that end first.
  const world = worldBox(mapText);
  const insideWorld = (point) =>
    world && [0, 1, 2].every((i) => point[i] >= world.min[i] && point[i] <= world.max[i]);
  if (points.length > 1 && !insideWorld(points[0]) && insideWorld(points[points.length - 1]))
    points.reverse();
  // where it gets out: the last point of the trail that is still inside the box of the world's brushes
  const firstOut = points.findIndex((point) => !insideWorld(point));
  const at = points.length
    ? points[Math.max(0, (firstOut < 0 ? points.length : firstOut) - 1)]
    : (entity?.origin ?? null);
  let nearest = null;
  if (at)
    for (const one of placedEntities(mapText)) {
      const distance = Math.hypot(one.origin[0] - at[0], one.origin[1] - at[1], one.origin[2] - at[2]);
      if (!nearest || distance < nearest.distance) nearest = { ...one, distance: Math.round(distance) };
    }
  return { entity, points, at, nearest };
}

/** A leak, said in a sentence. */
function leakSentence(leak) {
  const place = (point) => point.map((value) => Math.round(value)).join(" ");
  const from = leak.entity
    ? ` It was found from the ${leak.entity.classname} at ${place(leak.entity.origin)}.`
    : "";
  const out =
    leak.at && leak.points.length
      ? ` The trail (${leak.points.length} points) leaves the world near ${place(leak.at)}`
      : "";
  const near =
    out && leak.nearest
      ? `, ${leak.nearest.distance} units from the ${leak.nearest.classname} at ${place(leak.nearest.origin)}.`
      : out
        ? "."
        : "";
  return `the map LEAKS: the space the entities are in is open to the void outside, through a gap between world brushes or because an entity is outside the map.${from}${out}${near} Close the gap with world brushes (brush entities seal nothing) and compile again`;
}

/** The compilers' own .wad, kept beside them: the pictures of ORIGIN, CLIP, NULL, HINT, SKIP and the like. */
const TOOL_WAD = "zhlt.wad";

/** Where worldspawn's keys end in a map's text: at its first brush, or at its closing brace. */
function worldHeadEnd(mapText) {
  const open = mapText.indexOf("{");
  const firstBrush = mapText.indexOf("{", open + 1);
  const end = mapText.indexOf("}", open);
  return firstBrush >= 0 && firstBrush < end ? firstBrush : end;
}

/** The .wad files worldspawn's `wad` key lists in a map's text. */
function wadsOf(mapText) {
  const key = /^s*"wad"s+"([^"]*)"s*$/m.exec(mapText.slice(0, worldHeadEnd(mapText)));
  return key ? key[1].split(";").filter(Boolean) : [];
}

/** The map's text with worldspawn's `wad` key set to these files. */
function withWads(mapText, wadFiles) {
  const line = `"wad" "${wadFiles.join(";")}"`;
  const open = mapText.indexOf("{");
  const headEnd = worldHeadEnd(mapText);
  const head = mapText.slice(0, headEnd);
  if (/^\s*"wad"\s+"[^"]*"\s*$/m.test(head))
    return head.replace(/^\s*"wad"\s+"[^"]*"\s*$/m, line) + mapText.slice(headEnd);
  return `${mapText.slice(0, open + 1)}\n${line}${mapText.slice(open + 1)}`;
}

/** One program run: what it printed, how it ended, and the sentences its output gives. */
function runTool(tool, file, args, workFolder, timeout) {
  const started = Date.now();
  const run = spawnSync(file, args, {
    cwd: workFolder,
    encoding: LOG_ENCODING,
    timeout,
    maxBuffer: LOG_LIMIT,
    windowsHide: true,
  });
  const text = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  const seconds = (Date.now() - started) / 1000;
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const bad = lines.filter((line) => BAD_LINE.test(line));
  const leaked = lines.some((line) => LEAK_FOUND.test(line));
  const warnings = lines
    .filter((line) => WARNING_LINE.test(line) && !BAD_LINE.test(line) && !MISSING_TEXTURE.test(line))
    .map((line) => `${tool}: ${line}`);
  const errors = [];
  if (run.error?.code === "ETIMEDOUT")
    errors.push(
      `${tool} did not finish in ${Math.round(timeout / 1000)} seconds and was stopped: a larger timeout, or fast: true for a draft`,
    );
  else if (run.error)
    errors.push(`${tool} could not be run (${run.error.code ?? run.error.message}): ${file}`);
  for (const line of bad) {
    const texture = MISSING_TEXTURE.exec(line);
    if (texture) {
      const said = `the texture ${texture[1]} is in none of the .wad files given: name one that is, or give the .wad that has it`;
      if (!errors.includes(said)) errors.push(said);
    } else if (!LEAK_TALK.test(line)) errors.push(`${tool}: ${line}`);
  }
  if (!run.error && run.status !== 0 && !errors.length && !leaked)
    errors.push(`${tool} ended with code ${run.status}: read its log`);
  return { tool, args, code: run.status, seconds, text, errors, warnings, leaked };
}

/**
 * Compiles a `.map` file into a `.bsp`: hlcsg, hlbsp, hlvis and hlrad in turn. It NEEDS THE COMPILERS
 * (VHLT, an outside program: see `findCompilers`), and says so in `errors` when they are absent.
 *
 *   wads         the .wad files the map's textures are in (paths). They are written into the copy of the map
 *                that is compiled, in place of worldspawn's `wad` key; without them that key is used as it is.
 *                The compilers' own zhlt.wad (ORIGIN, CLIP, NULL...) is added to either by itself
 *   wadinclude   true to put the textures INSIDE the .bsp (all the wads'), or a list of wad names to put in.
 *                Such a .bsp carries the pictures of whoever made the .wad: keep it out of anything shared.
 *                Without it the game needs the .wad files beside its own, as every Half-Life map does
 *   out          where the .bsp goes (beside the map, with its name, unless told)
 *   fast         a quick draft: hlvis and hlrad at their fastest. The light is rougher
 *   vis, light   false leaves hlvis, or hlrad, out (a map with no light is drawn fully bright)
 *   compilers    what `findCompilers` returned, or `{ folder }`; looked for when not given
 *   timeout      milliseconds each program may run, or `{ hlvis: ..., hlrad: ... }`
 *   keep         true keeps the folder the work was done in (the .pts of a leak, the .prt, the .log) and
 *                returns it as `work`
 *
 * It returns `{ bsp, logs, errors, warnings, leak, work }`. `bsp` is the path of the result, or null when
 * the compile failed: then nothing was written where the .bsp goes. `logs` is one entry a program run:
 * `{ tool, args, code, seconds, text }`. `errors` and `warnings` are sentences. `leak` is null, or
 * `{ entity, points, at, nearest }`: the entity the compiler found the leak from, the trail of points from
 * it out to the void, the point where the trail leaves the world, and the map's entity nearest to that.
 * It never throws for what is wrong with the map.
 */
export function compileMap(mapFile, options = {}) {
  const {
    wads,
    wadinclude = false,
    out,
    fast = false,
    light = true,
    vis = true,
    compilers,
    timeout,
    keep = false,
  } = options;
  const result = { bsp: null, logs: [], errors: [], warnings: [], leak: null, work: null };
  const found = compilers?.tools ? compilers : findCompilers(compilers ?? {});
  if (!found.found) {
    result.errors.push(`compileMap: ${found.message}`);
    return result;
  }
  if (typeof mapFile !== "string" || !existsSync(mapFile)) {
    result.errors.push(
      `compileMap: there is no map file ${mapFile}: write the text of writeMap to a .map file first`,
    );
    return result;
  }
  const name = basename(mapFile).replace(/\.map$/i, "");
  const target = resolve(out ?? join(dirname(mapFile), `${name}.bsp`));
  const wadFiles = (wads ?? []).map((wad) => resolve(wad));
  for (const wad of wadFiles)
    if (!existsSync(wad)) result.errors.push(`compileMap: there is no .wad file ${wad}`);
  if (result.errors.length) return result;

  let mapText = readFileSync(mapFile, "utf8");
  // the compilers' own .wad goes with the others, or ORIGIN and CLIP would be textures found nowhere
  const listed = wadFiles.length ? [...wadFiles] : wadsOf(mapText);
  const toolWad = join(found.folder ?? dirname(found.tools.hlcsg), TOOL_WAD);
  const isToolWad = (wad) => basename(wad).toLowerCase() === TOOL_WAD;
  const ownWads = listed.filter((wad) => !isToolWad(wad));
  if (existsSync(toolWad) && !listed.some(isToolWad)) listed.push(toolWad);
  if (listed.length) mapText = withWads(mapText, listed);
  const work = mkdtempSync(join(tmpdir(), "smak-map-"));
  const base = join(work, name);
  writeFileSync(`${base}.map`, mapText);

  const included =
    wadinclude === true ? ownWads.map((wad) => basename(wad).replace(/\.wad$/i, "")) : wadinclude || [];
  const steps = [
    { tool: "hlcsg", args: [...included.flatMap((wad) => ["-wadinclude", wad]), base] },
    { tool: "hlbsp", args: [base] },
    vis && { tool: "hlvis", args: [...(fast ? ["-fast"] : []), base] },
    light && { tool: "hlrad", args: [...(fast ? ["-fast"] : []), base] },
  ].filter(Boolean);
  const limitFor = (tool) => (typeof timeout === "number" ? timeout : (timeout?.[tool] ?? TIMEOUTS[tool]));

  for (const step of steps) {
    const run = runTool(step.tool, found.tools[step.tool], step.args, work, limitFor(step.tool));
    result.logs.push({
      tool: run.tool,
      args: run.args,
      code: run.code,
      seconds: run.seconds,
      text: run.text,
    });
    result.warnings.push(...run.warnings);
    result.errors.push(...run.errors);
    if (run.leaked) {
      result.leak = leakOf(run.text, base, mapText);
      result.errors.push(leakSentence(result.leak));
    }
    // the programs after a failed one would only fail on what it left
    if (result.errors.length) break;
  }
  if (!result.errors.length && !existsSync(`${base}.bsp`))
    result.errors.push("compileMap: the compilers ended well and left no .bsp: read their logs");
  if (!result.errors.length) {
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(`${base}.bsp`, target);
    result.bsp = target;
  } else if (existsSync(target)) {
    result.warnings.push(`an older ${target} was left as it was: it is not the result of this compile`);
  }
  if (keep) result.work = work;
  else rmSync(work, { recursive: true, force: true });
  return result;
}

/**
 * What a compile said, in a few lines for a person or a log: each program with its time and how it ended,
 * then the errors, the leak and the warnings.
 */
export function compileSummary(result) {
  const lines = result.logs.map(
    (log) => `${log.tool}  ${log.seconds.toFixed(1)} s  ${log.code === 0 ? "ended" : `code ${log.code}`}`,
  );
  for (const error of result.errors) lines.push(`error: ${error}`);
  for (const warning of result.warnings) lines.push(`warning: ${warning}`);
  lines.push(result.bsp ? `compiled: ${result.bsp}` : "not compiled");
  return lines.join("\n");
}
