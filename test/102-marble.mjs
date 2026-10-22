// Marble, a material of the kit's: polished stone clouded lighter and darker and crossed by veins, laid whole or as
// tiles, and let be brighter and more coloured than Valve's walls (a bank's cream and green marble are both).
import { surfacePicture, materialOf } from "../src/spec/paint.mjs";
import { lookOf, lookFaults, ALLOWED } from "../src/spec/look.mjs";
import { test, sure } from "./helper.mjs";

const lum = (p, i) => 0.3 * p.rgb[i * 3] + 0.59 * p.rgb[i * 3 + 1] + 0.11 * p.rgb[i * 3 + 2];

test("marble: veins darker than its stone, wandering across the picture; its keys kept", () => {
  const m = materialOf({ base: "marble", tone: [0.66, 0.62, 0.54], vein: [0.3, 0.27, 0.22], veins: 2, scale: 40 });
  sure(m.vein.join() === "0.3,0.27,0.22" && m.veins === 2 && m.scale === 40, JSON.stringify(m));
  const p = surfacePicture({ base: "marble", tone: [0.66, 0.62, 0.54], vein: [0.3, 0.27, 0.22] }, 128);
  const values = Array.from({ length: 128 * 128 }, (_, i) => lum(p, i)).sort((a, b) => a - b);
  const [dark, middle] = [values[Math.floor(values.length * 0.02)], values[Math.floor(values.length / 2)]];
  // the darkest of it is vein, well under the stone's middle; and veins reach across: dark texels in most columns
  sure(dark < middle * 0.8, `darkest ${dark}, middle ${middle}`);
  let columns = 0;
  for (let x = 0; x < 128; x++) if (Array.from({ length: 128 }, (_, y) => lum(p, y * 128 + x)).some((v) => v < middle * 0.82)) columns++;
  sure(columns > 64, `${columns} columns of 128 hold a vein`);
});

test("marble laid as tiles: a joint at each cell's edge, each tile its own tone", () => {
  const p = surfacePicture({ base: "marble", tone: [0.6, 0.56, 0.5], cell: 64 }, 128);
  const row = (y) => Array.from({ length: 128 }, (_, x) => lum(p, y * 128 + x));
  const joint = row(0).reduce((a, b) => a + b) / 128;
  const field = row(32).reduce((a, b) => a + b) / 128;
  sure(joint < field * 0.7, `joint ${joint}, field ${field}`);
});

test("marble may be bright and coloured past Valve's walls; plaster may not", () => {
  const p = surfacePicture({ base: "marble", tone: [0.75, 0.7, 0.6] }, 64);
  sure(lookFaults(lookOf(p), ALLOWED.marble, "marble").every((f) => !/brighter|more coloured/.test(f)), lookFaults(lookOf(p), ALLOWED.marble, "marble").join());
  sure(ALLOWED.marble.includes("bright") && !ALLOWED.plaster);
});
