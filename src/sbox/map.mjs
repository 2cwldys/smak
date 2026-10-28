// A GoldSrc map (BSP 30) made an s&box scene: its compiled faces as the scene editor's own meshes, which s&box
// draws, collides with and lets a mapper edit; its textures as materials; its sky; its spawn points and its lights
// as s&box's components. Written as files, with no editor open, as sbox-port writes a model.
//
//   portMapToSbox(file, { name, folder, folders })   -> { name, scene, files, warnings, facts }
//   portMapToSboxFile(file, { out, name, folder, folders })   the same, written under `out` (a project's Assets)
//
// WHAT GOES WHERE (under `out`):
//   scenes/<folder>/<map>.scene                          the map: one game object for the world, one for each brush
//                                                        entity, one for each spawn point and light, the sky's
//   materials/<folder>/<wad>/<texture>.png .vmat         a wad's textures, shared by the maps that wear them (a
//                                                        holed one's holes in <texture>_mask.png)
//   materials/<folder>/maps/<map>/<texture>.png .vmat    a texture the map carries inside itself
//   materials/<folder>/sky/<skyname>.png .vmat           its sky, the six sides made one picture round the world
//
// THE FACES. Each face of the BSP is a polygon of a MeshComponent's PolygonMesh, as compiled (split by the
// compiler where the tree cut it): the world's in one, each brush entity's (`model` "*N") in its own, at its
// `origin`. A PolygonMesh is saved as a blob (PolygonMesh.Serialize.cs, MeshBlob): a half-edge mesh, every side of
// a polygon an edge inside it and its twin outside, and per half-edge the texture coordinate of the corner it
// points to. Each face here is a polygon of its own, its corners shared with no other, so no edge is ever shared
// by three faces, which a BSP's T-junctions and touching brushes would make (measured: stalkyard's 2502 faces all
// taken, none bad). GoldSrc walks a face clockwise seen from the front, s&box anticlockwise: the corners are
// turned round. A corner's coordinate is GoldSrc's (a point's dot with the texture's axes, over its size): units
// and axes are the same in both, inches and Z up.
//
// WHAT IS NOT DRAWN: sky faces (the sky is SkyBox2D's) and the compilers' tool textures (clip, origin, null, hint,
// skip, aaatrigger), so a trigger or a ladder (all aaatrigger) has no mesh yet. func_illusionary is drawn and
// collides with nothing.
//
// THE LIGHTS are s&box's, made from GoldSrc's light entities: GoldSrc's own light is baked in the map's lightmaps,
// which a PolygonMesh has no place for. `light` a PointLight, `light_spot` a SpotLight (`_cone`, `_cone2` its
// inner and outer half angles), `light_environment` a DirectionalLight, its colour also the sky's light
// (SkyColor). A light's colour is GoldSrc's `_light` in linear light times brightness / 255 (lightOf, as the GMod
// port's WORLDLIGHTS), and it reaches LIGHT_REACH units per the root of its brightness. A face whose texture
// shines (Valve's maps' lights.rad, texlights.mjs, or the map's own info_texlights) is drawn lit by itself and has a
// SpotLight before it, as strong as hlrad made it (TEXLIGHT_SCALE). The sun is SUN_SCALE times its colour, the sky's light SKY_LIGHT_SHARE
// of it: GoldSrc's light compiler bounced the light and spread the sky's, which s&box's lights do not, and these
// were fitted so that stalkyard's 21 starts look as bright as GoldSrc draws them with its lightmaps (mapcheck.mjs).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { readBsp, modelFaces, facePolygon, faceTexture, faceUvs, faceNormal, embeddedTexture, worldBounds } from "../maps/bsp.mjs";
import { texlightsFor } from "../maps/texlights.mjs";
import { textureKind, textureRgba } from "../maps/miptex.mjs";
import { mapOwnFolders, texturesFor } from "../maps/wad.mjs";
import { skyOf, skyColour } from "../maps/sky.mjs";
import { png } from "../image.mjs";
import { materialName, lightOf, directionOf } from "../source/map.mjs";
import { bleedHoles, powerOfTwo } from "../source/vtf.mjs";
import { PORT_FOLDER } from "../source/port.mjs";
import { clipBrushesOf, entityBrushesOf, regionOf } from "../source/mapbrushes.mjs";
import { vmatOf, WHITE_PNG } from "./vmdl.mjs";
import { lightmapAtlas, lightmapShader, LIGHTMAP_SHADER } from "./lightmap.mjs";
import { guidOf } from "./sound.mjs";

/** GoldSrc's player origin is the middle of its 72-high box; s&box's spawn point is where the feet go. */
export const PLAYER_HALF_HEIGHT = 36;
/** How far a GoldSrc light reaches in s&box, in units, per the square root of its brightness (a 200 light reaches
 * 450 units). */
export const LIGHT_REACH = 32;
/** A light_environment's colour, as s&box's sun: times this; and the sky's light it gives (SkyColor), this share
 * of its colour. Fitted on stalkyard (2026-10-27): its 21 starts, pictured with no tonemapping, as bright as GoldSrc
 * draws them (1.03 times, 17 within a third either way), where 1 and 0.25 had them 0.75 as bright. */
export const SUN_SCALE = 4;
export const SKY_LIGHT_SHARE = 0.75;
/** The sky's picture round the world: twice as wide as high (s&box's sky shader reads it longitude by latitude). */
export const SKY_WIDTH = 2048;
/** The world's own game object's tag, which a trace asks for to hit the world alone. */
export const WORLD_TAG = "world";
/** The clip brushes' tag. */
export const CLIP_TAG = "clip";
/** A brush entity's that blocks (a door, a func_wall): solid as the world is, but not of it. */
export const BRUSH_TAG = "brush";
/** The game object of the map's indirect light, and its probes per 1024 units, a probe every 256: half s&box's own
 * default of 8, an eighth of the probes. At 8 ts_lobby's bake counted 66096 probes, each drawing its 69 shadowed
 * lights, at 6 to 26 a second: one to three hours (2026-10-28); at 4, 9576. */
