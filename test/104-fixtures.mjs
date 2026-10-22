// Lamps built as fixtures, as the game's makers build theirs: a sconce on a wall facing any way and a chandelier
// hung from a ceiling, each with glass of a light's texture; and a flight of open treads, nothing under them.
import * as smak from "../src/index.mjs";
import { test, sure } from "./helper.mjs";

const { sconce, chandelier, stairs, shapeOf, box, carve, writeMap, checkPlan } = smak.maps;
const textures = (b) => new Set(b.faces.map((f) => f.texture));

test("sconce: on a wall facing any way, its glass a light's texture, closed brushes, the light's place in front", () => {
  for (const shape of ["fan", "drum", "box"])
    for (const facing of [0, 90, 180, 270, 45]) {
      const { brushes, light } = sconce({ at: [0, 0, 96], facing, glass: "~LAMP", metal: "BRASS", shape });
      sure(brushes.every((b) => shapeOf(b).faults.length === 0), `${shape} ${facing}: ${brushes.map((b) => shapeOf(b).faults).flat().join("; ")}`);
      sure(brushes.some((b) => textures(b).has("~LAMP")), `${shape}: no glass`);
      // it stands out of the wall the way it faces, and its light is in front of it
      const a = (facing * Math.PI) / 180;
      const out = brushes.flatMap((b) => shapeOf(b).corners).map(([x, y]) => x * Math.cos(a) + y * Math.sin(a));
      sure(Math.max(...out) > 10 && Math.min(...out) > -2.5, `${shape} ${facing}: ${Math.min(...out)} to ${Math.max(...out)}`);
      sure(Math.abs(light[0] - Math.round(Math.cos(a) * 24)) <= 1 && Math.abs(light[1] - Math.round(Math.sin(a) * 24)) <= 1 && light[2] === 112, `${facing}: ${light}`);
    }
  // without its plate: the shade alone, one brush fewer
  sure(sconce({ at: [0, 0, 96], glass: "~L", metal: "M", plate: false }).brushes.length === sconce({ at: [0, 0, 96], glass: "~L", metal: "M" }).brushes.length - 1);
  let refused = "";
  try {
    sconce({ at: [0, 0, 0], glass: "~L" });
  } catch (e) {
    refused = e.message;
  }
  sure(/glass .* and its metal/.test(refused), refused);
});

test("chandelier: hung under its canopy, tiers narrowing to a glass point, its lowest point said, in a map that plans", () => {
  const { brushes, light, low } = chandelier({ centre: [128, 128], top: 256, drop: 48, glass: "~LAMP", metal: "BRASS" });
  sure(brushes.every((b) => shapeOf(b).faults.length === 0));
  const shapes = brushes.map(shapeOf);
  sure(Math.max(...shapes.map((s) => s.max[2])) === 256 && Math.abs(Math.min(...shapes.map((s) => s.min[2])) - low) < 1e-6, `${low}`);
  sure(brushes.filter((b) => textures(b).has("~LAMP")).length === 4, "three tiers and a point of glass");
  sure(light[2] < 256 && light[2] > low);
  const map = { brushes: carve([{ min: [0, 0, 0], max: [256, 256, 256] }], 16, "WALL"), entities: [smak.maps.brushEntity("func_detail", brushes), smak.maps.playerStart([64, 64, 0])] };
  sure(checkPlan(map).errors.length === 0, checkPlan(map).errors.join("; "));
});

test("stairs open: a tread of the thickness asked at each step, nothing under it, as the solid flight lays them", () => {
  const solid = stairs([0, 0, 0], [240, 64, 160], "+x", "STEP");
  const open = stairs([0, 0, 0], [240, 64, 160], "+x", "STEP", { open: 6 });
  sure(open.length === solid.length);
  open.forEach((b, k) => {
    const s = shapeOf(b);
    const t = shapeOf(solid[k]);
    sure(s.max[2] === t.max[2] && s.max[2] - s.min[2] === 6, `step ${k}: ${s.min} ${s.max}`);
    sure(Math.abs(s.max[0] - s.min[0] - 24) < 1e-6, `step ${k} runs ${s.max[0] - s.min[0]}`);
  });
  // with treads on the grid and its ramp, and going down -y
  const down = stairs([0, 0, 0], [64, 200, 96], "-y", "STEP", { open: 4, tread: 24, ramp: "CLIP" });
  sure(down.at(-1).faces.every((f) => f.texture === "CLIP"));
  sure(down.slice(0, -1).every((b) => shapeOf(b).max[1] - shapeOf(b).min[1] === 24 && shapeOf(b).max[2] - shapeOf(b).min[2] === 4));
  let refused = "";
  try {
    stairs([0, 0, 0], [64, 64, 32], "+x", "STEP", { open: 0 });
  } catch (e) {
    refused = e.message;
  }
  sure(/open is a tread's thickness/.test(refused), refused);
});
