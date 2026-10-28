// A map's port held to its GoldSrc map in s&box's own editor: the scene opened there, its meshes, sky, spawn points
// and lights read back, and its world asked where a player is blocked, spot by spot, as GoldSrc's hulls say.
//
//   mapProbeCode(scene, spots, floors)          the C# that opens the scene and reads it (run_csharp)
//   expectedMapOf(file, port, { count, seed })  what the GoldSrc map says: its spots and what blocks each, its floors
//   compareSboxMap(expected, read, { allow })   -> { passed, faults, said, collision }
//   lightCamerasCode(views), compareLight(goldsrc, sbox)   its light pictured from the starts, held to GoldSrc's
//   checkSboxMap(file, { project, name, folder, folders, count, seed, allow, light, sbox, shot })   the whole check
//
// WHAT IS HELD:
// - every mesh the port wrote, by its game object's name, with its faces (none refused as bad) and materials, and
//   each material compiled (not s&box's error material);
// - the sky drawn with the port's material; every spawn point and light where the port put it;
// - where a player is blocked (the GMod port's gmod-collision, source/collision.mjs): `count` spots inside the map
//   (collisionSpots, a seed giving the same ones), each asked of GoldSrc's hull 1 (standing) and hull 3 (ducked),
//   and of the s&box world (the game object tagged `world`) with the player's box standing on the spot's floor,
//   32 by 32 by 72 (36 ducked): Scene.Trace.Box, started solid or not. A spot blocked only in s&box where the drawn
//   world is inside the box is s&box right and GoldSrc's compiled hull loose (worldInBox), and not counted. PASS when
//   the rest disagree on no more than `allow` in a hundred, standing and ducked, as gmod-collision;
// - each spawn point's floor: a ray down from where GoldSrc's player stands on it, the floor met where GoldSrc's
//   hull 0 has it (floorUnder), within FLOOR_TOLERANCE, and the player's box at its feet not started solid;
// - its light (`light`, unless false): from each start's eye, looking its way, a picture of s&box's (a camera of
//   the check's own, no tonemapping, the clip brushes left out) and GoldSrc's, drawn with its lightmaps as the game
//   draws them (maps/draw.mjs drawMap), the same size and field of view. Each cut in LIGHT_GRID regions, each
//   region's brightness its pixels' mean (0.3 r + 0.59 g + 0.11 b). The whole as bright as GoldSrc's (the views'
//   ratios' geometric mean within LIGHT_RATIO), and lit in the same places (each view's regions correlated with
//   GoldSrc's, LIGHT_LIKENESS or more on average). s&box's lights are not GoldSrc's light compiler: no light bounces,
//   so a single view may be off by more (stalkyard's, by a third either way on 17 of 21).
//
// THE EDITOR. The scene is opened in the project's editor (a tab of its own, not saved), as the one being edited:
// a scene loaded and never ticked builds no physics.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readBsp, contentsAt, floorUnder } from "../maps/bsp.mjs";
import { drawMap } from "../maps/draw.mjs";
import { mapOwnFolders } from "../maps/wad.mjs";
import { png, unpng } from "../image.mjs";
import { collisionSpots, worldInBox } from "../source/collision.mjs";
import { LIGHTMAP_SHADER } from "./lightmap.mjs";
import { editorFor, editorWindowsShown, runCsharp, sboxCall, projectFolder, compileFailures } from "./editor.mjs";
import { findSbox } from "./compile.mjs";
import { portMapToSboxFile, indirectProbes, sceneDataOf, BAKE_RECORD, BAKED_FIELDS, INDIRECT_LIGHT, PLAYER_HALF_HEIGHT, WORLD_TAG, CLIP_TAG, BRUSH_TAG } from "./map.mjs"; // prettier-ignore
import { join } from "node:path";

/** In hundredths of the spots, how many may disagree (gmod-collision's --allow). */
export const COLLISION_ALLOW = 0.5;
/** How far a spawn point's floor may be from GoldSrc's, in units. */
export const FLOOR_TOLERANCE = 0.5;
/** How long the indirect light's bake may take: this much a probe as the bake counts them, and no less than this, in
 * milliseconds. test_scripts' 2704 baked at 193 a second; ts_lobby's, each probe drawing 69 shadowed lights, at 6 to 26
 * (2026-10-28): 200 ms a probe, a little slower than the slowest. */
