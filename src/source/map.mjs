// A GoldSrc map (BSP 30) rewritten as a Source map (BSP 20, what GMod loads), keeping its compiled geometry, baked
// light and visibility: no decompile, no Valve compiler. Ported from stevenlafl's map converter for their port of
// The Specialists to GMod (tools/convert-map.mjs, tools/map/lights.mjs and docs/bsp-goldsrc-to-source.md, where
// each rule was found in the game); made general here, for any GoldSrc game.
//
//   portMapToSource(file, { name, folder, folders, valve, physics })
//     -> { name, bsp (the map's bytes), files: [{ path, data }] (under the addon), props: [{ file, model }],
//          physics (each model's convex brushes), warnings, facts }
//   portMapToGmod(file, { out, ... })   the same, with its physics, written as an addon (out/addon/maps/<name>.bsp),
//                                       its props ported by portToGmod
//
// WHERE THE TEXTURES GO. A wad's textures are shared files of the addon, materials/<folder>/<wad>/<texture>, worn
// by every map that wears them. A texture the map carries inside itself goes inside the Source map, in its
// PAKFILE, as materials/<folder>/maps/<map>/<texture>. So does every file that comes from Valve's `valve` folder
// (a wad, a sky, a sprite only Half-Life has): inside the map it is part of the converted map, never a loose file
// of Valve's in the addon (stevenlafl's call for their port, 2026-10-22, extended here to skies and sprites).
//
// WHAT IS LEFT. Outputs (GoldSrc's targets as Source's I/O), water surfaces, animated textures and decals, as in
// stevenlafl's converter. `physics` makes the PHYSCOLLIDE lump (physCollideLump, with GMod's own vphysics); without
// it the map has none, and Lua's traces and props fall through the world.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { findHalfLife } from "../maps/games.mjs";
import { physCollideLump } from "./vcollide.mjs";
import { portToGmod } from "./gmod.mjs";
import { readBsp, leafAt, faceLightmap, facePolygon, faceNormal, visibleFrom, embeddedTexture } from "../maps/bsp.mjs";
import { textureKind, textureRgba } from "../maps/miptex.mjs";
import { mapOwnFolders, texturesFor } from "../maps/wad.mjs";
import { skyOf, SKY_SIDES } from "../maps/sky.mjs";
import { readSpr } from "../maps/sprites.mjs";
import { inFolders } from "../maps/files.mjs";
import { readStudio } from "../studio-file.mjs";
import { sequences } from "../mdl.mjs";
import { writeVtf, bleedHoles, powerOfTwo, VTF_FLAG } from "./vtf.mjs";
import { CONTENTS, SOURCE_LUMP as LUMP, Packer, SURF, colorRgbExp, storedZip, visibilityLump, writeSourceBsp } from "./bsp.mjs";
import { brushesOfTree, clipBrushesOf, regionOf } from "./mapbrushes.mjs";

// GoldSrc's contents (bspfile.h)
const GS = { EMPTY: -1, SOLID: -2, WATER: -3, SLIME: -4, LAVA: -5, SKY: -6 };
const TEX_SPECIAL = 1;
const NO_STYLE = 255;
const LUXEL = 16;
// GoldSrc shows a texture at texture x sample x 2 / 255 (gl_overbright 1, maps/light.mjs). Source's LDR lightmap
// shader shows texture x 2 x (linear / 2)^(1/2.2), so the sample's linear light is 2 (sample / 255)^2.2. Times
// 255: ColorRGBExp32 counts in 255ths.
const toLinear255 = (v) => 2 * (v / 255) ** 2.2 * 255;
const LEAF_FLAGS_SKY2D = 0x4;
// one ambient sample a leaf, a third of its faces' light: about what vrad's own room had
const AMBIENT_SHARE = 1 / 3;
const AREA_WORLD = 1;
// GoldSrc's player origin is the middle of its 72 high hull, Source's its feet
const HULL_HALF_HEIGHT = 36;
const PLAYER_STARTS = new Set(["info_player_start", "info_player_deathmatch", "info_player_coop", "info_player_team1", "info_player_team2"]); // prettier-ignore
// the sky a map gets when its own is not found: one of GMod's
const GMOD_SKY = "sky_day01_01";

