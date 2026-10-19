// Maps from specs (src/spec/map.mjs): the cases of the fork's test/46-specs.mjs that build a map. The faults each case builds on purpose are the ones the
// soundness check must name, and the crashes found while the prompts of examples/prompts were built are
// built again here, so that none comes back.
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as smak from "../src/index.mjs";
import { buildModelSpec, validateModelSpec } from "../src/spec/model.mjs";
import { buildMapSpec, layoutOf, withIncludes, validateMapSpec } from "../src/spec/map.mjs";
import { materialOf, surfacePicture, MATERIALS, UNWORN } from "../src/spec/paint.mjs";
import { lookOf, lookFaults, ALLOWED } from "../src/spec/look.mjs";
import { changesOf } from "../src/spec/changes.mjs";
import { paintProjections } from "../src/spec/project.mjs";
import { validateWadSpec } from "../src/spec/wad.mjs";
import { sword, taper } from "../kits/swordkit.mjs";
import { definitionsOf } from "../src/maps/fgd.mjs";
import { findCompilers, COMPILERS_VARIABLE } from "../src/maps/compile.mjs";
import { test, testAsync, sure, near, tmp } from "./helper.mjs";

const { workshop: W, buildMdl, indexed, soundness, shapeSoundness, seeThrough } = smak;
const folder = join(tmp, "map-specs");
mkdirSync(folder, { recursive: true });
const Z = { x: 0, y: 0, w: 64, h: 64 };
const upright = (s, a, b) => [a, b, s];

/** A model of one bone and one mesh from what `build` makes in a workshop shape. */
function modelOf(build) {
  const M = W.shape(64, 64);
  build(M);
  return buildMdl({
    name: "t.mdl",
    bones: [{ name: "root", parent: -1 }],
    bodyparts: [{ name: "body", models: [{ name: "t", meshes: [{ tris: M.tris.map((t) => t.map((c) => ({ ...c, bone: "root" }))), texture: indexed(W.sheet(64, 64).image(), "t.bmp") }] }] }],
    sequences: [{ name: "idle", fps: 10, frames: [[[0, 0, 0, 0, 0, 0]]] }],
  });
}
const faultsOf = (mdl) => soundness(mdl).faults.join(" | ");

test("a map spec's doors: one on hinges, one that slides all the way up, and the threshold under each filled", () => {
  const spec = (door) => ({ spec: "smak.map/1", name: "doors", rooms: [{ id: "a", size: [256, 256, 128], surfaces: { floor: "planks" } }, { id: "b", size: [256, 256, 128], place: { east_of: "a" } }], links: [{ between: ["a", "b"], kind: "door", door, width: 32 }], entities: [{ class: "info_player_start", room: "a", at: "centre" }] });
  const swung = buildMapSpec(spec({ swing: true }), { out: join(folder, "doors-swing") });
  // asked 32 wide, as a house's drawing gives a door: a player passes one on hinges at ease at 56
  sure(swung.report.facts.some((f) => /widened from 32 to 56/.test(f)), swung.report.facts.filter((f) => /links/.test(f)).join("; "));
  const slid = buildMapSpec(spec(undefined), { out: join(folder, "doors-slide") });
  const text = (r) => readFileSync(r.files.map, "utf8");
  sure(/"classname" "func_door_rotating"/.test(text(swung)) && /ORIGIN/.test(text(swung)), "a door on hinges, with its hinge");
  sure(/"classname" "func_door"/.test(text(slid)) && /"lip" "0"/.test(text(slid)), "a sliding door that opens all the way");
  // the threshold: the map's brushes have a floor under the doorway, level with the rooms'
  const map = smak.maps.readMap(text(slid));
  const door = map.entities.find((e) => e.classname === "func_door");
  const [x, y] = [0, 1].map((k) => (Math.min(...door.brushes[0].faces.flatMap((f) => f.points.map((p) => p[k]))) + Math.max(...door.brushes[0].faces.flatMap((f) => f.points.map((p) => p[k])))) / 2);
  const under = map.brushes.some((b) => smak.maps.holds(b, [x, y, -4]));
  sure(under, `solid under the doorway at ${x}, ${y}`);
});

test("a map spec's furniture never floats: on the floor, against a wall, under the ceiling or on another piece", () => {
  // Steven's play-test of frenzy_words: "everything is floating everywhere"
  const faults = (furniture) =>
    buildMapSpec({ spec: "smak.map/1", name: "float", rooms: [{ id: "a", size: [512, 512, 256] }], entities: [{ class: "info_player_start", room: "a", at: [-200, -200] }], furniture }, { out: join(folder, "float"), compilers: { found: false, message: "" } }).report.faults.filter((f) => /float/.test(f));
  const held = faults([
    { box: [32, 32, 32], room: "a", at: [0, 0] },
    { box: [32, 32, 32], room: "a", at: [0, 0], z: 32 },
    { box: [16, 64, 16], room: "a", at: [248, 100], z: 120 },
    { box: [64, 64, 8], room: "a", at: [100, 100], z: 248 },
  ]);
  sure(!held.length, held.join("; "));
  // one set on another's corner is warned of; one set square on it is not
  const warned = (furniture) =>
    buildMapSpec({ spec: "smak.map/1", name: "float", rooms: [{ id: "a", size: [512, 512, 256] }], entities: [{ class: "info_player_start", room: "a", at: [-200, -200] }], furniture }, { out: join(folder, "float"), compilers: { found: false, message: "" } }).report.warnings.filter((w) => /footprint/.test(w));
  sure(!warned([{ box: [64, 64, 32], room: "a", at: [0, 0] }, { box: [32, 32, 32], room: "a", at: [0, 0], z: 32 }]).length, "square on");
  sure(warned([{ box: [64, 64, 32], room: "a", at: [0, 0] }, { box: [32, 32, 32], room: "a", at: [30, 30], z: 32 }]).some((w) => /furniture\[1\] \(box\) on \d+%/.test(w)), "on a corner");
  const afloat = faults([{ box: [32, 32, 32], room: "a", at: [100, 0], z: 100 }]);
  sure(afloat.some((f) => /furniture\[0\] \(box\) in a, 100 over its floor/.test(f)), afloat.join("; ") || "no fault");
});

test("a map spec's ladder is built as Valve's are: a func_ladder to climb, and see-through rungs in render mode 4", () => {
  // Steven's play-test of frenzy_pictures: a ladder made as furniture in a grate texture read as a vent
  const spec = { spec: "smak.map/1", name: "ladders", rooms: [{ id: "pit", size: [256, 256, 256] }], ladders: [{ room: "pit", side: "north", along: 0.25, height: 200 }], entities: [{ class: "info_player_start", room: "pit", at: "centre" }] };
  const { files, report } = buildMapSpec(spec, { out: join(folder, "ladders"), compilers: { found: false, message: "" } });
  const map = smak.maps.readMap(readFileSync(files.map, "utf8"));
  const climb = map.entities.find((e) => e.classname === "func_ladder");
  const seen = map.entities.find((e) => e.classname === "func_wall" && e.rendermode === "4");
  const textureOf = (e) => e.brushes[0].faces[0].texture;
  sure(climb && seen && textureOf(seen).startsWith("{") && textureOf(climb) === textureOf(seen), JSON.stringify(report.facts.filter((f) => /ladders/.test(f))));
  const ys = smak.maps.shapeOf(seen.brushes[0]).corners.map((p) => p[1]);
  sure(Math.max(...ys) === 128 && Math.min(...ys) === 122, `the rungs from ${Math.min(...ys)} to ${Math.max(...ys)}, the wall at 128`);
});