const BAKE_PER_PROBE = 200;
const BAKE_LEAST = 300_000;
/** The pictures of the light: their size, field of view (degrees across), and the eye above a start's feet
 * (GoldSrc's player's view, 28 above its middle). */
export const LIGHT_VIEW = { width: 640, height: 360, fov: 80, eye: 64 };
/** The regions a picture is cut into, across and down. */
export const LIGHT_GRID = [16, 9];
/** How bright the whole may be beside GoldSrc's, least and most (the views' ratios' geometric mean). */
export const LIGHT_RATIO = [0.8, 1.25];
/** How alike, on average, each view's regions must be lit (correlated with GoldSrc's). */
export const LIGHT_LIKENESS = 0.7;
const LIGHT_CAMERA = "smak_light_camera";
/** How long the editor is given to build the scene's meshes and physics, in milliseconds. */
const SCENE_SETTLE = 3000;
const SOLID = -2;
const DUCKED_HALF_HEIGHT = 18;

const csString = (s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const csFloats = (list) => `new float[] { ${list.map((v) => `${+v}f`).join(", ")} }`;

/**
 * The C# that opens `scene` in the editor and reads it back: its meshes, sky, spawn points and lights, whether
 * each of `spots` ([[x, y, z]], the player's middle) is blocked standing and ducked, and the floor under each of
 * `floors` ([[x, y, z]]).
 */
export function mapProbeCode(scene, spots, floors) {
  return `
var file = ResourceLibrary.Get<SceneFile>( ${csString(scene)} );
if ( file is null ) return new { error = "the scene is not in the project's assets: " + ${csString(scene)} };
// a tab already open on it (an earlier check's) keeps the scene as it was then: closed, so the port just written is read
foreach ( var open in Editor.SceneEditorSession.All.Where( x => x.Scene?.Source?.ResourcePath == file.ResourcePath ).ToList() ) open.Destroy();
Editor.EditorScene.OpenScene( file );
await Task.Delay( ${SCENE_SETTLE} );
var s = Editor.SceneEditorSession.Active.Scene;
var meshes = s.GetAllComponents<MeshComponent>().Select( m => new {
  name = m.GameObject.Name,
  faces = m.Mesh?.FaceHandles.Count() ?? 0,
  bad = m.Mesh?.BadFaces.Count ?? 0,
  materials = m.Mesh is null ? new string[0] : m.Mesh.FaceHandles.Select( f => m.Mesh.GetFaceMaterial( f ) ).Where( x => x is not null ).Select( x => x.ResourcePath + ( x.IsError ? " (error)" : "" ) ).Distinct().ToArray(),
  collision = m.Collision.ToString(),
  at = m.WorldPosition.ToString(),
} ).ToList();
var sky = s.GetAllComponents<SkyBox2D>().Select( k => k.SkyMaterial is null ? null : k.SkyMaterial.ResourcePath + ( k.SkyMaterial.IsError ? " (error)" : "" ) ).ToList();
var spawns = s.GetAllComponents<SpawnPoint>().Select( p => p.WorldPosition.ToString() ).ToList();
var lights = s.GetAllComponents<Light>().Select( l => new { type = l.GetType().Name, at = l.WorldPosition.ToString(), forward = l.WorldRotation.Forward.ToString() } ).ToList();
var spots = ${csFloats(spots.flat())};
var standing = new System.Text.StringBuilder();
var ducked = new System.Text.StringBuilder();
var stand = new BBox( new Vector3( -16, -16, -${PLAYER_HALF_HEIGHT} ), new Vector3( 16, 16, ${PLAYER_HALF_HEIGHT} ) );
var duck = new BBox( new Vector3( -16, -16, -${DUCKED_HALF_HEIGHT} ), new Vector3( 16, 16, ${DUCKED_HALF_HEIGHT} ) );
for ( int i = 0; i < spots.Length; i += 3 )
{
  var p = new Vector3( spots[i], spots[i + 1], spots[i + 2] );
  standing.Append( s.Trace.Box( stand, p, p ).WithAnyTags( ${csString(WORLD_TAG)}, ${csString(BRUSH_TAG)} ).Run().StartedSolid ? '1' : '0' );
  ducked.Append( s.Trace.Box( duck, p, p ).WithAnyTags( ${csString(WORLD_TAG)}, ${csString(BRUSH_TAG)} ).Run().StartedSolid ? '1' : '0' );
}
var floors = ${csFloats(floors.flat())};
var under = new System.Collections.Generic.List<object>();
for ( int i = 0; i < floors.Length; i += 3 )
{
  var p = new Vector3( floors[i], floors[i + 1], floors[i + 2] );
  var down = s.Trace.Ray( p, p + Vector3.Down * 4096 ).WithAnyTags( ${csString(WORLD_TAG)}, ${csString(BRUSH_TAG)} ).Run();
  var feet = new Vector3( p.x, p.y, down.HitPosition.z );
  var stuck = s.Trace.Box( new BBox( new Vector3( -16, -16, 0.5f ), new Vector3( 16, 16, ${PLAYER_HALF_HEIGHT * 2} ) ), feet, feet ).WithAnyTags( ${csString(WORLD_TAG)}, ${csString(BRUSH_TAG)} ).Run().StartedSolid;
  under.Add( new { hit = down.Hit, z = down.HitPosition.z, stuck } );
}
return new { scene = s.Name, meshes, sky, spawns, lights, standing = standing.ToString(), ducked = ducked.ToString(), under };
`;
}

/**
 * What the GoldSrc map says, beside what its port wrote: the spots and whether hull 1 and hull 3 block each; each
 * spawn point's floor under GoldSrc's player.
 */
export function expectedMapOf(file, port, { count = 5000, seed = 1 } = {}) {
  const bsp = readBsp(readFileSync(file));
  const spots = collisionSpots(bsp, { count, seed });
  // the world, and each brush entity the port made solid (a door, a func_wall), each at its own place: GoldSrc
  // blocks a player with them too
  const solids = [{ model: 0, at: [0, 0, 0] }, ...port.meshes.filter((m) => m.model && m.collision !== "None")];
  const blocked = (p, hull) => solids.some(({ model, at }) => contentsAt(bsp, p.map((v, k) => v - at[k]), { hull, model }) === SOLID);
  return {
    bsp,
    spots,
    standing: spots.map((p) => blocked(p, 1)),
    ducked: spots.map((p) => blocked(p, 3)),
    floors: port.spawns.map((s) => ({ ...s, floor: floorUnder(bsp, s.origin, { hull: 0, reach: 4096 }) })),
    meshes: port.meshes,
    sky: port.sky,
    spawns: port.spawns,
    lights: port.lights,
  };
}

const numbers = (text) => String(text).split(",").map(Number);
const far = (a, b) => Math.hypot(...a.map((v, k) => v - b[k]));

/** One way of standing, GoldSrc's hull against s&box's world: `{ both, free, onlyGoldSrc, onlySbox, intoWorld, unexplained }`. */
function collisionOf(expected, blockedGoldSrc, blockedSbox, half) {
  let both = 0;
  const onlyGoldSrc = [];
  const onlySbox = [];
  expected.spots.forEach((p, i) => {
    const gs = blockedGoldSrc[i];
    const sb = blockedSbox[i] === "1";
    if (gs && sb) both++;
    else if (gs) onlyGoldSrc.push(p);
    else if (sb) onlySbox.push(p);
  });
  const intoWorld = onlySbox.filter((p) => worldInBox(expected.bsp, p, half));
  const unexplained = onlySbox.filter((p) => !intoWorld.includes(p));
  const off = onlyGoldSrc.length + unexplained.length;
  return { spots: expected.spots.length, both, free: expected.spots.length - both - onlyGoldSrc.length - onlySbox.length, onlyGoldSrc, onlySbox, intoWorld, unexplained, off, share: (100 * off) / expected.spots.length }; // prettier-ignore
}

/** The read scene held to what was expected. */
export function compareSboxMap(expected, read, { allow = COLLISION_ALLOW } = {}) {
  const faults = [];
  const said = [];
  if (read.error) return { passed: false, faults: [read.error], said };
  // its meshes
  for (const m of expected.meshes) {
    const got = read.meshes.find((r) => r.name === m.name);
    if (!got) {
      faults.push(`${m.name}: no mesh in the scene`);
      continue;
    }
    if (got.faces !== m.faces) faults.push(`${m.name}: ${got.faces} faces, of ${m.faces}`);
    if (got.bad) faults.push(`${m.name}: ${got.bad} faces refused as bad`);
    const errors = got.materials.filter((x) => x.endsWith("(error)"));
    if (errors.length) faults.push(`${m.name}: ${errors.length} materials not compiled (${errors.slice(0, 4).join(", ")})`);
    const missing = m.materials.filter((x) => !got.materials.some((g) => g.replace(/ \(error\)$/, "") === x));
    if (missing.length) faults.push(`${m.name}: wears none of ${missing.slice(0, 4).join(", ")}`);
    if (got.collision !== m.collision) faults.push(`${m.name}: collides as ${got.collision}, not ${m.collision}`);
  }
  // its sky, spawn points and lights
  if (expected.sky && !read.sky.includes(expected.sky)) faults.push(`the sky is ${read.sky.join(", ") || "none"}, not ${expected.sky}`); // prettier-ignore
  const unmatched = (list, places) => list.filter((p) => !places.some((q) => far(p, q) < 0.01));
  const spawnsMissing = unmatched(expected.spawns.map((s) => s.feet), read.spawns.map(numbers));
  if (read.spawns.length !== expected.spawns.length || spawnsMissing.length) faults.push(`${read.spawns.length} spawn points, of ${expected.spawns.length}${spawnsMissing.length ? `; none at ${spawnsMissing.slice(0, 3).map((p) => p.join(" ")).join(", ")}` : ""}`); // prettier-ignore
  const lightsMissing = expected.lights.filter((l) => !read.lights.some((r) => far(l.origin, numbers(r.at)) < 0.01 && (!l.direction || far(l.direction, numbers(r.forward)) < 0.01))); // prettier-ignore
  if (read.lights.length !== expected.lights.length || lightsMissing.length) faults.push(`${read.lights.length} lights, of ${expected.lights.length}${lightsMissing.length ? `; none at (or shining the way of) ${lightsMissing.slice(0, 3).map((l) => `${l.classname} ${l.origin.join(" ")}`).join(", ")}` : ""}`); // prettier-ignore
  // where a player is blocked
  if (read.standing.length !== expected.spots.length || read.ducked.length !== expected.spots.length)
    faults.push(`the editor answered ${read.standing.length} spots of ${expected.spots.length}`);
  const standing = collisionOf(expected, expected.standing, read.standing, PLAYER_HALF_HEIGHT);
  const ducked = collisionOf(expected, expected.ducked, read.ducked, DUCKED_HALF_HEIGHT);
  for (const [way, c] of [["standing", standing], ["ducked", ducked]])
    if (c.share > allow) faults.push(`${way}: ${c.off} of ${c.spots} spots blocked otherwise than in GoldSrc (${c.share.toFixed(2)} in a hundred; ${allow} allowed): ${c.onlyGoldSrc.length} only in GoldSrc, ${c.unexplained.length} only in s&box`); // prettier-ignore
  // each spawn point's floor
  expected.floors.forEach((f, i) => {
    const got = read.under[i];
    if (f.floor === null) return;
    if (!got?.hit) faults.push(`spawn ${f.origin.join(" ")}: no floor under it in s&box (GoldSrc's at ${f.floor})`);
    else if (Math.abs(got.z - f.floor) > FLOOR_TOLERANCE) faults.push(`spawn ${f.origin.join(" ")}: its floor at ${got.z.toFixed(2)}, GoldSrc's at ${f.floor}`); // prettier-ignore
    else if (got.stuck) faults.push(`spawn ${f.origin.join(" ")}: the player stuck in the world standing on its floor`);
  });
  const faces = read.meshes.reduce((n, m) => n + m.faces, 0);
  said.push(
    `${read.meshes.length} meshes, ${faces} faces; sky ${read.sky.join(", ") || "none"}; ${read.spawns.length} spawn points, ${read.lights.length} lights`, // prettier-ignore
    `${standing.spots} spots: standing, ${standing.off} disagree (${standing.share.toFixed(2)} in a hundred: ${standing.onlyGoldSrc.length} blocked only in GoldSrc, ${standing.unexplained.length} only in s&box; ${standing.intoWorld.length} more only in s&box, rightly, the world in the box); ducked, ${ducked.off} (${ducked.share.toFixed(2)}: ${ducked.onlyGoldSrc.length}, ${ducked.unexplained.length}; ${ducked.intoWorld.length})`, // prettier-ignore
    `${expected.floors.filter((f) => f.floor !== null).length} spawn points' floors where GoldSrc's are`,
  );
  return { passed: !faults.length, faults, said, collision: { standing, ducked } };
}

/** A start's view: its eye LIGHT_VIEW.eye above its feet, looking its way, level. */
export const lightViewsOf = (port) => port.spawns.map((s) => ({ eye: [s.feet[0], s.feet[1], s.feet[2] + LIGHT_VIEW.eye], yaw: s.yaw })); // prettier-ignore

/** A picture's brightness, region by region (LIGHT_GRID), row by row. */
export function brightnessGrid({ width, height, rgba }, [across, down] = LIGHT_GRID) {
  const sums = new Array(across * down).fill(0);
  const counts = new Array(across * down).fill(0);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const cell = Math.floor((y * down) / height) * across + Math.floor((x * across) / width);
      sums[cell] += 0.3 * rgba[i] + 0.59 * rgba[i + 1] + 0.11 * rgba[i + 2];
      counts[cell]++;
    }
  return sums.map((v, k) => v / counts[k]);
}

