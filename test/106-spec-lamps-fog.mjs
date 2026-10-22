// A room's lamps built as the room wants them (`light.fixture`): tubes on the ceiling laid along its longer side, a
// sconce on its walls, a chandelier hung from it; and fog over a map, the mod's own (The Specialists' ts_fog).
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as smak from "../src/index.mjs";
import { buildMapSpec, LAMP_FIXTURES } from "../src/spec/map.mjs";
import specialists, { SPEC } from "../profiles/specialists.mjs";
import { fakeSpecialists } from "./fixture-specialists.mjs";
import { test, sure, tmp } from "./helper.mjs";

const folder = join(tmp, "spec-lamps-fog");
mkdirSync(folder, { recursive: true });
const mod = specialists({ game: fakeSpecialists(folder) });
const none = { compilers: { found: false, message: "" } };
const room = (light, size = [512, 256, 192]) => ({ spec: "smak.map/1", name: "lamps", rooms: [{ id: "hall", size, light }], entities: [{ class: "info_player_start", room: "hall", at: "centre" }] });
const built = (spec, name, options = {}) => {
  const { report, files } = buildMapSpec(spec, { out: join(folder, name), ...none, ...options });
  sure(report.errors.length === 0, report.errors.join("; "));
  return { report, map: smak.maps.readMap(readFileSync(files.map, "utf8")) };
};
const details = (map) => map.entities.filter((e) => e.classname === "func_detail").flatMap((e) => e.brushes).map((b) => ({ b, s: smak.maps.shapeOf(b) }));
const wearing = (map, pred) => details(map).filter(({ b }) => b.faces.some((f) => pred(f.texture.toUpperCase())));
const LAMP = SPEC.textures.fixture.texture.toUpperCase();

test("a room's tubes lie along its longer side: a hall longer along x has its tubes' length along x, one longer along y along y", () => {
  for (const [size, axis] of [[[512, 256, 192], 0], [[256, 512, 192], 1]]) {
    const { map } = built(room("auto", size), `tubes${axis}`, { mod });
    const tubes = wearing(map, (t) => t === LAMP || t === SPEC.textures.fixture_dim.texture.toUpperCase());
    sure(tubes.length >= 2, `${tubes.length} tubes`);
    // the fake game's light textures are 64 square: lay them by their place instead, two side by side across the long side
    const pairs = tubes.map(({ s }) => s.min);
    const across = axis === 0 ? 1 : 0;
    sure(pairs.some((p, k) => pairs.some((q, j) => j !== k && p[axis] === q[axis] && p[across] !== q[across])), `the two tubes of a lamp side by side across the room's long side: ${JSON.stringify(pairs)}`);
  }
});

test("a room's lamps as sconces on its two longer walls, or chandeliers hung from its ceiling; a word not a fixture refused", () => {
  const { map: walls, report: wr } = built(room({ count: 4, fixture: "sconce" }), "sconces");
  const hall = wr.rooms.hall;
  const lights = walls.entities.filter((e) => e.classname === "light");
  sure(lights.length === 4, `${lights.length} lights`);
  // each in front of a wall of y 0 or 256 (the long ones), over a head's height... under the ceiling
  for (const l of lights) {
    const [x, y, z] = l.origin.split(" ").map(Number);
    sure((Math.abs(y - hall.min[1] - 24) <= 1 || Math.abs(hall.max[1] - 24 - y) <= 1) && z > hall.min[2] + 64 && z < hall.max[2], `${l.origin} in ${JSON.stringify(hall)}`);
  }
  const { map: hung, report } = built(room({ count: 2, fixture: "chandelier" }), "chandeliers");
  const low = Math.min(...details(hung).filter(({ b }) => b.faces.some((f) => /FIXTURE|LAMP/i.test(f.texture))).map(({ s }) => s.min[2]));
  sure(low >= report.rooms.hall.min[2] + 72 && hung.entities.filter((e) => e.classname === "light").length === 2, `lowest glass at ${low}; ${report.facts.filter((f) => /lamps/.test(f)).join(" | ")}`);
  sure(LAMP_FIXTURES.join() === "panel,sconce,chandelier");
  const bad = buildMapSpec(room({ fixture: "candle" }), { out: join(folder, "bad"), ...none }).report;
  sure(bad.errors.some((e) => /light\.fixture: what its lamps are built as, panel, sconce, chandelier/.test(e)), bad.errors.join("; "));
  // The Specialists': its sconces wear the game's light texture and stand alone, no light entity with them
  const { map: ts } = built(room({ count: 2, fixture: "sconce" }), "ts-sconces", { mod });
  sure(ts.entities.filter((e) => e.classname === "light").length === 0 && wearing(ts, (t) => t === LAMP).length >= 2, JSON.stringify(ts.entities.map((e) => e.classname)));
});

test("fog over the map: The Specialists' ts_fog as its maps write it, the spec's near, far and colour over the profile's; a game with none says so", () => {
  const { map, report } = built({ ...room("auto"), fog: true }, "fog", { mod });
  const fog = map.entities.find((e) => e.classname === "ts_fog");
  sure(fog && fog.near === "2048" && fog.far === "9000" && fog.color === "0.8 0.8 0.8", JSON.stringify(fog));
  sure(report.facts.some((f) => /^fog: ts_fog, from 2048 to 9000/.test(f)));
  const own = built({ ...room("auto"), fog: { near: 256, far: 1024, color: [0.2, 0.25, 0.3] } }, "fog2", { mod }).map.entities.find((e) => e.classname === "ts_fog");
  sure(own.near === "256" && own.far === "1024" && own.color === "0.2 0.25 0.3", JSON.stringify(own));
  const plain = buildMapSpec({ ...room("auto"), fog: true }, { out: join(folder, "fog3"), ...none }).report;
  sure(plain.warnings.some((w) => /^fog: Half-Life has no fog of its own/.test(w)), plain.warnings.join("; "));
  const wrong = buildMapSpec({ ...room("auto"), fog: { near: 500, far: 100 } }, { out: join(folder, "fog4"), ...none, mod }).report;
  sure(wrong.errors.some((e) => /^fog: \{ near, far, color \}/.test(e)), wrong.errors.join("; "));
});