export const INDIRECT_LIGHT = "indirect light";
export const INDIRECT_LIGHT_DENSITY = 4;
/** How many probes a map's indirect light bakes, as s&box's bake counts them: the world's box and 16 units round it,
 * INDIRECT_LIGHT_DENSITY per 1024 units each way and one more, twice over (ts_lobby's at 8 counted 66096: 2 x 36 x 34 x
 * 27, 2026-10-28). */
export function indirectProbes(bsp) {
  const world = worldBounds(bsp);
  return 2 * [0, 1, 2].reduce((n, c) => n * (Math.max(1, Math.ceil(((world.maxs[c] - world.mins[c] + 32) * INDIRECT_LIGHT_DENSITY) / 1024)) + 1), 1); // prettier-ignore
}
/** The record of a bake beside its files (in the scene's own data folder, `<scene>_scene_data`): what the port wrote
 * when it was baked (bakeKeyOf) and the volume's three textures. A port that writes the same again keeps the bake
 * (writeSboxMap), as a bake takes minutes to hours (INDIRECT_LIGHT_DENSITY). */
export const BAKE_RECORD = "smak_bake.json";
/** The fields of s&box's IndirectLightVolume that its bake fills. */
export const BAKED_FIELDS = ["IrradianceTexture", "DistanceTexture", "RelocationTexture"];
/** The folder of a scene's own data (its bakes), as s&box names it: scenes/ts/ts_lobby.scene's is scenes/ts/ts_lobby_scene_data. */
export const sceneDataOf = (scene) => scene.replace(/\.scene$/, "_scene_data");
/** What a port wrote, every file's path and bytes, hashed: the same key, the same map lit the same way. */
export function bakeKeyOf(port) {
  const hash = createHash("sha256");
  for (const { path, data } of port.files) hash.update(`${path}\n`).update(data).update("\n");
  return hash.digest("hex");
}
/** Texture flags of sbox-port's vmatOf (GoldSrc's STUDIO_NF_): a holed texture's, and a see-through one's. */
const MASKED = 64;
const ADDITIVE = 32;
const FULLBRIGHT = 4;
/** A texture light's face as hlrad lights with it (lightmap.cpp CreateDirectLights, emit_surface): its value times its
 * colour out of 255, its area, its texture's reflectivity (TEXLIGHT_REFLECT of its mean colour) over pi, falling off
 * as the square of the distance; and hlrad stores a sample of that, doubled, to the power 0.55 (its colour gamma),
 * where s&box shows light to the power 1 / 2.2. So s&box's light is TEXLIGHT_SCALE times hlrad's to the power
 * TEXLIGHT_POWER (0.55 times 2.2), and reaches TEXLIGHT_REACH times the root of hlrad's: where hlrad's sample falls
 * to one level in 255 (so a face's light no longer ends where a small face's brightness said: test_scripts' crystals
 * stopped 35 to 192 units out, its walls 600 away black).
 * A map's own info_texlights is taken as the compilers before VHLT's counted it, without the reflectivity and pi
 * (their DLIGHT_SCALE 2 and LIGHTSCALE 1 where SDHLT's are 1 and 2): Valve's list (texlights.mjs) was calibrated
 * under SDHLT, an info_texlights belongs to the ZHLT years. Measured (2026-10-27): with TEXLIGHT_SCALE fitted on
 * stalkyard alone (8e-8: 0.96 as bright, 9 of 21 starts within a third), test_scripts came out 0.73 as bright, where
 * the old face-as-a-lamp texlight left it 0.38 (0.44 with this reach); 1e-7 has both through: test_scripts 0.82,
 * stalkyard 1.02 (5 of 21 within a third, its starts by its lamps brighter). */
export const TEXLIGHT_SCALE = 1e-7;
export const TEXLIGHT_POWER = 0.55 * 2.2;
export const TEXLIGHT_REACH = Math.sqrt(2 * 256 ** (1 / 0.55 - 1));
const TEXLIGHT_REFLECT = 0.7;
/** A texture light shines from this far in front of its face, so that its face's own plane does not shadow it. */
const TEXLIGHT_OFF = 2;
/** And into this half angle, in degrees: all its side of the face, as GoldSrc's, short of the face's plane. */
const TEXLIGHT_CONE = [60, 89];
/** How many units a tool texture's picture spans. */
const TOOL_TEXTURE_SPAN = 64;
/** GoldSrc's render modes in which renderamt says how solid a brush entity looks (0: not drawn), and the added one;
 * and the brush entities the game never draws, whatever they wear (as draw.mjs has them). */
const FADING_MODES = [1, 2, 3, 5];
const ADDITIVE_MODE = 5;
/** The render mode in which a `{` texture's holes are open (kRenderTransAlpha). */
const HOLES_MODE = 4;
const NEVER_DRAWN = /^(trigger_|func_ladder$|func_monsterclip$|func_buyzone$|func_bomb_target$|msarea_)/;
/** The brush entities that do not block a player: func_illusionary, and those the game never draws (a trigger, a
 * ladder, a monster's clip, a zone); ts_lobby's trigger_hurts blocked 3.5 in a hundred spots when kept solid (2026-10-28). */
const notSolid = (classname) => classname === "func_illusionary" || NEVER_DRAWN.test(classname);
/** Spawn points' classes. */
const SPAWNS = new Set(["info_player_start", "info_player_deathmatch"]);

