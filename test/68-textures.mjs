// Where a map's textures are best seen, and a wad spec's preview from there.
//   texturePlaces: each texture of the fixture's two rooms at a lit face, with its light, the texels a view
//   spans and the turn of its picture; placeView draws it
//   a material seen under a known light: the paint is the colour divided by it, channel by channel
//   smak build's wad preview `each`: every texture of the spec from the judge's camera, and what it reports
//   the renderer's scene is kept by the textures given, not their names: two sets of one name draw apart
//   a texture's wear: finer detail and spread than a plain fill, and no seam where it repeats
//   relief: a pipe lit on its top and dark below, a grille's holes dark, a refused part said
//   matchTextures: a texture under a dim light is found first among others
import { readFileSync, mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as smak from "../src/index.mjs";
import { materialOf } from "../src/spec/paint.mjs";
import { buildWadSpec, validateWadSpec } from "../src/spec/wad.mjs";
import { test, sure, HERE, tmp, runSmak } from "./helper.mjs";

const FIXTURES = join(HERE, "fixtures");
// the two rooms whose textures are in a .wad: a map that keeps its own inside wears those, whatever is given
const bsp = smak.maps.readBsp(readFileSync(join(FIXTURES, "tworooms-wants-wad.bsp")));
const places = smak.maps.texturePlaces(bsp);

test("texturePlaces: each texture at a lit face, with its light, its texels across and its turn", () => {
  sure(places.map((p) => p.name).sort().join() === "smakfloor,smakwall", places.map((p) => p.name).join());
  for (const p of places) {
    sure(p.lit && p.light.length === 3 && p.light.every((v) => v > 0), JSON.stringify(p));
    sure(p.across > 0 && Number.isFinite(p.turned) && p.from.length === 3, JSON.stringify(p));
  }
  const view = smak.maps.placeView(bsp, places[0], { folders: [FIXTURES] });
  sure(view.width === 320 && view.height === 240);
});

test("material seen under a known light: the paint is the colour over it, channel by channel", () => {
  const m = materialOf({ base: "plaster", seen: { colour: [0.5, 0.4, 0.2], light: [2, 1, 0.5] } });
  sure(m.tone.map((v) => v.toFixed(2)).join() === "0.25,0.40,0.40", m.tone.join());
  const plain = materialOf({ base: "plaster", seen: { colour: [0.5, 0.5, 0.5], light: 2 } });
  sure(plain.tone.every((v) => Math.abs(v - 0.25) < 1e-9));
  let refused = false;
  try {
    materialOf({ base: "plaster", seen: { colour: [0.5, 0.5, 0.5], light: 0 } });
  } catch {
    refused = true;
  }
  sure(refused, "a light of 0 is refused");
});

test("the renderer keeps a scene by the textures given: two sets under one name draw apart", () => {
  const flat = (v) => ({ name: "smakwall", width: 64, height: 64, rgb: new Uint8Array(64 * 64 * 3).fill(v) });
  const wad = (v) => smak.maps.readWad(smak.maps.writeWad([{ name: "smakwall", image: flat(v) }, { name: "smakfloor", image: { ...flat(v), name: "smakfloor", width: 32, height: 32, rgb: new Uint8Array(32 * 32 * 3).fill(v) } }])).textures;
  const place = places.find((p) => p.name === "smakwall");
  const mean = (picture) => picture.rgba.reduce((s, v, i) => (i % 4 === 3 ? s : s + v), 0) / (picture.width * picture.height * 3);
  const dark = mean(smak.maps.placeView(bsp, place, { textures: wad(30) }));
  const light = mean(smak.maps.placeView(bsp, place, { textures: wad(220) }));
  sure(light > dark + 20, `${dark} against ${light}`);
});

test("a texture's wear: detail and spread as a used wall has them, and no seam where it repeats", () => {
  const base = { base: "plaster", tone: [0.45, 0.43, 0.4] };
  const out = join(tmp, "wear");
  buildWadSpec({ spec: "smak.wad/1", name: "wear.wad", textures: [{ name: "plain", size: [128, 64], material: base }, { name: "worn", size: [128, 64], material: base, wear: { stains: 0.6, streaks: 0.5, cracks: 0.6, scratches: 0.4, speckle: 0.8 } }] }, { out });
  const [plain, worn] = smak.maps.readWad(readFileSync(join(out, "wear.wad"))).textures;
  const lum = (t, x, y) => {
    const c = t.pixels[((y + t.height) % t.height) * t.width + ((x + t.width) % t.width)] * 3;
    return 0.3 * t.palette[c] + 0.59 * t.palette[c + 1] + 0.11 * t.palette[c + 2];
  };
  const detail = (t) => {
    let d = 0;
    for (let y = 0; y < t.height; y++) for (let x = 0; x < t.width; x++) d += Math.abs(4 * lum(t, x, y) - lum(t, x - 1, y) - lum(t, x + 1, y) - lum(t, x, y - 1) - lum(t, x, y + 1));
    return d / (t.width * t.height);
  };
  // a plain wall has a grain of its own (src/spec/look.mjs): wear adds to it a third again at least
  sure(detail(worn) > 1.3 * detail(plain) && detail(worn) > 20, `${detail(plain)} against ${detail(worn)}`);
  // the step across the picture's edges against the steps inside it
  const step = (t, x) => {
    let d = 0;
    for (let y = 0; y < t.height; y++) d += Math.abs(lum(t, x + 1, y) - lum(t, x, y));
    return d / t.height;
  };
  let inside = 0;
  for (let x = 0; x < worn.width - 1; x++) inside += step(worn, x);
  inside /= worn.width - 1;
  sure(step(worn, worn.width - 1) < 1.5 * inside, `across the edge ${step(worn, worn.width - 1)}, inside ${inside}`);
});

test("relief: a pipe lit on its top and shaded below, a grille's recess dark, a wrong part refused", () => {
  const out = join(tmp, "relief");
  const built = buildWadSpec({ spec: "smak.wad/1", name: "relief.wad", textures: [
    { name: "pipe", size: [64, 64], material: { base: "plaster", tone: [0.5, 0.5, 0.5] }, relief: [{ kind: "pipe", path: [[0, 32], [64, 32]], radius: 8, material: { base: "paint", tone: [0.5, 0.5, 0.5] } }] },
    { name: "grille", size: [64, 64], material: { base: "plaster", tone: [0.5, 0.5, 0.5] }, relief: [{ kind: "bars", at: [32, 32], size: [40, 40], count: 5, width: 4 }] },
  ] }, { out });
  sure(built.report.ok, built.report.errors.join("; "));
  const [pipe, grille] = smak.maps.readWad(readFileSync(join(out, "relief.wad"))).textures;
  const lum = (t, x, row) => {
    const c = t.pixels[row * t.width + x] * 3;
    return 0.3 * t.palette[c] + 0.59 * t.palette[c + 1] + 0.11 * t.palette[c + 2];
  };
  // the pipe's middle is row 31 from the top; its upper flank faces the light, its lower one does not
  sure(lum(pipe, 32, 26) > lum(pipe, 32, 37) + 15, `${lum(pipe, 32, 26)} over ${lum(pipe, 32, 37)}`);
  // between two bars, the hole is dark
  let darkest = 255;
  for (let x = 12; x < 52; x++) darkest = Math.min(darkest, lum(grille, x, 32));
  sure(darkest < 30, `the hole ${darkest}`);
  const bad = buildWadSpec({ spec: "smak.wad/1", name: "bad.wad", textures: [{ name: "x", size: [64, 64], relief: [{ kind: "pipe", path: [[0, 0]] }, { kind: "fan" }] }] }, { out });
  sure(bad.report.errors.length === 2, bad.report.errors.join("; "));
});

test("matchTextures: a texture seen dim is found first among others", () => {
  const picture = (w, h, f) => ({ width: w, height: h, rgb: Uint8Array.from({ length: w * h * 3 }, (_, i) => f(Math.floor(i / 3) % w, Math.floor(i / 3 / w), i % 3)) });
  const textures = smak.maps.readWad(smak.maps.writeWad([
    { name: "bricks", image: picture(32, 32, (x, y, c) => ((y % 8 < 1 || (x + (Math.floor(y / 8) % 2) * 8) % 16 < 1) ? 200 : [150, 60, 40][c])) },
    { name: "grass", image: picture(32, 32, (x, y, c) => [60, 140, 50][c] + ((x * 7 + y * 13) % 20)) },
    { name: "steel", image: picture(32, 32, (x, y, c) => 120 + ((x + y) % 6) * 4) },
  ])).textures;
  // the bricks as a view shows them: twice as large, at half the light
  const bricks = textures[0];
  const view = { width: 64, height: 64, rgba: new Uint8Array(64 * 64 * 4) };
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const p = bricks.pixels[(y >> 1) * 32 + (x >> 1)] * 3;
      view.rgba.set([bricks.palette[p] >> 1, bricks.palette[p + 1] >> 1, bricks.palette[p + 2] >> 1, 255], (y * 64 + x) * 4);
    }
  const found = smak.maps.matchTextures(view, [0, 0, 64, 64], textures);
  sure(found[0].name === "bricks", found.map((f) => `${f.name} ${f.distance}`).join(", "));
});

