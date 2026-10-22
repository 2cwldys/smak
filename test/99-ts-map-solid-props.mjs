// Props a player cannot walk through: The Specialists' ts_model is a point to a player (its program gives it a box of
// no size), so a thing the profile says is `solid` (a couch, a table, a box) is given a CLIP box of its footprint,
// turned as it stands, from its foot to its `high`; a plant or a picture is walked through, as in the game's maps. A
// prop's own `solid` says otherwise. The rooms dressed by use clip theirs too, and are still walked. On a game of
// the test's own.
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as smak from "../src/index.mjs";
import { buildMapSpec } from "../src/spec/map.mjs";
import specialists, { SPEC } from "../profiles/specialists.mjs";
import { fakeSpecialists } from "./fixture-specialists.mjs";
import { test, sure, tmp } from "./helper.mjs";

const folder = join(tmp, "ts-map-solid-props");
mkdirSync(folder, { recursive: true });
const mod = specialists({ game: fakeSpecialists(folder) });
const none = { compilers: { found: false, message: "" } };

/** Every CLIP brush of the map's world, as its box. */
const clipsOf = (map) =>
  map.brushes.filter((b) => b.faces.every((f) => /^CLIP$/i.test(f.texture))).map((b) => {
    const { min, max } = smak.maps.shapeOf(b);
    return { min: min.map(Math.round), max: max.map(Math.round) };
  });
const around = (clip, [x, y]) => clip.min[0] <= x && x <= clip.max[0] && clip.min[1] <= y && y <= clip.max[1];

test("a solid thing of The Specialists' is clipped, turned as it stands, from its foot to its top; a plant is walked through; a prop's own word wins", () => {
  const couch = SPEC.things.couch;
  const spec = {
    spec: "smak.map/1",
    name: "ts_solid",
    rooms: [{ id: "hall", size: [512, 384, 160] }],
    props: [
      { model: couch.model, room: "hall", at: [-100, 120], facing: 0 },
      { model: couch.model, room: "hall", at: [100, 120], facing: 90 },
      { model: SPEC.things.plant.model, room: "hall", at: [-200, -150], z: 70 },
      { model: SPEC.things.plant2.model, room: "hall", at: [200, -150], z: 47, solid: true },
      { model: SPEC.things.table.model, room: "hall", at: [0, -100], solid: false },
    ],
    entities: [{ class: "info_player_deathmatch", room: "hall", at: [0, 0] }],
  };
  const { report, files } = buildMapSpec(spec, { out: join(folder, "props"), mod, ...none });
  sure(report.errors.length === 0, report.errors.join("; "));
  const map = smak.maps.readMap(readFileSync(files.map, "utf8"));
  const clips = clipsOf(map);
  const floor = report.rooms.hall.min[2];
  const origin = (k) => map.entities.filter((e) => e.classname === "ts_model")[k].origin.split(" ").map(Number);
  // the couch at yaw 0: the profile turns it 90, so its long side (r) runs along x, its back (wall) to -y
  const a = clips.find((c) => around(c, origin(0)));
  const [ax, ay] = origin(0);
  sure(a && a.min[2] === floor && a.max[2] === floor + couch.high, `the first couch's clip ${JSON.stringify(a)} (high ${couch.high})`);
  sure(a.max[0] - a.min[0] === 2 * couch.r && ay - a.min[1] === couch.deep && a.max[1] - ay === couch.wall, `turned as it stands: ${JSON.stringify(a)} about ${ax} ${ay}`);
  // at yaw 90 its long side runs along y
  const b = clips.find((c) => around(c, origin(1)));
  sure(b && b.max[1] - b.min[1] === 2 * couch.r && b.max[0] - b.min[0] === couch.wall + couch.deep, JSON.stringify(b));
  // the plant is walked through; the plant told `solid` is clipped from the floor, though its origin is lifted;
  // the table told not to be is not
  sure(!clips.some((c) => around(c, origin(2))), "a plant walked through");
  const plant = clips.find((c) => around(c, origin(3)));
  sure(plant && plant.min[2] === floor && plant.max[2] === floor + SPEC.things.plant2.high, JSON.stringify(plant));
  sure(!clips.some((c) => around(c, origin(4))), "the table told not to be solid");
  sure(clips.length === 3 && report.facts.some((f) => /props: 3 solid, each in a CLIP box of its footprint and height \(3 in hall\)/.test(f)), report.facts.filter((f) => /solid/.test(f)).join(" | "));
});

test("rooms dressed by The Specialists' uses: their couches, tables and boxes clipped, their plants and pictures not, and every room still walked", () => {
  const spec = {
    spec: "smak.map/1",
    name: "ts_dressed",
    rooms: [
      { id: "lobby", size: [448, 384, 160], use: "lobby" },
      { id: "alley", size: [384, 448, 256], place: { east_of: "lobby" }, sky: true, use: "alley" },
    ],
    links: [{ between: ["lobby", "alley"], kind: "door" }],
    entities: [{ class: "info_player_deathmatch", room: "lobby", at: "against west", facing: "east" }, { class: "info_player_deathmatch", room: "alley", at: "corner ne", facing: "west" }],
  };
  const { report, files } = buildMapSpec(spec, { out: join(folder, "dressed"), mod, ...none });
  sure(report.errors.length === 0 && !report.faults.some((f) => !/not compiled/.test(f)), [...report.errors, ...report.faults].join("; "));
  const map = smak.maps.readMap(readFileSync(files.map, "utf8"));
  const clips = clipsOf(map);
  const solid = new Set(Object.values(SPEC.things).filter((t) => t.solid).map((t) => t.model));
  const props = map.entities.filter((e) => e.classname === "ts_model");
  const clipped = props.filter((e) => clips.some((c) => around(c, e.origin.split(" ").map(Number))));
  sure(props.some((e) => solid.has(e.model)) && props.filter((e) => solid.has(e.model)).every((e) => clipped.includes(e)), `solid: ${props.filter((e) => solid.has(e.model)).map((e) => e.model).join(", ")}; clipped ${clipped.length}`);
  sure(!props.some((e) => !solid.has(e.model) && clipped.includes(e)), "nothing walked through is clipped");
  sure(report.facts.some((f) => /walked from 2 places to start/.test(f)), report.facts.filter((f) => /walk/.test(f)).join(" | "));
});