/**
 * s&box's pictures of the light held to GoldSrc's, both lists of brightnessGrid's, view by view: `{ ratio, likeness,
 * per: [{ view, goldsrc, sbox, ratio, likeness }], faults, said }`.
 */
export function compareLight(goldsrc, sbox, { ratio: [least, most] = LIGHT_RATIO, likeness: like = LIGHT_LIKENESS } = {}) {
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const per = goldsrc.map((g, view) => {
    const s = sbox[view];
    const [mg, ms] = [mean(g), mean(s)];
    let both = 0;
    let dg = 0;
    let ds = 0;
    g.forEach((v, k) => {
      both += (v - mg) * (s[k] - ms);
      dg += (v - mg) ** 2;
      ds += (s[k] - ms) ** 2;
    });
    // a view all one brightness is alike only to one as flat
    const likeness = dg && ds ? both / Math.sqrt(dg * ds) : dg === ds ? 1 : 0;
    return { view, goldsrc: mg, sbox: ms, ratio: ms / Math.max(mg, 1e-6), likeness };
  });
  const ratio = Math.exp(mean(per.map((p) => Math.log(Math.max(p.ratio, 1e-3)))));
  const likeness = mean(per.map((p) => p.likeness));
  const faults = [];
  if (ratio < least || ratio > most) faults.push(`its light ${ratio.toFixed(2)} times as bright as GoldSrc's (${least} to ${most} allowed)`); // prettier-ignore
  if (likeness < like) faults.push(`its light in other places than GoldSrc's: its regions correlated ${likeness.toFixed(2)} (${like} or more wanted)`); // prettier-ignore
  const within = per.filter((p) => p.ratio >= 0.75 && p.ratio <= 1 / 0.75).length;
  const said = [`its light from ${per.length} starts ${ratio.toFixed(2)} times as bright as GoldSrc's, ${within} of them within a third either way; lit in the same places, correlated ${likeness.toFixed(2)}`]; // prettier-ignore
  return { ratio, likeness, per, faults, said };
}

