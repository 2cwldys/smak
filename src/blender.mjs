// Blender, where the machine has it: the one thing in the kit that is not plain JavaScript, and nothing else
// needs it. It is found (the SMAK_BLENDER environment variable, the usual places it is installed, the PATH), run
// headless on a script and a JSON file, and the float pictures it writes are read back. One bake comes with the
// kit: a detailed copy's colours, occlusion and normals laid onto a plain one's picture (selected to active).
//
//   findBlender({ blender })                      the program's path, or null
//   runBlender(script, args, { blender, timeout })  headless, the script's lines that begin with `[smak]`
//   runBlenderJob(script, input, outDir, options)   input written as JSON in outDir, the script given it and outDir
//   readFloatMap(file)                            a raw float32 RGBA picture and its .json: rows from the top
//   bakeMaps(pairs, { width, height, outDir, maps, ao, cage, distance, samples, occluders, blender })
//
// Without Blender, findBlender gives null and the rest throw, saying where it was looked for.
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, delimiter } from "node:path";
import { fileURLToPath } from "node:url";

/** The environment variable that names Blender's program. */
export const BLENDER_VARIABLE = "SMAK_BLENDER";
/** Where Blender is installed on each system, newest version first where a folder holds several. */
const PLACES = {
  win32: ["C:/Program Files/Blender Foundation", "C:/Program Files (x86)/Blender Foundation"],
  darwin: ["/Applications/Blender.app/Contents/MacOS/Blender"],
  linux: ["/usr/bin/blender", "/usr/local/bin/blender", "/snap/bin/blender", "/opt/blender/blender"],
};
const PROGRAM = process.platform === "win32" ? "blender.exe" : "blender";

/** The versions in a folder such as "Blender Foundation", newest first: "Blender 5.2" before "Blender 4.10". */
const versionsIn = (folder) => {
  if (!existsSync(folder)) return [];
  const number = (name) => (name.match(/\d+/g) ?? []).map(Number);
  return readdirSync(folder)
    .filter((name) => /blender/i.test(name) && existsSync(join(folder, name, PROGRAM)))
    .sort((a, b) => {
      const x = number(a);
      const y = number(b);
      for (let i = 0; i < Math.max(x.length, y.length); i++)
        if ((y[i] ?? 0) !== (x[i] ?? 0)) return (y[i] ?? 0) - (x[i] ?? 0);
      return 0;
    })
    .map((name) => join(folder, name, PROGRAM));
};

/** Every place Blender is looked for, in order. */
export function blenderPlaces({ blender } = {}) {
  const out = [];
  if (blender) out.push(blender);
  if (process.env[BLENDER_VARIABLE]) out.push(process.env[BLENDER_VARIABLE]);
  for (const place of PLACES[process.platform] ?? []) {
    const inside = versionsIn(place);
    out.push(...(inside.length ? inside : [place]));
  }
  for (const folder of (process.env.PATH ?? "").split(delimiter)) if (folder) out.push(join(folder, PROGRAM));
  return out;
}

/** Blender's program: the one given, SMAK_BLENDER, the usual places, then the PATH; null when none is there. */
export function findBlender(options = {}) {
  return blenderPlaces(options).find((p) => existsSync(p) && !/Blender Foundation$/.test(p)) ?? null;
}

const needBlender = (options) => {
  const found = findBlender(options);
  if (!found)
    throw new Error(
      `Blender was not found: set ${BLENDER_VARIABLE} to its program (looked in ${blenderPlaces(options).slice(0, 6).join(", ")} and the PATH)`,
    );
  return found;
};

/**
 * Runs a Python script in Blender, headless and with its factory settings: `blender -b --factory-startup
 * --python script -- ...args`. Returns { lines (those the script printed beginning with "[smak]", without it),
 * log (all it printed) }. Throws with the end of the log when Blender fails.
 */
