// A Source model read whole and drawn by the kit's own renderer: its .mdl, .vvd and .vtx, and for each material
// its VMT and the VTF that names, found among a game's folders and packs as the engine finds them.
//
//   sourceFiles({ folders, vpks })        the files of a game: { has(path), read(path) }, folders before packs
//   gmodFiles(gmod, { more })             GMod's: garrysmod/, its addons, and its packs (Half-Life 2's among them)
//   readSourceModel(path, files)          { mdl, triangles, materials: [{ name, vmt, shader, texture, flags }] }
//   sourceTris(model, { body, skin })     the triangles as render() draws them (its `tris` option)
//   renderSource(model, options)          render(), sheet() for a Source model: render's options and body, skin
//
// A material is looked for in each of the model's cdmaterials folders in turn, as the engine does. A VMT's
// $basetexture names its VTF; $alphatest is drawn as a GoldSrc mask is, $additive as additive, UnlitGeneric
// unlit. A material that is not found is drawn grey and said in `missing`.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { readSourceMdl } from "./mdl.mjs";
import { readVvd, readVtx, sourceTriangles } from "./mesh.mjs";
import { readVtf } from "./vtf.mjs";
import { openVpk } from "./vpk.mjs";
import { render, sheet, TEXTURE } from "../render.mjs";

const isFolder = (folder) => {
  try {
    return statSync(folder).isDirectory();
  } catch {
    return false;
  }
};
/** A path as the engine reads one: forward slashes, no leading slash. */
const clean = (path) => path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\//, "");

/**
 * A game's files: each folder in turn (an addon, the game's own), then each pack (a _dir.vpk's path). `has` and
 * `read` take a path under the game (models/kleiner.mdl), in any case where a pack has it.
 */
export function sourceFiles({ folders = [], vpks = [] } = {}) {
  const packs = vpks.map(openVpk);
  const inFolder = (path) => folders.map((folder) => join(folder, clean(path))).find((file) => existsSync(file));
  return {
    has: (path) => Boolean(inFolder(path)) || packs.some((pack) => pack.has(clean(path))),
    read(path) {
      const file = inFolder(path);
      if (file) return readFileSync(file);
      const pack = packs.find((p) => p.has(clean(path)));
      if (!pack) throw new Error(`${path} is in none of the game's folders or packs`);
      return pack.read(clean(path));
    },
  };
}

/**
 * GMod's files, as the game finds them: `more` folders first (a port's addon folder), then garrysmod/, each of its
 * addons/, and the packs of garrysmod/ and sourceengine/ (Half-Life 2's models and textures).
 */
export function gmodFiles(gmod, { more = [] } = {}) {
  const game = join(gmod, "garrysmod");
  const addons = join(game, "addons");
  const folders = [...more, game, ...(isFolder(addons) ? readdirSync(addons).map((name) => join(addons, name)).filter(isFolder) : [])]; // prettier-ignore
  const packsIn = (folder) => (isFolder(folder) ? readdirSync(folder).filter((name) => /_dir\.vpk$/i.test(name)).map((name) => join(folder, name)) : []); // prettier-ignore
  return sourceFiles({ folders, vpks: [...packsIn(game), ...packsIn(join(gmod, "sourceengine"))] });
}

/** A VMT's shader and its keys (lower case), the nested blocks (proxies, fallbacks) left out. */
export function readVmt(text) {
  const tokens = [...String(text).replace(/\/\/[^\n]*/g, "").matchAll(/"([^"]*)"|([{}])|([^\s{}"]+)/g)].map((m) => m[1] ?? m[2] ?? m[3]); // prettier-ignore
  const shader = tokens[0] ?? "";
  const keys = {};
  let depth = 0;
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === "{") depth++;
    else if (token === "}") depth--;
    else if (depth === 1 && tokens[i + 1] !== "{" && tokens[i + 1] !== undefined && tokens[i + 1] !== "}") {
      keys[token.toLowerCase()] = tokens[i + 1];
      i++;
    }
  }
  return { shader, keys };
}