test("a map spec's frame: bands, ribs, beams, cut corners and a frame round each way, lamps in fixtures, all detail", () => {
  const spec = (frame) => ({ spec: "smak.map/1", name: "framed", ...(frame === undefined ? {} : { frame }), rooms: [{ id: "hall", size: [768, 512, 256] }, { id: "side", size: [256, 96, 128], place: { east_of: "hall" } }], links: [{ between: ["hall", "side"], kind: "door" }], entities: [{ class: "info_player_start", room: "hall", at: [-200, 0] }, { class: "item_battery", room: "side", at: [80, 0] }] });
  const build = (frame, name) => buildMapSpec({ ...spec(frame), name }, { out: join(folder, name), compilers: { found: false, message: "" } });
  const plain = build(undefined, "frame_off");
  const framed = build(true, "frame_on");
  sure(!plain.report.facts.some((f) => /^frame:/.test(f)), "the default build is unframed");
  const said = framed.report.facts.find((f) => /^frame: \d+ brushes/.test(f)) ?? framed.report.facts.join(" | ");
  sure(/bands/.test(said) && /ribs/.test(said) && /beams/.test(said) && /4 corners/.test(said) && /frames/.test(said), said);
  sure(framed.report.facts.some((f) => /^frame: \d+ lamps in fixtures that glow/.test(f)) && framed.report.facts.some((f) => /texture lights: .*FIXTURE/.test(f)), framed.report.facts.join(" | "));
  // the corridor (96 across) keeps its width: no ribs, beams or cut corners in it; and the way is still walked
  const map = smak.maps.readMap(readFileSync(framed.files.map, "utf8"));
  const detail = map.entities.filter((e) => e.classname === "func_detail");
  sure(detail.length && detail.every((e) => e.zhlt_detaillevel === "1"), "every func_detail says its level");
  const reach = smak.maps.reachOf(map);
  sure(reach.entities.find((e) => e.classname === "item_battery")?.reached, reach.warnings.join(" | "));
  // a cut corner is a slant: brushes off the axes, which a box room has none of
  const slanted = detail.flatMap((e) => e.brushes).filter((b) => smak.maps.shapeOf(b).corners.length === 6);
  sure(slanted.length === 4, `four triangular corners: ${slanted.length}`);
  // a room's own frame: false over the map's
  const off = buildMapSpec({ ...spec(true), name: "frame_room", rooms: [{ id: "hall", size: [768, 512, 256], frame: false }, { id: "side", size: [256, 96, 128], place: { east_of: "hall" } }] }, { out: join(folder, "frame_room"), compilers: { found: false, message: "" } });
  sure(/in 1 rooms/.test(off.report.facts.find((f) => /^frame: \d+ brushes/.test(f)) ?? ""), off.report.facts.filter((f) => /^frame/.test(f)).join(" | "));
  sure(buildMapSpec({ ...spec({ ribs: "many" }), name: "frame_bad" }, { out: join(folder, "frame_bad"), compilers: { found: false, message: "" } }).report.errors.some((e) => /frame\.ribs: a number of units/.test(e)), "a wrong frame word refused");
});

test("a frame's bands are on the wall's own faces: base, field and upper meeting on one plane, as Valve bands its own", () => {
  const spec = (frame) => ({ spec: "smak.map/1", name: "banded", frame, rooms: [{ id: "hall", size: [512, 384, 256] }, { id: "side", size: [256, 96, 128], place: { east_of: "hall" } }], links: [{ between: ["hall", "side"], kind: "door" }], entities: [{ class: "info_player_start", room: "hall", at: [-150, 0] }, { class: "item_battery", room: "side", at: [80, 0] }] });
  const built = buildMapSpec(spec({ bands: true }), { out: join(folder, "banded"), compilers: { found: false, message: "" } });
  sure(built.report.facts.some((f) => /^frame: the walls of 2 rooms banded on their own faces, 3 joins in all \(hall: \w+_DADO to 48, \w+ to 112, \w+_UPPER to 256; side: \w+_DADO to 48, \w+ to 128\)/.test(f)), built.report.facts.filter((f) => /frame/.test(f)).join(" | "));
  // the hall's west wall (x = its min): its face's textures, foot to head, are the three bands, on one plane
  const map = smak.maps.readMap(readFileSync(built.files.map, "utf8"));
  const hall = { x: -256, z0: 0, z1: 256 };
  const faces = map.brushes.flat().flatMap((b) => {
    const s = smak.maps.shapeOf(b);
    return s.faces.filter((f) => f.normal && Math.abs(f.normal[0] - 1) < 1e-6 && Math.abs(s.max[0] - hall.x) < 1e-6).map((f) => ({ texture: f.texture, z0: s.min[2], z1: s.max[2] }));
  });
  const bands = [...new Map(faces.filter((f) => f.z0 < hall.z1 && f.z1 > hall.z0).map((f) => [`${f.z0}`, f])).values()].sort((a, b) => a.z0 - b.z0);
  sure(bands.length === 3 && bands[0].z1 === 48 && bands[1].z1 === 112 && /dado/i.test(bands[0].texture) && /upper/i.test(bands[2].texture) && bands[0].texture !== bands[1].texture, JSON.stringify(bands));
  // a room with walls of its own is banded in its lining: the slabs cut at the bands, each wearing its own
  const lined = buildMapSpec({ ...spec({ bands: true }), name: "banded_lined", textures: { tile: "tile" }, rooms: [{ id: "hall", size: [512, 384, 256], surfaces: { walls: "tile" } }, { id: "side", size: [256, 96, 128], place: { east_of: "hall" } }] }, { out: join(folder, "banded_lined"), compilers: { found: false, message: "" } });
  const lining = smak.maps.readMap(readFileSync(lined.files.map, "utf8")).brushes.flat().map((b) => smak.maps.shapeOf(b)).filter((s) => Math.abs(s.max[0] + 256) < 1e-6 && s.max[0] - s.min[0] <= 16 && s.min[2] >= -1e-6);
  const laid = [...new Map(lining.map((s) => [s.min[2], s.faces.find((f) => f.normal?.[0] > 0.9)?.texture])).entries()].sort((a, b) => a[0] - b[0]);
  sure(laid.length === 3 && /TILE_DADO/i.test(JSON.stringify(laid[0][1])) && /TILE_UPPER/i.test(JSON.stringify(laid[2][1])), JSON.stringify(laid));
  // no strip stood off the wall for the dado or the cornice in a banded room; the way is still walked
  sure(!/\d+ bands/.test(built.report.facts.find((f) => /^frame: \d+ brushes/.test(f)) ?? ""), "the proud bands are not built where the wall is banded");
  sure(smak.maps.reachOf(map).entities.find((e) => e.classname === "item_battery")?.reached, "the way through still walked");
  // the default frame is unbanded, and a wrong word is refused
  sure(!buildMapSpec({ ...spec(true), name: "unbanded" }, { out: join(folder, "unbanded"), compilers: { found: false, message: "" } }).report.facts.some((f) => /banded on their own faces/.test(f)), "frame: true alone does not band");
  sure(buildMapSpec({ ...spec({ bands: "yes" }), name: "banded_bad" }, { out: join(folder, "banded_bad"), compilers: { found: false, message: "" } }).report.errors.some((e) => /frame\.bands: true or false/.test(e)), "a wrong bands refused");
  // the game's own families: what Valve stacks under and over its wall textures, measured from its maps
  const family = smak.maps.familyOf("c1a0_labw5");
  sure(family?.under === "DUCT_VNT" && family.underAt === 48 && family.over === "C1A0_LABW7C" && family.overAt === 160, JSON.stringify(family));
});