/** The C# that makes a camera of the check's own at each view (no tonemapping) and leaves the clip brushes out of
 * the pictures; their ids, in order. lightCamerasGoneCode undoes it. */
export function lightCamerasCode(views) {
  return `
var s = Editor.SceneEditorSession.Active.Scene;
foreach ( var c in s.GetAllObjects( true ).Where( o => o.Tags.Has( ${csString(CLIP_TAG)} ) ).ToList() ) c.Enabled = false;
var ids = new System.Collections.Generic.List<string>();
var views = ${csFloats(views.flatMap((v) => [...v.eye, v.yaw]))};
for ( int i = 0; i < views.Length; i += 4 )
{
  var go = s.CreateObject();
  go.Name = ${csString(LIGHT_CAMERA)};
  go.WorldPosition = new Vector3( views[i], views[i + 1], views[i + 2] );
  go.WorldRotation = Rotation.From( 0, views[i + 3], 0 );
  var cam = go.Components.Create<CameraComponent>();
  cam.FieldOfView = ${LIGHT_VIEW.fov};
  cam.ZNear = 2;
  cam.IsMainCamera = false;
  ids.Add( go.Id.ToString() );
}
return ids;
`;
}

export const lightCamerasGoneCode = () => `
var s = Editor.SceneEditorSession.Active.Scene;
foreach ( var go in s.GetAllObjects( true ).Where( o => o.Name == ${csString(LIGHT_CAMERA)} ).ToList() ) go.Destroy();
foreach ( var c in s.GetAllObjects( true ).Where( o => o.Tags.Has( ${csString(CLIP_TAG)} ) ).ToList() ) c.Enabled = true;
return true;
`;

