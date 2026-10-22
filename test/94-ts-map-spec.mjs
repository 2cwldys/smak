// The Specialists' map spec (profiles/specialists.mjs, SPEC): a map of rooms built in the game's manner, its textures
// of the game's two shipped .wad files, its props ts_models of the game's own, rooms furnished by TS's uses (a
// computer on a desk of the kit's, couches with their backs to the wall), and the starts kept clear. On a game of the
// test's own (plain pictures under the game's names, no model files: names only); and, where The Specialists is
// installed (SMAK_HALF_LIFE, or Steam's folder), every texture the profile names in the game's .wad files and every
// model there under its very name, of the size the profile gives it.
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import * as smak from "../src/index.mjs";
import { buildMapSpec } from "../src/spec/map.mjs";
import { posed } from "../src/render.mjs";
import specialists, { SPEC } from "../profiles/specialists.mjs";
import { test, sure, tmp } from "./helper.mjs";

const folder = join(tmp, "ts-map-spec");
mkdirSync(folder, { recursive: true });

/** The textures SPEC names that are Half-Life's (valve/halflife.wad); the rest are TS's own (ts/specialists.wad). */
const HALF_LIFE = new Set(["fifties_ceil01", "basetrim02", "cardbox1", "lab1_cab2", "drkmtlt_bord11", "+0drkmtl_scrn", "trrm_wood2", "lab1_b4", "lab1_brd10", "lab1_trim3", "stripes2", "glass_dark", "glass_bright"]); // prettier-ignore
const named = [...new Set(Object.values(SPEC.textures).map((t) => t.texture))];

/** Where a model's back is, in the world: its -x turned by its yaw less the profile's `turn`. */
const backOf = (yaw, turn = 0) => {
  const a = ((yaw - turn) * Math.PI) / 180;
  return [-Math.round(Math.cos(a)), -Math.round(Math.sin(a))];
};