test("a texture made from another of the spec: a random set's other tile, a lamp's frame switched off", () => {
  const out = join(tmp, "from");
  const spec = {
    spec: "smak.wad/1",
    name: "from.wad",
    textures: [
      { name: "-0pipe", size: [32, 32], material: { base: "metal", tone: [0.5, 0.5, 0.5] } },
      { name: "-1pipe", size: [32, 32], from: { texture: "-0pipe", flip: "x" } },
      { name: "+alamp", size: [32, 32], from: { texture: "-0pipe", brightness: 0.4 } },
    ],
  };
  const { report } = buildWadSpec(spec, { out });
  sure(!report.errors.length && report.facts.some((f) => /-1pipe: made from -0pipe, flipped x/.test(f)), [...report.errors, ...report.facts].join(" | "));
  const [a, b, c] = smak.maps.readWad(readFileSync(join(out, "from.wad"))).textures;
  const at = (t, x, y) => t.palette[t.pixels[y * t.width + x] * 3];
  sure(Math.abs(at(b, 0, 5) - at(a, 31, 5)) <= 8, `flipped: ${at(b, 0, 5)} against ${at(a, 31, 5)}`);
  sure(at(c, 5, 5) < at(a, 5, 5) * 0.6, `dimmed: ${at(c, 5, 5)} against ${at(a, 5, 5)}`);
  sure(validateWadSpec({ ...spec, textures: [{ name: "x", size: [16, 16], from: "later" }, { name: "later", size: [16, 16], material: "metal" }] }).errors.some((e) => /from: the name of a texture above it/.test(e)), "a texture below refused");
});
