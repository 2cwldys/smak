// A mod's map delivered as the .bsp alone (profiles/specialists.mjs, SPEC): built on the .wad files the game ships, a
// map wearing only their textures writes no .wad of its own and names none (its sky is the compilers' own), and one
// with pictures of its own puts them inside the .bsp (hlcsg -wadinclude), unless the spec says compile.embed: false.
// On a game of the test's own; compiled where the compilers are (VHLT_DIR).
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import * as smak from "../src/index.mjs";
import { buildMapSpec } from "../src/spec/map.mjs";
import { findCompilers, COMPILERS_VARIABLE } from "../src/maps/compile.mjs";
import specialists, { SPEC } from "../profiles/specialists.mjs";
import { test, sure, tmp } from "./helper.mjs";

const folder = join(tmp, "ts-map-delivered");
mkdirSync(folder, { recursive: true });

/** A Half-Life folder of the test's own: ts/specialists.wad and valve/halflife.wad of plain pictures under the profile's names. */
export function fakeSpecialists(at) {
  const game = join(at, "Half-Life");
  mkdirSync(join(game, "ts", "maps"), { recursive: true });
  mkdirSync(join(game, "valve"), { recursive: true });
  const plain = (name, k) => ({ name, image: { width: 64, height: 64, rgb: new Uint8Array(64 * 64 * 3).fill(40 + ((k * 23) % 160)) } });
  const named = [...new Set([...Object.values(SPEC.textures).map((t) => t.texture), ...Object.keys(SPEC.lamps ?? {})])];
  // the profile's comments say which .wad has each; a fake game only needs them found in one of the two
  const halfLife = (n) => /^[+~]|^(fifties|basetrim|cardbox|lab1|drkmtl|trrm|stripes|glass|generic|light|tnnl)/i.test(n);
  writeFileSync(join(game, "ts", "specialists.wad"), smak.maps.writeWad(named.filter((n) => !halfLife(n)).map(plain)));
  writeFileSync(join(game, "valve", "halflife.wad"), smak.maps.writeWad(named.filter(halfLife).map(plain)));
  return game;
}

const game = fakeSpecialists(folder);
const mod = specialists({ game });
const none = { compilers: { found: false, message: "" } };
const compilers = process.env[COMPILERS_VARIABLE] ? findCompilers() : { found: false };
const spec = (more = {}) => ({
  spec: "smak.map/1",
  name: "ts_alone",
  rooms: [
    { id: "hall", size: [384, 320, 160] },
    { id: "yard", size: [384, 320, 256], place: { north_of: "hall" }, sky: true },
  ],
  links: [{ between: ["hall", "yard"], kind: "door" }],
  entities: [{ class: "info_player_deathmatch", room: "hall", at: "centre" }],
  ...more,
});
const worldWads = (file) => String(smak.maps.readMap(readFileSync(file, "utf8")).worldspawn.wad).split(";").filter(Boolean).map((w) => basename(w.replace(/\\/g, "/")));