/** A point's place on a texture laid flat along the axis its face looks down most. */
const flatUv = (p, w) => {
  const e1 = w[1].map((v, k) => v - w[0][k]);
  const e2 = w[2].map((v, k) => v - w[0][k]);
  const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]].map(Math.abs);
  const [a, b] = n[2] >= n[0] && n[2] >= n[1] ? [0, 1] : n[1] >= n[0] ? [0, 2] : [1, 2];
  return [p[a] / TOOL_TEXTURE_SPAN, -p[b] / TOOL_TEXTURE_SPAN];
};
/** A flat polygon's area: half its corners' cross products' length, summed round it. */
function polygonArea(corners) {
  const sum = [0, 0, 0];
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    sum[0] += a[1] * b[2] - a[2] * b[1];
    sum[1] += a[2] * b[0] - a[0] * b[2];
    sum[2] += a[0] * b[1] - a[1] * b[0];
  }
  return Math.hypot(...sum) / 2;
}
const numbersOf = (text) => (text ?? "").trim().split(/\s+/).filter(Boolean).map(Number);
const vector = (v) => v.map((x) => +x.toFixed(4)).join(",");

/** Source's AngleQuaternion: a rotation of pitch (down), yaw (left), roll in degrees, as s&box's Rotation "x,y,z,w". */
export function rotationOf([pitch = 0, yaw = 0, roll = 0]) {
  const half = (deg) => (deg * Math.PI) / 360;
  const [sp, cp, sy, cy, sr, cr] = [Math.sin(half(pitch)), Math.cos(half(pitch)), Math.sin(half(yaw)), Math.cos(half(yaw)), Math.sin(half(roll)), Math.cos(half(roll))]; // prettier-ignore
  return vector([sr * cp * cy - cr * sp * sy, cr * sp * cy + sr * cp * sy, cr * cp * sy - sr * sp * cy, cr * cp * cy + sr * sp * sy]); // prettier-ignore
}

/** The rotation whose forward is `d` (a unit vector), no roll. */
const rotationAlong = (d) =>
  rotationOf([(-Math.asin(Math.max(-1, Math.min(1, d[2]))) * 180) / Math.PI, (Math.atan2(d[1], d[0]) * 180) / Math.PI, 0]); // prettier-ignore

/**
 * A PolygonMesh's saved blob (MeshBlob, version 1), base64, of `polygons` `[{ corners, uvs, material }]`: each
 * polygon its own corners, as s&box winds them (anticlockwise seen from the front), `uvs` one per corner,
 * `material` the index of its material in the mesh's list; `color`, if given, its corners' vertex colour, [r, g, b, a]
 * bytes (a lightmapped face's place in its map's atlas: lightmap.mjs).
 */
export function meshBlob(polygons) {
  let vertices = 0;
  let edges = 0;
  const vertexEdges = [];
  const halfEdges = [];
  const faceEdges = [];
  const positions = [];
  const uvs = [];
  const materials = [];
  const colors = [];
  for (const { corners, uvs: cornerUvs, material, color = [0, 0, 0, 0] } of polygons) {
    const n = corners.length;
    for (let i = 0; i < n; i++) {
      positions.push(corners[i]);
      vertexEdges.push(edges + 2 * i);
    }
    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n;
      const before = (i + n - 1) % n;
      // [the vertex it points to, its twin, the next in its loop, its face]: inside, from corner i to i+1; its
      // twin outside, back, with no face, its loop the other way round
      halfEdges.push([vertices + next, edges + 2 * i + 1, edges + 2 * next, faceEdges.length]);
      halfEdges.push([vertices + i, edges + 2 * i, edges + 2 * before + 1, -1]);
      uvs.push(cornerUvs[next], [0, 0]);
      colors.push(...color, 0, 0, 0, 0);
    }
    faceEdges.push(edges + 2 * (n - 1));
    materials.push(material);
    vertices += n;
    edges += 2 * n;
  }
  const ints = (list) => {
    const b = Buffer.alloc(list.length * 4);
    list.forEach((v, i) => b.writeInt32LE(v, i * 4));
    return b;
  };
  const floats = (rows) => {
    const flat = rows.flat();
    const b = Buffer.alloc(flat.length * 4);
    flat.forEach((v, i) => b.writeFloatLE(v, i * 4));
    return b;
  };
  // HalfEdgeMesh.Serialize: the counts, each vertex's edge, each half-edge, each face's edge
  const topology = ints([vertices, edges, faceEdges.length, ...vertexEdges, ...halfEdges.flat(), ...faceEdges]);
  const sections = [
    ["topology", topology],
    ["positions", floats(positions)],
    ["blends", Buffer.alloc(edges * 4)],
    ["colors", Buffer.from(colors)],
    ["texcoord", floats(uvs)],
    ["materialindex", ints(materials)],
    ["edgeflags", Buffer.alloc(edges * 4)],
  ];
  // the blob's version, its sections' count, then each: its name (ByteStream's string: length, UTF-8), its bytes
  const parts = [ints([1, sections.length])];
  for (const [name, data] of sections) parts.push(ints([Buffer.byteLength(name)]), Buffer.from(name), ints([data.length]), data); // prettier-ignore
  return Buffer.concat(parts).toString("base64");
}

/** A game object of a scene: `components` its, each `{ __type, ...properties }`. */
function gameObject(id, name, { position, rotation, tags = "", components = [] } = {}) {
  return {
    __guid: guidOf(id),
    __version: 2,
    Flags: 0,
    Name: name,
    Position: vector(position ?? [0, 0, 0]),
    Rotation: rotation ?? "0,0,0,1",
    Scale: "1,1,1",
    Tags: tags,
    Enabled: true,
    Components: components.map((c, k) => ({ __guid: guidOf(`${id} ${k}`), __enabled: true, Flags: 0, ...c })),
  };
}

/** The sky as one picture round the world, longitude across, latitude down, as s&box's sky shader lays it: -X in
 * its middle, +Y a quarter of the way to its right. Measured with a picture coloured by the way each part
 * faces (2026-10-28): with +X in its middle, as made before, ts_lobby's sky came out turned half round. */