/** A material of the model: its VMT found in one of the cdmaterials folders, and the VTF it names. */
function materialOf(name, cdmaterials, files) {
  for (const folder of cdmaterials) {
    const path = clean(`materials/${folder}/${name}.vmt`);
    if (!files.has(path)) continue;
    const { shader, keys } = readVmt(files.read(path).toString("latin1"));
    const base = keys.$basetexture;
    const vtf = base ? clean(`materials/${base.replace(/\.vtf$/i, "")}.vtf`) : null;
    let texture = null;
    if (vtf && files.has(vtf))
      try {
        texture = readVtf(files.read(vtf));
      } catch {
        // a picture of a format not read here: drawn grey
      }
    const on = (key) => keys[key] !== undefined && keys[key] !== "0";
    const flags =
      (on("$alphatest") || on("$translucent") ? TEXTURE.masked : 0) |
      (on("$additive") ? TEXTURE.additive : 0) |
      (/unlit/i.test(shader) ? TEXTURE.fullbright : 0);
    return { name, vmt: path, shader, texture, flags };
  }
  return { name, vmt: null, shader: null, texture: null, flags: 0 };
}

/**
 * A Source model read whole: `path` its .mdl under the game (models/kleiner.mdl), `files` the game's
 * (sourceFiles, gmodFiles). Its triangles are of LOD 0, from the dx90 .vtx (dx80, then .vtx, when that is not
 * there). `missing`: the materials found in none of the folders.
 */
export function readSourceModel(path, files) {
  const stem = clean(path).replace(/\.mdl$/i, "");
  const mdl = readSourceMdl(files.read(`${stem}.mdl`));
  const vtxPath = [".dx90.vtx", ".dx80.vtx", ".vtx"].map((ext) => stem + ext).find((p) => files.has(p));
  if (!vtxPath) throw new Error(`${stem}: no .vtx beside the .mdl`);
  const triangles = sourceTriangles(mdl, readVvd(files.read(`${stem}.vvd`)), readVtx(files.read(vtxPath)));
  const materials = mdl.materials.map((name) => materialOf(name, mdl.cdmaterials, files));
  return { mdl, triangles, materials, missing: materials.filter((m) => !m.vmt).map((m) => m.name) };
}

/**
 * The model's triangles as render draws them, for a body number and a skin family: { tex, where, tri, c: [{ p, n,
 * u, v, bone }] }, u and v in the texture's pixels.
 */
export function sourceTris(model, { body = 0, skin = 0 } = {}) {
  const { mdl, triangles, materials } = model;
  const shown = mdl.bodyparts.map((part) => (part.models.length ? Math.floor(body / Math.max(1, part.base)) % part.models.length : 0)); // prettier-ignore
  const family = mdl.skins[skin] ?? mdl.skins[0] ?? [];
  const texOf = new Map();
  const tex = (number) => {
    if (!texOf.has(number)) {
      const material = materials[number];
      const picture = material?.texture;
      texOf.set(number, picture ? { name: material.name, width: picture.width, height: picture.height, flags: material.flags, rgba: picture.rgba } : null); // prettier-ignore
    }
    return texOf.get(number);
  };
  const tris = [];
  for (const t of triangles) {
    if (shown[t.bodypart] !== t.model) continue;
    const mesh = mdl.bodyparts[t.bodypart].models[t.model].meshes[t.mesh];
    const texture = tex(family[mesh.material] ?? mesh.material);
    tris.push({
      tex: texture,
      where: { bodypart: t.bodypart, model: t.model, mesh: t.mesh },
      tri: tris.length,
      c: t.corners.map((c) => ({
        p: c.p,
        n: c.n,
        u: c.uv[0] * (texture?.width ?? 1),
        v: c.uv[1] * (texture?.height ?? 1),
        bone: c.bones[0]?.[0] ?? 0,
      })),
    });
  }
  return tris;
}

/** A Source model drawn: render's options (view, yaw, pitch, width ...), and `body`, `skin`; `sheet: true` six views. */
export function renderSource(model, options = {}) {
  const tris = sourceTris(model, options);
  return options.sheet ? sheet(null, { ...options, tris }) : render(null, { ...options, tris });
}