test("a mod's map of the game's textures alone: no .wad of its own, its sky the compilers', the game's .wad files named", () => {
  const { report, files } = buildMapSpec(spec(), { out: join(folder, "plain"), mod, ...none });
  sure(report.errors.length === 0, report.errors.join("; "));
  sure(!files.wad && !existsSync(join(folder, "plain", "ts_alone.wad")), `a .wad of its own: ${files.wad}`);
  sure(worldWads(files.map).join() === "specialists.wad,halflife.wad", worldWads(files.map).join());
  sure(report.facts.some((f) => /textures: every one the map wears is in specialists\.wad, halflife\.wad, which the game ships: no \.wad of the map's own/.test(f)), report.facts.filter((f) => /textures:/.test(f)).join(" | "));
  // a sky room still wears sky, the compilers' own texture
  sure(/\bsky\b/.test(readFileSync(files.map, "utf8")), "the yard's sky");
  sure(!report.warnings.some((w) => /\.wad files are in none of the game's folders/.test(w)), report.warnings.join(" | "));
});

test("a mod's map with pictures of its own: its .wad put inside the .bsp, named by the source and not by the map delivered; or shipped when told", () => {
  const marble = { textures: { marble: { base: "tile", tone: [0.6, 0.58, 0.55] } }, rooms: [{ id: "hall", size: [384, 320, 160], surfaces: { floor: "marble" } }, { id: "yard", size: [384, 320, 256], place: { north_of: "hall" }, sky: true }] };
  const { report, files } = buildMapSpec(spec(marble), { out: join(folder, "marble"), mod, ...none });
  sure(report.errors.length === 0, report.errors.join("; "));
  const own = smak.maps.readWad(readFileSync(files.wad));
  // its own pictures and not the sky: the compilers have that
  sure(own.textures.map((t) => t.name.toUpperCase()).join() === "SM_MARBLE", own.textures.map((t) => t.name).join());
  sure(worldWads(files.map)[0] === "ts_alone.wad", worldWads(files.map).join());
  sure(report.facts.some((f) => /textures: ts_alone\.wad \(1 picture of the map's own\) put inside the \.bsp as it compiles \(hlcsg -wadinclude\): the map needs specialists\.wad, halflife\.wad beside it, which the game ships/.test(f)), report.facts.filter((f) => /textures:/.test(f)).join(" | "));
  sure(!report.warnings.some((w) => /\.wad files are in none of the game's folders/.test(w)), report.warnings.join(" | "));
  // compile.embed: false ships it beside the map, and says so
  const shipped = buildMapSpec(spec({ ...marble, compile: { embed: false } }), { out: join(folder, "shipped"), mod, ...none }).report;
  sure(shipped.warnings.some((w) => /compile\.embed is false: ts_alone\.wad \(1 pictures? of the map's own\) is named by the map and has to be shipped beside it/.test(w)), shipped.warnings.join(" | "));
  sure(shipped.warnings.some((w) => /\.wad files are in none of the game's folders.*ts_alone\.wad/.test(w)), "the plan check finds it in none of the game's folders");
});

if (compilers.found)
  test("a mod's map compiled: the .bsp asks the game for its shipped .wad files alone and carries its own pictures and the sky inside", () => {
    for (const [name, more, inside] of [["plain", {}, ["SKY"]], ["marble", { textures: { marble: { base: "tile", tone: [0.6, 0.58, 0.55] } }, rooms: [{ id: "hall", size: [384, 320, 160], surfaces: { floor: "marble" } }, { id: "yard", size: [384, 320, 256], place: { north_of: "hall" }, sky: true }] }, ["SKY", "SM_MARBLE"]]]) {
      const { report, files } = buildMapSpec({ ...spec(more), compile: { quality: "draft" } }, { out: join(folder, `compiled-${name}`), mod, compilers });
      sure(files.bsp, [...report.errors, ...report.faults].join("; "));
      const bsp = smak.maps.readBsp(readFileSync(files.bsp));
      const asks = String(Object.fromEntries(bsp.entities[0]).wad).split(";").filter(Boolean).map((w) => basename(w.replace(/\\/g, "/")).toLowerCase());
      sure(asks.join() === "specialists.wad,halflife.wad", `${name}: the compiled map asks for ${asks.join(", ")}`);
      const carried = bsp.textures.filter((t) => t.embedded).map((t) => t.name.toUpperCase());
      sure(inside.every((t) => carried.includes(t)), `${name}: inside the .bsp ${carried.join(", ")}`);
      sure(report.facts.some((f) => /the compiled map asks the game for specialists\.wad, halflife\.wad and carries \d+ pictures? inside/.test(f)), report.facts.filter((f) => /compiled map asks/.test(f)).join(" | "));
      sure(!report.faults.some((f) => /does not ship/.test(f)), report.faults.join("; "));
    }
  });
else console.log("skip  a mod's map compiled\n      skipped: the compilers are not found (VHLT_DIR)");
