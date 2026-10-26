// A map's PHYSCOLLIDE lump: each model's collision for VPhysics (props landing on the world, a door pushing a
// player), made by GMod's own vphysics through src/source/vcollide.cpp, then laid out as vbsp does (Source SDK
// 2013 src/utils/vbsp/ivp.cpp): for each model a dphysmodel_t, each solid's size and bytes, then the text that
// says what the solids are; a model index of -1 ends the list. Ported from stevenlafl's tools/map/vcollide.mjs.
//
//   physCollideLump(models, { materials, surfaceprops })   the lump's bytes; throws, saying what is missing
//   findVphysics({ file, gmod })                     GMod's bin/win64/vphysics.dll
//   vcollideHelper({ file })                         the helper, built once with Visual Studio into ~/.smak/
//
// The format is vphysics' own and nothing documents it, so the DLL that reads it writes it: like studiomdl, an
// outside program the person has with the game. SMAK_VPHYSICS and SMAK_VCOLLIDE name them where they are not
// found.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findGmod } from "./compile.mjs";

const SOURCE = join(dirname(fileURLToPath(import.meta.url)), "vcollide.cpp");
const TIMEOUT = 5 * 60 * 1000;

// bspflags.h MASK_SOLID: SOLID | MOVEABLE | WINDOW | MONSTER | GRATE
const MASK_SOLID = 0x1 | 0x4000 | 0x2 | 0x2000000 | 0x8;
// a brush entity's mass is its volume at the "default" surface's density (2000 kg/m^3), at most 100 t. vbsp takes
// its surfaceprop's density; GoldSrc weighs nothing, and stevenlafl keeps every brush entity as heavy as this
const DENSITY = 2000;
const CUBIC_METERS_PER_CUBIC_INCH = 0.0254 ** 3;
const MAX_MASS = 100000;

/** GMod's 64-bit vphysics.dll: `file`, else SMAK_VPHYSICS, else GMod's own. Throws, saying what it is, when none. */
export function findVphysics({ file, gmod, env = process.env } = {}) {
  const told = file ?? env.SMAK_VPHYSICS;
  if (told) {
    if (!existsSync(told)) throw new Error(`no vphysics at ${told}`);
    return resolve(told);
  }
  const game = gmod ?? findGmod({ env });
  const own = game && join(game, "bin", "win64", "vphysics.dll");
  if (own && existsSync(own)) return own;
  throw new Error(`no vphysics: GMod's physics library (bin/win64/vphysics.dll), which writes a map's collision. Install GMod from Steam, or name it with SMAK_VPHYSICS`); // prettier-ignore
}

// Visual Studio's C++ compiler for x64, and the Windows SDK's headers and libraries, found as vswhere finds them
// (vcvars64.bat is not run: a quote in the PATH stops it)
function visualStudio() {
  const vswhere = join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Microsoft Visual Studio", "Installer", "vswhere.exe");
  if (!existsSync(vswhere)) return null;
  const found = spawnSync(vswhere, ["-latest", "-products", "*", "-requires", "Microsoft.VisualStudio.Component.VC.Tools.x86.x64", "-property", "installationPath"], { encoding: "utf8", windowsHide: true }); // prettier-ignore
  const install = found.stdout?.trim().split(/\r?\n/)[0];
  if (!install) return null;
  const versionFile = join(install, "VC", "Auxiliary", "Build", "Microsoft.VCToolsVersion.default.txt");
  if (!existsSync(versionFile)) return null;
  const msvc = join(install, "VC", "Tools", "MSVC", readFileSync(versionFile, "utf8").trim());
  const kits = join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Windows Kits", "10");
  const sdk = existsSync(join(kits, "Include"))
    ? readdirSync(join(kits, "Include")).filter((v) => existsSync(join(kits, "Include", v, "ucrt"))).sort().at(-1)
    : null;
  if (!sdk) return null;
  return {
    cl: join(msvc, "bin", "Hostx64", "x64", "cl.exe"),
    include: [join(msvc, "include"), ...["ucrt", "um", "shared"].map((d) => join(kits, "Include", sdk, d))].join(";"),
    lib: [join(msvc, "lib", "x64"), ...["ucrt", "um"].map((d) => join(kits, "Lib", sdk, d, "x64"))].join(";"),
  };
}

/**
 * The helper that calls vphysics: `file`, else SMAK_VCOLLIDE, else built from vcollide.cpp with Visual Studio into
 * ~/.smak/ (once for each version of the source). Throws, saying what is missing, when it can be neither found
 * nor built.
 */