function skyPicture(sky, width = SKY_WIDTH) {
  const height = width / 2;
  const rgba = new Uint8Array(width * height * 4);
  const colour = [0, 0, 0];
  for (let row = 0; row < height; row++) {
    const lat = (0.5 - (row + 0.5) / height) * Math.PI;
    for (let column = 0; column < width; column++) {
      const lon = (1 - (column + 0.5) / width) * 2 * Math.PI;
      skyColour(sky, Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat), colour);
      const at = (row * width + column) * 4;
      rgba.set([Math.round(colour[0]), Math.round(colour[1]), Math.round(colour[2]), 255], at);
    }
  }
  return { width, height, rgba };
}

/**
 * A GoldSrc map as an s&box scene, from its file. `name`: the scene's (the file's, unless given). `folder`: the
 * port's own folder under scenes/ and materials/ (smak). `folders`: more game folders to look for wads and skies
 * in, after the map's own. `starts`: the classes a player starts at (a mod profile's `starts`; Half-Life's two
 * unless given).
 */
export function portMapToSbox(file, { name, folder = PORT_FOLDER, folders = [], starts = SPAWNS, lighting = "lightmaps" } = {}) {
  if (lighting !== "lightmaps" && lighting !== "lights") throw new Error(`lighting: "lightmaps" or "lights", not ${lighting}`);
  const startClasses = new Set(starts);
  const mapName = (name ?? basename(file).replace(/\.bsp$/i, "")).toLowerCase();
  const warnings = [];
  const files = [];
  const put = (path, data) => files.push({ path, data });
  const bsp = readBsp(readFileSync(file));
  const searched = [...new Set([...mapOwnFolders(file), ...folders].map((f) => resolve(f)))];
  const entities = bsp.entities.map((pairs) => new Map(pairs));
  // the textures that shine (hlrad's lights.rad, as calibrated for Valve's maps: texlights.mjs)
  const shining = new Map(texlightsFor(mapName).map((t) => [t.name.toLowerCase(), t]));
  // and the map's own: an info_texlights's keys are textures, each "r g b brightness" (as SDHLT's hlrad reads it)
  for (const keys of entities.filter((keys) => keys.get("classname") === "info_texlights"))
    for (const [key, value] of keys) {
      const [r, g, b, brightness] = numbersOf(value);
      if (key !== "classname" && key !== "origin" && brightness !== undefined)
        shining.set(key.toLowerCase(), { name: key, rgb: [r, g, b], value: brightness, own: true });
    }

  // ── its textures ──
  const fromWads = texturesFor(bsp, searched, { pixels: true });
  if (fromWads.missing.length) warnings.push(`textures in no wad found, not drawn: ${fromWads.missing.slice(0, 8).join(" ")}${fromWads.missing.length > 8 ? ` and ${fromWads.missing.length - 8} more` : ""}`); // prettier-ignore
  const made = new Map(); // each material's inputs: an entity drawn otherwise makes its own variant of them
  const reflects = []; // each texture's reflectivity, as hlrad has it
  const materials = bsp.textures.map((entry, index) => {
    const kind = textureKind(entry.name);
    if (entry.absent || kind.sky || kind.tool) return null;
    let texture = embeddedTexture(bsp, index);
    let base = `materials/${folder}/maps/${mapName}/${materialName(entry.name)}`;
    if (!texture) {
      const found = fromWads.textures.find((t) => t.name.toLowerCase() === entry.name.toLowerCase());
      if (!found?.texture) return null;
      texture = found.texture;
      base = `materials/${folder}/${materialName(found.wad.replace(/\.wad$/i, ""))}/${materialName(entry.name)}`;
    }
    const original = texture;
    let image = textureRgba(texture);
    const sum = [0, 0, 0];
    for (let p = 0; p < image.rgba.length; p += 4) for (let c = 0; c < 3; c++) sum[c] += image.rgba[p + c];
    reflects[index] = sum.map((c) => ((c / (image.rgba.length / 4) / 255) * TEXLIGHT_REFLECT));
    let mask = null;
    if (kind.holes) {
      // a power of two each way: s&box's texture compiler makes no mipmaps of a mask whose sides are not
      // (stalkyard's {duct_vnt2, 64 by 48, failed), and a face's coordinates are fractions of the picture
      image = powerOfTwo(image, { alpha: true });
      const holes = new Uint8Array(image.width * image.height * 4);
      for (let p = 0; p < image.width * image.height; p++) {
        const a = image.rgba[p * 4 + 3];
        holes.set([a, a, a, 255], p * 4);
      }
      // a hole takes its neighbours' colour, or GoldSrc's see-through blue bleeds into the edge once filtered; the
      // picture opaque, its holes in the mask
      bleedHoles(image.rgba, image.width, image.height);
      for (let p = 3; p < image.rgba.length; p += 4) image.rgba[p] = 255;
      mask = `${base}_mask.png`;
      put(mask, png(image.width, image.height, holes));
    }
    put(`${base}.png`, png(image.width, image.height, image.rgba));
    // a texture that shines is drawn lit by itself, as GoldSrc's light compiler lit it
    const flags = (mask ? MASKED : 0) | (shining.has(entry.name.toLowerCase()) ? FULLBRIGHT : 0);
    const illum = flags & FULLBRIGHT ? `materials/${folder}/tools/white.png` : undefined;
    if (illum && !files.some((f) => f.path === illum)) put(illum, WHITE_PNG);
    put(`${base}.vmat`, vmatOf({ color: `${base}.png`, mask, illum, flags }));
    // its holes filled (the palette's last colour in them, as the game draws them out of render mode 4), made
    // when a face wears it so
    const filled = () => {
      const picture = powerOfTwo(textureRgba({ ...original, holes: false }));
      put(`${base}_filled.png`, png(picture.width, picture.height, picture.rgba));
      return `${base}_filled.png`;
    };
    // a power of two each way, for a variant drawn translucent: complex.shader's translucent mipmaps fail on a picture
    // whose sides are not (ts_parking's ts_wall19, 96 by 128, added, 2026-10-28)
    const even = () => {
      const picture = powerOfTwo(image);
      if (picture.rgba === image.rgba) return `${base}.png`;
      put(`${base}_pot.png`, png(picture.width, picture.height, picture.rgba));
      return `${base}_pot.png`;
    };
    made.set(`${base}.vmat`, { base, mask, illum, flags, filled, even });
    return `${base}.vmat`;
  });
  // a brush entity drawn added to what is behind it (rendermode 5, kRenderTransAdd), as bright as its renderamt
  // says out of 255 and lit by nothing: its own variant of each material, made once. GoldSrc adds it on the screen's
  // colours, s&box in linear light: its share in linear light (to the power 2.2), or a dark room behind it comes out
  // washed in its colour (test_scripts' shield, renderamt 100: s&box's view of the room all purple, 2026-10-27)
  const additiveOf = (material, amount) => {
    const { base } = made.get(material);
    const variant = `${base}_add${amount}.vmat`;
    const illum = `materials/${folder}/tools/white.png`;
    const share = (amount / 255) ** 2.2;
    if (!files.some((f) => f.path === illum)) put(illum, WHITE_PNG);
    if (!files.some((f) => f.path === variant))
      put(variant, vmatOf({ color: translucentPictureOf(material), illum, flags: ADDITIVE | FULLBRIGHT, tint: [share, share, share] })); // prettier-ignore
    return variant;
  };
  // a brush entity seen through (rendermode 1 to 3: kRenderTransColor, Texture, Glow) at its renderamt out of 255:
  // glass, mostly (ts_lobby's skylights at 150, drawn opaque before 2026-10-28). GoldSrc draws it with no lightmap,
  // at full light (Xash R_HasLightmap), so lit by itself
  const seenThroughOf = (material, amount) => {
    const { base } = made.get(material);
    const variant = `${base}_see${amount}.vmat`;
    const see = `materials/${folder}/tools/white.png`;
    if (!files.some((f) => f.path === see)) put(see, WHITE_PNG);
    if (!files.some((f) => f.path === variant)) put(variant, vmatOf({ color: translucentPictureOf(material), illum: see, flags: FULLBRIGHT, opacity: amount / 255, see })); // prettier-ignore
    return variant;
  };
  // a `{` texture's holes are open only on a brush entity in render mode 4 (kRenderTransAlpha, "Solid"); on the world
  // and in any other mode the game draws them filled with the palette's last colour (draw.mjs lookOf), blue as a rule
  const filledPictures = new Map();
  const pictureOf = (material) => {
    const { base, mask, filled } = made.get(material);
    if (!mask) return `${base}.png`;
    if (!filledPictures.has(material)) filledPictures.set(material, filled());
    return filledPictures.get(material);
  };
  // the picture as a translucent variant wears it: a power of two each way (`even`; a filled one is already)
  const evenPictures = new Map();
  const translucentPictureOf = (material) => {
    const { mask, even } = made.get(material);
    if (mask) return pictureOf(material);
    if (!evenPictures.has(material)) evenPictures.set(material, even());
    return evenPictures.get(material);
  };
  const filledOf = (material) => {
    const { base, illum, flags } = made.get(material);
    const variant = `${base}_filled.vmat`;
    if (!files.some((f) => f.path === variant)) put(variant, vmatOf({ color: pictureOf(material), illum, flags: flags & ~MASKED }));
    return variant;
  };
  // ── its light, when GoldSrc's own (lighting "lightmaps", lightmap.mjs): every face's lightmap in one picture of the
  // map's, the light as the map starts, its styles that change played by the shader, each texture's material made
  // the map's own to read it ──
  const atlasPath = `materials/${folder}/maps/${mapName}/lightmap.png`;
  const stylesPath = `materials/${folder}/maps/${mapName}/lightstyles.png`;
  let atlas = null;
  if (lighting === "lightmaps") {
    atlas = lightmapAtlas(bsp, bsp.models.flatMap((_, m) => modelFaces(bsp, m)));
    put(atlasPath, png(atlas.width, atlas.height, atlas.rgba));
    if (atlas.styles) put(stylesPath, png(atlas.styles.width, atlas.styles.height, atlas.styles.rgba));
    put(LIGHTMAP_SHADER, lightmapShader());
  }
  // the texture as a lightmapped face wears it: `light` "lit" (its lightmap's), "full" (a liquid's: no lightmap, full
  // light) or "dark" (a face the compiler left unlit, which GoldSrc draws black); its holes open or filled; `size`
  // the texture's in pixels, which its face's coordinates are fractions of
  const litOf = (material, light, holesOpen, size) => {
    const { base, mask } = made.get(material);
    const open = Boolean(mask) && holesOpen;
    const own = base.slice(`materials/${folder}/`.length).replace(/\//g, "_");
    const variant = `materials/${folder}/maps/${mapName}/lit/${own}${light === "lit" ? "" : `_${light}`}${open ? "_holes" : ""}.vmat`; // prettier-ignore
    if (!files.some((f) => f.path === variant)) {
      const lines = ["// Made by SMAK (sbox-map): a GoldSrc texture lit by its map's lightmaps (lightmap.mjs).", "", "Layer0", "{", `\tshader "${LIGHTMAP_SHADER}"`]; // prettier-ignore
      if (open) lines.push("\tF_ALPHA_TEST 1");
      if (light !== "lit") lines.push("\tF_FULL_LIGHT 1");
      lines.push(`\tTextureColor "${open ? `${base}.png` : pictureOf(material)}"`);
      if (open) lines.push(`\tTextureTranslucency "${mask}"`, '\tg_flAlphaTestReference "0.500"');
      lines.push(`\tTextureLightmap "${atlasPath}"`, `\tg_vLightmapSize "[${atlas.width}.000000 ${atlas.height}.000000]"`, `\tg_vTextureSize "[${size[0]}.000000 ${size[1]}.000000]"`); // prettier-ignore
      if (light === "lit" && atlas.styles) lines.push(`\tg_flStyleLayers "${atlas.layers}.000"`, `\tg_flFirstLayer "${atlas.firstLayer}.000"`, `\tg_flLayerHeight "${atlas.layerHeight}.000"`, `\tTextureStyles "${stylesPath}"`); // prettier-ignore
      if (light === "dark") lines.push('\tg_flLightScale "0.000"');
      lines.push("}", "");
      put(variant, lines.join("\n"));
    }
    return variant;
  };

  // the material of what blocks unseen (clip brushes, a brush entity's undrawn solids), seen in the editor only
  const clipMaterial = `materials/${folder}/tools/playerclip.vmat`;
  let clipMade = false;
  const clipMaterialUsed = () => {
    if (!clipMade) {
      put(`materials/${folder}/tools/playerclip.png`, png(4, 4, new Uint8Array(64).fill(255).map((v, i) => [160, 40, 200, 255][i % 4]))); // prettier-ignore
      put(clipMaterial, vmatOf({ color: `materials/${folder}/tools/playerclip.png`, flags: ADDITIVE }));
      clipMade = true;
    }
    return clipMaterial;
  };
  const hullMesh = (region) => ({
    __type: "Sandbox.MeshComponent",
    Collision: "Hull",
    Static: true,
    HideInGame: true,
    SmoothingAngle: 0,
    // each side's corners as s&box winds them, the texture laid flat on the side's main axis
    Mesh: { Data: meshBlob(region.windings.map((w) => ({ corners: [...w].reverse(), uvs: [...w].reverse().map((p) => flatUv(p, w)), material: 0 }))), Materials: [clipMaterialUsed()] }, // prettier-ignore
  });

  // ── its faces: the world's, then each brush entity's ──
  const objects = [];
  const meshes = [];
  const brushModels = [{ model: 0, keys: entities[0] ?? new Map([["classname", "worldspawn"]]) }];
  for (const keys of entities) {
    const model = /^\*(\d+)$/.exec(keys.get("model") ?? "");
    if (model) brushModels.push({ model: Number(model[1]), keys });
  }
  const emitters = [];
  for (const { model, keys } of brushModels) {
    const classname = keys.get("classname") ?? "worldspawn";
    const at = numbersOf(keys.get("origin")).length === 3 ? numbersOf(keys.get("origin")) : [0, 0, 0];
    // how GoldSrc draws it (draw.mjs lookOf, from Xash3D's renderer): render modes 1, 2, 3 and 5 fade it by its
    // renderamt, and at 0 it is not drawn (still solid as its class is); some classes are never drawn
    const mode = model ? Number(keys.get("rendermode") ?? 0) || 0 : 0;
    const amount = Math.round(Number(keys.get("renderamt") ?? 0) || 0);
    const fades = FADING_MODES.includes(mode);
    const hidden = model > 0 && (NEVER_DRAWN.test(classname) || (fades && amount <= 0));
    const additive = fades && mode === ADDITIVE_MODE ? amount : null;
    const seenThrough = fades && mode !== ADDITIVE_MODE && amount < 255 ? amount : null;
    const holesOpen = model > 0 && mode === HOLES_MODE;
    const used = [];
    const polygons = [];
    for (const face of hidden ? [] : modelFaces(bsp, model)) {
      const texture = faceTexture(bsp, face);
      const base = materials[texture.index];
      // drawn with its lightmap, as the game draws it unless faded or added (lighting "lightmaps")
      const place = atlas && additive === null && seenThrough === null ? atlas.offsetOf(face) : null;
      const lit = atlas && additive === null && seenThrough === null;
      const material = !base ? base : additive !== null ? additiveOf(base, additive) : seenThrough !== null ? seenThroughOf(base, seenThrough) : lit ? litOf(base, place ? "lit" : atlas.fullOf(face) ? "full" : "dark", holesOpen, [texture.width, texture.height]) : made.get(base).mask && !holesOpen ? filledOf(base) : base; // prettier-ignore
      if (!material) continue;
      if (!used.includes(material)) used.push(material);
      const corners = facePolygon(bsp, face);
      polygons.push({ corners: [...corners].reverse(), uvs: faceUvs(bsp, face).reverse(), material: used.indexOf(material), ...(place ? { color: place } : {}) }); // prettier-ignore
      // the faces that shine, lights of s&box's before them (lighting "lights")
      const light = !atlas && shining.get(texture.name.toLowerCase());
      if (light) emitters.push({ texture: texture.name, light, reflect: reflects[texture.index], corners: corners.map((p) => p.map((v, k) => v + at[k])), normal: faceNormal(bsp, face) }); // prettier-ignore
    }
    if (!polygons.length && !(hidden && !notSolid(classname))) continue;
    const objectName = model ? `${classname} *${model}` : "worldspawn";
    const collision = notSolid(classname) ? "None" : "Mesh";
    if (polygons.length) meshes.push({ name: objectName, model, at, faces: polygons.length, materials: used, collision }); // prettier-ignore
    // a solid brush entity blocks with its every brush, as GoldSrc's hull has them: the drawn faces miss a side
    // the mapper textured NULL (test_scripts' shield, a cage whose lid is never drawn)
    const solids = model && collision !== "None" ? entityBrushesOf(bsp, model).map((b) => regionOf(b.planes.filter((p) => !p.bevel))).filter(Boolean) : []; // prettier-ignore
    const solidChildren = solids.map((region, k) => gameObject(`${mapName} ${objectName} solid ${k}`, `solid ${k}`, { tags: `${BRUSH_TAG},${CLIP_TAG}`, components: [hullMesh(region)] })); // prettier-ignore
    objects.push({
      ...gameObject(`${mapName} ${objectName}`, objectName, {
        position: at,
        tags: model ? (collision === "None" ? "" : BRUSH_TAG) : WORLD_TAG,
        // one not drawn keeps only its solids
        components: polygons.length
          ? [
              {
                __type: "Sandbox.MeshComponent",
                Collision: collision,
                Static: true,
                SmoothingAngle: 0,
                Mesh: { Data: meshBlob(polygons), Materials: used },
              },
            ]
          : [],
      }),
      ...(solidChildren.length ? { Children: solidChildren } : {}),
    });
  }

  // ── its clip brushes: rebuilt from the player's hulls, each solid all through, seen in the editor only ──
  const clips = clipBrushesOf(bsp, { skySolid: true })
    .map((b) => regionOf(b.planes.filter((p) => !p.bevel)))
    .filter(Boolean);
  const children = clips.map((region, k) => {
    const objectName = `clip ${k}`;
    meshes.push({ name: objectName, faces: region.windings.length, materials: [clipMaterialUsed()], collision: "Hull" });
    return gameObject(`${mapName} ${objectName}`, objectName, { tags: `${WORLD_TAG},${CLIP_TAG}`, components: [hullMesh(region)] });
  });
  // and the world's sky faces, never drawn, solid as GoldSrc's player hulls have the sky: a sky face that closes the
  // map has the void behind it, a region of the hull the clip brushes' samples miss its growth in (ts_parking's
  // sky, 93 spots of 5000 blocked only in GoldSrc, 2026-10-28)
  const skyFaces = modelFaces(bsp, 0).filter((face) => textureKind(faceTexture(bsp, face).name).sky);
  if (skyFaces.length) {
    const polygons = skyFaces.map((face) => ({ corners: [...facePolygon(bsp, face)].reverse(), uvs: faceUvs(bsp, face).reverse(), material: 0 })); // prettier-ignore
    meshes.push({ name: "sky clip", faces: polygons.length, materials: [clipMaterialUsed()], collision: "Mesh" });
    children.push(gameObject(`${mapName} sky clip`, "sky clip", { tags: `${WORLD_TAG},${CLIP_TAG}`, components: [{ __type: "Sandbox.MeshComponent", Collision: "Mesh", Static: true, HideInGame: true, SmoothingAngle: 0, Mesh: { Data: meshBlob(polygons), Materials: [clipMaterialUsed()] } }] })); // prettier-ignore
  }
  if (children.length) objects.push({ ...gameObject(`${mapName} clip`, "clip", { tags: CLIP_TAG }), Children: children });

  // ── its sky ──
  const skyName = (entities[0]?.get("skyname") || "desert").toLowerCase();
  const sky = skyOf(skyName, searched);
  let skyMaterial = null;
  if (sky.sides) {
    const base = `materials/${folder}/sky/${materialName(skyName)}`;
    const picture = skyPicture(sky);
    put(`${base}.png`, png(picture.width, picture.height, picture.rgba));
    put(`${base}.vmat`, `// Made by SMAK (sbox-map) from GoldSrc's sky ${skyName}.\n\nLayer0\n{\n\tshader "shaders/sky.shader"\n\tSkyTexture "${base}.png"\n}\n`); // prettier-ignore
    skyMaterial = `${base}.vmat`;
    objects.push(gameObject(`${mapName} sky`, "sky", { components: [{ __type: "Sandbox.SkyBox2D", SkyMaterial: skyMaterial, Tint: "1,1,1,1", SkyIndirectLighting: !atlas }] })); // prettier-ignore
  } else warnings.push(`sky ${skyName}: ${sky.why}; none drawn`);

  // ── its spawn points and lights ──
  const spawns = [];
  const lights = [];
  entities.forEach((keys, k) => {
    const classname = keys.get("classname");
    const origin = numbersOf(keys.get("origin"));
    if (origin.length !== 3) return;
    const id = `${mapName} ${classname} ${k}`;
    if (startClasses.has(classname)) {
      const yaw = numbersOf(keys.get("angles"))[1] ?? Number(keys.get("angle") ?? 0);
      const feet = [origin[0], origin[1], origin[2] - PLAYER_HALF_HEIGHT];
      spawns.push({ classname, origin, feet, yaw });
      objects.push(gameObject(id, classname, { position: feet, rotation: rotationOf([0, yaw, 0]), components: [{ __type: "Sandbox.SpawnPoint" }] })); // prettier-ignore
      return;
    }
    if (classname !== "light" && classname !== "light_spot" && classname !== "light_environment") return;
    const colour = lightOf(keys);
    const brightness = numbersOf(keys.get("_light"))[3] ?? 200;
    const reach = Math.sqrt(brightness) * LIGHT_REACH;
    const LightColor = `${vector(colour)},1`;
    if (classname === "light") {
      lights.push({ classname, origin, colour, reach });
      objects.push(gameObject(id, classname, { position: origin, components: [{ __type: "Sandbox.PointLight", LightColor, Radius: +reach.toFixed(1), Attenuation: 1, Shadows: true }] })); // prettier-ignore
      return;
    }
    const direction = directionOf(keys);
    if (classname === "light_spot") {
      const inner = Number(keys.get("_cone") ?? 10);
      const outer = Math.max(inner, Number(keys.get("_cone2") ?? 20));
      lights.push({ classname, origin, colour, reach, direction, inner, outer });
      objects.push(gameObject(id, classname, { position: origin, rotation: rotationAlong(direction), components: [{ __type: "Sandbox.SpotLight", LightColor, Radius: +reach.toFixed(1), ConeInner: inner, ConeOuter: outer, Attenuation: 1, Shadows: true }] })); // prettier-ignore
      return;
    }
    // light_environment: the sun's way is where it shines, from the sky; a map has one of each or two alike
    if (lights.some((l) => l.classname === classname)) return;
    const sun = colour.map((c) => c * SUN_SCALE);
    lights.push({ classname, origin, colour: sun, direction });
    objects.push(gameObject(id, classname, { position: origin, rotation: rotationAlong(direction), components: [{ __type: "Sandbox.DirectionalLight", LightColor: `${vector(sun)},1`, SkyColor: `${vector(colour.map((c) => c * SKY_LIGHT_SHARE))},1`, Shadows: true }] })); // prettier-ignore
  });
  // the faces that shine, each a light before it, shining out of it
  const bounds = worldBounds(bsp);
  const across = Math.hypot(...[0, 1, 2].map((c) => bounds.maxs[c] - bounds.mins[c]));
  emitters.forEach(({ texture, light, reflect, corners, normal }, k) => {
    const area = polygonArea(corners);
    const middle = [0, 1, 2].map((c) => corners.reduce((sum, p) => sum + p[c], 0) / corners.length);
    const origin = middle.map((v, c) => v + normal[c] * TEXLIGHT_OFF);
    const hlrad = light.rgb.map((c, i) => light.value * (c / 255) * area * (light.own ? 1 : (reflect?.[i] ?? 0.5) / Math.PI)); // prettier-ignore
    const colour = hlrad.map((c) => TEXLIGHT_SCALE * c ** TEXLIGHT_POWER);
    // no farther than across the world: a bright lamp's sample is still one level across a whole map
    const reach = Math.min(across, TEXLIGHT_REACH * Math.sqrt(Math.max(...hlrad)));
    lights.push({ classname: "texlight", texture, origin, colour, reach, direction: normal, inner: TEXLIGHT_CONE[0], outer: TEXLIGHT_CONE[1] }); // prettier-ignore
    objects.push(gameObject(`${mapName} texlight ${k}`, `texlight ${texture}`, { position: origin, rotation: rotationAlong(normal), components: [{ __type: "Sandbox.SpotLight", LightColor: `${vector(colour)},1`, Radius: +reach.toFixed(1), ConeInner: TEXLIGHT_CONE[0], ConeOuter: TEXLIGHT_CONE[1], Attenuation: 1, Shadows: true }] })); // prettier-ignore
  });
  if (!spawns.length) warnings.push(`no spawn point (${[...startClasses].join(", ")}) in it`);

  // ── its bounced light ──
  // GoldSrc's light compiler bounced every light round the map into its lightmaps; s&box's lights are direct only,
  // and test_scripts' crystal room came out an eighth as bright. s&box's own indirect light (DDGI) over the whole
  // world stands in, baked in the editor (sbox-map-check bakes it); the clip brushes kept out of it
  const world = worldBounds(bsp);
  if (!atlas) objects.push(gameObject(`${mapName} indirect light`, INDIRECT_LIGHT, { components: [{ __type: "Sandbox.IndirectLightVolume", Bounds: { Mins: vector(world.mins.map((v) => v - 16)), Maxs: vector(world.maxs.map((v) => v + 16)) }, ProbeDensity: INDIRECT_LIGHT_DENSITY, RenderExcludeTags: CLIP_TAG }] })); // prettier-ignore

  const scene = `scenes/${folder}/${mapName}.scene`;
  put(
    scene,
    `${JSON.stringify(
      {
        __guid: guidOf(scene),
        GameObjects: objects,
        SceneProperties: { Metadata: { Title: mapName } },
        ResourceVersion: 3,
        Title: mapName,
        Description: `GoldSrc's ${basename(file)}, ported by SMAK`,
        __references: [],
        __version: 3,
      },
      null,
      2,
    )}\n`,
  );
  const facts = {
    faces: meshes.reduce((n, m) => n + m.faces, 0),
    meshes: meshes.length,
    materials: materials.filter(Boolean).length,
    spawns: spawns.length,
    lights: lights.length,
    sky: skyMaterial ? skyName : null,
  };
  return { name: mapName, scene, files, meshes, spawns, lights, sky: skyMaterial, lighting, warnings, facts };
}

/** The port's files written under `out` (a project's Assets folder). Returns their paths. The bake of the scene's
 * indirect light kept, when its record (BAKE_RECORD) has the port's key and its textures are there; `port.baked` says. */
export function writeSboxMap(port, out) {
  port.bakeKey = bakeKeyOf(port);
  port.baked = false;
  const record = join(out, sceneDataOf(port.scene), BAKE_RECORD);
  const kept = existsSync(record) ? JSON.parse(readFileSync(record, "utf8")) : null;
  if (kept?.key === port.bakeKey && BAKED_FIELDS.every((f) => kept.textures?.[f] && existsSync(join(out, `${kept.textures[f]}_c`)))) {
    const file = port.files.find((f) => f.path === port.scene);
    const scene = JSON.parse(file.data);
    const volume = scene.GameObjects.find((o) => o.Name === INDIRECT_LIGHT)?.Components.find((c) => c.__type === "Sandbox.IndirectLightVolume"); // prettier-ignore
    if (volume) {
      Object.assign(volume, kept.textures);
      file.data = `${JSON.stringify(scene, null, 2)}
`;
      port.baked = true;
    }
  }
  return port.files.map(({ path, data }) => {
    const target = join(out, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, data);
    return target;
  });
}

/** A GoldSrc map ported and written under `out` (a project's Assets). Returns the port, with `written`. */
export function portMapToSboxFile(file, { out, ...options } = {}) {
  if (!out) throw new Error("portMapToSboxFile: `out` is a project's Assets folder");
  const port = portMapToSbox(file, options);
  const written = writeSboxMap(port, out);
  return { ...port, written };
}