const numbersOf = (text) => (text ?? "").trim().split(/\s+/).filter(Boolean).map(Number);
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** A material name Source's file system takes: lower case, the GoldSrc prefixes spelled out. */
export function materialName(name) {
  return name
    .toLowerCase()
    .replace(/^\{/, "mask_")
    .replace(/^!/, "water_")
    .replace(/^\+/, "anim_")
    .replace(/^-/, "rand_")
    .replace(/^\*/, "warp_")
    .replace(/~/g, "lit_")
    .replace(/[^a-z0-9_]/g, "_");
}

// GoldSrc warps a liquid's texture as it draws it; Source's own water wants fog volumes these maps do not have.
// This moves it instead: the texture twice, as itself and as its detail (mod2x, so the brightness holds),
// drifting different ways
const waterMotion = (path) => [
  `\t"$detail" "${path}"`,
  '\t"$detailscale" "1"',
  '\t"$detailblendmode" "0"',
  '\t"Proxies"\n\t{\n' +
    '\t\t"TextureScroll"\n\t\t{\n\t\t\t"texturescrollvar" "$basetexturetransform"\n\t\t\t"texturescrollrate" "0.04"\n\t\t\t"texturescrollangle" "30"\n\t\t}\n' +
    '\t\t"TextureScroll"\n\t\t{\n\t\t\t"texturescrollvar" "$detailtexturetransform"\n\t\t\t"texturescrollrate" "0.03"\n\t\t\t"texturescrollangle" "160"\n\t\t}\n\t}',
];

const vmt = (shader, params) => Buffer.from(`"${shader}"\n{\n${params.join("\n")}\n}\n`, "latin1");

/**
 * A GoldSrc map as a Source map. `name`: the map's name in Source (the file's, unless given). `folder`: the
 * addon's own folder under materials/ (smak). `folders`: more game folders to look for wads, skies, sprites and
 * models in, after the map's own (a mod's folder). `valve`: Half-Life's valve folder, looked in last; its files
 * go inside the map. `physics(models, { materials, surfaceprops })`: the PHYSCOLLIDE lump made from each model's
 * convex brushes (physCollideLump's), or null.
 */
export function portMapToSource(file, { name, folder = "smak", folders = [], valve, physics } = {}) {
  const mapName = (name ?? basename(file).replace(/\.bsp$/i, "")).toLowerCase();
  const warnings = [];
  const files = [];
  const packed = [];
  // a file of Valve's, or of the map itself, goes inside the map; the rest are the addon's shared files
  const toAddon = (path, data) => files.push({ path, data });
  const toPak = (path, data) => packed.push({ name: path, bytes: data });
  const valveDir = valve ? resolve(valve) : null;
  const isValves = (path) => !!valveDir && resolve(path).toLowerCase().startsWith(valveDir.toLowerCase() + sep);
  const bsp = readBsp(readFileSync(file));
  const searched = [...new Set([...mapOwnFolders(file), ...folders, ...(valveDir ? [valveDir] : [])].map((f) => resolve(f)))];
  const world = bsp.models[0];

  // a material as its two files: the picture made a power of two each way
  const writeMaterial = (put, path, image, { alpha = false, keepHoles = false, shader = "LightmappedGeneric", extra = [], clamp = false } = {}) => {
    const sized = powerOfTwo(image, { alpha });
    put(`materials/${path}.vtf`, writeVtf(sized, { alpha, keepHoles, flags: clamp ? VTF_FLAG.CLAMPS | VTF_FLAG.CLAMPT : 0 }));
    put(`materials/${path}.vmt`, vmt(shader, [`\t"$basetexture" "${path}"`, ...(alpha ? ['\t"$alphatest" "1"'] : []), ...extra]));
    return { width: sized.width, height: sized.height };
  };

  // ── textures ──
  const typeOf = textureTypes(searched);
  const fromWads = texturesFor(bsp, searched, { pixels: true });
  if (fromWads.missing.length) warnings.push(`textures in no wad found, drawn as nothing: ${fromWads.missing.slice(0, 8).join(" ")}${fromWads.missing.length > 8 ? ` and ${fromWads.missing.length - 8} more` : ""}`); // prettier-ignore
  const strings = [];
  const texdata = [];
  const addTexdata = (path, width, height, reflectivity = [0.5, 0.5, 0.5]) => {
    strings.push(path);
    texdata.push({ path, width, height, reflectivity, string: strings.length - 1 });
    return texdata.length - 1;
  };
  const SKYBOX = addTexdata("tools/toolsskybox", 256, 256);
  const NODRAW = addTexdata("tools/toolsnodraw", 64, 64);
  const TRIGGER = addTexdata("tools/toolstrigger", 64, 64);
  const wadUsed = new Set();
  const textures = bsp.textures.map((entry, index) => {
    if (entry.absent) return { texdata: NODRAW, scaleS: 1, scaleT: 1, kind: {} };
    const kind = textureKind(entry.name);
    if (kind.sky) return { texdata: SKYBOX, scaleS: 1, scaleT: 1, kind };
    if (entry.name.toLowerCase() === "aaatrigger") return { texdata: TRIGGER, scaleS: 1, scaleT: 1, kind };
    let texture = embeddedTexture(bsp, index);
    let wad = null;
    let valves = false;
    if (!texture) {
      const found = fromWads.textures.find((t) => t.name.toLowerCase() === entry.name.toLowerCase());
      if (!found?.texture) return { texdata: NODRAW, scaleS: 1, scaleT: 1, kind };
      texture = found.texture;
      wad = found.wad.replace(/\.wad$/i, "");
      valves = isValves(found.path);
    }
    wadUsed.add(wad ?? "the map itself");
    const inMap = !wad || valves;
    const path = !wad
      ? `${folder}/maps/${mapName}/${materialName(entry.name)}`
      : valves
        ? `${folder}/maps/${mapName}/${materialName(wad)}/${materialName(entry.name)}`
        : `${folder}/${materialName(wad)}/${materialName(entry.name)}`;
    const image = textureRgba(texture);
    // a hole takes its neighbours' colour, or GoldSrc's see-through blue bleeds into the edge once filtered
    if (kind.holes) bleedHoles(image.rgba, image.width, image.height);
    const put = inMap ? toPak : toAddon;
    const surfaceprop = kind.water ? "water" : surfacepropOfType(typeOf(entry.name));
    const size = writeMaterial(put, path, image, {
      alpha: kind.holes,
      keepHoles: kind.holes,
      shader: kind.water ? "UnlitGeneric" : "LightmappedGeneric",
      extra: [`\t"$surfaceprop" "${surfaceprop}"`, ...(kind.water ? waterMotion(path) : [])],
    });
    const sum = [0, 0, 0];
    for (let i = 0; i < image.rgba.length; i += 4) for (let c = 0; c < 3; c++) sum[c] += image.rgba[i + c];
    const n = image.rgba.length / 4;
    const reflectivity = sum.map((c) => (c / n / 255) ** 2.2);
    return { texdata: addTexdata(path, size.width, size.height, reflectivity), scaleS: size.width / entry.width, scaleT: size.height / entry.height, kind, path, put, size, reflectivity, surfaceprop }; // prettier-ignore
  });
  const sidesSurfaceprop = (side) => {
    const ti = side.texinfo === NODRAW_INFO ? null : bsp.texinfo[side.texinfo];
    return ti && textures[ti.texture]?.surfaceprop;
  };

  // the sky: GoldSrc's gfx/env/<skyname><side>.tga as Source's materials/skybox/<folder>_<skyname><side>
  const worldspawn = Object.fromEntries(bsp.entities[0] ?? []);
  const skyName = (worldspawn.skyname || "desert").toLowerCase();
  const sky = skyOf(skyName, searched);
  let sourceSky = GMOD_SKY;
  if (sky.sides) {
    sourceSky = `${folder}_${skyName}`;
    const put = sky.files?.some(isValves) ? toPak : toAddon;
    SKY_SIDES.forEach((side, k) => {
      const { width, height, rgb } = sky.sides[k];
      const rgba = new Uint8Array(width * height * 4);
      for (let p = 0; p < width * height; p++) {
        rgba.set(rgb.subarray(p * 3, p * 3 + 3), p * 4);
        rgba[p * 4 + 3] = 255;
      }
      // clamped, so a sky's sides do not bleed into each other at their edges
      writeMaterial(put, `skybox/${sourceSky}${side}`, { width, height, rgba }, { shader: "UnlitGeneric", extra: ['\t"$nofog" "1"', '\t"$ignorez" "1"'], clamp: true }); // prettier-ignore
    });
  } else warnings.push(`sky ${skyName}: ${sky.why}; GMod's ${GMOD_SKY} instead`);

  // ── planes: GoldSrc's, then the turned-round and new ones the faces and brushes need ──
  const planes = bsp.planes.map((p) => ({ normal: p.normal, dist: p.dist, type: p.type }));
  const planeKey = (n, d) => `${n.map((x) => x.toFixed(5)).join(",")}|${d.toFixed(3)}`;
  const planeIndex = new Map(planes.map((p, i) => [planeKey(p.normal, p.dist), i]));
  const planeFor = (normal, dist) => {
    const key = planeKey(normal, dist);
    let i = planeIndex.get(key);
    if (i !== undefined) return i;
    // a node's axial plane faces + along its axis (type 0-2) and the engine's traces take that for granted; a
    // plane facing - along one is typed as merely leaning that way
    let axis = 0;
    for (let k = 1; k < 3; k++) if (Math.abs(normal[k]) > Math.abs(normal[axis])) axis = k;
    planes.push({ normal, dist, type: normal[axis] === 1 ? axis : 3 + axis });
    i = planes.length - 1;
    planeIndex.set(key, i);
    return i;
  };

  // ── texinfo: one for each of GoldSrc's, the same numbers, then a nodraw one for brush sides no face is on ──
  const texinfo = bsp.texinfo.map((ti) => {
    const tex = textures[ti.texture] ?? { texdata: NODRAW, scaleS: 1, scaleT: 1, kind: {} };
    let flags = 0;
    if (ti.flags & TEX_SPECIAL) flags |= SURF.NOLIGHT;
    if (tex.kind.sky) flags |= SURF.SKY | SURF.SKY2D | SURF.NOLIGHT;
    if (tex.texdata === TRIGGER) flags |= SURF.TRIGGER | SURF.NODRAW | SURF.NOLIGHT;
    // GoldSrc draws a liquid unlit; SURF_WARP would make Source draw it as its own water, which wants a fog
    // volume the map does not have (it came out black)
    if (tex.kind.water) flags |= SURF.NOLIGHT;
    return {
      s: ti.s.map((x) => x * tex.scaleS),
      t: ti.t.map((x) => x * tex.scaleT),
      ls: ti.s.map((x) => x / LUXEL),
      lt: ti.t.map((x) => x / LUXEL),
      flags,
      texdata: tex.texdata,
    };
  });
  const NODRAW_INFO = texinfo.length;
  texinfo.push({ s: [1, 0, 0, 0], t: [0, 1, 0, 0], ls: [0, 0, 0, 0], lt: [0, 0, 0, 0], flags: SURF.NODRAW | SURF.NOLIGHT, texdata: NODRAW }); // prettier-ignore

  // GoldSrc draws a brush entity in render mode Color, Texture, Glow or Additive with no lightmap, at full light
  // times its renderamt (Xash ref/gl/gl_rsurf.c R_HasLightmap; a liquid in Texture mode keeps it). Source still
  // multiplies by the lightmap, which left additive glass all but invisible in shaded windows: those faces get
  // an unlit copy of their material and no lightmap
  const UNLIT_MODES = new Set(["1", "2", "3", "5"]);
  const unlitModels = new Set();
  for (const pairs of bsp.entities) {
    const keys = new Map(pairs);
    const model = keys.get("model") ?? "";
    if (!model.startsWith("*") || !UNLIT_MODES.has(keys.get("rendermode") ?? "0")) continue;
    if (keys.get("rendermode") === "2" && (Number(keys.get("skin") ?? 0) < 0 || keys.get("classname") === "func_water")) continue;
    unlitModels.add(Number(model.slice(1)));
  }
  const unlitTexdata = new Map();
  const unlitInfo = new Map();
  const unlitTexinfo = (t) => {
    if (unlitInfo.has(t)) return unlitInfo.get(t);
    const tex = textures[bsp.texinfo[t].texture];
    let data = texinfo[t].texdata;
    if (tex?.path) {
      if (!unlitTexdata.has(tex.path)) {
        const path = `${tex.path}_unlit`;
        tex.put(`materials/${path}.vmt`, vmt("UnlitGeneric", [`\t"$basetexture" "${tex.path}"`, ...(tex.kind.holes ? ['\t"$alphatest" "1"'] : [])])); // prettier-ignore
        unlitTexdata.set(tex.path, addTexdata(path, tex.size.width, tex.size.height, tex.reflectivity));
      }
      data = unlitTexdata.get(tex.path);
    }
    texinfo.push({ ...texinfo[t], flags: texinfo[t].flags | SURF.NOLIGHT, texdata: data });
    unlitInfo.set(t, texinfo.length - 1);
    return texinfo.length - 1;
  };
  const faceTexinfo = bsp.faces.map((f) => f.texinfo);
  for (const mi of unlitModels) {
    const m = bsp.models[mi];
    if (!m) continue;
    for (let i = m.firstFace; i < m.firstFace + m.faceCount; i++) faceTexinfo[i] = unlitTexinfo(bsp.faces[i].texinfo);
  }

  // a brush side's texinfo: that of the face lying on it, facing out of it. The brushes are the tree's solid leaves
  // and the faces are cut by the same tree, so the side's own face has its middle in the brush; of those the
  // biggest, a water surface's last (it lies on the plane of the ground beside it), else any face on its plane. Taken from the first face on the plane, as before 0.30.1, 11 to 25 in a
  // hundred of the world's drawn area had another face's surfaceprop (dirt as concrete, concrete as wood), or none
  // where the map has the plane twice (Half-Life's boot_camp, stalkyard, crossfire, c2a5)
  const facesOnPlane = new Map();
  bsp.faces.forEach((f, i) => {
    const p = bsp.planes[f.plane];
    const key = f.side ? planeKey(p.normal.map((x) => -x), -p.dist) : planeKey(p.normal, p.dist);
    const poly = facePolygon(bsp, i);
    const middle = [0, 1, 2].map((k) => poly.reduce((s, q) => s + q[k], 0) / poly.length);
    let area = 0;
    for (let k = 1; k + 1 < poly.length; k++) {
      const u = [0, 1, 2].map((c) => poly[k][c] - poly[0][c]);
      const v = [0, 1, 2].map((c) => poly[k + 1][c] - poly[0][c]);
      area += Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
    }
    if (!facesOnPlane.has(key)) facesOnPlane.set(key, []);
    const water = /^[!*]/.test(bsp.textures[bsp.texinfo[f.texinfo]?.texture]?.name ?? "");
    facesOnPlane.get(key).push({ texinfo: f.texinfo, middle, area, water });
  });
  const sideTexinfo = (planes, side) => {
    const on = facesOnPlane.get(planeKey(planes[side].normal, planes[side].dist));
    if (!on) return NODRAW_INFO;
    let best = null;
    for (const face of on) {
      const inside = planes.every((q) => q.normal[0] * face.middle[0] + q.normal[1] * face.middle[1] + q.normal[2] * face.middle[2] - q.dist <= 1); // prettier-ignore
      if (inside && (!best || (best.water && !face.water) || (best.water === face.water && face.area > best.area))) best = face;
    }
    return (best ?? on[0]).texinfo;
  };

  // ── leaves and brushes ──
  const leafContents = (leaf) => {
    if (leaf === 0) return CONTENTS.SOLID;
    switch (bsp.leaves[leaf].contents) {
      case GS.SOLID:
      case GS.SKY:
        return CONTENTS.SOLID;
      case GS.WATER:
        return CONTENTS.WATER;
      case GS.SLIME:
      case GS.LAVA:
        return CONTENTS.SLIME;
      default:
        return null;
    }
  };
  const leaves = bsp.leaves.map((l, i) => {
    const contents = leafContents(i) ?? CONTENTS.EMPTY;
    const open = i >= 1 && i <= world.visLeaves && contents !== CONTENTS.SOLID;
    return { contents, cluster: -1, area: open ? AREA_WORLD : 0, flags: open ? LEAF_FLAGS_SKY2D : 0, mins: l.mins, maxs: l.maxs, firstFace: l.firstMarkSurface, faceCount: l.markSurfaceCount, brushes: [] }; // prettier-ignore
  });
  // clusters: the world's open leaves, numbered with no gaps. Numbered by GoldSrc leaf (leaf - 1), the solid ones
  // among them (sky) left holes, and the engine sized its rows by the clusters it found: the client warned "Vis
  // decompression overrun" without end and dropped things from view
  const clusterLeaves = [];
  for (let i = 1; i <= world.visLeaves; i++)
    if (leaves[i].contents !== CONTENTS.SOLID) {
      leaves[i].cluster = clusterLeaves.length;
      clusterLeaves.push(i);
    }
  const nodes = bsp.nodes.map((n) => ({ ...n, children: [...n.children] }));
  const brushes = [];
  const clampShort = (v) => Math.max(-32768, Math.min(32767, Math.round(v)));
  // for each model, its solid brushes for VPhysics (bevels left out, as vbsp does); a world side's material is its
  // texture's surfaceprop, numbered in the world's materialtable (stevenlafl's)
  const physicsModels = bsp.models.map(() => []);
  const physicsMaterials = [];
  // GoldSrc takes a brush entity's contents from its `skin` when that is under 0 (func_water's -3, the
  // func_ladder code's -16), whatever its brushes were compiled as: a sea that is a func_water compiled solid
  // came out a wall
  const SKIN_CONTENTS = { [GS.WATER]: CONTENTS.WATER, [GS.SLIME]: CONTENTS.SLIME, [GS.LAVA]: CONTENTS.SLIME };
  const modelContents = new Map();
  for (const pairs of bsp.entities) {
    const keys = new Map(pairs);
    const model = keys.get("model") ?? "";
    if (!model.startsWith("*")) continue;
    const skin = Number(keys.get("skin") ?? 0);
    if (keys.get("classname") === "func_ladder") modelContents.set(Number(model.slice(1)), CONTENTS.LADDER | CONTENTS.PLAYERCLIP);
    else if (SKIN_CONTENTS[skin]) modelContents.set(Number(model.slice(1)), SKIN_CONTENTS[skin]);
  }
  for (const [modelIndex, model] of bsp.models.entries()) {
    const override = modelContents.get(modelIndex);
    const contentsOf = override ? (leaf) => (leafContents(leaf) === null ? null : override) : leafContents;
    for (const b of brushesOfTree(bsp, model.headNodes[0], contentsOf, world.mins, world.maxs)) {
      let leaf = -1 - b.leafChild;
      if (leaf === 0) {
        // GoldSrc's one shared solid leaf: Source wants one for each place, holding its brush
        leaves.push({ contents: b.contents, cluster: -1, area: 0, flags: 0, mins: b.mins.map((v) => clampShort(Math.floor(v))), maxs: b.maxs.map((v) => clampShort(Math.ceil(v))), firstFace: 0, faceCount: 0, brushes: [] }); // prettier-ignore
        leaf = leaves.length - 1;
        nodes[b.node].children[b.side] = -1 - leaf;
      }
      const sides = b.planes.map((p, k) => ({ plane: planeFor(p.normal, p.dist), texinfo: sideTexinfo(b.planes, k), bevel: p.bevel ? 1 : 0 })); // prettier-ignore
      if (b.contents === CONTENTS.SOLID) {
        const planes = b.planes.flatMap((p, k) => {
          if (p.bevel) return [];
          if (modelIndex !== 0) return [p];
          const surface = sidesSurfaceprop(sides[k]);
          if (surface && !physicsMaterials.includes(surface) && physicsMaterials.length < 126) physicsMaterials.push(surface);
          return [{ ...p, material: physicsMaterials.indexOf(surface) + 1 }];
        });
        physicsModels[modelIndex].push({ planes, mins: b.mins, maxs: b.maxs });
      }
      brushes.push({ contents: b.contents, sides });
      leaves[leaf].brushes.push(brushes.length - 1);
      if (override) leaves[leaf].contents = b.contents;
    }
  }

  // ── clip brushes ──
  // Rebuilt from hulls 1 and 3 (brushesOfClipHull), the ones open in hull 0 are clip; the rest are the world's own,
  // already solid. Each is carved into the world's tree as vbsp does: the leaves it reaches split by its sides, the
  // piece inside it a leaf of player and NPC clip holding it (a trace tests a leaf's brushes only when the leaf's
  // contents are in its mask)
  const clips = clipBrushesOf(bsp);
  const CLIP = CONTENTS.PLAYERCLIP | CONTENTS.MONSTERCLIP;
  const worldBox = [0, 1, 2].flatMap((k) => [
    { normal: [0, 1, 2].map((c) => (c === k ? 1 : 0)), dist: world.maxs[k] + 64 },
    { normal: [0, 1, 2].map((c) => (c === k ? -1 : 0)), dist: -(world.mins[k] - 64) },
  ]);
  // `path`: the planes down to here, each facing out of the region, as brushesOfTree walks them
  const carve = (child, clip, brushIndex, path) => {
    if (child >= 0) {
      const node = nodes[child];
      const pl = planes[node.plane];
      const d = clip.points.map((v) => dot3(pl.normal, v) - pl.dist);
      if (d.some((x) => x > 0.01)) node.children[0] = carve(node.children[0], clip, brushIndex, [...path, { normal: pl.normal.map((x) => -x), dist: -pl.dist }]); // prettier-ignore
      if (d.some((x) => x < -0.01)) node.children[1] = carve(node.children[1], clip, brushIndex, [...path, pl]);
      return child;
    }
    const leaf = leaves[-1 - child];
    if (leaf.contents & CONTENTS.SOLID) return child;
    // only the sides that cut the leaf: none when the brush holds all of it, the leaf then clip as it is
    const region = regionOf([...path, ...worldBox]);
    if (!region || !regionOf([...path, ...worldBox, ...clip.planes])) return child;
    const corners = region.windings.flat();
    const cutting = clip.planes.filter((p) => !p.bevel && corners.some((v) => dot3(p.normal, v) - p.dist > 0.01));
    if (!cutting.length) {
      leaf.contents |= CLIP;
      leaf.brushes.push(brushIndex);
      return child;
    }
    // the piece inside the brush, then a node a side, each with the piece outside that side (the first the leaf
    // itself, the rest copies of it). The pieces draw nothing of their own: the leaf keeps its faces (the same
    // cluster, the same bounds)
    const piece = (extra) => ({ ...leaf, faceCount: 0, splitFrom: leaf.splitFrom ?? leaf, brushes: [...leaf.brushes], ...extra });
    leaves.push(piece({ contents: leaf.contents | CLIP, brushes: [...leaf.brushes, brushIndex] }));
    let at = -leaves.length;
    cutting.forEach((side, k) => {
      let outside = child;
      if (k > 0) {
        leaves.push(piece({}));
        outside = -leaves.length;
      }
      // a node's plane faces + along its main axis (planeFor); the outside is in front of the side
      const axis = [0, 1, 2].reduce((m, c) => (Math.abs(side.normal[c]) > Math.abs(side.normal[m]) ? c : m), 0);
      const flip = side.normal[axis] < 0;
      const plane = flip ? planeFor(side.normal.map((x) => -x), -side.dist) : planeFor(side.normal, side.dist);
      nodes.push({ plane, children: flip ? [at, outside] : [outside, at], mins: leaf.mins, maxs: leaf.maxs, firstFace: 0, faceCount: 0 }); // prettier-ignore
      at = nodes.length - 1;
    });
    return at;
  };
  for (const clip of clips) {
    brushes.push({ contents: CLIP, sides: clip.planes.map((p) => ({ plane: planeFor(p.normal, p.dist), texinfo: NODRAW_INFO, bevel: p.bevel ? 1 : 0 })) }); // prettier-ignore
    carve(0, clip, brushes.length - 1, []);
  }

  // a node's area: its leaves' when they share one, else -1
  const nodeAreas = new Map();
  const areaOf = (child) => (child < 0 ? leaves[-1 - child].area : nodeArea(child));
  function nodeArea(n) {
    if (nodeAreas.has(n)) return nodeAreas.get(n);
    const [a, b] = nodes[n].children.map(areaOf);
    const area = a === b ? a : -1;
    nodeAreas.set(n, area);
    return area;
  }
  nodes.forEach((_, i) => nodeArea(i));

  // ── faces and light ──
  const lighting = [];
  let lightBytes = 0;
  const faceLight = bsp.faces.map((f, i) => {
    if (texinfo[faceTexinfo[i]].flags & SURF.NOLIGHT) return null;
    const lm = faceLightmap(bsp, i);
    if (!lm) return null;
    const samples = lm.width * lm.height;
    const block = Buffer.alloc(lm.styles.length * 4 + lm.styles.length * samples * 4);
    const averages = [];
    lm.styles.forEach((style, k) => {
      const sum = [0, 0, 0];
      for (let s = 0; s < samples; s++) {
        const lin = [0, 1, 2].map((c) => toLinear255(style.rgb[s * 3 + c]));
        colorRgbExp(lin[0], lin[1], lin[2], block, lm.styles.length * 4 + (k * samples + s) * 4);
        for (let c = 0; c < 3; c++) sum[c] += lin[c];
      }
      averages.push(sum.map((c) => c / samples));
    });
    // each style's average sits just before the samples, style 0 nearest: (lightofs - 4 (style + 1))
    averages.forEach((avg, k) => colorRgbExp(avg[0], avg[1], avg[2], block, (lm.styles.length - 1 - k) * 4));
    const lightofs = lightBytes + lm.styles.length * 4;
    lighting.push(block);
    lightBytes += block.length;
    return { lightofs, mins: [lm.originS / LUXEL, lm.originT / LUXEL], size: [lm.width - 1, lm.height - 1], average: averages[0] };
  });
  const faceArea = (i) => {
    const poly = facePolygon(bsp, i);
    let area = 0;
    for (let k = 1; k + 1 < poly.length; k++) {
      const a = poly[0];
      const u = [0, 1, 2].map((c) => poly[k][c] - a[c]);
      const v = [0, 1, 2].map((c) => poly[k + 1][c] - a[c]);
      area += Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
    }
    return area;
  };

  // A face's plane is the one it lies on facing out, as vbsp writes it: for a face on the back of its node's plane
  // (side 1) that is the plane turned round. GoldSrc names the node's plane and lets side 1 turn it; copied, Source
  // took those faces of brush entities for back faces and never drew them (a breakable wall, one side of every
  // fence). Worked out before the planes are packed: some are new
  const facePlanes = bsp.faces.map((f) => {
    if (!f.side) return f.plane;
    const p = bsp.planes[f.plane];
    return planeFor(p.normal.map((x) => -x), -p.dist);
  });

  // ── the entities ──
  const props = [];
  const entities = entityLump(bsp, { sourceSky, searched, folder, isValves, toAddon, toPak, props, warnings });

  // ── the lumps ──
  const L = {};
  L[LUMP.ENTITIES] = entities;
  {
    const p = new Packer();
    for (const pl of planes) p.vec(pl.normal).f32(pl.dist).i32(pl.type);
    L[LUMP.PLANES] = p.done();
  }
  {
    const p = new Packer();
    for (const t of texdata) p.vec(t.reflectivity).i32(t.string).i32(t.width).i32(t.height).i32(t.width).i32(t.height);
    L[LUMP.TEXDATA] = p.done();
    const data = new Packer();
    const table = new Packer();
    for (const s of strings) {
      table.i32(data.at);
      data.bytes(Buffer.from(`${s}\0`, "latin1"));
    }
    L[LUMP.TEXDATA_STRING_DATA] = data.done();
    L[LUMP.TEXDATA_STRING_TABLE] = table.done();
  }
  {
    const p = new Packer();
    for (const v of bsp.vertices) p.vec(v);
    L[LUMP.VERTEXES] = p.done();
  }
  L[LUMP.VISIBILITY] = visibility(bsp, clusterLeaves, leaves);
  {
    const p = new Packer();
    nodes.forEach((n, i) => {
      p.i32(n.plane).i32(n.children[0]).i32(n.children[1]);
      for (const v of n.mins) p.i16(v);
      for (const v of n.maxs) p.i16(v);
      p.u16(n.firstFace).u16(n.faceCount).i16(nodeAreas.get(i)).i16(0);
    });
    L[LUMP.NODES] = p.done();
  }
  {
    const p = new Packer();
    for (const t of texinfo) {
      for (const v of [...t.s, ...t.t, ...t.ls, ...t.lt]) p.f32(v);
      p.i32(t.flags).i32(t.texdata);
    }
    L[LUMP.TEXINFO] = p.done();
  }
  {
    const p = new Packer();
    bsp.faces.forEach((f, i) => {
      const light = faceLight[i];
      p.u16(facePlanes[i]).u8(f.side ? 1 : 0).u8(1).i32(f.firstEdge).i16(f.edgeCount).i16(faceTexinfo[i]).i16(-1).i16(-1);
      for (let k = 0; k < 4; k++) p.u8(light ? f.styles[k] : NO_STYLE);
      p.i32(light ? light.lightofs : -1).f32(faceArea(i));
      p.i32(light ? light.mins[0] : 0).i32(light ? light.mins[1] : 0);
      p.i32(light ? light.size[0] : 0).i32(light ? light.size[1] : 0);
      p.i32(i).u16(0).u16(0).u32(0);
    });
    L[LUMP.FACES] = p.done();
    L[LUMP.ORIGINALFACES] = L[LUMP.FACES];
    // a normal for each corner of each face, in face order, as vbsp writes them (vrad smooths them; GoldSrc's faces
    // are flat, so each corner takes its face's). Source reads a face's corners' normals through the indices
    // whether or not the lumps are there; without them brush entities' faces went missing
    const normals = new Packer();
    const indices = new Packer();
    bsp.faces.forEach((f, i) => {
      normals.vec(faceNormal(bsp, i));
      for (let k = 0; k < f.edgeCount; k++) indices.u16(i);
    });
    L[LUMP.VERTNORMALS] = normals.done();
    L[LUMP.VERTNORMALINDICES] = indices.done();
  }
  L[LUMP.LIGHTING] = Buffer.concat(lighting);
  L[LUMP.WORLDLIGHTS] = worldLightsLump(bsp.entities, (origin) => leaves[leafAt(bsp, origin)]?.cluster ?? -1);
  L[LUMP.OCCLUSION] = new Packer().i32(0).i32(0).i32(0).done();
  {
    // each leaf's own run of face references, written in leaf order: the engine lays the runs out one after another
    // by count, whatever firstleafface says (two leaves sharing one run crashed the client at load, the water
    // marking reading past the end). The ambient samples read them back; a piece a clip brush split off a leaf has
    // no faces and samples the leaf's
    const p = new Packer();
    let at = 0;
    for (const l of leaves) {
      const list = bsp.marksurfaces.slice(l.firstFace, l.firstFace + l.faceCount);
      l.faceList = l.splitFrom ? l.splitFrom.faceList : list;
      l.firstFace = at;
      l.faceCount = list.length;
      for (const f of list) p.u16(f);
      at += list.length;
    }
    L[LUMP.LEAFFACES] = p.done();
  }
  {
    const p = new Packer();
    const leafBrushes = new Packer();
    let firstBrush = 0;
    for (const l of leaves) {
      p.i32(l.contents).i16(l.cluster).i16((l.area & 0x1ff) | (l.flags << 9));
      for (const v of l.mins) p.i16(v);
      for (const v of l.maxs) p.i16(v);
      p.u16(l.firstFace).u16(l.faceCount).u16(firstBrush).u16(l.brushes.length).i16(-1).i16(0);
      for (const b of l.brushes) leafBrushes.u16(b);
      firstBrush += l.brushes.length;
    }
    L[LUMP.LEAFS] = p.done();
    L[LUMP.LEAFBRUSHES] = leafBrushes.done();
  }
  {
    const p = new Packer();
    for (const e of bsp.edges) p.u16(e[0]).u16(e[1]);
    L[LUMP.EDGES] = p.done();
    const s = new Packer();
    for (const e of bsp.surfedges) s.i32(e);
    L[LUMP.SURFEDGES] = s.done();
  }
  {
    const p = new Packer();
    for (const m of bsp.models) p.vec(m.mins).vec(m.maxs).vec(m.origin).i32(m.headNodes[0]).i32(m.firstFace).i32(m.faceCount);
    L[LUMP.MODELS] = p.done();
  }
  {
    const b = new Packer();
    const s = new Packer();
    let firstSide = 0;
    for (const brush of brushes) {
      b.i32(firstSide).i32(brush.sides.length).i32(brush.contents);
      for (const side of brush.sides) s.u16(side.plane).i16(side.texinfo).i16(-1).i16(side.bevel);
      firstSide += brush.sides.length;
    }
    L[LUMP.BRUSHES] = b.done();
    L[LUMP.BRUSHSIDES] = s.done();
  }
  // area 0 is no area; area 1 is the whole world (no area portals)
  L[LUMP.AREAS] = new Packer().i32(0).i32(0).i32(0).i32(0).done();
  L[LUMP.AREAPORTALS] = new Packer().u16(0).u16(0).u16(0).u16(0).i32(0).done();
  L[LUMP.GAME_LUMP] = new Packer().i32(0).done();
  if (packed.length) L[LUMP.PAKFILE] = storedZip(packed);
  // a brush entity's surfaceprop: its textures' with the most area, as vbsp picks it
  const physicsSurfaceprops = bsp.models.map((m, index) => {
    if (!index) return undefined;
    const area = new Map();
    for (let i = m.firstFace; i < m.firstFace + m.faceCount; i++) {
      const surface = textures[bsp.texinfo[bsp.faces[i].texinfo].texture]?.surfaceprop ?? "default";
      area.set(surface, (area.get(surface) ?? 0) + faceArea(i));
    }
    return [...area].sort((a, b) => b[1] - a[1])[0]?.[0];
  });
  const collide = physics ? physics(physicsModels, { materials: physicsMaterials, surfaceprops: physicsSurfaceprops }) : null;
  if (collide) L[LUMP.PHYSCOLLIDE] = collide;
  else warnings.push("no physics collision (PHYSCOLLIDE): Lua's traces and props fall through the world. It needs GMod's vphysics (physCollideLump)"); // prettier-ignore
  {
    // one ambient sample in the middle of each open leaf: the mean light of its faces. Ambient cubes count in
    // linear light (1 is full), where lightmaps count in 255ths: written in 255ths they lit props hundreds of times
    // over and they drew black
    const index = new Packer();
    const samples = new Packer();
    let count = 0;
    for (const l of leaves) {
      if (l.contents === CONTENTS.SOLID) {
        index.u16(0).u16(count);
        continue;
      }
      const sum = [0, 0, 0];
      let n = 0;
      for (const face of l.faceList) {
        const light = faceLight[face];
        if (!light) continue;
        for (let c = 0; c < 3; c++) sum[c] += light.average[c];
        n++;
      }
      const avg = (n ? sum.map((c) => c / n) : [64, 64, 64]).map((c) => (c / 255) * AMBIENT_SHARE);
      const cube = Buffer.alloc(24);
      for (let side = 0; side < 6; side++) colorRgbExp(avg[0], avg[1], avg[2], cube, side * 4);
      samples.bytes(cube).u8(128).u8(128).u8(128).u8(0);
      index.u16(1).u16(count);
      count++;
    }
    L[LUMP.LEAF_AMBIENT_INDEX] = index.done();
    L[LUMP.LEAF_AMBIENT_LIGHTING] = samples.done();
    L[LUMP.LEAF_AMBIENT_INDEX_HDR] = L[LUMP.LEAF_AMBIENT_INDEX];
    L[LUMP.LEAF_AMBIENT_LIGHTING_HDR] = L[LUMP.LEAF_AMBIENT_LIGHTING];
  }

  return {
    name: mapName,
    bsp: writeSourceBsp(L),
    files,
    props,
    physics: physicsModels,
    physicsMaterials,
    physicsSurfaceprops,
    warnings,
    facts: {
      faces: bsp.faces.length,
      leaves: leaves.length,
      solidSplitOff: leaves.length - bsp.leaves.length,
      brushes: brushes.length,
      clipBrushes: clips.length,
      clusters: clusterLeaves.length,
      visLeaves: world.visLeaves,
      packed: packed.length,
      textureSources: [...wadUsed],
      sky: sourceSky,
      physics: !!collide,
    },
  };
}

// GoldSrc's rows have a bit for each leaf from 1; Source's a bit for each cluster (`clusterLeaves`: each cluster's
// leaf). The PAS (what can be heard) is every cluster seen from one seen
function visibility(bsp, clusterLeaves, leaves) {
  const count = clusterLeaves.length;
  const rowBytes = (count + 7) >> 3;
  const set = (row, c) => (row[c >> 3] |= 1 << (c & 7));
  const pvs = clusterLeaves.map((leaf) => {
    const row = new Uint8Array(rowBytes);
    const seen = visibleFrom(bsp, leaf);
    if (seen === null) for (let c = 0; c < count; c++) set(row, c);
    else for (const other of seen) if (leaves[other].cluster >= 0) set(row, leaves[other].cluster);
    return row;
  });
  const pas = pvs.map((row) => {
    const out = new Uint8Array(rowBytes);
    for (let c = 0; c < count; c++) if (row[c >> 3] & (1 << (c & 7))) for (let k = 0; k < rowBytes; k++) out[k] |= pvs[c][k];
    return out;
  });
  return visibilityLump(pvs, pas);
}

// GoldSrc's movers take their way from `angles` (or `angle`, -1 up and -2 down) and then zero them (SetMovedir:
// CBaseDoor, CMomentaryDoor, CBaseButton, CFuncConveyor, and every trigger in InitTrigger). Source reads `movedir`
// (trigger_push: `pushdir`) and turns the brush by `angles`, which put a sea 270 degrees round the map's origin.
// Returns [key, value] to write instead, [null] for angles only dropped, or null for a class that keeps them
const MOVEDIR_CLASSES = new Set(["func_door", "func_water", "momentary_door", "func_button", "func_conveyor"]);
function movedirOf(cls, keys) {
  const isTrigger = cls?.startsWith("trigger_");
  if (!MOVEDIR_CLASSES.has(cls) && !isTrigger) return null;
  if (!keys.has("angles") && !keys.has("angle")) return null;
  let angles = numbersOf(keys.get("angles"));
  if (keys.has("angle")) angles = [0, Number(keys.get("angle")), 0];
  const [pitch = 0, yaw = 0, roll = 0] = angles;
  const dir = pitch === 0 && yaw === -1 ? "-90 0 0" : pitch === 0 && yaw === -2 ? "90 0 0" : `${pitch} ${yaw} ${roll}`;
  if (cls === "trigger_push") return ["pushdir", dir];
  if (isTrigger) return [null];
  return ["movedir", dir];
}

// The entities, with what Source reads differently: worldspawn loses its .wad list and gets the sky; a player
// start comes down to the feet; a missing renderamt is 0 in GoldSrc and 255 in Source, and maps hide brushes that
// way (rendermode 2, no renderamt). A sprite (env_sprite, env_glow, a cycler_sprite naming one) is Source's
// env_sprite on the converted material, env_glow and cycler_sprite always on as in GoldSrc; a cycler_sprite's
// model is a prop_dynamic, not solid, playing its `sequence` (its port is left to the caller: `props`).
function entityLump(bsp, { sourceSky, searched, folder, isValves, toAddon, toPak, props, warnings }) {
  const missing = new Set();
  const sprites = new Map();
  const asset = (path) => {
    const file = inFolders(searched, path);
    if (!file) missing.add(path);
    return file;
  };
  const text = bsp.entities
    .map((pairs) => {
      const e = pairs.filter(([k]) => k !== "wad" && k !== "mapversion");
      const cls = e.find(([k]) => k === "classname")?.[1];
      if (cls === "worldspawn") return [...e.filter(([k]) => k !== "skyname"), ["skyname", sourceSky]];
      const keys = new Map(e);
      if (keys.has("rendermode") && keys.get("rendermode") !== "0" && !keys.has("renderamt")) e.push(["renderamt", "0"]);
      // GoldSrc colours a brush by rendercolor only in rendermode 1 (Color), and draws a sprite or model whose
      // rendercolor is 0 0 0 (Hammer's default) untinted; Source tints everything by it, so crates, props and
      // masked brushes came out black and additive glass invisible
      const brush = (keys.get("model") ?? "").startsWith("*");
      const black = numbersOf(keys.get("rendercolor")).every((c) => c === 0);
      if (keys.has("rendercolor") && ((brush && keys.get("rendermode") !== "1") || (!brush && black))) {
        const i = e.findIndex(([k]) => k === "rendercolor");
        e[i] = ["rendercolor", "255 255 255"];
      }
      const moved = movedirOf(cls, keys);
      if (moved) {
        const [key, value] = moved;
        return [...e.filter(([k]) => k !== "angles" && k !== "angle"), ...(key ? [[key, value]] : [])];
      }
      // Source has no func_ladder class (vbsp folds ladders into the world); its brushes are CONTENTS_LADDER and
      // player clip, which a func_brush carries and the player's movement climbs. GoldSrc's ladder draws nothing
      // (its aaatrigger faces showed through a func_brush), so: rendermode 10
      if (cls === "func_ladder")
        return [...e.filter(([k]) => !["classname", "rendermode"].includes(k)), ["classname", "func_brush"], ["Solidity", "2"], ["rendermode", "10"]]; // prettier-ignore
      const model = keys.get("model") ?? "";
      const set = (list, key, value) => [...list.filter(([k]) => k !== key), [key, value]];
      if (/\.spr$/i.test(model) && ["env_sprite", "env_glow", "cycler_sprite"].includes(cls)) {
        const file = asset(model);
        if (!file) return e;
        if (!sprites.has(file)) sprites.set(file, spriteMaterial(file, folder, isValves(file) ? toPak : toAddon));
        let out = set(set(e, "classname", "env_sprite"), "model", sprites.get(file));
        if (cls !== "env_sprite") out = set(out, "spawnflags", String(Number(keys.get("spawnflags") ?? 0) | 1));
        return out;
      }
      if (/\.mdl$/i.test(model) && cls === "cycler_sprite") {
        const file = asset(model);
        if (!file) return e;
        const own = basename(file).replace(/\.mdl$/i, "").toLowerCase();
        const path = `models/${folder}/props/${own}.mdl`;
        if (!props.some((p) => p.model === path)) props.push({ file, model: path, name: own });
        const names = sequences(readStudio(file).src).map((s) => s.name);
        // GoldSrc's is SOLID_SLIDEBOX but SET_MODEL gives a studio model no size, so nothing bumps into it
        // (stevenlafl, in game: TS let them past a parasol that the model's box blocked)
        let out = set(set(set(e, "classname", "prop_dynamic"), "model", path), "solid", "0");
        const seq = names[Number(keys.get("sequence") ?? 0)] ?? names[0];
        if (seq) out = set(out, "DefaultAnim", seq);
        return out.filter(([k]) => k !== "sequence" && k !== "framerate");
      }
      if (PLAYER_STARTS.has(cls) && keys.has("origin")) {
        const [x, y, z] = numbersOf(keys.get("origin"));
        return e.map(([k, v]) => (k === "origin" ? [k, `${x} ${y} ${z - HULL_HALF_HEIGHT}`] : [k, v]));
      }
      return e;
    })
    .map((pairs) => `{\n${pairs.map(([k, v]) => `"${k}" "${v}"`).join("\n")}\n}\n`)
    .join("");
  if (missing.size) warnings.push(`not found, left as GoldSrc had them: ${[...missing].slice(0, 8).join(" ")}${missing.size > 8 ? ` and ${missing.size - 8} more` : ""}`); // prettier-ignore
  return Buffer.from(`${text}\0`, "latin1");
}

const SPRITE_ORIENTATION = {
  upright: "parallel_upright",
  "facing upright": "facing_upright",
  parallel: "vp_parallel",
  oriented: "oriented",
  "parallel oriented": "vp_parallel_oriented",
};

// A GoldSrc sprite as materials/sprites/<folder>/<name>.vmt on the "Sprite" shader, every frame kept (the entity's
// framerate cycles them). Frames of different sizes are laid on one canvas about the sprite's origin, padded with
// nothing to powers of two rather than stretched, so a sprite keeps its size in the world at the entity's own
// scale. The file's type is the sprite's $spriteorientation; its format says how the palette becomes colour (the
// last colour is the hole of an alpha-test sprite; an index-alpha sprite is all the last colour, its index the
// alpha). Returns its path, as env_sprite's model names it.
function spriteMaterial(file, folder, put) {
  const name = basename(file).replace(/\.spr$/i, "").toLowerCase().replace(/[^a-z0-9_]/g, "_");
  const material = `sprites/${folder}/${name}`;
  const sprite = readSpr(readFileSync(file));
  const clear = sprite.format === "alpha test";
  const indexAlpha = sprite.format === "index alpha";
  let left = Infinity;
  let right = -Infinity;
  let top = -Infinity;
  let bottom = Infinity;
  for (const f of sprite.frames) {
    left = Math.min(left, f.left);
    right = Math.max(right, f.left + f.width);
    top = Math.max(top, f.up);
    bottom = Math.min(bottom, f.up - f.height);
  }
  const pow2 = (n) => 2 ** Math.ceil(Math.log2(Math.max(1, n)));
  const width = pow2(right - left);
  const height = pow2(top - bottom);
  const padX = Math.floor((width - (right - left)) / 2);
  const padY = Math.floor((height - (top - bottom)) / 2);
  const frames = sprite.frames.map((f) => {
    const rgba = new Uint8Array(width * height * 4);
    const x0 = padX + (f.left - left);
    const y0 = padY + (top - f.up);
    f.pixels.forEach((index, i) => {
      const at = ((y0 + Math.floor(i / f.width)) * width + x0 + (i % f.width)) * 4;
      rgba.set(sprite.palette.subarray(indexAlpha ? 765 : index * 3, indexAlpha ? 768 : index * 3 + 3), at);
      rgba[at + 3] = indexAlpha ? index : clear && index === 255 ? 0 : 255;
    });
    if (clear || indexAlpha) bleedHoles(rgba, width, height);
    return { width, height, rgba };
  });
  // where the origin is on the canvas, as a share of it
  const origin = [(padX - left) / width, (padY + top) / height];
  put(`materials/${material}.vtf`, writeVtf(frames[0], { alpha: clear ? true : indexAlpha ? "smooth" : false, frames }));
  put(
    `materials/${material}.vmt`,
    Buffer.from(`"Sprite"\n{\n\t"$spriteorientation" "${SPRITE_ORIENTATION[sprite.type] ?? "vp_parallel"}"\n\t"$spriteorigin" "[ ${origin[0].toFixed(3)} ${origin[1].toFixed(3)} ]"\n\t"$basetexture" "${material}"\n}\n`, "latin1"), // prettier-ignore
  );
  return `${material}.vmt`;
}

// ── what a texture is made of ──
// GoldSrc gives a texture its type in the game's sound/materials.txt ("C NAME" a line), which picks its step
// and bullet sounds; Source picks them, and the impact's decal and particles, from the material's $surfaceprop
// and from each physics convex's (vbsp's ivp.cpp). The types as Source's surfaceprops (GMod's
// scripts/surfaceproperties.txt): concrete is GoldSrc's default
const DEFAULT_SURFACEPROP = "concrete";
const SURFACEPROP_OF_TYPE = { C: "concrete", M: "metal", D: "dirt", V: "metalvent", G: "metalgrate", T: "tile", S: "slipperyslime", W: "wood", P: "computer", Y: "glass", F: "flesh", N: "snow" }; // prettier-ignore
/** A GoldSrc texture type (materials.txt's letter) as Source's surfaceprop; concrete for one not known. */
export const surfacepropOfType = (type) => SURFACEPROP_OF_TYPE[type] ?? DEFAULT_SURFACEPROP;

/**
 * A game's texture types, from the first of `folders` that has sound/materials.txt: a function of a texture's name
 * to its letter ("C" when not listed), read as the engine reads it (the HL SDK's TEXTURETYPE_Find): a frame's
 * "-0" or "+0" and a "{", "!", "~" or " " are stripped, then the first 12 letters compared, whatever their case.
 */
export function textureTypes(folders) {
  const file = inFolders(folders, "sound/materials.txt");
  const types = new Map();
  if (file)
    for (const line of readFileSync(file, "latin1").split(/\r?\n/)) {
      const found = line.replace(/\/\/.*/, "").match(/^\s*([A-Za-z])\s+(\S+)/);
      if (found && !types.has(found[2].slice(0, 12).toLowerCase())) types.set(found[2].slice(0, 12).toLowerCase(), found[1].toUpperCase());
    }
  return (name) => {
    let n = name;
    if (n[0] === "-" || n[0] === "+") n = n.slice(2);
    if ("{!~ ".includes(n[0])) n = n.slice(1);
    return types.get(n.slice(0, 12).toLowerCase()) ?? "C";
  };
}

// ── the lights ──
// The WORLDLIGHTS lump from the map's light entities. The baked light is already in the lightmaps; these only
// light models (props, players) directly, as vrad's do. Encoded as vrad writes them (Source SDK 2013
// src/utils/vrad/lightmap.cpp, checked by stevenlafl against a box room built with vrad): intensity is the colour
// in linear light times brightness / 255. hlrad's lights fall off with distance, so each gets quadratic
// attenuation, its intensity scaled to read true at 100 units, as Hammer's lights do.
const EMIT = { point: 1, spotlight: 2, skylight: 3 };
const ATTENUATION_REFERENCE = 100;

/** `_light` as r g b and brightness: "r g b brightness", or "r g b" with 200 (hlrad's default); in linear light
 * times brightness / 255. `keys` a Map of the entity's. */
export function lightOf(keys) {
  const v = numbersOf(keys.get("_light"));
  const [r = 255, g = 255, b = 255] = v;
  const brightness = v[3] ?? 200;
  return [r, g, b].map((c) => (c / 255) ** 2.2 * (brightness / 255));
}

/** Where a light shines, a unit vector: its angles, with `pitch` over theirs; pitch -90 is straight down (hlrad). */
export function directionOf(keys) {
  const angles = numbersOf(keys.get("angles"));
  let pitch = angles[0] ?? 0;
  const yaw = angles[1] ?? Number(keys.get("angle") ?? 0);
  if (keys.has("pitch")) pitch = Number(keys.get("pitch"));
  if (yaw === -1) return [0, 0, 1];
  if (yaw === -2) return [0, 0, -1];
  const p = (pitch * Math.PI) / 180;
  const y = (yaw * Math.PI) / 180;
  return [Math.cos(p) * Math.cos(y), Math.cos(p) * Math.sin(y), Math.sin(p)];
}

/** The WORLDLIGHTS lump: `entities` the map's, each a list of [key, value]; `clusterAt(origin)` a point's cluster. */
export function worldLightsLump(entities, clusterAt) {
  const p = new Packer();
  for (const pairs of entities) {
    const keys = new Map(pairs);
    const cls = keys.get("classname");
    if (cls !== "light" && cls !== "light_spot" && cls !== "light_environment") continue;
    const origin = numbersOf(keys.get("origin"));
    if (origin.length !== 3) continue;
    let intensity = lightOf(keys);
    let type = EMIT.point;
    let normal = [0, 0, -1];
    let stopdot = 0;
    let stopdot2 = 0;
    let attenuation = [0, 0, 1];
    if (cls === "light_environment") {
      type = EMIT.skylight;
      normal = directionOf(keys);
      attenuation = [1, 0, 0];
    } else {
      intensity = intensity.map((c) => c * ATTENUATION_REFERENCE ** 2);
      if (cls === "light_spot") {
        type = EMIT.spotlight;
        normal = directionOf(keys);
        const inner = Number(keys.get("_cone") ?? 10);
        const outer = Number(keys.get("_cone2") ?? Math.max(inner, 20));
        stopdot = Math.cos((inner * Math.PI) / 180);
        stopdot2 = Math.cos((outer * Math.PI) / 180);
      }
    }
    p.vec(origin).vec(intensity).vec(normal).i32(clusterAt(origin)).i32(type).i32(Number(keys.get("style") ?? 0));
    p.f32(stopdot).f32(stopdot2).f32(type === EMIT.spotlight ? 1 : 0).f32(0);
    p.f32(attenuation[0]).f32(attenuation[1]).f32(attenuation[2]);
    p.i32(0).i32(0).i32(0);
  }
  return p.done();
}

/**
 * A GoldSrc map ported to GMod as an addon: out/addon/maps/<name>.bsp, the shared materials beside it, and the
 * models its cycler_sprites show, ported by portToGmod (compiled with GMod's studiomdl) under
 * models/<folder>/props/. `valve`: Half-Life's valve folder (found in Steam's libraries unless given; null for
 * none). `physics: false` writes no collision; else it is made with GMod's vphysics (`vphysics`, `helper`: as
 * physCollideLump finds them), and the map is written without it, said, when that fails.
 * Returns what portMapToSource does, with `file` (the map's path) and `written` (every file's path).
 */
export function portMapToGmod(file, { out, name, folder = "smak", folders, valve, physics = true, vphysics, helper, gmod, studiomdl } = {}) {
  if (!out) throw new Error("portMapToGmod: the folder the port goes to (out)");
  const halfLife = valve === undefined ? findHalfLife() : null;
  const valveDir = valve === undefined ? (halfLife ? join(halfLife, "valve") : null) : valve;
  let failed = null;
  const collide = (models, tables) => {
    try {
      return physCollideLump(models, { ...tables, vphysics, helper, gmod });
    } catch (e) {
      failed = e.message;
      return null;
    }
  };
  const port = portMapToSource(file, { name, folder, folders, valve: valveDir ?? undefined, physics: physics ? collide : null });
  if (failed) port.warnings = port.warnings.map((w) => (/^no physics collision/.test(w) ? `${w}: ${failed}` : w));
  const addon = join(out, "addon");
  const written = [];
  const put = (path, data) => {
    const at = join(addon, ...path.split("/"));
    mkdirSync(dirname(at), { recursive: true });
    writeFileSync(at, data);
    written.push(at);
  };
  put(`maps/${port.name}.bsp`, port.bsp);
  for (const f of port.files) put(f.path, f.data);
  for (const prop of port.props) {
    const work = join(out, "props", prop.name);
    try {
      const made = portToGmod(prop.file, { out: work, name: prop.name, folder: `${folder}/props`, studiomdl, gmod, picture: false });
      if (existsSync(join(work, "addon"))) cpSync(join(work, "addon"), addon, { recursive: true });
      for (const w of made.warnings ?? []) port.warnings.push(`${prop.name}: ${w}`);
    } catch (e) {
      port.warnings.push(`the prop ${prop.model} was not ported (${e.message}): its prop_dynamic shows nothing`);
    }
  }
  return { ...port, file: join(addon, "maps", `${port.name}.bsp`), written };
}
