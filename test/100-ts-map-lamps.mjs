// The Specialists' lamps: every room's lamp built in a fixture of the game's own light texture (+0~fifties_lgt2, two
// tubes on the ceiling, each its whole picture once), lit as a texture light in the colour the game's maps' makers lit
// it (an info_texlights, hlrad's own list), and any other of the profile's lamps a spec wears lit too; a frame that
// says fixtures: false has none. The dressing's share of brushes that wear a lamp is then Valve's. On a game of the
// test's own; compiled where the compilers are, the lamps' faces lit by themselves.
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import * as smak from "../src/index.mjs";
import { buildMapSpec } from "../src/spec/map.mjs";
import { findCompilers, COMPILERS_VARIABLE } from "../src/maps/compile.mjs";
import { VALVE_DRESSING } from "../src/maps/dressing.mjs";
import specialists, { SPEC } from "../profiles/specialists.mjs";
import { fakeSpecialists } from "./fixture-specialists.mjs";
import { test, sure, tmp } from "./helper.mjs";

const folder = join(tmp, "ts-map-lamps");
mkdirSync(folder, { recursive: true });
const mod = specialists({ game: fakeSpecialists(folder) });
const none = { compilers: { found: false, message: "" } };
const compilers = process.env[COMPILERS_VARIABLE] ? findCompilers() : { found: false };
const LAMP = SPEC.textures.fixture.texture.toUpperCase();
const DIM = SPEC.textures.fixture_dim.texture.toUpperCase();

const spec = (more = {}) => ({
  spec: "smak.map/1",
  name: "ts_lamps",
  rooms: [
    { id: "hall", size: [512, 384, 160] },
    { id: "dock", size: [384, 384, 192], place: { north_of: "hall" }, surfaces: { ceiling: "ts_sodium" } },
    { id: "yard", size: [384, 384, 256], place: { east_of: "hall" }, sky: true },
  ],
  links: [{ between: ["hall", "dock"], kind: "opening", width: 96 }, { between: ["hall", "yard"], kind: "door" }],
  entities: [{ class: "info_player_deathmatch", room: "hall", at: "corner sw", facing: "east" }],
  ...more,
});
const lampBrushes = (map, name = LAMP) => map.entities.filter((e) => e.classname === "func_detail").flatMap((e) => e.brushes).filter((b) => b.faces.some((f) => f.texture.toUpperCase() === name));

test("The Specialists' rooms lit by the game's lamps: each lamp two tubes of +0~fifties_lgt2 on the ceiling, a texture light in its makers' colour; the sky has none", () => {
  const { report, files } = buildMapSpec(spec(), { out: join(folder, "lit"), mod, ...none });
  sure(report.errors.length === 0 && !report.faults.some((f) => !/not compiled/.test(f)), [...report.errors, ...report.faults].join("; "));
  const map = smak.maps.readMap(readFileSync(files.map, "utf8"));
  const tubes = [...lampBrushes(map), ...lampBrushes(map, DIM)];
  // two tubes for each lamp of a roofed room (one lamp in three of a room dimmed: its tubes the dim ones), none under
  // the sky; and no light entity under them: the game's maps light their rooms by their lamps' texture lights alone
  const roofed = Array.from({ length: Number(/lamps: (\d+) lamps in fixtures/.exec(report.facts.join(" "))?.[1] ?? 0) });
  sure(roofed.length >= 3 && tubes.length === 2 * roofed.length, `${tubes.length} tubes for ${roofed.length} lamps`);
  sure(lampBrushes(map, DIM).length === 2 && map.entities.filter((e) => e.classname === "light").length === 0, `${lampBrushes(map, DIM).length} dim tubes, ${map.entities.filter((e) => e.classname === "light").length} lights`);
  sure(report.facts.some((f) => /^lighting: composed: 1 lamps dimmed to 0.3 \(one in 3\)/.test(f)), report.facts.filter((f) => /lighting/.test(f)).join(" | "));
  for (const tube of tubes) {
    const { min, max } = smak.maps.shapeOf(tube);
    // on the ceiling, 2 thick, the size of its picture (the fake game's are 64 by 64), the picture once on its face
    const room = Object.values(report.rooms).find((r) => min[0] >= r.min[0] && max[0] <= r.max[0] && min[1] >= r.min[1] && max[1] <= r.max[1]);
    sure(room && Math.round(max[2]) === room.max[2] && Math.round(max[2] - min[2]) === 2 && Math.round(max[0] - min[0]) === 64 && Math.round(max[1] - min[1]) === 64, `a tube from ${min.join(" ")} to ${max.join(" ")}`);
    // on its face the picture once: its texels at the face's corners are its own corners (laid along the room's
    // longer side, it may be turned a quarter)
    const face = tube.faces.find((f) => f.u[2] === 0 && f.v[2] === 0 && smak.maps.planeOf(f.points).normal[2] < -0.9);
    const texel = (p) => [0, 1].map((k) => { const a = k ? face.v : face.u; return Math.round((((p[0] * a[0] + p[1] * a[1] + p[2] * a[2]) / face.scale[k] + a[3]) % 64 + 64) % 64); });
    const corners = [[min[0], min[1]], [max[0], min[1]], [min[0], max[1]], [max[0], max[1]]].map(([x, y]) => texel([x, y, min[2]]).join());
    sure(face && corners.every((c) => ["0,0", "0,64", "64,0", "64,64"].includes(c)), `its picture's corners at its corners: ${corners.join(" ")}`);
  }
  // the texture lights: the fixture's and the sodium lamp the dock's ceiling wears, each [r, g, b, brightness] as the profile has them
  const texlights = map.entities.find((e) => e.classname === "info_texlights");
  const said = (name) => Object.entries(texlights ?? {}).find(([key]) => key.toUpperCase() === name.toUpperCase())?.[1];
  sure(said(LAMP) === SPEC.lamps["+0~fifties_lgt2"].join(" ") && said("+0~tnnl_lgt4") === SPEC.lamps["+0~tnnl_lgt4"].join(" "), JSON.stringify(texlights));
  sure(report.facts.some((f) => new RegExp(`^lamps: ${roofed.length} lamps in fixtures that glow \\(a texture light each, \\+0~fifties_lgt2\\)`, "i").test(f)), report.facts.filter((f) => /lamps:/.test(f)).join(" | "));
  // the brushes that wear a lamp, as Valve's maps are: from 11 in 100
  const roles = smak.maps.dressingOfSource(map);
  sure(roles.litBrushes >= VALVE_DRESSING.measures.litBrushes.least, `${Math.round(roles.litBrushes * 100)}% of the brushes wear a lamp`);
  // a frame that says fixtures: false has none
  const bare = buildMapSpec(spec({ frame: { fixtures: false } }), { out: join(folder, "bare"), mod, ...none });
  sure(lampBrushes(smak.maps.readMap(readFileSync(bare.files.map, "utf8"))).length === 0, "fixtures: false");
});

