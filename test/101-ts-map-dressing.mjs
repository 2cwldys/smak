// Rooms dressed as thickly as the game's own: The Specialists' compact maps are cluttered at their edges (ts_trident: 47
// props and 34 breakables over 4.4 million square units), and a warehouse of 448 x 384 got four pieces. Pieces now
// stand all along the walls, crates pile into the corners and along from them and in a pile in the middle, an office's
// desks stand in rows, a lobby's couches face each other over a table; a room's `density` thickens or thins it. The
// ways through and the places to start are kept clear, and every room is still walked. On a game of the test's own.
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as smak from "../src/index.mjs";
import { buildMapSpec } from "../src/spec/map.mjs";
import { dressRooms, densityOf, DENSITIES } from "../src/spec/dress.mjs";
import specialists, { SPEC } from "../profiles/specialists.mjs";
import { fakeSpecialists } from "./fixture-specialists.mjs";
import { test, sure, tmp } from "./helper.mjs";

const folder = join(tmp, "ts-map-dressing");
mkdirSync(folder, { recursive: true });
const mod = specialists({ game: fakeSpecialists(folder) });
const none = { compilers: { found: false, message: "" } };
const fault = (report) => [...report.errors, ...report.faults.filter((f) => !/not compiled/.test(f))];
const count = (report, room) => Number(new RegExp(`${room} \\(\\w+\\): (\\d+) pieces`).exec(report.facts.find((f) => /^dressed by use/.test(f)) ?? "")?.[1] ?? 0);

/** A store and a hall, a start in each and a way between: the store dressed as a warehouse as dense as told. */
const store = (density, size = [448, 384, 192]) => ({
  spec: "smak.map/1",
  name: "ts_store",
  rooms: [
    { id: "hall", size: [384, 256, 160] },
    { id: "store", size, place: { north_of: "hall" }, use: "warehouse", ...(density === undefined ? {} : { density }) },
  ],
  links: [{ between: ["hall", "store"], kind: "opening", width: 96 }],
  entities: [{ class: "info_player_deathmatch", room: "hall", at: "centre" }, { class: "info_player_deathmatch", room: "store", at: "corner nw", facing: "south" }],
});

test("a warehouse of 448 x 384 dressed as the game's are: twice the pieces it had, crates piled into its corners and along its walls, the way and the start clear, every room walked", () => {
  const { report, files } = buildMapSpec(store(), { out: join(folder, "store"), mod, ...none });
  sure(fault(report).length === 0, fault(report).join("; "));
  const pieces = count(report, "store");
  sure(pieces >= 8, `${pieces} pieces: ${report.facts.find((f) => /^dressed by use/.test(f))}`);
  // crates against each other: a pile, not one to a corner
  const map = smak.maps.readMap(readFileSync(files.map, "utf8"));
  const crates = map.entities.filter((e) => e.classname === "func_breakable" && e.material === "1").map((e) => smak.maps.shapeOf(e.brushes[0]));
  const near = (a, b) => [0, 1].every((k) => a.min[k] <= b.max[k] + 8 && b.min[k] <= a.max[k] + 8);
  sure(crates.some((a) => crates.some((b) => a !== b && near(a, b))), `crates side by side: ${crates.length}`);
  // nothing in the way through or on the start
  const room = report.rooms.store;
  const start = map.entities.find((e) => e.classname === "info_player_deathmatch" && Number(e.origin.split(" ")[1]) > room.min[1]).origin.split(" ").map(Number);
  const boxes = [...map.entities.filter((e) => /^func_(breakable|detail)$/.test(e.classname)).flatMap((e) => e.brushes), ...map.brushes.filter((b) => b.faces.every((f) => /^CLIP$/i.test(f.texture)))].map((b) => smak.maps.shapeOf(b)).filter((s) => s.min[1] >= room.min[1] - 1);
  sure(!boxes.some((b) => b.min[0] < start[0] + 16 && start[0] - 16 < b.max[0] && b.min[1] < start[1] + 16 && start[1] - 16 < b.max[1]), "nothing on the start");
  sure(report.facts.some((f) => /walked from 2 places to start/.test(f)) && !report.warnings.some((w) => /no floor of store is walked/.test(w)), report.facts.filter((f) => /walk/.test(f)).join(" | "));
});

test("a room's density: dense dresses more than normal, sparse less; a density that is no number or word refused", () => {
  const n = (density) => count(buildMapSpec(store(density), { out: join(folder, `store-${density}`), mod, ...none }).report, "store");
  const [sparse, normal, dense] = [n("sparse"), n(undefined), n("dense")];
  sure(sparse < normal && normal < dense, `sparse ${sparse}, normal ${normal}, dense ${dense}`);
  sure(densityOf("cluttered") === 2 && densityOf(0.7) === 0.7 && densityOf("heaps") === null && densityOf(-1) === null && Object.keys(DENSITIES).join() === "sparse,normal,dense,cluttered", "the words");
  const wrong = buildMapSpec(store("heaps"), { out: join(folder, "store-wrong"), mod, ...none }).report;
  sure(wrong.errors.some((e) => /rooms\[1\]\.density: how thickly its use dresses it, a number over 0 to 4 \(1 as the use is written\) or sparse, normal, dense, cluttered/.test(e)), wrong.errors.join("; "));
});