/** The C# that compiles a shader of the project's: "compiled" when it compiled, else its errors. */
export const shaderCompileCode = (path) => `
try { await Shader.CompileFileAsync( ${csString(path)} ); return "compiled"; }
catch ( ShaderCompileException e ) { return string.Join( " | ", e.Errors.Select( x => x.ToString() ) ); }
`;

/** The C# that bakes the open scene's indirect light (sbox-map's volume over the world), the scene saved before
 * (s&box bakes only a saved scene) and after; how many volumes were baked. */
export const bakeIndirectLightCode = () => `
var session = Editor.SceneEditorSession.Active;
var volumes = session.Scene.GetAllComponents<IndirectLightVolume>().ToList();
if ( volumes.Count == 0 ) return 0;
session.HasUnsavedChanges = true;
session.Save( false );
foreach ( var v in volumes ) await v.BakeProbes();
session.HasUnsavedChanges = true;
session.Save( false );
return volumes.Count( v => v.IrradianceTexture is not null );
`;

/**
 * The bake just saved in the scene (`assets`/`scene`) recorded beside its files under the port's key, so that a
 * port that writes the same again keeps it (map.mjs writeSboxMap); and the files of the bakes before it removed
 * (each bake writes three of its own, named by the bake, and leaves the last one's). Returns the textures, or null.
 */
