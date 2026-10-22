// The Specialists' lamps: every room's lamp built in a fixture of the game's own light texture (+0~fifties_lgt2, two
// tubes on the ceiling, each its whole picture once), lit as a texture light in the colour the game's maps' makers lit
// it (an info_texlights, hlrad's own list), and any other of the profile's lamps a spec wears lit too; a frame that
// says fixtures: false has none. The dressing's share of brushes that wear a lamp is then Valve's. On a game of the
// test's own; compiled where the compilers are, the lamps' faces lit by themselves.
import { mkdirSync, readFileSync } from "node:fs";
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
const lampBrushes = (map) => map.entities.filter((e) => e.classname === "func_detail").flatMap((e) => e.brushes).filter((b) => b.faces.some((f) => f.texture.toUpperCase() === LAMP));

test("The Specialists' rooms lit by the game's lamps: each lamp two tubes of +0~fifties_lgt2 on the ceiling, a texture light in its makers' colour; the sky has none", () => {
  const { report, files } = buildMapSpec(spec(), { out: join(folder, "lit"), mod, ...none });
  sure(report.errors.length === 0 && !report.faults.some((f) => !/not compiled/.test(f)), [...report.errors, ...report.faults].join("; "));
  const map = smak.maps.readMap(readFileSync(files.map, "utf8"));
  const lights = map.entities.filter((e) => e.classname === "light");
  const tubes = lampBrushes(map);
  // two tubes for each lamp of a roofed room, none under the sky
  const roofed = lights.filter((e) => Number(e.origin.split(" ")[0]) < report.rooms.yard.min[0]);
  sure(roofed.length >= 3 && tubes.length === 2 * roofed.length, `${tubes.length} tubes for ${roofed.length} lamps`);
  for (const tube of tubes) {
    const { min, max } = smak.maps.shapeOf(tube);
    // on the ceiling, 2 thick, the size of its picture (the fake game's are 64 by 64), the picture once on its face
    const room = Object.values(report.rooms).find((r) => min[0] >= r.min[0] && max[0] <= r.max[0] && min[1] >= r.min[1] && max[1] <= r.max[1]);
    sure(room && Math.round(max[2]) === room.max[2] && Math.round(max[2] - min[2]) === 2 && Math.round(max[0] - min[0]) === 64 && Math.round(max[1] - min[1]) === 64, `a tube from ${min.join(" ")} to ${max.join(" ")}`);
    const face = tube.faces.find((f) => f.u[2] === 0 && f.v[2] === 0 && smak.maps.planeOf(f.points).normal[2] < -0.9);
    sure(face && Math.round(((min[0] + face.u[3]) % 64 + 64) % 64) === 0 && Math.round(((-max[1] + face.v[3]) % 64 + 64) % 64) === 0, `its picture's corner at its corner: ${JSON.stringify(face && [face.u, face.v])}`);
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