export function vcollideHelper({ file, env = process.env } = {}) {
  const told = file ?? env.SMAK_VCOLLIDE;
  if (told) {
    if (!existsSync(told)) throw new Error(`no vcollide helper at ${told}`);
    return resolve(told);
  }
  const source = readFileSync(SOURCE);
  const built = join(homedir(), ".smak", `vcollide-${createHash("sha1").update(source).digest("hex").slice(0, 12)}.exe`);
  if (existsSync(built)) return built;
  if (process.platform !== "win32") throw new Error(`no vcollide helper: build src/source/vcollide.cpp for your vphysics (g++ -O2 -o vcollide vcollide.cpp -ldl) and name it with SMAK_VCOLLIDE`); // prettier-ignore
  const vs = visualStudio();
  if (!vs || !existsSync(vs.cl)) throw new Error(`no C++ compiler for the vcollide helper: install Visual Studio's C++ build tools (x64) with a Windows SDK, or build src/source/vcollide.cpp yourself and name it with SMAK_VCOLLIDE`); // prettier-ignore
  mkdirSync(dirname(built), { recursive: true });
  const work = mkdtempSync(join(tmpdir(), "smak-vcollide-build-"));
  try {
    const result = spawnSync(vs.cl, ["/nologo", "/O2", "/EHsc", "/MT", SOURCE, `/Fe:${built}`, `/Fo:${join(work, "vcollide.obj")}`], {
      cwd: work,
      env: { ...process.env, INCLUDE: vs.include, LIB: vs.lib },
      encoding: "latin1",
      windowsHide: true,
    });
    if (result.status !== 0 || !existsSync(built))
      throw new Error(`the vcollide helper did not build: ${`${result.stdout ?? ""}${result.stderr ?? ""}`.split(/\r?\n/).filter((l) => /error/i.test(l)).slice(0, 3).join(" | ") || result.error?.message}`); // prettier-ignore
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  return built;
}

/**
 * The PHYSCOLLIDE lump. `models`: for each model of the map, the convex brushes it collides with (model 0 is the
 * world), each `{ planes, mins, maxs }` or only its planes, `{ normal, dist, material }` facing out of it. A world
 * plane's `material` is its surfaceprop's number in `materials` plus 1 (the world's `materialtable`, at most 126,
 * as vbsp's RemapWorldMaterial), 0 for `default`: each of the world's triangles takes the material of the side it
 * lies on (stevenlafl's). `surfaceprops[model]`: a brush entity's one surfaceprop. `vphysics` and `helper`: as
 * findVphysics and vcollideHelper find them, when not given.
 */
export function physCollideLump(models, { materials = [], surfaceprops = [], vphysics, helper, gmod } = {}) {
  if (materials.length > 126) throw new Error(`physCollideLump: ${materials.length} world materials, 126 at most`);
  const library = findVphysics({ file: vphysics, gmod });
  const program = vcollideHelper({ file: helper });
  const work = mkdtempSync(join(tmpdir(), "smak-vcollide-"));
  try {
    const solids = models.map((convexes, index) => ({ index, convexes })).filter((m) => m.convexes.length);
    const parts = [];
    const int = (v) => {
      const b = Buffer.alloc(4);
      b.writeInt32LE(v);
      parts.push(b);
    };
    int(solids.length);
    for (const { index, convexes } of solids) {
      int(index === 0 ? 0 : 1);
      int(convexes.length);
      for (const convex of convexes) {
        const planes = Array.isArray(convex) ? convex : convex.planes;
        int(planes.length);
        // no box: one too big for the helper's grid, so its triangles are looked for in it everywhere
        const box = Buffer.alloc(24);
        [...(convex.mins ?? [-1e6, -1e6, -1e6]), ...(convex.maxs ?? [1e6, 1e6, 1e6])].forEach((v, k) => box.writeFloatLE(v, k * 4));
        parts.push(box);
        const b = Buffer.alloc(planes.length * 20);
        planes.forEach((p, k) => {
          b.writeFloatLE(p.normal[0], k * 20);
          b.writeFloatLE(p.normal[1], k * 20 + 4);
          b.writeFloatLE(p.normal[2], k * 20 + 8);
          b.writeFloatLE(p.dist, k * 20 + 12);
          b.writeInt32LE(index === 0 ? (p.material ?? 0) : 0, k * 20 + 16);
        });
        parts.push(b);
      }
    }
    writeFileSync(join(work, "in"), Buffer.concat(parts));
    const run = spawnSync(program, [library, join(work, "in"), join(work, "out")], {
      cwd: dirname(library),
      encoding: "latin1",
      timeout: TIMEOUT,
      windowsHide: true,
    });
    if (run.status !== 0 || !existsSync(join(work, "out")))
      throw new Error(`vphysics made no collision: ${(run.stderr || run.stdout || run.error?.message || `exit ${run.status}`).trim()}`);
    const out = readFileSync(join(work, "out"));
    let at = 0;
    const lump = [];
    for (const { index } of solids) {
      const size = out.readInt32LE(at);
      const collide = out.subarray(at + 4, at + 4 + size);
      const volume = out.readFloatLE(at + 4 + size);
      at += 8 + size;
      if (!size) continue;
      const mass = Math.min(MAX_MASS, Math.max(1, volume * DENSITY * CUBIC_METERS_PER_CUBIC_INCH));
      const table = materials.length ? `materialtable {\n${materials.map((m, k) => `"${m}" "${k + 1}"\n`).join("")}}\n` : "";
      const text =
        index === 0
          ? `staticsolid {\n"index" "0"\n"contents" "${MASK_SOLID}"\n}\n${table}`
          : `solid {\n"index" "0"\n"mass" "${mass.toFixed(6)}"\n"surfaceprop" "${surfaceprops[index] ?? "default"}"\n}\n`;
      const keydata = Buffer.from(`${text}\0`, "latin1");
      const head = Buffer.alloc(16);
      head.writeInt32LE(index, 0);
      head.writeInt32LE(4 + size, 4);
      head.writeInt32LE(keydata.length, 8);
      head.writeInt32LE(1, 12);
      const sizeBytes = Buffer.alloc(4);
      sizeBytes.writeInt32LE(size);
      lump.push(head, sizeBytes, collide, keydata);
    }
    const end = Buffer.alloc(16);
    end.writeInt32LE(-1, 0);
    end.writeInt32LE(-1, 4);
    lump.push(end);
    return Buffer.concat(lump);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