export function recordBake(assets, scene, key) {
  const saved = JSON.parse(readFileSync(join(assets, scene), "utf8"));
  const volume = saved.GameObjects?.find((o) => o.Name === INDIRECT_LIGHT)?.Components?.find((c) => c.__type === "Sandbox.IndirectLightVolume"); // prettier-ignore
  if (!BAKED_FIELDS.every((f) => volume?.[f])) return null;
  const textures = Object.fromEntries(BAKED_FIELDS.map((f) => [f, volume[f]]));
  const data = join(assets, sceneDataOf(scene));
  writeFileSync(join(data, BAKE_RECORD), `${JSON.stringify({ key, textures }, null, 1)}
`);
  const bake = /_([0-9a-f]{32}).vtex$/i.exec(textures.IrradianceTexture)?.[1].toLowerCase();
  const ddgi = join(data, "ddgi");
  if (bake && existsSync(ddgi))
    for (const name of readdirSync(ddgi))
      if (/_[0-9a-f]{32}.vtex(_c)?$/i.test(name) && !name.toLowerCase().includes(bake))
        try {
          rmSync(join(ddgi, name));
        } catch {} // the editor may still hold it; the next bake removes it
  return textures;
}

/** Two pictures side by side, the first on the left. */
function sideBySide(a, b) {
  const width = a.width + b.width;
  const height = Math.max(a.height, b.height);
  const rgba = new Uint8Array(width * height * 4);
  for (const [p, left] of [[a, 0], [b, a.width]])
    for (let y = 0; y < p.height; y++) rgba.set(p.rgba.subarray(y * p.width * 4, (y + 1) * p.width * 4), (y * width + left) * 4);
  return png(width, height, rgba);
}

/**
 * A GoldSrc map ported into `project`'s Assets and held to its original in the project's editor (the one open,
 * else one opened for the check and closed after). `light: false` leaves its light unpictured. `shot`: a
 * picture's path, GoldSrc's view from the first start beside s&box's; `shots`: a folder, each start's two views in it
 * (start_00.png and on).
 */