if (compilers.found)
  test("The Specialists' lamps compiled: their faces lit by their own light, the rooms under them lit", () => {
    const { report, files } = buildMapSpec({ ...spec(), compile: { quality: "draft" } }, { out: join(folder, "compiled"), mod, compilers });
    sure(files.bsp, [...report.errors, ...report.faults].join("; "));
    const bsp = smak.maps.readBsp(readFileSync(files.bsp));
    const lamp = [];
    for (let m = 0; m < bsp.models.length; m++)
      for (const face of smak.maps.modelFaces(bsp, m)) {
        if (smak.maps.faceTexture(bsp, face)?.name?.toUpperCase() !== LAMP) continue;
        const light = smak.maps.faceLightmap(bsp, face)?.styles.find((s) => s.style === 0);
        if (light) for (let i = 0; i < light.rgb.length; i += 3) lamp.push((light.rgb[i] + light.rgb[i + 1] + light.rgb[i + 2]) / 3);
      }
    lamp.sort((a, b) => a - b);
    sure(lamp.length && lamp[Math.floor(lamp.length / 2)] >= 200, `the lamps' faces lit ${lamp[Math.floor(lamp.length / 2)]} (median of ${lamp.length} luxels)`);
    sure(Object.values(report.rooms).every((r) => r.light > 24), JSON.stringify(report.rooms));
  });
else console.log("skip  The Specialists' lamps compiled\n      skipped: the compilers are not found (VHLT_DIR)");

test("The Specialists' light as its maps are lit: composed unless the spec says not, a room's own light still a light entity", () => {
  // lighting: false: every lamp its two bright tubes, none dimmed
  const plain = buildMapSpec(spec({ lighting: false }), { out: join(folder, "plain"), mod, ...none });
  const map = smak.maps.readMap(readFileSync(plain.files.map, "utf8"));
  sure(lampBrushes(map, DIM).length === 0 && !plain.report.facts.some((f) => /^lighting: composed/.test(f)), plain.report.facts.filter((f) => /lighting/.test(f)).join(" | "));
  // a room that asks its own light: a light entity of that brightness, its fixture with it
  const own = buildMapSpec(spec({ rooms: spec().rooms.map((r) => (r.id === "hall" ? { ...r, light: { count: 1, brightness: 180 } } : r)) }), { out: join(folder, "own"), mod, ...none });
  const lights = smak.maps.readMap(readFileSync(own.files.map, "utf8")).entities.filter((e) => e.classname === "light");
  sure(lights.some((e) => /180$/.test(e._light)), JSON.stringify(lights.map((e) => e._light)));
});

// where the game is installed and the compilers are: a lobby, an office and a warehouse built with its profile are lit as
// the game's own maps (the floor's mean 52 to 102 over its arenas and compact maps), not as Valve's lamps lit them (218)
const game = [process.env.SMAK_HALF_LIFE, "C:/Program Files (x86)/Steam/steamapps/common/Half-Life"].find((g) => g && existsSync(join(g, "ts", "specialists.wad")));
if (compilers.found && game)
  test("The Specialists' rooms built with the installed game are lit as its maps are: the floor's mean 60 to 90 of 255", () => {
    const real = specialists({ game });
    const rooms = { spec: "smak.map/1", name: "ts_lit", rooms: [{ id: "lobby", size: [448, 320, 160], use: "lobby" }, { id: "office", size: [384, 320, 128], place: { east_of: "lobby" }, use: "office" }, { id: "store", size: [512, 384, 192], place: { north_of: "lobby" }, use: "warehouse" }], links: [{ between: ["lobby", "office"], kind: "door" }, { between: ["lobby", "store"], kind: "opening" }], entities: [{ class: "info_player_deathmatch", room: "lobby", at: "centre" }] };
    const { report, files } = buildMapSpec(rooms, { out: join(folder, "real"), mod: real, compilers });
    sure(files.bsp, [...report.errors, ...report.faults].join("; "));
    const { floor } = smak.maps.lightReport(smak.maps.readBsp(readFileSync(files.bsp)));
    sure(floor.mean >= 60 && floor.mean <= 90, `the floor lit ${floor.mean} on average`);
  });
else console.log("skip  The Specialists' rooms built with the installed game are lit as its maps are\n      skipped: the game or the compilers are not found (SMAK_HALF_LIFE, VHLT_DIR)");
