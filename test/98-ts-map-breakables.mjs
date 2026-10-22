// What breaks in a map spec: a piece of furniture, a prefab or one piece of it that says `breakable` (a word of
// Half-Life's materials) is a func_breakable of its own, with the keys the material takes: the kit's, under a mod's
// (The Specialists' profile: glass in render mode 2 at 100 and health 1, wood at 15, every one back after 45 seconds,
// as the game's maps and the Havoc9 matchmode want). A window's glass is one; the kit's crates break, each alone, in a
// warehouse of The Specialists. On a game of the test's own.
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as smak from "../src/index.mjs";
import { buildMapSpec, BREAKABLE_MATERIALS } from "../src/spec/map.mjs";
import specialists from "../profiles/specialists.mjs";
import { fakeSpecialists } from "./fixture-specialists.mjs";
import { test, sure, tmp } from "./helper.mjs";

const folder = join(tmp, "ts-map-breakables");
mkdirSync(folder, { recursive: true });
const mod = specialists({ game: fakeSpecialists(folder) });
const none = { compilers: { found: false, message: "" } };

/** The map's func_breakables, each with the textures its brushes wear. */
const breakablesOf = (file) =>
  smak.maps.readMap(readFileSync(file, "utf8")).entities.filter((e) => e.classname === "func_breakable").map((e) => ({ ...e, textures: [...new Set(e.brushes.flatMap((b) => b.faces.map((f) => f.texture.toUpperCase())))] }));

const spec = {
  spec: "smak.map/1",
  name: "ts_breaks",
  rooms: [
    { id: "bank", size: [512, 384, 160] },
    { id: "office", size: [384, 384, 128], place: { east_of: "bank" } },
    { id: "store", size: [448, 384, 192], place: { north_of: "bank" }, use: "warehouse" },
  ],
  links: [
    { between: ["bank", "office"], kind: "window", width: 128, height: 64, sill: 40, glass: true, along: 0.3 },
    { between: ["bank", "office"], kind: "door", along: 0.8 },
    { between: ["bank", "store"], kind: "opening", width: 96 },
  ],
  prefabs: {
    // a teller's counter: a wooden base that stands, a glass screen on it that breaks
    teller: { pieces: [{ box: [[0, -64, 0], [24, 64, 40]], texture: "ts_furniture" }, { box: [[10, -64, 40], [12, 64, 96]], texture: "glass", breakable: "glass" }] },
    safe: { pieces: [{ box: [[0, -16, 0], [32, 16, 48]], texture: "ts_metal" }] },
  },
  furniture: [
    { prefab: "teller", room: "bank", at: [0, 0] },
    { prefab: "safe", room: "office", at: "corner ne", rotate: 180, breakable: "metal" },
    { box: [32, 32, 32], room: "bank", at: "corner sw", breakable: true },
  ],
  entities: [{ class: "info_player_deathmatch", room: "bank", at: "corner nw", facing: "east" }],
};

test("what breaks in a map of The Specialists: a window's glass, a screen on a counter, a safe of metal, a box and the warehouse's crates, each with the game's keys", () => {
  const { report, files } = buildMapSpec(spec, { out: join(folder, "ts"), mod, ...none });
  sure(report.errors.length === 0 && !report.faults.some((f) => !/not compiled/.test(f)), [...report.errors, ...report.faults].join("; "));
  const broken = breakablesOf(files.map);
  const glass = broken.filter((e) => e.material === "0");
  // the window's pane and the counter's screen: the game's glass, half see-through, one hit, back after 45
  sure(glass.length === 2 && glass.every((e) => e.rendermode === "2" && e.renderamt === "100" && e.health === "1" && e.respawntime === "45" && e.textures.join() === "GLASS_BRIGHT"), JSON.stringify(glass.map(({ brushes, ...keys }) => keys)));
  // the counter's base is no breakable: it stands, as func_detail
  const map = smak.maps.readMap(readFileSync(files.map, "utf8"));
  sure(map.entities.some((e) => e.classname === "func_detail" && e.brushes.length === 1 && e.brushes[0].faces.some((f) => /WOOD21/i.test(f.texture))), "the counter's wooden base");
  const metal = broken.filter((e) => e.material === "2");
  sure(metal.length === 1 && metal[0].health === "50" && metal[0].respawntime === "45", JSON.stringify(metal.map(({ brushes, ...keys }) => keys)));
  // `breakable: true` is wood; and the warehouse's crates are wood, each crate a breakable of one brush
  const wood = broken.filter((e) => e.material === "1");
  sure(wood.length >= 3 && wood.every((e) => e.health === "15" && e.respawntime === "45" && e.brushes.length === 1), JSON.stringify(wood.map(({ brushes, ...keys }) => ({ ...keys, brushes: brushes.length }))));
  sure(wood.filter((e) => e.textures.join() === "CARDBOX1").length >= 2, `the warehouse's crates: ${JSON.stringify(wood.map((e) => e.textures))}`);
  sure(report.facts.some((f) => new RegExp(`breakables: ${broken.length} func_breakable \\(.*2 glass.*\\), with the mod's respawntime 45`).test(f)), report.facts.filter((f) => /breakables/.test(f)).join(" | "));
  // TS's own definitions know every key written
  sure(!report.warnings.some((w) => /keys their class does not define/.test(w)), report.warnings.filter((w) => /keys/.test(w)).join(" | "));
});

test("what breaks in a map of no mod: Half-Life's materials with the kit's keys, no respawntime; a word that is no material refused", () => {
  const plain = { ...spec, name: "hl_breaks", rooms: spec.rooms.map(({ use, ...room }) => room), prefabs: { teller: { pieces: [{ box: [[0, -64, 0], [24, 64, 40]], texture: "darkwood" }, { box: [[10, -64, 40], [12, 64, 96]], texture: "glass", breakable: "glass" }] }, safe: { pieces: [{ box: [[0, -16, 0], [32, 16, 48]], texture: "metal" }] } } };
  const { report, files } = buildMapSpec(plain, { out: join(folder, "hl"), ...none });
  sure(report.errors.length === 0, report.errors.join("; "));
  const broken = breakablesOf(files.map);
  const glass = broken.filter((e) => e.material === "0");
  sure(glass.length === 2 && glass.every((e) => e.rendermode === "2" && e.renderamt === "90" && e.health === "20" && e.respawntime === undefined), JSON.stringify(glass.map(({ brushes, ...keys }) => keys)));
  sure(broken.some((e) => e.material === "2" && e.health === "50") && broken.some((e) => e.material === "1"), JSON.stringify(broken.map(({ brushes, ...keys }) => keys)));
  sure(Object.keys(BREAKABLE_MATERIALS).join() === "glass,wood,metal,flesh,cinder,concrete,tile,computer,unbreakable_glass,rocks", Object.keys(BREAKABLE_MATERIALS).join());
  const wrong = buildMapSpec({ ...plain, furniture: [{ prefab: "safe", room: "bank", at: "corner ne", breakable: "cheese" }] }, { out: join(folder, "wrong"), ...none }).report;
  sure(wrong.errors.some((e) => /furniture\[0\]\.breakable: what it is made of, glass, wood, metal/.test(e)), wrong.errors.join("; "));
});
