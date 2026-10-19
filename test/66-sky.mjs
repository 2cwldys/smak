// Skies made from words: six sides drawn from the way out of the eye, written as the game's Targa files, read
// back by the game's table of sides with no seam.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { makeSky, skyFiles, skyOf, skyColour, readTga, SKY_SIDES } from "../src/maps/sky.mjs";
import { test, sure, tmp } from "./helper.mjs";

const folder = join(tmp, "sky");
const game = join(folder, "game");

test("a sky made from words is written as the game's skies are, and read back the same", () => {
  const { sides, mean } = makeSky({ hills: { height: 5 } });
  sure(sides.length === 6 && sides.every((s) => s.width === 256 && s.height === 256), "six sides of 256");
  const files = skyFiles("t/day", sides);
  sure(files.map((f) => f.name).join() === SKY_SIDES.map((s) => `gfx/env/t/day${s}.tga`).join(), files.map((f) => f.name).join());
  // as Valve's: a plain 24-bit Targa, rows from the bottom, with the 2.0 footer
  const bytes = files[0].bytes;
  sure(bytes[2] === 2 && bytes[16] === 24 && bytes[17] === 0 && bytes.length === 18 + 256 * 256 * 3 + 26, `kind ${bytes[2]}, ${bytes[16]} bits, about ${bytes[17]}, ${bytes.length} bytes`);
  const back = readTga(bytes);
  sure(Buffer.from(back.rgb).equals(Buffer.from(sides[0].rgb)), "the picture read back is the one written");
  for (const f of files) {
    mkdirSync(join(game, "gfx", "env", "t"), { recursive: true });
    writeFileSync(join(game, f.name), f.bytes);
  }
  const read = skyOf("t/day", [game]);
  sure(read.sides && read.mean.join() === mean.join(), read.why ?? `${read.mean} against ${mean}`);
});

test("the sides meet with no seam, and the sun is where its light comes from", () => {
  const sky = { sides: makeSky({ clouds: false, sun: { yaw: 135, pitch: -35, size: 4, glow: 10 } }).sides };
  // ways a hair either side of every edge of the cube: the colour on each side the same, near enough
  let worst = 0;
  const a = [0, 0, 0];
  const b = [0, 0, 0];
  for (let k = 0; k < 400; k++) {
    const t = (k / 400) * 2 - 1;
    for (const [p, q] of [
      [[1, 0.999, t], [0.999, 1, t]], [[1, -0.999, t], [0.999, -1, t]], [[-1, 0.999, t], [-0.999, 1, t]], [[-1, -0.999, t], [-0.999, -1, t]],
      [[t, 1, 0.999], [t, 0.999, 1]], [[t, -1, 0.999], [t, -0.999, 1]], [[1, t, 0.999], [0.999, t, 1]], [[-1, t, 0.999], [-0.999, t, 1]],
      [[t, 1, -0.999], [t, 0.999, -1]], [[1, t, -0.999], [0.999, t, -1]],
    ]) {
      skyColour(sky, ...p, a);
      skyColour(sky, ...q, b);
      worst = Math.max(worst, ...a.map((v, i) => Math.abs(v - b[i])));
    }
  }
  sure(worst < 12, `colours across an edge differ by up to ${worst.toFixed(1)}`);
  // a light going along yaw 135, 35 down: the sun stands at yaw 315, 35 up
  const r = Math.PI / 180;
  const sun = skyColour(sky, Math.cos(35 * r) * Math.cos(315 * r), Math.cos(35 * r) * Math.sin(315 * r), Math.sin(35 * r), [0, 0, 0]);
  const away = skyColour(sky, Math.cos(35 * r) * Math.cos(135 * r), Math.cos(35 * r) * Math.sin(135 * r), Math.sin(35 * r), [0, 0, 0]);
  sure(sun.every((v) => v > 230) && away[0] < 200, `at the sun ${sun.map(Math.round)}, half round ${away.map(Math.round)}`);
});
