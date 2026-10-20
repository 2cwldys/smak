// Blender where the machine has it (src/blender.mjs): found by the variable, by its usual places, or not at
// all; a float picture read back the right way up; and a cube's bake, its answer known: each face's colour, its
// normal, and the occlusion a floor under it casts on its bottom and not its top. The bake runs only where
// Blender is found (SMAK_BLENDER, or where it is usually installed); without it, it is said to be skipped.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as smak from "../src/index.mjs";
import { test, sure, near, tmp } from "./helper.mjs";

const folder = join(tmp, "blender");
mkdirSync(folder, { recursive: true });

test("findBlender: the program named first, null where there is none, every place it looks said", () => {
  const fake = join(folder, "my-blender.exe");
  writeFileSync(fake, "");
  sure(smak.findBlender({ blender: fake }) === fake, "the program given is taken first");
  const places = smak.blenderPlaces({ blender: fake });
  sure(places[0] === fake && places.length > 1, `places: ${places.slice(0, 3)}`);
  const saved = { variable: process.env.SMAK_BLENDER, path: process.env.PATH };
  process.env.SMAK_BLENDER = join(folder, "nowhere.exe");
  sure(
    smak.blenderPlaces()[0] === process.env.SMAK_BLENDER,
    "the variable is looked at first when none is given",
  );
  if (saved.variable === undefined) delete process.env.SMAK_BLENDER;
  else process.env.SMAK_BLENDER = saved.variable;
});

test("readFloatMap: Blender's rows from the bottom read from the top", () => {
  const file = join(folder, "two");
  const floats = new Float32Array([0, 0, 0, 1, 1, 1, 1, 1]); // a 1 by 2 picture: the bottom row black, the top white
  writeFileSync(file, Buffer.from(floats.buffer));
  writeFileSync(file + ".json", JSON.stringify({ width: 1, height: 2 }));
  const map = smak.readFloatMap(file);
  sure(map.width === 1 && map.height === 2 && map.data[0] === 1 && map.data[4] === 0, `${[...map.data]}`);
});

const blender = smak.findBlender();
const withBlender = (name, run) => {
  if (blender) test(name, run);
  else console.log(`skip  ${name}\n      skipped: no Blender (set SMAK_BLENDER to its program to run it)`);
};

withBlender(
  "bakeMaps: a cube baked onto a cube, each face's colour, normal and occlusion as they are",
  () => {
    const S = smak.solids;
    const low = S.trisOf(S.box(S.place([0, 0, 0], [0, 0, 1], [1, 0, 0]), 4, 4, 4)).map((t) =>
      t.map((c) => c.p),
    );
    const high = low.map((t) => t.map((p) => p.map((v) => v * 1.01)));
    // each face in a 32 pixel cell of a 96 by 64 picture, 4 pixels in from its edges
    const faces = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]; // prettier-ignore
    const colours = [[0.8, 0.1, 0.1], [0.1, 0.8, 0.1], [0.1, 0.1, 0.8], [0.8, 0.8, 0.1], [0.1, 0.8, 0.8], [0.8, 0.1, 0.8]]; // prettier-ignore
    const faceOf = (t) => {
      const n = S.unit(S.cross(S.sub(t[1], t[0]), S.sub(t[2], t[0])));
      return faces.findIndex((f) => S.dot(f, n) > 0.99);
    };
    const cell = (f) => [(f % 3) * 32, Math.floor(f / 3) * 32];
    const uv = low.map((t) => {
      const f = faceOf(t);
      const axes = [0, 1, 2].filter((a) => !faces[f][a]);
      const [x0, y0] = cell(f);
      return t.map((p) => [x0 + 4 + ((p[axes[0]] + 2) / 4) * 24, y0 + 4 + ((2 - p[axes[1]]) / 4) * 24]);
    });
    // a floor a little under the cube, to shade its bottom
    const floor = [[[-20, -20, -2.6], [20, -20, -2.6], [20, 20, -2.6]], [[-20, -20, -2.6], [20, 20, -2.6], [-20, 20, -2.6]]]; // prettier-ignore
    const out = smak.bakeMaps(
      [{ low: { tris: low, uv }, high: { tris: high, colours: high.map((t) => colours[faceOf(t)]) } }],
      { width: 96, height: 64, outDir: join(folder, "cube"), ao: 3, occluders: floor, samples: 32 },
    );
    const at = (map, f) => {
      const [x0, y0] = cell(f);
      const i = ((y0 + 16) * 96 + x0 + 16) * 4;
      return [map.data[i], map.data[i + 1], map.data[i + 2]];
    };
    faces.forEach((n, f) => {
      const a = at(out.albedo, f);
      a.forEach((v, k) => near(v, colours[f][k], 0.02, `face ${f}'s colour, channel ${k}`));
      const nn = at(out.normal, f);
      nn.forEach((v, k) => near(v, (n[k] + 1) / 2, 0.03, `face ${f}'s normal, channel ${k}`));
    });
    const top = at(out.ao, 4)[0];
    const bottom = at(out.ao, 5)[0];
    sure(top > 0.9, `the top is open to the sky: ${top}`);
    sure(bottom < 0.6, `the bottom is shaded by the floor: ${bottom}`);
  },
);