export async function checkSboxMap(file, { project, name, folder, folders = [], starts, lighting, count, seed, allow, light = true, sbox, shot, shots } = {}) {
  const root = projectFolder(project);
  const engine = sbox ?? findSbox();
  const port = portMapToSboxFile(file, { out: join(root, "Assets"), name, folder, folders, starts, lighting });
  const expected = expectedMapOf(file, port, { count, seed });
  const editor = await editorFor(root, { sbox: engine });
  try {
    // the editor compiles what changed on disk on its own; asked, so the check reads this port's
    // the shader first (asset_compile does not answer for a .shader: Shader.CompileFileAsync, which says its errors)
    const shaderFailed = port.lighting === "lightmaps" ? runCsharp(root, shaderCompileCode(LIGHTMAP_SHADER), { sbox: engine }) : null; // prettier-ignore
    const compiling = [...new Set(port.meshes.flatMap((m) => m.materials))].concat(port.sky ? [port.sky] : []);
    const compiled = sboxCall(root, "call_tools", { calls: compiling.map((path) => ({ name: "asset_compile", arguments: { path } })) }, { sbox: engine }); // prettier-ignore
    const failed = compileFailures(compiled, compiling);
    if (shaderFailed && shaderFailed !== "compiled") failed.unshift(`${LIGHTMAP_SHADER} (${shaderFailed})`);
    const floors = expected.floors.map((f) => [f.feet[0], f.feet[1], f.origin[2]]);
    const read = runCsharp(root, mapProbeCode(port.scene, expected.spots, floors), { sbox: engine });
    const result = compareSboxMap(expected, read, { allow });
    if (failed.length) {
      result.faults.unshift(`${failed.length} materials not compiled: ${failed.slice(0, 6).join(", ")}`);
      result.passed = false;
    }
    const views = lightViewsOf(port);
    if (light && !read.error && views.length) {
      // baked again only when the port wrote something other than it wrote for the bake it has
      if (port.lighting === "lightmaps") result.said.push("lit by the map's own lightmaps: nothing to bake");
      else if (port.baked) result.said.push("the indirect light's bake kept: the port wrote the same as when it was baked");
      else {
        const bake = Math.max(BAKE_LEAST, indirectProbes(expected.bsp) * BAKE_PER_PROBE);
        // drawn on the screen while it bakes: minimized, the editor bakes at a crawl
        const minimize = editorWindowsShown();
        try {
          result.bakedVolumes = runCsharp(root, bakeIndirectLightCode(), { sbox: engine, timeout: bake });
        } finally {
          minimize();
        }
        if (!recordBake(join(root, "Assets"), port.scene, port.bakeKey)) result.said.push("the indirect light's bake not recorded: the saved scene names no textures"); // prettier-ignore
      }
      const { width, height, fov } = LIGHT_VIEW;
      const searched = [...mapOwnFolders(file), ...folders];
      const goldsrc = views.map((v) => drawMap(expected.bsp, { from: v.eye, yaw: v.yaw, pitch: 0, fov, width, height, folders: searched, entities: false, labels: false })); // prettier-ignore
      const ids = runCsharp(root, lightCamerasCode(views), { sbox: engine });
      let made;
      try {
        const calls = ids.map((camera) => ({ name: "camera_screenshot", arguments: { camera, width, height } }));
        // each start pictured twice, the first only to stream its textures in
        sboxCall(root, "call_tools", { calls }, { sbox: engine });
        const pictured = sboxCall(root, "call_tools", { calls }, { sbox: engine });
        made = [...String(typeof pictured === "string" ? pictured : JSON.stringify(pictured)).matchAll(/[A-Za-z]:\\[^\r\n"]+?\.png/g)].map((m) => unpng(readFileSync(m[0].replace(/\\\\/g, "\\")))); // prettier-ignore
      } finally {
        runCsharp(root, lightCamerasGoneCode(), { sbox: engine });
      }
      if (made.length !== views.length) result.faults.push(`the editor pictured ${made.length} of ${views.length} starts`);
      else {
        const lit = compareLight(goldsrc.map((p) => brightnessGrid(p)), made.map((p) => brightnessGrid(p)));
        result.faults.push(...lit.faults);
        result.said.push(...lit.said);
        result.light = lit;
        if (shot) {
          writeFileSync(shot, sideBySide(goldsrc[0], made[0]));
          result.shot = shot;
        }
        // every start's two pictures, numbered as the starts are
        if (shots) {
          mkdirSync(shots, { recursive: true });
          result.shots = goldsrc.map((g, i) => {
            const at = join(shots, `start_${String(i).padStart(2, "0")}.png`);
            writeFileSync(at, sideBySide(g, made[i]));
            return at;
          });
        }
      }
      result.passed = !result.faults.length;
    }
    return { ...result, port, opened: editor.opened };
  } finally {
    await editor.close();
  }
}