test("composed light: a lamp in each rhythm dimmed with its fixture, pooling under itself, a doorway spilling light", () => {
  const spec = (lighting) => ({ spec: "smak.map/1", name: "composed", frame: true, lighting, rooms: [{ id: "hall", size: [768, 512, 256], light: { count: 6 } }, { id: "side", size: [256, 96, 128], place: { east_of: "hall" } }], links: [{ between: ["hall", "side"], kind: "door" }], entities: [{ class: "info_player_start", room: "hall", at: [-200, 0] }] });
  const built = buildMapSpec(spec(true), { out: join(folder, "composed"), compilers: { found: false, message: "" } });
  sure(built.report.facts.some((f) => /^lighting: composed: 2 lamps dimmed to 0\.2 \(one in 3\), 1 doorways spilling light, each lamp's light falling off 2\.5 times sooner/.test(f)), built.report.facts.filter((f) => /lighting/.test(f)).join(" | "));
  const map = smak.maps.readMap(readFileSync(built.files.map, "utf8"));
  const lights = map.entities.filter((e) => e.classname === "light");
  sure(lights.every((e) => e._fade === "2.5") && lights.some((e) => /\s50$/.test(e._light)) && lights.some((e) => / 250$/.test(e._light)), JSON.stringify(lights.map((e) => e._light)));
  // the dimmed lamps' fixtures glow dim: a texture light of their own
  sure(built.report.facts.some((f) => /texture lights: .*FIXTURE_DIM/.test(f)), built.report.facts.filter((f) => /texture lights/.test(f)).join(" | "));
  sure(!buildMapSpec({ ...spec(undefined), name: "uncomposed" }, { out: join(folder, "uncomposed"), compilers: { found: false, message: "" } }).report.facts.some((f) => /^lighting/.test(f)), "unasked, the light is as it was");
  sure(buildMapSpec({ ...spec({ goalRoom: "attic" }), name: "composed_bad" }, { out: join(folder, "composed_bad"), compilers: { found: false, message: "" } }).report.errors.some((e) => /lighting\.goalRoom: a room's id/.test(e)), "a goal that is no room refused");
});

test("a room's silhouette broken and its floor dressed for its use: off the axes, clear of its ways, varied, still walked", () => {
  const spec = (frame, use) => ({ spec: "smak.map/1", name: "dressed", frame, rooms: [{ id: "hall", size: [640, 512, 256], ...(use ? { use } : {}) }, { id: "side", size: [256, 96, 128], place: { east_of: "hall" } }], links: [{ between: ["hall", "side"], kind: "door" }], entities: [{ class: "info_player_start", room: "hall", at: [-220, 0] }, { class: "item_battery", room: "side", at: [80, 0] }] });
  const build = (frame, use, name) => buildMapSpec({ ...spec(frame, use), name }, { out: join(folder, name), compilers: { found: false, message: "" } });
  const plain = build({ bands: true }, undefined, "dress_off");
  const done = build({ bands: true, breaks: true }, "storage", "dress_on");
  const faults = done.report.faults.filter((f) => !/^not compiled/.test(f));
  sure(done.report.errors.length === 0 && faults.length === 0, [...done.report.errors, ...faults].join(" | "));
  // pillars in the corners (the room's corners are cut by the frame unless chamfer 0: none then), coves, a pipe run
  const said = done.report.facts.find((f) => /^frame: \d+ brushes/.test(f)) ?? "";
  sure(/coves/.test(said) && /pipes/.test(said), said);
  const off = (built) => smak.maps.readMap(readFileSync(built.files.map, "utf8")).entities.filter((e) => e.classname === "func_detail").flatMap((e) => e.brushes).filter((b) => smak.maps.shapeOf(b).corners.length !== 8).length;
  sure(off(done) > off(plain) + 4, `more brushes off the axes: ${off(plain)} unbroken, ${off(done)} broken`);
  const pillared = build({ chamfer: 0, breaks: { coves: false, pipes: false } }, undefined, "dress_pillars");
  sure(/4 pillars/.test(pillared.report.facts.find((f) => /^frame: \d+ brushes/.test(f)) ?? ""), pillared.report.facts.filter((f) => /^frame/.test(f)).join(" | "));
  // the storage room dressed: crates and shelves at its walls and in its corners, no piece more than twice
  const dressed = done.report.facts.find((f) => /^dressed by use: hall \(storage\): \d+ pieces/.test(f)) ?? done.report.facts.join(" | ");
  sure(/crate/.test(dressed) && !/\b[3-9] dress_/.test(dressed), dressed);
  const pieces = done.report.placed.filter((p) => p.what === "dressing");
  sure(pieces.length >= 3 && pieces.every((p) => p.room === "hall"), JSON.stringify(pieces));
  // nothing in front of the door, and the way still walked
  sure(!done.report.faults.some((f) => /in front of|blocks/.test(f)) && smak.maps.reachOf(smak.maps.readMap(readFileSync(done.files.map, "utf8"))).entities.find((e) => e.classname === "item_battery")?.reached, "the way through still walked");
  // the default is undressed; a use or a break that is no word is refused
  sure(!plain.report.facts.some((f) => /dressed by use/.test(f)), "unasked, no dressing");
  sure(build(true, "kitchenette", "dress_bad").report.errors.some((e) => /rooms\[0\]\.use: what the room is for, dressed by it: storage, lab/.test(e)), "a wrong use refused");
  sure(build({ breaks: { arches: true } }, undefined, "breaks_bad").report.errors.some((e) => /frame\.breaks\.arches: not a word of breaks/.test(e)), "a wrong break refused");
});

test("a map's focus: a landmark in its main room, on a plinth, lit, seen from each way in; one hidden is told", () => {
  const spec = (more = {}) => ({
    spec: "smak.map/1", name: "focus", lighting: true,
    rooms: [{ id: "hall", size: [640, 512, 256] }, { id: "west", size: [256, 256, 160], place: { west_of: "hall" } }, { id: "south", size: [256, 256, 160], place: { south_of: "hall" } }],
    links: [{ between: ["hall", "west"], kind: "opening" }, { between: ["hall", "south"], kind: "opening" }],
    entities: [{ class: "info_player_start", room: "west", at: "against west", facing: "hall" }],
    focus: { room: "hall", landmark: { kit: "pump" }, from: ["start"] },
    ...more,
  });
  const none = { found: false, message: "" };
  const open = buildMapSpec(spec(), { out: join(folder, "focus"), compilers: none });
  const said = [...open.report.facts, ...open.report.warnings].join(" | ");
  sure(/focus: a pump the kit made/.test(said) && /focus: 1 plinth 8 high/.test(said), said);
  sure(/focus: the landmark \(pump, 1 piece\) in hall at .*seen from 3 of 3 ways in: links\[0\] sees it, links\[1\] sees it, the start sees it/.test(said), said);
  sure(/^lighting: composed: .*hall lit 1\.6 times brighter/m.test(open.report.facts.join("\n")), "the main room is the light's goal");
  const map = smak.maps.readMap(readFileSync(open.files.map, "utf8"));
  sure(map.entities.some((e) => e.classname === "info_target" && e.targetname === "landmark"), "an info_target named landmark at it, for the views");
  // a wall of furniture between the west way and the landmark: that way and the start do not see it
  const hidden = buildMapSpec(spec({ furniture: [{ box: [32, 300, 200], room: "hall", at: [-200, 0] }] }), { out: join(folder, "focus_hidden"), compilers: none });
  sure(hidden.report.warnings.some((w) => /focus: the landmark is not seen from links\[0\] .*the start/.test(w)), hidden.report.warnings.join(" | "));
  // the landmark named among what the room has: every pump of the room is of it, each on its own plinth
  const pumps = buildMapSpec(spec({ prefabs: { pump: { pieces: [{ cylinder: { centre: [0, 0], radius: 24, from: 0, to: 128, sides: 8 }, texture: "furniture" }] } }, furniture: [{ prefab: "pump", room: "hall", at: [-160, 0] }, { prefab: "pump", room: "hall", at: [160, 0] }, { prefab: "pump", room: "west", at: "centre" }], focus: { room: "hall", landmark: "pump" } }), { out: join(folder, "focus_pumps"), compilers: none });
  sure(pumps.report.facts.some((f) => /focus: 2 plinths 8 high/.test(f)) && pumps.report.facts.some((f) => /landmark \(pump, 2 pieces\)/.test(f)), pumps.report.facts.filter((f) => /focus/.test(f)).join(" | "));
  // what is no landmark is refused in words
  sure(validateMapSpec(spec({ focus: { room: "hall", landmark: { kit: "windmill" } } })).errors.some((e) => /focus\.landmark\.kit: pump, machine, reactor, statue, door/.test(e)), "a kind the kit has not");
  sure(validateMapSpec(spec({ focus: { room: "attic", landmark: { kit: "pump" } } })).errors.some((e) => /focus\.room: the main room's id/.test(e)), "a room the map has not");
  sure(validateMapSpec(spec({ focus: { room: "hall", landmark: "nothing" } })).errors.some((e) => /no furniture or prop in hall is "nothing"/.test(e)), "a landmark the room has not");
});

test("a map spec's glow is on what it shines from: one in the air is a fault, one on the ceiling is not", () => {
  // frenzy_pictures: seven env_glow floating, what Steven saw as "random lights in the middle of the air"
  const faults = (z) =>
    buildMapSpec({ spec: "smak.map/1", name: "glow2", rooms: [{ id: "a", size: [512, 512, 256] }], entities: [{ class: "info_player_start", room: "a", at: [-200, -200] }, { class: "env_glow", room: "a", at: "centre", z, keys: { model: "sprites/glow01.spr" } }] }, { out: join(folder, "glow2"), compilers: { found: false, message: "" } }).report.faults.filter((f) => /hangs in the air/.test(f));
  sure(faults(128).length === 1, "at 128 of 256, in the air");
  sure(faults(240).length === 0, "16 under the ceiling");
});

test("a map's props may be the kit's own furniture, built as the map's models and solid to a body", () => {
  // Kaupo's bathroom was boxes: "sink, toilet, and ... something else in the middle?" (Steven's walk)
  const spec = (model) => ({ spec: "smak.map/1", name: "bath", rooms: [{ id: "bath", size: [256, 192, 128] }], props: [{ model, room: "bath", at: "corner ne" }], entities: [{ class: "info_player_start", room: "bath", at: [-80, -40] }] });
  const { files, report } = buildMapSpec(spec("kit:toilet"), { out: join(folder, "kitprops"), compilers: { found: false, message: "" } });
  sure(report.errors.length === 0 && report.facts.some((f) => /models\.kit_toilet: built and sound/.test(f)), report.errors.join("; "));
  const text = readFileSync(files.map, "utf8");
  sure(/models\/bath\/kit_toilet\.mdl/.test(text) && /\bCLIP\b/.test(text), "the toilet named, and a CLIP box about it");
  const wrong = buildMapSpec(spec("kit:jacuzzi"), { out: join(folder, "kitprops"), compilers: { found: false, message: "" } }).report;
  sure(wrong.errors.some((e) => /"kit:jacuzzi" is none of the kit's furniture \(.*kit:toilet/.test(e)), wrong.errors.join("; "));
});

test("a lamp is never in mid-air: one hung below a tall room's ceiling has a shade and a rod up to it", () => {
  // Steven's play-test of frenzy_pictures: "random lights in the middle of the air"
  const spec = { spec: "smak.map/1", name: "tall", rooms: [{ id: "hall", size: [256, 256, 480] }], entities: [{ class: "info_player_start", room: "hall", at: "centre" }, { class: "light", room: "hall", at: "corner ne" }] };
  const { files } = buildMapSpec(spec, { out: join(folder, "tall"), compilers: { found: false, message: "" } });
  const map = smak.maps.readMap(readFileSync(files.map, "utf8"));
  const lights = map.entities.filter((e) => e.classname === "light");
  const rods = map.entities.filter((e) => e.classname === "func_detail").flatMap((e) => e.brushes);
  const top = Math.max(...map.brushes.flatMap((b) => b.faces.flatMap((f) => f.points.map((p) => p[2]))));
  for (const l of lights) {
    const [x, y, z] = l.origin.split(" ").map(Number);
    const hung = rods.some((b) => {
      const ps = b.faces.flatMap((f) => f.points);
      const lo = [0, 1, 2].map((k) => Math.min(...ps.map((p) => p[k])));
      const hi = [0, 1, 2].map((k) => Math.max(...ps.map((p) => p[k])));
      return lo[0] <= x && x <= hi[0] && lo[1] <= y && y <= hi[1] && lo[2] >= z && lo[2] - z < 12;
    });
    sure(hung, `the light at ${l.origin} has no shade just over it`);
  }
  sure(lights.length >= 2 && rods.length >= 2 * lights.length && top > 400, `${lights.length} lights, ${rods.length} brushes hung`);
});

test("an entity that loads a model it does not name: refused by the spec, by both writers, and found in a map", () => {
  // frenzy_plans: eight env_glow with no sprite stopped the game on load (PF_precache_model_I: Bad string '')
  const spec = { spec: "smak.map/1", name: "glow", rooms: [{ id: "a", size: [256, 256, 128] }], entities: [{ class: "info_player_start", room: "a", at: "centre" }, { class: "env_glow", room: "a", at: "corner ne" }] };
  const built = buildMapSpec(spec, { out: join(folder, "glow"), compilers: { found: false, message: "" } });
  sure(built.report.errors.some((e) => /entities\[1\]\.keys\.model: env_glow/.test(e)), built.report.errors.join("; "));
  let refused = "";
  try {
    smak.maps.writeMap({ worldspawn: {}, brushes: [], entities: [{ classname: "env_sprite", origin: "0 0 0" }] });
  } catch (error) {
    refused = error.message;
  }
  sure(/writeMap: entity 1 \(env_sprite\) precache a model/.test(refused), refused || "writeMap wrote it");
  refused = "";
  try {
    smak.maps.writeEntities([[["classname", "worldspawn"]], [["classname", "env_glow"], ["origin", "0 0 0"]]]);
  } catch (error) {
    refused = error.message;
  }
  sure(/writeEntities: env_glow precache a model/.test(refused), refused || "writeEntities wrote it");
  // a source made elsewhere: the plan check names it
  const plan = smak.maps.checkPlan({ worldspawn: {}, brushes: [], entities: [{ classname: "env_glow", origin: "0 0 0" }] }, { leak: false });
  sure(plan.errors.some((e) => /precache a model they do not name/.test(e)), plan.errors.join("; "));
});

test("a map spec keeps its ways through at ease: no furniture in front of a door, no wall too short for one", () => {
  const spec = (furniture, size = [256, 256, 128]) => ({
    spec: "smak.map/1", name: "ways",
    rooms: [{ id: "a", size: [256, 256, 128] }, { id: "b", size, place: { east_of: "a" } }],
    prefabs: { chest: { pieces: [{ box: [[-16, -16, 0], [16, 16, 40]] }] }, slab: { pieces: [{ box: [[-20, -20, 0], [20, 20, 4]] }] }, steps: { pieces: [9, 18, 27].map((h, k) => ({ box: [[-24 + 8 * k, -20, 0], [-16 + 8 * k, 20, h]] })) } },
    links: [{ between: ["a", "b"], kind: "door" }],
    furniture,
    entities: [{ class: "info_player_start", room: "a", at: "centre" }],
  });
  const faults = (s) => buildMapSpec(s, { out: join(folder, "ways") }).report.faults.filter((f) => !/not compiled/.test(f));
  // the door is in a's east wall, at its middle: 20 in front of it stands in the way, a slab and steps do not
  const blocked = faults(spec([{ prefab: "chest", room: "a", at: [108, 0] }]));
  sure(blocked.some((f) => /furniture\[0\] \(chest\) stands in front of links\[0\]/.test(f)), blocked.join("; "));
  const over = faults(spec([{ prefab: "slab", room: "a", at: [104, 0] }, { prefab: "steps", room: "b", at: [-100, 0] }]));
  sure(!over.some((f) => /in front of/.test(f)), over.join("; "));
  const aside = faults(spec([{ prefab: "chest", room: "a", at: [108, 100] }]));
  sure(!aside.some((f) => /in front of/.test(f)), aside.join("; "));
  // a room that shares 40 of wall: a door there is too narrow, and the build says so
  const short = faults({ ...spec([], [40, 40, 128]), rooms: [{ id: "a", size: [256, 256, 128] }, { id: "b", size: [40, 40, 128], place: { east_of: "a" } }] });
  sure(short.some((f) => /links\[0\]: the wall a and b share is 40 long/.test(f)), short.join("; "));
});

test("a map's plan is held to the size its spec asks, as a model's is", () => {
  const sized = (size) => buildMapSpec({ spec: "smak.map/1", name: `sized${String(size).replace(/\D/g, "")}`, size, rooms: [{ id: "a", size: [256, 256, 128] }], entities: [{ class: "info_player_start", room: "a", at: "centre" }] }, { out: join(folder, "sized"), compilers: { found: false, message: "" } }).report;
  const right = sized([288, 288]), near = sized(340), far = sized({ length: 1000 });
  sure(right.facts.some((f) => /^size: its plan is 288 by 288/.test(f)) && !right.faults.some((f) => /^size/.test(f)), right.faults.join(" | "));
  sure(near.warnings.some((w) => /^size: .* off by 15%/.test(w)) && !near.faults.some((f) => /^size/.test(f)), near.warnings.join(" | "));
  sure(far.faults.some((f) => /^size: its plan is 288 by 288, where the spec asks 1000: off by 71%/.test(f)), far.faults.join(" | "));
  sure(validateMapSpec({ spec: "smak.map/1", name: "x", size: "big", rooms: [] }).errors.some((e) => /^size:/.test(e)), "a size that is no number is refused");
});

test("a map's pictures look as Valve's walls do: grain, patches, colour and brightness within nine in ten of theirs", () => {
  // every base the kit paints, at its own tone, passes, held to Valve's of its kind; it did not while the pictures
  // were even. The softest are told they have less grain than nine in ten of Valve's, and nothing else: their grain
  // is soft grit, not the static of a random texel (research/reference-textures.md), and a picture is the way to
  // more. Every base a map's theme uses unless told passes outright, so a plain map is not warned of its own look
  const SOFT = ["leather", "cloth", "grass", "dirt", "paint", "bone", "rope", "snow"];
  for (const base of Object.keys(MATERIALS).filter((b) => !materialOf({ base: b }).flags.includes("masked") && !UNWORN.has(b))) {
    const said = lookFaults(lookOf(surfacePicture(materialOf({ base }), base === "door" ? 64 : 128, 128)), ALLOWED[base], base);
    sure(SOFT.includes(base) ? said.every((s) => /^little grain/.test(s)) : said.length === 0, `${base}: ${said.join(", ")}`);
  }
  // a flat white wall, and a picture of one colour, are named
  const flat = { width: 64, height: 64, rgb: new Uint8Array(64 * 64 * 3).fill(230) };
  sure(lookFaults(lookOf(flat)).join() === "too even (no grain, no patches),brighter (0.90; Valve's 0.332)", lookFaults(lookOf(flat)).join());
  const spec = { spec: "smak.map/1", name: "looks", textures: { wall: { base: "plaster", tone: [0.95, 0.95, 0.95] } }, theme: { wall: "wall" }, rooms: [{ id: "a", size: [256, 256, 128] }], entities: [{ class: "info_player_start", room: "a", at: "centre" }] };
  const report = buildMapSpec(spec, { out: join(folder, "looks"), compilers: { found: false, message: "" } }).report;
  sure(report.warnings.some((w) => /look unlike nine in ten of Valve's.*brighter/.test(w)), report.warnings.join("; "));
  // a .wad beside the spec is the maker's own, measured too (Kaupo's white wallboard); one in the game's folder is not
  const own = join(folder, "looks-own");
  mkdirSync(own, { recursive: true });
  writeFileSync(join(own, "mine.wad"), smak.maps.writeWad([{ name: "my_white", image: { width: 64, height: 64, rgb: new Uint8Array(64 * 64 * 3).fill(235) } }]));
  const named = buildMapSpec({ ...spec, wads: ["mine.wad"], textures: { wall: { texture: "my_white" } } }, { out: join(own, "out"), folder: own, compilers: { found: false, message: "" } }).report;
  sure(named.warnings.some((w) => /textures of the spec's own .wad files.*my_white \(mine\.wad\) too even.*brighter/.test(w)), named.warnings.join("; "));
  const game = buildMapSpec({ ...spec, wads: ["mine.wad"], textures: { wall: { texture: "my_white" } } }, { out: join(own, "out2"), folder: join(own, "elsewhere"), wads: [own], compilers: { found: false, message: "" } }).report;
  sure(!game.warnings.some((w) => /spec's own .wad/.test(w)), game.warnings.join("; "));
});

test("a map at fidelity high: trim round its ways and along its walls, not solid; more lamps; boxes named for kit furniture as its models", () => {
  const spec = (fidelity) => ({
    spec: "smak.map/1", name: "trimmed", ...(fidelity ? { fidelity } : {}),
    rooms: [{ id: "a", size: [384, 384, 128] }, { id: "b", size: [256, 256, 128], place: { east_of: "a" } }],
    links: [{ between: ["a", "b"], kind: "door", door: { swing: true } }, { between: ["a", "b"], kind: "window", along: 0.15 }],
    prefabs: { toilet: { pieces: [{ box: [[-10, -10, 0], [10, 10, 16]] }] } },
    furniture: [{ prefab: "toilet", room: "b", at: "corner ne" }],
    entities: [{ class: "info_player_start", room: "a", at: "centre" }],
  });
  const build = (f) => buildMapSpec(spec(f), { out: join(folder, `trimmed-${f ?? "game"}`), compilers: { found: false, message: "" } });
  const game = build();
  const high = build("high");
  sure(!high.report.errors.length && !high.report.faults.some((f) => !/not compiled/.test(f)), [...high.report.errors, ...high.report.faults].join("; "));
  sure(high.report.facts.some((f) => /fidelity high: \d+ pieces of trim/.test(f)), high.report.facts.join("; "));
  sure(high.report.facts.some((f) => /toilet as kit:toilet/.test(f)), "the toilet of boxes put in as the kit's");
  const text = readFileSync(high.files.map, "utf8");
  sure(/"classname" "func_illusionary"/.test(text), "the trim is drawn, not solid");
  const lamps = (r) => (readFileSync(r.files.map, "utf8").match(/"classname" "light"/g) ?? []).length;
  sure(lamps(high) > lamps(game), `lamps: ${lamps(game)} at game fidelity, ${lamps(high)} at high`);
  sure(!/func_illusionary/.test(readFileSync(game.files.map, "utf8")), "no trim at game fidelity");
  sure(buildMapSpec({ ...spec("ultra") }, { out: join(folder, "trimmed-x"), compilers: { found: false, message: "" } }).report.errors.some((e) => /fidelity: "game" or "high"/.test(e)), "a wrong word");
});

test("a building raised over its yard gets steps out from its door, and is walked into", () => {
  const spec = { spec: "smak.map/1", name: "raised", rooms: [{ id: "yard", size: [1024, 1024, 320], sky: true }, { id: "a", size: [256, 256, 112], floor: 48, place: { in: "yard", offset: [384, 384], stand: true }, building: { roof: false } }], links: [{ between: ["a", "yard"], kind: "door", side: "south", door: { swing: true } }], entities: [{ class: "info_player_start", room: "yard", at: [-300, -300] }, { class: "item_battery", room: "a", at: "centre" }] };
  const report = buildMapSpec(spec, { out: join(folder, "raised"), compilers: { found: false, message: "" } }).report;
  sure(!report.errors.length && !report.faults.some((f) => !/not compiled/.test(f)), [...report.errors, ...report.faults].join("; "));
  sure(report.facts.some((f) => /stairs of 3 steps in yard up to the way at 48/.test(f)), report.facts.filter((f) => /links/.test(f)).join("; "));
  // a house's room with nothing in it is told; the yard round it is not
  const bare = buildMapSpec({ ...spec, entities: spec.entities.slice(0, 1) }, { out: join(folder, "raised"), compilers: { found: false, message: "" } }).report.warnings;
  sure(bare.some((w) => /^1 rooms of a building have nothing in them: a:/.test(w)), bare.join("; "));
  sure(!report.warnings.some((w) => /nothing in them/.test(w)), report.warnings.join("; "));
  const hall = buildMapSpec({ ...spec, rooms: [spec.rooms[0], { ...spec.rooms[1], size: [400, 64, 112] }], entities: spec.entities.slice(0, 1) }, { out: join(folder, "raised"), compilers: { found: false, message: "" } }).report.warnings;
  sure(!hall.some((w) => /nothing in them/.test(w)), `a corridor may be bare: ${hall.join("; ")}`);
});

test("a building's doors open through walls of any thickness, and a room no floor of which is walked is a fault", () => {
  // walls under 16 once left each room's own lining standing in the next, across its doorway (a maker's house of 6)
  const house = (wall, furniture = []) => ({
    spec: "smak.map/1", name: "thin", wall,
    rooms: [{ id: "yard", size: [1024, 1024, 256], sky: true }, { id: "a", size: [256, 256, 112], floor: 8, place: { in: "yard", offset: [256, 256], stand: true }, building: { roof: false } }, { id: "b", size: [256, 256, 112], place: { east_of: "a" } }],
    links: [{ between: ["a", "b"], kind: "door", door: { swing: true } }, { between: ["a", "yard"], kind: "door", side: "south" }],
    prefabs: { fill: { pieces: [{ box: [[-128, -128, 0], [128, 128, 112]] }] } }, furniture,
    entities: [{ class: "info_player_start", room: "yard", at: [-300, -300] }],
  });
  const faults = (s) => buildMapSpec(s, { out: join(folder, "thin"), compilers: { found: false, message: "" } }).report.faults.filter((f) => !/not compiled/.test(f));
  for (const wall of [16, 6, 4]) sure(faults(house(wall)).length === 0, `${wall}: ${faults(house(wall)).join("; ")}`);
  // b filled from wall to wall: its door leads nowhere
  const shut = faults(house(16, [{ prefab: "fill", room: "b", at: [0, 0] }]));
  sure(shut.some((f) => /no floor of b is walked to, though a way leads into it/.test(f)), shut.join("; "));
});

test("furniture of boxes named for a thing the kit has a model of is warned of (Kaupo's bathroom of blocks)", () => {
  const spec = (prefabs) => ({
    spec: "smak.map/1", name: "boxed", rooms: [{ id: "a", size: [256, 256, 128] }],
    prefabs: Object.fromEntries(prefabs.map((n) => [n, { pieces: [{ box: [[-8, -8, 0], [8, 8, 16]] }] }])),
    furniture: prefabs.map((prefab, k) => ({ prefab, room: "a", at: [-80 + 40 * k, 60] })),
    entities: [{ class: "info_player_start", room: "a", at: [0, -60] }],
  });
  const said = (prefabs) => buildMapSpec(spec(prefabs), { out: join(folder, "boxed"), compilers: { found: false, message: "" } }).report.warnings.find((w) => /kit has a model/.test(w)) ?? "";
  sure(/toilet as kit:toilet, tub as kit:bathtub, wall_sink as kit:sink_cabinet/.test(said(["toilet", "tub", "wall_sink"])), said(["toilet", "tub", "wall_sink"]));
  // a shelf by the bath, a crate and steps are no kit's furniture
  sure(said(["bath_shelf", "crate", "front_steps", "porta_toilet"]) === "", said(["bath_shelf", "crate", "front_steps", "porta_toilet"]));
});

test("stairs are kept clear as a doorway is: on them and at their foot (Kaupo's blocks by its stairs)", () => {
  const spec = (furniture) => ({
    spec: "smak.map/1", name: "stairs",
    rooms: [{ id: "a", size: [320, 256, 200] }, { id: "b", size: [256, 256, 200], place: { east_of: "a" }, floor: 64 }],
    prefabs: { chest: { pieces: [{ box: [[-16, -16, 0], [16, 16, 40]] }] } },
    links: [{ between: ["a", "b"], kind: "opening" }],
    furniture,
    entities: [{ class: "info_player_start", room: "a", at: [-100, 0] }],
  });
  const build = (s) => buildMapSpec(s, { out: join(folder, "stairs"), compilers: { found: false, message: "" } }).report;
  const plain = build(spec([]));
  const steps = Number(plain.facts.map((f) => /stairs of (\d+) steps in a/.exec(f)).find(Boolean)?.[1]);
  sure(steps > 0, plain.facts.join("; "));
  // the stairs run west from a's east wall (x 160): a chest 20 past their foot, and one on them, stand in the way
  const run = 24 * steps; // a tread is 24
  for (const x of [160 - run - 20, 160 - run / 2]) {
    const faults = build(spec([{ prefab: "chest", room: "a", at: [x, 0] }])).faults;
    sure(faults.some((f) => /furniture\[0\] \(chest\) stands on or at the foot of the stairs of links\[0\]/.test(f)), `${x}: ${faults.join("; ")}`);
  }
  // one beside them, and one well clear of their foot, do not
  for (const at of [[160 - run / 2, 100], [160 - run - 80, 0]]) {
    const faults = build(spec([{ prefab: "chest", room: "a", at }])).faults;
    sure(!faults.some((f) => /stairs of links/.test(f)), `${at}: ${faults.join("; ")}`);
  }
});

test("a way through clears a step: raised to Valve's 96, and 90 over the lower floor (Kaupo's shed, ducked through)", () => {
  const spec = (high) => ({ spec: "smak.map/1", name: "step", rooms: [{ id: "yard", size: [256, 256, high] }, { id: "shed", size: [256, 256, high], place: { east_of: "yard" }, floor: 8 }], links: [{ between: ["yard", "shed"], kind: "opening", height: 76 }], entities: [{ class: "info_player_start", room: "yard", at: "centre" }] });
  const tall = buildMapSpec(spec(160), { out: join(folder, "step"), compilers: { found: false, message: "" } }).report;
  sure(tall.facts.some((f) => /raised from 76 to 96 high/.test(f)), tall.facts.filter((f) => /links/.test(f)).join("; "));
  const low = buildMapSpec(spec(86), { out: join(folder, "step"), compilers: { found: false, message: "" } }).report;
  sure(low.faults.some((f) => /is 78 high.*over the step of 8/.test(f)), [...low.faults, ...low.errors].join("; "));
});

test("a door's picture is fitted to its leaf, a ladder's across its width; every door opens to a touch and shuts by itself", () => {
  // Steven's walk of kaupo_v2: doors "solid wood, no handles", a ladder "-|- rather than |--|"
  const spec = (door) => ({ spec: "smak.map/1", name: "fit", rooms: [{ id: "a", size: [256, 256, 128] }, { id: "b", size: [256, 256, 128], place: { east_of: "a" } }], links: [{ between: ["a", "b"], kind: "door", door }], ladders: [{ room: "a", side: "north", height: 120 }], entities: [{ class: "info_player_start", room: "a", at: "centre" }] });
  for (const door of [{ swing: true }, undefined]) {
    const { files } = buildMapSpec(spec(door), { out: join(folder, "fit"), compilers: { found: false, message: "" } });
    const map = smak.maps.readMap(readFileSync(files.map, "utf8"));
    const leaf = map.entities.find((e) => /^func_door/.test(e.classname));
    // every door as Valve's are: opened by walking into it, shut by itself two seconds later (Steven, 2026-10-15)
    sure(leaf.spawnflags === "0" && leaf.wait === "2" && !map.entities.some((e) => e.classname === "func_button"), `${leaf.classname} spawnflags ${leaf.spawnflags}, wait ${leaf.wait}`);
    // the leaf, 96 high and as wide as the doorway (64 unless told, less 4 at a hinge): its broad faces
    // (looking along x) span exactly one 64 x 128 picture
    const corners = smak.maps.shapeOf(leaf.brushes[0]).corners;
    const wide = Math.max(...corners.map((p) => p[1])) - Math.min(...corners.map((p) => p[1]));
    const broad = leaf.brushes[0].faces.filter((f) => Math.abs(f.v[2] + 1) < 1e-9 && Math.abs(f.u[1]) === 1);
    sure(broad.length === 2 && broad.every((f) => Math.abs(f.scale[0] * 64 - wide) < 1e-6 && Math.abs(f.scale[1] * 128 - 96) < 1e-6), JSON.stringify({ wide, scales: broad.map((f) => f.scale) }));
    const rungs = map.entities.find((e) => e.classname === "func_wall").brushes[0].faces.filter((f) => Math.abs(f.u[0]) === 1 && Math.abs(f.v[2] + 1) < 1e-9);
    // 32 wide, its rungs one picture across (the map's own mesh, 128 wide, without the game's .wad) and tiling up
    sure(rungs.length && rungs.every((f) => f.scale[1] === 1 && Math.abs(f.scale[0] * 128 - 32) < 1e-6), JSON.stringify(rungs.map((f) => [f.scale, f.u[3]])));
  }
});

test("a flight of stairs has a railing on each open side: a post and a handrail over every step", () => {
  // Steven's walk of kaupo_v2: "the stairs don't have railing"
  const spec = { spec: "smak.map/1", name: "rail", rooms: [{ id: "low", size: [384, 384, 256] }, { id: "high", size: [256, 256, 128], place: { east_of: "low" }, floor: 64 }], links: [{ between: ["low", "high"], kind: "opening", width: 64 }], entities: [{ class: "info_player_start", room: "low", at: "centre" }] };
  const { files, report } = buildMapSpec(spec, { out: join(folder, "rail"), compilers: { found: false, message: "" } });
  const steps = Number(/stairs of (\d+) steps/.exec(report.facts.join(" "))?.[1]);
  const map = smak.maps.readMap(readFileSync(files.map, "utf8"));
  // one func_detail holds the railing (the lamps' rods and shades are others): two sides, a post and a rail a step
  const rails = map.entities.filter((e) => e.classname === "func_detail").map((e) => e.brushes.length);
  sure(steps > 0 && rails.includes(2 * 2 * steps), `${steps} steps, func_detail of ${rails.join(", ")} pieces`);
});

test("a lamp over a flight of stairs clears a head on its treads: a climb of 256 is walked", () => {
  // the original mod's maker: "stairs over 376 units failed the walk test even with headroom fixed". The room's
  // lamps hung 192 over its floor, and a stair down the room's middle climbed into one halfway up
  const spec = { spec: "smak.map/1", name: "climb", rooms: [{ id: "low", size: [544, 256, 384] }, { id: "high", size: [256, 256, 128], place: { east_of: "low" }, floor: 256 }], links: [{ between: ["low", "high"], kind: "opening" }], entities: [{ class: "info_player_start", room: "low", at: "corner sw" }, { class: "item_battery", room: "high", at: "centre" }] };
  const { files, report } = buildMapSpec(spec, { out: join(folder, "climb"), compilers: { found: false, message: "" } });
  sure(report.facts.some((f) => /stairs of 16 steps in low up to the way at 256/.test(f)), report.facts.filter((f) => /links/.test(f)).join("; "));
  const reach = smak.maps.reachOf(smak.maps.readMap(readFileSync(files.map, "utf8")));
  sure(reach.entities.find((e) => e.classname === "item_battery").reached, reach.warnings.join(" | "));
});

test("a map spec's prism pieces cut a room's corner at 45 degrees, turned with their prefab; a plan's grid", () => {
  const out = mkdtempSync(join(tmpdir(), "smak-prism-"));
  const { report, files } = buildMapSpec(
    {
      spec: "smak.map/1",
      name: "oct",
      rooms: [{ id: "hall", size: [512, 512, 192], dark: true }],
      prefabs: { corner: { pieces: [{ prism: { outline: [[0, 0], [128, 0], [0, 128]], from: 0, to: 192 } }] } },
      furniture: [{ prefab: "corner", room: "hall", at: [-256, -256], as: "world" }, { prefab: "corner", room: "hall", at: [256, -256], rotate: 90, as: "world" }],
      entities: [{ class: "info_player_start", room: "hall", at: "centre" }],
    },
    { out, compilers: { found: false, message: "no compilers in this test" } },
  );
  sure(report.errors.length === 0, report.errors.join("; "));
  // the source plan: rock in the two front corners, floor in the back ones
  const map = smak.maps.readMap(readFileSync(files.map, "utf8"));
  const plan = smak.maps.planOfSource(map, { scale: 1, grid: 128 });
  const at = (x, y) => {
    const [px, py] = [Math.round((x - plan.facts.x0) * plan.facts.scale), Math.round((plan.facts.y0 - y) * plan.facts.scale)];
    return [...plan.rgba.subarray((py * plan.width + px) * 4, (py * plan.width + px) * 4 + 3)];
  };
  const same = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 8);
  sure(same(at(-240, -240), at(240, -240)) && !same(at(-240, -240), at(-200, 200)) && same(at(-200, 200), at(100, 100)), `rock cut in at both front corners: ${at(-240, -240)} ${at(240, -240)} against floor ${at(-200, 200)} ${at(100, 100)}`);
});

test("a map spec is laid out by words, its rooms in rooms, its modules taken in with their ids and their walls", () => {
  const spec = {
    spec: "smak.map/1",
    rooms: [
      { id: "hall", size: [256, 256, 160] },
      { id: "study", size: [256, 256, 128], place: { east_of: "hall" }, floor: 16 },
      { id: "pit", size: [128, 64, 48], place: { in: "hall", offset: [64, 32] }, floor: -48 },
    ],
  };
  const { rooms } = layoutOf(spec);
  sure(rooms.get("study").min.join() === "144,-128,16", `east of the hall, 16 of rock between, its floor 16 up: ${rooms.get("study").min}`);
  sure(rooms.get("pit").min.join() === "-64,-96,-48", `in the hall: ${rooms.get("pit").min}`);

  const moduleFile = join(folder, "shop.json");
  writeFileSync(moduleFile, JSON.stringify({
    spec: "smak.map/1",
    theme: { wall: "tile" },
    rooms: [{ id: "shop", size: [256, 192, 128] }, { id: "front", size: [256, 192, 256], place: { south_of: "shop" }, test: true }],
    links: [{ between: ["shop", "front"], kind: "opening" }],
    entities: [{ class: "info_player_start", room: "front", at: "centre" }, { class: "item_battery", room: "shop", at: "centre", facing: "shop" }],
  }));
  const taken = withIncludes({ spec: "smak.map/1", rooms: [{ id: "street", size: [512, 256, 256] }], include: [{ spec: "shop.json", as: "corner", place: { north_of: "street" } }] }, folder);
  const shop = taken.rooms.find((room) => room.id === "corner_shop");
  sure(shop && shop.place.north_of === "street" && shop.surfaces.walls === "corner_wall", `the module's first room placed, its walls kept: ${JSON.stringify(shop)}`);
  sure(!taken.rooms.some((room) => room.id === "corner_front") && !taken.links.length, "a test room and its link stay out");
  sure(taken.entities.length === 1 && taken.entities[0].facing === "corner_shop", "its start stays out; a room it names is prefixed");
});

test("a map spec is built without compilers: lined rooms (the crash of case 9), water, glass, breakables, neon", () => {
  const out = join(folder, "lined");
  const { report, files } = buildMapSpec(
    {
      spec: "smak.map/1",
      name: "lined",
      night: true,
      textures: { pink: { base: "neon", tone: [1, 0.2, 0.7] }, fence: { base: "mesh", tone: [0.5, 0.5, 0.5], cell: 6 } },
      rooms: [
        { id: "yard", size: [384, 256, 256], sky: true, surfaces: { floor: "grass", walls: "brick" } },
        { id: "pool", size: [256, 256, 128], place: { north_of: "yard" }, water: 32 },
      ],
      links: [{ between: ["yard", "pool"], kind: "opening" }, { between: ["yard", "pool"], kind: "window", along: 0.8, glass: true }],
      furniture: [
        { box: [32, 32, 32], room: "yard", at: [100, 0], entity: { class: "func_breakable", material: 1 } },
        { box: [64, 4, 16], room: "yard", at: [0, -126], z: 96, texture: "pink" },
        { box: [96, 2, 48], room: "yard", at: [-120, -60], texture: "fence" },
      ],
      entities: [{ class: "info_player_start", room: "yard", at: "centre" }],
      models: { post: { spec: "smak.model/1", parts: [{ id: "post", kind: "cylinder", radius: 2, height: 40 }] } },
      props: [{ model: "post", room: "yard", at: [-100, 60] }],
    },
    { out, compilers: { found: false, message: "no compilers in this test" } },
  );
  // the models it builds, drawn one by one and named
  const gallery = smak.unpng(readFileSync(files.models));
  sure(gallery.width === 192 && gallery.height === 192, `a gallery of its models: ${gallery.width}x${gallery.height}`);
  sure(report.errors.length === 0, report.errors.join("; "));
  sure(report.faults.length === 1 && /not compiled/.test(report.faults[0]), `only the compile is wanting: ${report.faults}`);
  const text = readFileSync(files.map, "utf8");
  sure(/"classname" "func_breakable"[\s\S]*"rendermode" "2"/.test(text), "a glass pane, a func_breakable half see-through");
  sure(/"material" "1"/.test(text), "the crate a breakable of wood");
  sure(/"classname" "func_wall"\n"rendermode" "4"\n"renderamt" "255"[^}]*\{\n[^}]*\{SM_FENCE/.test(text), "a fence of mesh, a func_wall in render mode 4");
  sure(/!SM_WATER/.test(text) && /"classname" "info_texlights"[\s\S]*"SM_PINK"/.test(text), "water, and the neon a texture light");
  sure(/"_diffuse_light"/.test(text), "a night sky's own light under the moon's");
  const wad = smak.maps.readWad(readFileSync(files.wad));
  sure(["SM_GRASS", "SM_BRICK", "!SM_WATER", "SM_PINK", "SKY", "{SM_FENCE"].every((name) => wad.textures.some((t) => t.name.toUpperCase() === name)), `the wad: ${wad.textures.map((t) => t.name)}`);
  // the fence's holes are the last colour of its palette, and they are most of it
  const fence = wad.textures.find((t) => t.name.toUpperCase() === "{SM_FENCE");
  const holes = fence.pixels.filter((i) => i === 255).length / fence.pixels.length;
  sure(holes > 0.4 && holes < 0.9, `a fence is mostly holes: ${holes}`);
  // chain-link's cords run on the diagonals: the diagonal through a crossing is all cord, as a square grid's is not
  const solid = (picture) => Array.from({ length: 32 }, (_, i) => picture.rgba[(i * picture.width + i) * 4 + 3]).every((a) => a === 255);
  sure(solid(surfacePicture({ base: "mesh", cell: 6, weave: "diamond" }, 128)) && !solid(surfacePicture({ base: "mesh", cell: 6 }, 128)), "a diamond weave");
  // a map's picture tiles: its left column follows on from its right
  const picture = surfacePicture(materialOf("brick"), 64);
  const step = (x0, x1) => Math.abs(picture.rgb[(10 * 64 + x0) * 3] - picture.rgb[(10 * 64 + x1) * 3]);
  sure(step(63, 0) < 80, "a picture laid side by side shows no seam");
});

test("a map spec's building stands in the open: a shell of its own material, a gable roof, ways out through its walls", () => {
  const spec = {
    spec: "smak.map/1",
    name: "house",
    rooms: [
      { id: "yard", size: [1024, 896, 384], sky: true, surfaces: { floor: "grass" } },
      { id: "living", size: [320, 256, 112], floor: 8, place: { in: "yard", offset: [256, 256], stand: true } },
      { id: "kitchen", size: [192, 256, 112], place: { east_of: "living" } },
    ],
    links: [
      { between: ["living", "yard"], kind: "door", side: "south" },
      { between: ["living", "kitchen"], kind: "opening" },
      { between: ["kitchen", "yard"], kind: "window", side: "east", glass: true },
    ],
    entities: [
      { class: "info_player_start", room: "yard", at: [0, -300], facing: "north" },
      { class: "item_healthkit", room: "kitchen", at: "centre" },
    ],
  };
  const { report, files } = buildMapSpec(spec, { out: join(folder, "house"), compilers: { found: false, message: "no compilers in this test" } });
  sure(report.errors.length === 0, report.errors.join("; "));
  sure(/building living: living, kitchen, standing in yard, its outside siding, a gable roof of shingles/.test(report.facts.join("\n")), report.facts.join(" | "));
  sure(/all \d+ entities a player goes to are reached on foot/.test(report.facts.join("\n")), "the kitchen is walked into from the yard, through the front door");
  const text = readFileSync(files.map, "utf8");
  sure(/SM_OUTSIDE/.test(text) && /SM_ROOF/.test(text), "its outside and its roof wear their own textures");
  // taken into a larger map as a module: its theme's words, a theme word naming its own texture, and its
  // doors' material come with it under its prefix
  writeFileSync(join(folder, "house-module.json"), JSON.stringify({ ...spec, theme: { door: "oak", outside: "blue" }, textures: { oak: { base: "wood" }, blue: { base: "siding", tone: [0.5, 0.6, 0.9] } } }));
  const town = buildMapSpec(
    {
      spec: "smak.map/1",
      name: "town",
      rooms: [{ id: "road", size: [1024, 256, 320], sky: true }],
      include: [{ spec: "house-module.json", as: "h", place: { north_of: "road" } }],
      links: [{ between: ["h_yard", "road"], kind: "opening" }],
      entities: [{ class: "info_player_start", room: "road", at: "centre" }],
    },
    { out: join(folder, "town"), folder, compilers: { found: false, message: "" } },
  );
  sure(town.report.errors.length === 0, town.report.errors.join("; "));
  const townText = readFileSync(town.files.map, "utf8");
  sure(/"classname" "func_door"\n(?:"[^\n]*\n)*\{\n[^\n]*SM_H_OAK/.test(townText) && /SM_H_BLUE/.test(townText), "the module's door and outside are its own");
  // the same town in winter: a word replaced in every module, a model for every prop of another
  const cone = { spec: "smak.model/1", parts: [{ id: "cone", kind: "cylinder", radius: 8, top: 0.5, height: 30 }] };
  const ball = { spec: "smak.model/1", parts: [{ id: "ball", kind: "sphere", radius: 10 }] };
  writeFileSync(join(folder, "house-trees.json"), JSON.stringify({ ...JSON.parse(readFileSync(join(folder, "house-module.json"))), models: { tree: ball }, props: [{ model: "tree", room: "yard", at: [-400, -350] }] }));
  const winter = buildMapSpec(
    {
      spec: "smak.map/1",
      name: "winter",
      rooms: [{ id: "road", size: [1024, 256, 320], sky: true }],
      include: [{ spec: "house-trees.json", as: "h", place: { north_of: "road" } }],
      links: [{ between: ["h_yard", "road"], kind: "opening" }],
      entities: [{ class: "info_player_start", room: "road", at: "centre" }],
      models: { bare: cone },
      replace: { textures: { outside: { base: "snow" } }, models: { tree: "bare" } },
    },
    { out: join(folder, "winter"), folder, compilers: { found: false, message: "" } },
  ).report;
  sure(winter.errors.length === 0, winter.errors.join("; "));
  sure(winter.facts.includes("replaced outside: h_outside") && winter.facts.includes("replaced the model tree by bare: 1 props"), winter.facts.join(" | "));
  sure(winter.placed.some((thing) => thing.name === "bare") && !winter.placed.some((thing) => /tree/.test(thing.name)), "the tree is the bare one");
  const wrong = buildMapSpec({ spec: "smak.map/1", name: "w2", rooms: [{ id: "road", size: [512, 256, 320], sky: true }], entities: [{ class: "info_player_start", room: "road", at: "centre" }], replace: { textures: { lawn: { base: "snow" } }, models: { tree: "bare" } } }, { out: join(folder, "w2"), compilers: { found: false, message: "" } }).report;
  sure(wrong.errors.some((e) => /replace.textures.lawn: no texture/.test(e)) && wrong.errors.some((e) => /replace.models.tree: "bare" is none of the spec's models/.test(e)), wrong.errors.join("; "));
  // a model the map and its module both have from one file is one model, built once
  writeFileSync(join(folder, "post.json"), JSON.stringify({ spec: "smak.model/1", parts: [{ id: "post", kind: "cylinder", radius: 2, height: 40 }] }));
  writeFileSync(join(folder, "posts-module.json"), JSON.stringify({ spec: "smak.map/1", rooms: [{ id: "plot", size: [256, 256, 128], sky: true }], models: { post: { file: "post.json" } }, props: [{ model: "post", room: "plot", at: "centre" }], entities: [] }));
  const merged = withIncludes({ spec: "smak.map/1", rooms: [{ id: "road", size: [512, 256, 128], sky: true }], models: { lamp: { file: "post.json" } }, props: [{ model: "lamp", room: "road", at: "centre" }], include: [{ spec: "posts-module.json", as: "p", place: { north_of: "road" } }] }, folder);
  sure(Object.keys(merged.models).join() === "lamp" && merged.props.every((thing) => thing.model === "lamp"), `one model for one file: ${JSON.stringify(merged.models)} ${JSON.stringify(merged.props)}`);
  const wad = smak.maps.readWad(readFileSync(town.files.wad));
  sure(wad.textures.some((tx) => tx.name.toUpperCase() === "SM_H_BLUE"), `the module's own texture is made: ${wad.textures.map((tx) => tx.name)}`);
  const out = buildMapSpec({ ...spec, rooms: [spec.rooms[0], { ...spec.rooms[1], place: { in: "yard", offset: [900, 256], stand: true } }, spec.rooms[2]] }, { out: join(folder, "house2"), compilers: { found: false, message: "" } }).report;
  sure(out.errors.some((e) => /the building's walls .* reach out of yard/.test(e)), out.errors.join("; "));
  const inside = buildMapSpec({ ...spec, props: [{ model: "bush", room: "yard", at: [-200, -200] }], models: { bush: { spec: "smak.model/1", parts: [{ id: "bush", kind: "sphere", radius: 10 }] } } }, { out: join(folder, "house4"), compilers: { found: false, message: "" } }).report;
  sure(inside.faults.some((f) => /props\[0\] \(bush\) stands \d+ into the building living in yard/.test(f)), `a bush put inside the house: ${inside.faults.join("; ")}`);
  const sideless = buildMapSpec({ ...spec, links: [{ between: ["living", "yard"], kind: "door" }, ...spec.links.slice(1)] }, { out: join(folder, "house3"), compilers: { found: false, message: "" } }).report;
  sure(sideless.errors.some((e) => /side "north", "south", "east" or "west"/.test(e)), sideless.errors.join("; "));
});

test("a map spec's walk faults come back in the walk test's own words (the crash of case 8)", () => {
  const { report } = buildMapSpec(
    {
      spec: "smak.map/1",
      name: "stuck",
      rooms: [{ id: "room", size: [256, 256, 128] }],
      furniture: [{ box: [96, 96, 96], room: "room", at: "centre" }],
      entities: [{ class: "info_player_start", room: "room", at: "centre" }],
    },
    { out: join(folder, "stuck"), compilers: { found: false, message: "no compilers in this test" } },
  );
  sure(report.faults.some((fault) => /walk: .*stand in something solid/.test(fault)), report.faults.join(" | "));
});

test("the compilers' tool textures as SDHLT has them: SKIP leaks, NOCLIP lets a player through, SOLIDHINT is solid to a body", () => {
  const { box, carve, playerStart, pointEntity } = smak.maps;
  // a sealed room, then the same room with its east wall a brush of one tool texture
  const roomWith = (east) => {
    const walls = smak.maps.hollow([0, 0, 0], [256, 256, 128], 16, "WALL");
    walls[3] = box([256, -16, -16], [272, 272, 144], east);
    return { brushes: walls, entities: [playerStart([64, 128, 0], 0)] };
  };
  sure(smak.maps.checkPlan(roomWith("SKIP")).leak, "a wall of SKIP seals nothing");
  sure(smak.maps.checkPlan(roomWith("NOCLIP")).leak, "a wall of NOCLIP seals hull 0 alone: a player goes through it");
  sure(!smak.maps.checkPlan(roomWith("SOLIDHINT")).leak, "a wall of SOLIDHINT seals");
  // a SOLIDHINT brush across the room stops a body: what is behind it is not reached on foot
  const map = {
    brushes: [...carve([{ min: [0, 0, 0], max: [512, 256, 128] }], 16, "WALL"), box([248, 0, 0], [264, 256, 128], "SOLIDHINT")],
    entities: [playerStart([64, 128, 0], 0), pointEntity("item_battery", [448, 128, 0])],
  };
  sure(smak.maps.reachOf(map).unreached.length === 1, "behind a SOLIDHINT wall is not walked to");
});

test("the compilers' chart of the engine's limits is read; a map spec's furniture is func_detail unless told", async () => {
  const { limitsOf } = await import("../src/maps/compile.mjs");
  const limits = limitsOf("* AllocBlock 5/64\n * worldleaves 771/8192\nclipnodes      2113/32767  16904/262136 (6.4%)");
  sure(limits.allocblock.used === 5 && limits.worldleaves.most === 8192 && limits.clipnodes.used === 2113, JSON.stringify(limits));
  const spec = (as) => ({
    spec: "smak.map/1",
    name: `detail_${as}`,
    rooms: [{ id: "room", size: [256, 256, 128] }],
    furniture: [{ box: [32, 32, 32], room: "room", at: [64, 64], ...(as ? { as } : {}) }],
    entities: [{ class: "info_player_start", room: "room", at: "centre" }],
  });
  const text = (as) => readFileSync(buildMapSpec(spec(as), { out: join(folder, `detail_${as}`), compilers: { found: false, message: "none" } }).files.map, "utf8");
  sure(/"classname" "func_detail"/.test(text()), "unless told, furniture is func_detail");
  sure(!/func_detail/.test(text("world")), "as: world keeps it in the world");
});