export function runBlender(script, args = [], { blender, timeout = 30 * 60 * 1000 } = {}) {
  const program = needBlender({ blender });
  const path = script instanceof URL ? fileURLToPath(script) : script;
  let log;
  try {
    log = execFileSync(program, ["-b", "--factory-startup", "--python", path, "--", ...args.map(String)], {
      encoding: "utf8",
      maxBuffer: 1 << 28,
      timeout,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    const said = `${e.stdout ?? ""}${e.stderr ?? ""}`.split("\n").slice(-12).join("\n");
    throw new Error(`Blender failed on ${path}: ${e.message.split("\n")[0]}\n${said}`);
  }
  // Blender says a script's own error on its output and still ends well: that is a failure here
  if (/Traceback \(most recent call last\)/.test(log)) {
    const at = log.indexOf("Traceback");
    throw new Error(`Blender's script ${path} failed:\n${log.slice(at, at + 2000)}`);
  }
  const lines = log
    .split(/\r?\n/)
    .filter((l) => l.startsWith("[smak]"))
    .map((l) => l.slice(7));
  return { lines, log };
}

/** `input` written as input.json in `outDir`, and the script run on it: `-- input.json outDir`. */
export function runBlenderJob(script, input, outDir, options = {}) {
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, "input.json");
  writeFileSync(file, JSON.stringify(input));
  return runBlender(script, [file, outDir], options);
}

/**
 * A picture Blender wrote as raw float32 RGBA with a .json of its size beside it: { width, height, data }, data
 * four floats a pixel, rows from the top (Blender keeps them from the bottom).
 */
export function readFloatMap(file) {
  const { width, height } = JSON.parse(readFileSync(file + ".json", "utf8"));
  const buf = readFileSync(file);
  if (buf.length !== width * height * 16)
    throw new Error(`readFloatMap: ${file} is not ${width} by ${height} RGBA floats`);
  const raw = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
  const data = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y++)
    data.set(raw.subarray((height - 1 - y) * width * 4, (height - y) * width * 4), y * width * 4);
  return { width, height, data };
}

/** The bake's script, which comes with the kit. */
export const BAKE_SCRIPT = new URL("./blender-bake.py", import.meta.url);

/**
 * A detailed copy baked onto a plain one, selected to active, in Blender.
 *   pairs     [{ low: { tris, uv }, high: { tris, colours } }]: `tris` triangles of points (or of { p }) in one
 *             space for all; `uv` each low triangle's corners on the picture, in pixels; `colours` one [r, g, b]
 *             (0 to 1) a high triangle (grey when not given)
 *   width, height   the picture's size
 *   outDir    where the maps are written (and input.json)
 *   maps      which: "albedo" (the high pieces' colours), "ao" (their occlusion, `ao` units out: 1), "normal"
 *             (their normals in that space, 0 to 1). All three unless told
 *   cage, distance   how far out the rays start (0.1) and how far they look (0.5), units
 *   samples   Cycles' samples a pixel (16); `occluders`: triangles that only cast shadow
 * Returns { albedo, ao, normal } as `readFloatMap` gives them (rows from the top), and `lines`, what it said.
 */
export function bakeMaps(
  pairs,
  {
    width,
    height,
    outDir,
    maps = ["albedo", "ao", "normal"],
    ao = 1,
    cage = 0.1,
    distance = 0.5,
    samples = 16,
    margin = 2,
    occluders = [],
    blender,
  } = {},
) {
  if (!width || !height || !outDir) throw new Error("bakeMaps: give width, height and outDir");
  const points = (tris) => tris.map((t) => t.map((c) => c.p ?? c));
  const input = {
    width,
    height,
    maps,
    ao,
    cage,
    distance,
    samples,
    margin,
    pairs: pairs.map(({ low, high }) => ({
      low: { tris: points(low.tris), uv: low.uv },
      high: { tris: points(high.tris), colours: high.colours ?? null },
    })),
    occluders: points(occluders),
  };
  const { lines } = runBlenderJob(BAKE_SCRIPT, input, outDir, { blender });
  const out = { lines };
  for (const name of maps) out[name] = readFloatMap(join(outDir, name));
  return out;
}