test("The Specialists' map spec: the game's textures, ts_model props, rooms furnished by its uses, its starts kept clear", () => {
  // a game of the test's own: ts/ and valve/, each with its .wad of plain pictures under the game's names
  const game = join(folder, "Half-Life");
  mkdirSync(join(game, "ts", "maps"), { recursive: true });
  mkdirSync(join(game, "valve"), { recursive: true });
  const plain = (name, k) => ({ name, image: { width: 64, height: 64, rgb: new Uint8Array(64 * 64 * 3).fill(40 + ((k * 23) % 160)) } });
  writeFileSync(join(game, "ts", "specialists.wad"), smak.maps.writeWad(named.filter((n) => !HALF_LIFE.has(n)).map(plain)));
  writeFileSync(join(game, "valve", "halflife.wad"), smak.maps.writeWad(named.filter((n) => HALF_LIFE.has(n)).map(plain)));
  const mod = specialists({ game });
  sure(mod.spec === SPEC && mod.spec.prop.class === "ts_model" && mod.character.props.includes("ts_model"), "the profile's spec");

  const spec = {
    spec: "smak.map/1",
    name: "ts_rooms",
    rooms: [
      { id: "lobby", size: [448, 320, 160], use: "lobby", surfaces: { floor: "ts_parquet" } },
      { id: "office", size: [384, 320, 128], place: { east_of: "lobby" }, use: "office" },
      { id: "store", size: [448, 384, 192], place: { north_of: "lobby" }, use: "warehouse", surfaces: { floor: "ts_asphalt" } },
    ],
    links: [{ between: ["lobby", "office"], kind: "door" }, { between: ["lobby", "store"], kind: "opening", width: 96 }],
    entities: [
      { class: "info_player_deathmatch", room: "lobby", at: "against west", facing: "east" },
      { class: "info_player_deathmatch", room: "office", at: "corner se", facing: "west" },
      { class: "info_player_deathmatch", room: "store", at: "corner nw", facing: "south" },
    ],
  };
  const none = { compilers: { found: false, message: "" } };
  const { report, files } = buildMapSpec(spec, { out: join(folder, "ts_rooms"), mod, ...none });
  sure(report.errors.length === 0 && !report.faults.some((f) => !/not compiled/.test(f)), [...report.errors, ...report.faults].join("; "));
  // the theme's words as the game's textures, of the .wad each is in
  for (const fact of [/^ts_floor: wood4a of specialists\.wad/, /^ts_wall: crete33 of specialists\.wad/, /^ts_ceiling: fifties_ceil01 of halflife\.wad/i, /^ts_parquet: floor004 of specialists\.wad/, /^ts_door: door006 of specialists\.wad/])
    sure(report.facts.some((f) => fact.test(f)), `${fact}: ${report.facts.filter((f) => /^ts_/.test(f)).join(" | ")}`);
  sure(report.facts.some((f) => /walked from 3 places to start: 3 info_player_deathmatch/.test(f)), report.facts.filter((f) => /walked/.test(f)).join(" | "));
  const map = smak.maps.readMap(readFileSync(files.map, "utf8"));
  sure(/specialists\.wad/.test(map.worldspawn.wad) && /halflife\.wad/.test(map.worldspawn.wad), map.worldspawn.wad);

  // every prop a ts_model of a model the profile names, turned by it
  const models = new Map(Object.values(SPEC.things).map((t) => [t.model, t]));
  const props = map.entities.filter((e) => e.classname === "ts_model");
  sure(props.length >= 8 && props.every((e) => models.has(e.model)), JSON.stringify(props.map((e) => e.model)));
  sure(!map.entities.some((e) => e.classname === "env_model" || e.classname === "cycler_sprite"), "no other class of prop");
  const rooms = report.rooms;
  const roomOf = ([x, y]) => Object.entries(rooms).find(([, r]) => x >= r.min[0] && x <= r.max[0] && y >= r.min[1] && y <= r.max[1]);
  const middles = new Set(Object.values(SPEC.uses).flat().filter((rule) => rule[2] === "middle").map((rule) => rule[1][0]));
  for (const e of props) {
    const thing = models.get(e.model);
    if ([...middles].some((name) => SPEC.things[name] === thing)) continue;
    // its back to the nearest wall of its room
    const at = e.origin.split(" ").map(Number);
    const yaw = Number(e.angles.split(" ")[1]);
    const [, room] = roomOf(at);
    const gaps = { "-1,0": at[0] - room.min[0], "1,0": room.max[0] - at[0], "0,-1": at[1] - room.min[1], "0,1": room.max[1] - at[1] };
    const back = backOf(yaw, thing.turn).join(",");
    sure(gaps[back] === Math.min(...Object.values(gaps)), `${e.model} at ${e.origin} turned ${yaw}: its back ${back}, the walls ${JSON.stringify(gaps)}`);
  }
  // a computer stands on a desk of the kit's: at its top, the desk's brushes under it
  const computers = props.filter((e) => /3dm_pc[34]/.test(e.model));
  sure(computers.length >= 1 && computers.every((e) => Number(e.origin.split(" ")[2]) === 36), JSON.stringify(computers.map((e) => e.origin)));
  const desks = map.entities.filter((e) => e.classname === "func_detail" && e.brushes.some((b) => b.faces.some((f) => /TRRM_WOOD2/i.test(f.texture))));
  sure(desks.length === computers.length, `${desks.length} desks for ${computers.length} computers`);
  // a couch's back against its wall (made facing -y, the profile turns it 90)
  sure(props.some((e) => /sg_couch|3dm_sofa/.test(e.model)), "a couch in the lobby");
  // nothing stands within a player's box and a step of a place to start
  const starts = map.entities.filter((e) => e.classname === "info_player_deathmatch").map((e) => e.origin.split(" ").map(Number));
  for (const e of props) {
    const at = e.origin.split(" ").map(Number);
    const r = models.get(e.model).r;
    for (const s of starts) sure(Math.max(Math.abs(at[0] - s[0]), Math.abs(at[1] - s[1])) > 24, `${e.model} at ${e.origin} on the start at ${s.join(" ")} (r ${r})`);
  }
  sure(report.facts.some((f) => /dressed by use: lobby \(lobby\): \d+ pieces .*couch|sofa/.test(f)) && report.facts.some((f) => /office \(office\): \d+ pieces \(.*workstation/.test(f)), report.facts.filter((f) => /dressed/.test(f)).join(" | "));
  // a use of the kit's and one of TS's of the same word: TS's stands (an office of computers, not the kit's brush desks)
  sure(!map.entities.some((e) => e.classname === "func_detail" && e.brushes.some((b) => b.faces.some((f) => /SM_SCREEN/i.test(f.texture)))), "TS's office, not the kit's");
});

// The Specialists where it is installed: SMAK_HALF_LIFE, or Steam's folder
const TS = [process.env.SMAK_HALF_LIFE, join(homedir(), ".steam/steam/steamapps/common/Half-Life"), "C:/Program Files (x86)/Steam/steamapps/common/Half-Life"]
  .filter(Boolean)
  .map((f) => join(f, "ts"))
  .find((f) => existsSync(join(f, "specialists.wad"))); // prettier-ignore
/** A file under a folder by its very name, letter for letter (a server on Linux finds no other). */
const exactly = (root, path) => path.split("/").every((part, k, parts) => { const dir = join(root, ...parts.slice(0, k)); return existsSync(dir) && readdirSync(dir).includes(part); }); // prettier-ignore

if (TS)
  test("The Specialists' map spec against the installed game: its textures in the game's .wad files, its models there and of their size", () => {
    const valve = join(TS, "..", "valve");
    const inWads = new Set([join(TS, "specialists.wad"), join(valve, "halflife.wad")].flatMap((f) => smak.maps.readWad(readFileSync(f)).textures.map((t) => t.name.toLowerCase())));
    const missing = named.filter((n) => !inWads.has(n.toLowerCase()));
    sure(!missing.length, `not in specialists.wad or halflife.wad: ${missing.join(", ")}`);
    for (const n of named) sure(HALF_LIFE.has(n) === !smak.maps.readWad(readFileSync(join(TS, "specialists.wad"))).textures.some((t) => t.name.toLowerCase() === n), `${n}: which .wad`);
    for (const [name, thing] of Object.entries(SPEC.things)) {
      sure(exactly(TS, thing.model), `${name}: ${thing.model} is not in ${TS} under that very name`);
      // posed as the game shows it, turned by the profile's `turn`: its back within `wall` of its origin, its front
      // within `deep`, its width within `r`, its foot no lower than the floor once lifted
      const { tris } = posed(readFileSync(join(TS, thing.model)), { seq: 0 });
      const a = ((thing.turn ?? 0) * Math.PI) / 180;
      const pts = tris.flatMap((t) => t.c.map((c) => [c.p[0] * Math.cos(a) - c.p[1] * Math.sin(a), c.p[0] * Math.sin(a) + c.p[1] * Math.cos(a), c.p[2]]));
      const lo = [0, 1, 2].map((k) => Math.min(...pts.map((p) => p[k])));
      const hi = [0, 1, 2].map((k) => Math.max(...pts.map((p) => p[k])));
      const r = thing.r ?? 16;
      const say = `${name} (${thing.model}): x ${lo[0].toFixed(0)} to ${hi[0].toFixed(0)}, y ${lo[1].toFixed(0)} to ${hi[1].toFixed(0)}, z ${lo[2].toFixed(0)} to ${hi[2].toFixed(0)}`;
      sure(tris.length > 0 && hi[2] - lo[2] > 1 && hi[2] - lo[2] < 300, say);
      sure(-lo[0] <= (thing.wall ?? r) + 2 && hi[0] <= (thing.deep ?? r) + 2 && Math.max(-lo[1], hi[1]) <= r + 2, `${say}: wall ${thing.wall}, deep ${thing.deep}, r ${r}`);
      sure(lo[2] + (thing.lift ?? 0) >= -2, `${say}: lift ${thing.lift}`);
    }
  });
else console.log("skip  The Specialists' map spec against the installed game\n      skipped: no ts/specialists.wad (SMAK_HALF_LIFE names the Half-Life folder)");