test("an office's desks in rows in its middle, facing one way, each with its computer on it; a lobby's couches facing each other over a table", () => {
  const spec = {
    spec: "smak.map/1",
    name: "ts_floor",
    rooms: [
      { id: "lobby", size: [640, 512, 192], use: "lobby" },
      { id: "office", size: [576, 512, 128], place: { east_of: "lobby" }, use: "office" },
    ],
    links: [{ between: ["lobby", "office"], kind: "door", along: 0.85 }],
    entities: [{ class: "info_player_deathmatch", room: "lobby", at: "against west", facing: "east" }, { class: "info_player_deathmatch", room: "office", at: "corner se", facing: "west" }],
  };
  const { report, files } = buildMapSpec(spec, { out: join(folder, "floor"), mod, ...none });
  sure(fault(report).length === 0, fault(report).join("; "));
  const map = smak.maps.readMap(readFileSync(files.map, "utf8"));
  const props = map.entities.filter((e) => e.classname === "ts_model").map((e) => ({ model: e.model, at: e.origin.split(" ").map(Number), yaw: Number(e.angles.split(" ")[1]) }));
  const inside = (r, at, margin) => at[0] > r.min[0] + margin && at[0] < r.max[0] - margin && at[1] > r.min[1] + margin && at[1] < r.max[1] - margin;
  // desks in the office's middle, off every wall by more than a desk stands off one, all facing one way
  const office = report.rooms.office;
  const computers = props.filter((p) => /3dm_pc[34]/.test(p.model) && inside(office, p.at, 48 + 8));
  sure(computers.length >= 2 && new Set(computers.map((p) => p.yaw)).size === 1, JSON.stringify(computers));
  // in rows: at least two share a line across the room's long way
  sure(computers.some((a) => computers.some((b) => a !== b && Math.abs(a.at[1] - b.at[1]) < 1)), `in a row: ${JSON.stringify(computers.map((p) => p.at))}`);
  // the lobby's couches about its coffee table: two, on its two sides the room's short way, turned half round from each other
  const lobby = report.rooms.lobby;
  const table = props.find((p) => p.model === SPEC.things.coffeeTable.model);
  sure(table && inside(lobby, table.at, 100), JSON.stringify(table));
  const seats = props.filter((p) => [SPEC.things.couch.model, SPEC.things.sofa.model].includes(p.model) && Math.abs(p.at[0] - table.at[0]) < 1);
  sure(seats.length === 2 && Math.abs(seats[0].yaw - seats[1].yaw) === 180 && (seats[0].at[1] - table.at[1]) * (seats[1].at[1] - table.at[1]) < 0, JSON.stringify(seats));
  // a walk round the table: a player passes between it and each couch
  sure(seats.every((s) => Math.abs(s.at[1] - table.at[1]) - SPEC.things.couch.deep - SPEC.things.coffeeTable.r >= 32 || Math.abs(s.at[1] - table.at[1]) - SPEC.things.sofa.deep - SPEC.things.coffeeTable.r >= 32), JSON.stringify(seats.map((s) => s.at[1] - table.at[1])));
});

test("dressRooms by itself: a use of rows, a group and a cluster of the test's own, clear of a way through and of what is taken, nothing overlapping", () => {
  const things = { seat: { model: "seat.mdl", r: 30, wall: 20, deep: 16 }, low: { model: "low.mdl", r: 20, wall: 30, deep: 30 } };
  const pieces = { cube: { pieces: [{ box: [[0, -16, 0], [32, 16, 32]], texture: "crate" }], breakable: "wood" } };
  const uses = { hall: [["cube", ["cube"], "corner", 2], ["bench", ["bench"], "rows", 1.5], ["lounge", ["seat"], "group", 0.3, { between: "low" }], ["pile", ["cube"], "cluster", 0.5, { count: 3 }]] };
  const room = { id: "hall", min: [0, 0, 0], max: [1024, 768, 160], spec: { use: "hall" } };
  const way = { min: [480, 0], max: [576, 40] };
  const start = { min: [40, 700], max: [88, 748] };
  const dressed = dressRooms({ rooms: [room], ways: [way], taken: [start], uses, things, pieces, seed: 7 });
  const mid = [512, 384];
  const prints = [
    ...dressed.props.map((p) => ({ min: [p.at[0] + mid[0] + p.print.min[0], p.at[1] + mid[1] + p.print.min[1]], max: [p.at[0] + mid[0] + p.print.max[0], p.at[1] + mid[1] + p.print.max[1]] })),
  ];
  sure(dressed.furniture.some((f) => f.prefab === "dress_cube") && dressed.furniture.some((f) => f.prefab === "dress_bench") && dressed.props.some((p) => p.model === "low.mdl") && dressed.props.filter((p) => p.model === "seat.mdl").length >= 2, dressed.facts.join(" | "));
  sure(dressed.prefabs.dress_cube.breakable === "wood", "a mod's piece keeps its word");
  const overlaps = (a, b) => a.min[0] < b.max[0] && b.min[0] < a.max[0] && a.min[1] < b.max[1] && b.min[1] < a.max[1];
  sure(!prints.some((p) => overlaps(p, way) || overlaps(p, start)), "the way and the start kept clear");
  sure(!prints.some((a, i) => prints.some((b, j) => i < j && overlaps(a, b))), "no two models overlap");
});
