// Source's maps (src/source/bsp.mjs): the file written lump by lump and read back, ColorRGBExp32, the visibility
// rows, the PAKFILE's zip.
import { gzipSync } from "node:zlib";
import * as smak from "../src/index.mjs";
import { test, sure, near, tmp } from "./helper.mjs";

const { source } = smak;

test("source BSP: written lump by lump and read back, each lump started on 4 bytes, the versioned ones versioned", () => {
  const L = source.SOURCE_LUMP;
  const entities = Buffer.from('{\n"classname" "worldspawn"\n}\n\0', "latin1");
  const planes = new source.Packer().vec([0, 0, 1]).f32(64).i32(2).done();
  const bytes = source.writeSourceBsp({ [L.ENTITIES]: entities, [L.PLANES]: planes, [L.FACES]: Buffer.alloc(3) }, { revision: 7 });
  sure(bytes.toString("latin1", 0, 4) === "VBSP", "the ident");
  const read = source.readSourceBsp(bytes);
  sure(read.version === 20 && read.revision === 7, `version ${read.version}, revision ${read.revision}`);
  sure(read.lumps.length === 64, `${read.lumps.length} lumps`);
  sure(read.lumps[L.ENTITIES].bytes.equals(entities) && read.lumps[L.PLANES].bytes.equals(planes), "the lumps as given");
  sure(read.lumps[L.PLANES].bytes.readFloatLE(12) === 64 && read.lumps[L.PLANES].bytes.readInt32LE(16) === 2, "a plane packed");
  sure(read.lumps[L.FACES].version === 1 && read.lumps[L.LEAFS].version === 1 && read.lumps[L.OCCLUSION].version === 2, "lump versions");
  sure(read.lumps[L.VISIBILITY].bytes.length === 0 && read.lumps[L.VISIBILITY].version === 0, "a lump not given is empty");
  const offsets = read.lumps.filter((l) => l.bytes.length).map((l) => l.bytes.byteOffset);
  sure(offsets.every((o) => o % 4 === 0), `offsets ${offsets.join(" ")}`);
  let refused = "";
  try {
    source.readSourceBsp(Buffer.alloc(2000));
  } catch (e) {
    refused = e.message;
  }
  sure(/not a Source map/.test(refused), refused);
});

test("source BSP: a light as ColorRGBExp32, byte times 2^exp over 255, near what it was", () => {
  const out = Buffer.alloc(4);
  for (const [r, g, b] of [[200, 100, 50], [1000, 20, 5], [0.5, 0.25, 0.1], [255, 255, 255]]) {
    source.colorRgbExp(r, g, b, out, 0);
    const exp = out.readInt8(3);
    const back = [0, 1, 2].map((c) => out[c] * 2 ** exp);
    const most = Math.max(r, g, b);
    [r, g, b].forEach((v, c) => near(back[c], v, most / 255 + 1e-9, `${[r, g, b]} channel ${c}: ${back[c]}`));
  }
  source.colorRgbExp(0, 0, 0, out, 0);
  sure(out.readUInt32LE(0) === 0, "no light is 0");
});

test("source BSP: the visibility rows run-length packed, each cluster's PVS and PAS found by its offsets", () => {
  const pvs = [Uint8Array.from([0b101, 0, 0, 0]), Uint8Array.from([0, 0, 0, 0x80])];
  const pas = [Uint8Array.from([0xff, 0xff, 0, 0]), Uint8Array.from([0, 0, 0, 0])];
  const lump = source.visibilityLump(pvs, pas);
  sure(lump.readInt32LE(0) === 2, "two clusters");
  const unpack = (at, bytes) => {
    const row = [];
    while (row.length < bytes) {
      const v = lump[at++];
      if (v) row.push(v);
      else for (let n = lump[at++]; n > 0; n--) row.push(0);
    }
    return row;
  };
  [0, 1].forEach((c) => {
    sure(unpack(lump.readInt32LE(4 + c * 8), 4).join() === [...pvs[c]].join(), `cluster ${c}'s PVS`);
    sure(unpack(lump.readInt32LE(8 + c * 8), 4).join() === [...pas[c]].join(), `cluster ${c}'s PAS`);
  });
});

test("source BSP: the PAKFILE as a stored zip whose names, sizes and CRCs a zip reader takes", () => {
  const files = [
    { name: "materials/smak/maps/test/wall.vmt", bytes: Buffer.from('"LightmappedGeneric"\n{\n}\n') },
    { name: "materials/smak/maps/test/wall.vtf", bytes: Buffer.from([1, 2, 3, 4, 5]) },
  ];
  const zip = source.storedZip(files);
  const end = zip.length - 22;
  sure(zip.readUInt32LE(end) === 0x06054b50 && zip.readUInt16LE(end + 10) === 2, "the end record, two files");
  let central = zip.readUInt32LE(end + 16);
  for (const f of files) {
    sure(zip.readUInt32LE(central) === 0x02014b50, "a central record");
    const nameLength = zip.readUInt16LE(central + 28);
    sure(zip.toString("latin1", central + 46, central + 46 + nameLength) === f.name, "its name");
    const local = zip.readUInt32LE(central + 42);
    sure(zip.readUInt32LE(local) === 0x04034b50 && zip.readUInt16LE(local + 8) === 0, "stored, not deflated");
    const data = zip.subarray(local + 30 + zip.readUInt16LE(local + 26), local + 30 + zip.readUInt16LE(local + 26) + f.bytes.length);
    sure(data.equals(f.bytes), "its bytes");
    // the CRC, against zlib's own: a gzip's trailer carries it
    const gz = gzipSync(f.bytes);
    sure(zip.readUInt32LE(central + 16) === gz.readUInt32LE(gz.length - 8), "its CRC-32");
    central += 46 + nameLength;
  }
});

// ── a GoldSrc map ported (src/source/map.mjs), held to the rules stevenlafl found in the game ──
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HERE } from "./helper.mjs";

const twoRooms = join(HERE, "fixtures", "tworooms.bsp");
const gold = smak.maps.readBsp(readFileSync(twoRooms));
const ported = source.portMapToSource(twoRooms, {});
const read = source.readSourceBsp(ported.bsp);
const lump = (name) => read.lumps[source.SOURCE_LUMP[name]].bytes;
const entitiesOf = (text) => [...text.matchAll(/\{([^}]*)\}/g)].map((m) => Object.fromEntries([...m[1].matchAll(/"([^"]*)" "([^"]*)"/g)].map((k) => [k[1], k[2]]))); // prettier-ignore

test("map port: every lump a whole number of Source's structures, the faces, edges and vertices GoldSrc's own", () => {
  const sizes = { PLANES: 20, TEXINFO: 72, FACES: 56, LEAFS: 32, NODES: 32, BRUSHES: 12, BRUSHSIDES: 8, MODELS: 48, EDGES: 4, SURFEDGES: 4, VERTEXES: 12, LEAFFACES: 2, LEAFBRUSHES: 2 }; // prettier-ignore
  for (const [name, size] of Object.entries(sizes)) sure(lump(name).length % size === 0, `${name}: ${lump(name).length} bytes, not a whole number of ${size}`);
  sure(lump("FACES").length / 56 === gold.faces.length && lump("VERTEXES").length / 12 === gold.vertices.length, "the faces and vertices as they were");
  sure(lump("MODELS").length / 48 === gold.models.length, "a model for each of GoldSrc's");
  sure(lump("LIGHTING").length > 0 && lump("VISIBILITY").length > 0, "light and visibility kept");
});

test("map port: a face on the back of its node's plane names the plane turned round", () => {
  const faces = lump("FACES");
  const planes = lump("PLANES");
  let back = 0;
  gold.faces.forEach((f, i) => {
    const plane = faces.readUInt16LE(i * 56);
    const normal = [0, 1, 2].map((k) => planes.readFloatLE(plane * 20 + k * 4));
    const want = gold.planes[f.plane].normal.map((x) => (f.side ? -x : x));
    sure(normal.every((x, k) => Math.abs(x - want[k]) < 1e-5), `face ${i}: ${normal} where ${want}`);
    if (f.side) back++;
  });
  sure(back > 0, "the map has faces on the back of their planes, to test");
});

test("map port: each leaf its own run of faces in leaf order, the clusters numbered with no gaps", () => {
  const leafs = lump("LEAFS");
  let at = 0;
  const clusters = new Set();
  for (let i = 0; i < leafs.length / 32; i++) {
    const first = leafs.readUInt16LE(i * 32 + 20);
    const count = leafs.readUInt16LE(i * 32 + 22);
    sure(first === at, `leaf ${i}'s faces start at ${first}, not ${at}`);
    at += count;
    const cluster = leafs.readInt16LE(i * 32 + 4);
    if (cluster >= 0) clusters.add(cluster);
  }
  sure(at === lump("LEAFFACES").length / 2, "the runs fill the lump");
  const count = lump("VISIBILITY").readInt32LE(0);
  sure(count === clusters.size && [...clusters].every((c) => c < count), `${count} clusters in the rows, ${clusters.size} in the leaves`);
  sure(count === ported.facts.clusters, "as the facts say");
});

test("map port: the entities as Source reads them: the start at its feet, no wad list, the sky named", () => {
  const was = smak.maps.readBsp(readFileSync(twoRooms)).entities.map((pairs) => Object.fromEntries(pairs));
  const now = entitiesOf(lump("ENTITIES").toString("latin1"));
  sure(now.length === was.length, `${now.length} entities, ${was.length} before`);
  const start = (list) => list.find((e) => e.classname === "info_player_start").origin.split(" ").map(Number);
  sure(start(now)[2] === start(was)[2] - 36, `the start at ${start(now)}, from ${start(was)}`);
  sure(!("wad" in now[0]) && now[0].skyname === ported.facts.sky, `worldspawn: ${JSON.stringify(now[0])}`);
});

test("map port: the map's own textures in its PAKFILE, the grate alpha-tested with one-bit alpha", () => {
  const pak = lump("PAKFILE");
  const names = [...pak.toString("latin1").matchAll(/materials\/smak\/maps\/tworooms\/[a-z_]+\.v[mt][tf]/g)].map((m) => m[0]);
  for (const t of ["smakwall", "smakfloor", "mask_smakgrate"])
    sure(names.includes(`materials/smak/maps/tworooms/${t}.vtf`) && names.includes(`materials/smak/maps/tworooms/${t}.vmt`), `${t}: ${[...new Set(names)].join(" ")}`); // prettier-ignore
  sure(/"\$alphatest" "1"/.test(pak.toString("latin1")), "the grate is alpha-tested");
  sure(ported.files.length === 0, "nothing of a wad, so nothing shared in the addon");
});

test("map port: brushes where the walls are, none in the rooms, and the brush entity's own", () => {
  const brushes = lump("BRUSHES");
  const sides = lump("BRUSHSIDES");
  const planes = lump("PLANES");
  const inside = (b, p) => {
    const first = brushes.readInt32LE(b * 12);
    const count = brushes.readInt32LE(b * 12 + 4);
    for (let s = first; s < first + count; s++) {
      const pl = sides.readUInt16LE(s * 8);
      const n = [0, 1, 2].map((k) => planes.readFloatLE(pl * 20 + k * 4));
      if (n[0] * p[0] + n[1] * p[1] + n[2] * p[2] - planes.readFloatLE(pl * 20 + 12) > 0) return false;
    }
    return true;
  };
  const count = brushes.length / 12;
  const solidAt = (p) => [...Array(count).keys()].some((b) => inside(b, p) && brushes.readInt32LE(b * 12 + 8) & source.CONTENTS.SOLID); // prettier-ignore
  const start = gold.entities.map((pairs) => Object.fromEntries(pairs)).find((e) => e.classname === "info_player_start").origin.split(" ").map(Number); // prettier-ignore
  sure(!solidAt(start), `the start ${start} is in a brush`);
  sure(solidAt([start[0], start[1], gold.models[0].mins[2] + 1]), "under the floor is solid");
  const wall = gold.models[1];
  sure(solidAt(wall.mins.map((v, k) => (v + wall.maxs[k]) / 2)), "the func_wall's middle is in its brush");
});

let vphysics = null;
try {
  vphysics = source.findVphysics();
} catch {
  // no GMod on this machine: the physics case is skipped
}
const testPhysics = (name, run) => {
  if (vphysics && process.platform === "win32") test(name, run);
  else console.log(`skip  ${name}\n      skipped: no GMod vphysics (install Garry's Mod, or name it in SMAK_VPHYSICS)`);
};

testPhysics("map port: the world's and the brush entity's physics made by GMod's vphysics, a box's volume exact", () => {
  const box = (x, s) => [[1, 0, 0, x + s], [-1, 0, 0, -x], [0, 1, 0, s], [0, -1, 0, 0], [0, 0, 1, s], [0, 0, -1, 0]].map(([a, b, c, d]) => ({ normal: [a, b, c], dist: d })); // prettier-ignore
  const lump = source.physCollideLump([[box(0, 64), box(100, 32)], [box(0, 16), box(32, 16)]]);
  sure(lump.readInt32LE(0) === 0, "model 0 first");
  const next = 16 + lump.readInt32LE(4) + lump.readInt32LE(8);
  sure(lump.readInt32LE(next) === 1, "then model 1");
  sure(lump.readInt32LE(lump.length - 16) === -1, "the list's end");
  const text = lump.toString("latin1");
  sure(/staticsolid \{\n"index" "0"/.test(text), "the world a static solid");
  // two 16 unit boxes: 8192 cubic inches at 2000 kg/m^3
  const mass = Number(text.match(/"mass" "([\d.]+)"/)?.[1]);
  near(mass, 8192 * 2000 * 0.0254 ** 3, 0.01, `the brush entity's mass: ${mass}`);
  const whole = source.portMapToGmod(twoRooms, { out: join(tmp, "tworooms-gmod"), valve: null });
  sure(whole.facts.physics && !whole.warnings.some((w) => /physics/.test(w)), whole.warnings.join("; "));
  sure(source.readSourceBsp(readFileSync(whole.file)).lumps[source.SOURCE_LUMP.PHYSCOLLIDE].bytes.length > 0, "the lump in the map");
});

test("map port: a texture's type from the game's sound/materials.txt, read as the engine reads it, as its $surfaceprop", () => {
  const game = join(tmp, "typed-game");
  mkdirSync(join(game, "sound"), { recursive: true });
  writeFileSync(join(game, "sound", "materials.txt"), "// types\nM METALFLOOR_LONGNAME\nW CRATE01\nG {GRATE\n");
  const typeOf = source.textureTypes([game]);
  sure(typeOf("metalfloor_longname_b") === "M", "the first 12 letters, whatever their case");
  sure(typeOf("+0crate01") === "W" && typeOf("-1crate01") === "W", "a frame's prefix stripped");
  sure(typeOf("{grate") === "C" && typeOf("grate") === "C", "a { stripped from the texture, not from the list's name (as the engine does)");
  sure(typeOf("anything") === "C" && source.textureTypes([join(tmp, "nowhere")])("x") === "C", "concrete when not listed, or no file");
  sure(source.surfacepropOfType("M") === "metal" && source.surfacepropOfType("V") === "metalvent" && source.surfacepropOfType("?") === "concrete", "the types as Source's"); // prettier-ignore
  const pak = lump("PAKFILE").toString("latin1");
  sure((pak.match(/"\$surfaceprop" "concrete"/g) ?? []).length === 3, "the two rooms' three textures, listed nowhere, are concrete");
  sure(ported.physics[0].every((c) => c.surfaceprop === "concrete" && c.planes.length >= 4), "the world's convexes say what they are made of");
});

test("map port: a clip brush is held to the hulls, grown by the player's box: a wall's own fits hull 1, moved into a room it does not", () => {
  const world = gold.models[0];
  const solid = (leaf) => (gold.leaves[leaf].contents === -2 ? "solid" : null);
  const walls = source.brushesOfTree(gold, world.headNodes[0], solid, world.mins, world.maxs);
  const half = [16, 16, 36];
  // the walls' brushes inside the map (not the closing box outside it)
  const inside = walls.filter((b) => b.planes.every((p) => Math.abs(p.dist) < 60000));
  const fits = inside.map((b) => source.clipOutsideHull(gold, b, world.headNodes[1], half));
  sure(
    fits.length && fits.every((f) => f <= 0.02),
    `the walls grown fit hull 1: ${fits.map((f) => f.toFixed(2)).join(" ")}`,
  );
  // the room's middle: open in hull 1
  const mid = [0, 1, 2].map((k) => (world.mins[k] + world.maxs[k]) / 2);
  const roomy = [...Array(9).keys()]
    .map((i) => [mid[0] + (i - 4) * 32, mid[1], mid[2]])
    .find((p) => smak.maps.contentsAt(gold, p, { hull: 1 }) === -1);
  sure(roomy, "an open spot in hull 1");
  const cube = [0, 1, 2].flatMap((k) =>
    [1, -1].map((s) => ({ normal: [0, 1, 2].map((c) => (c === k ? s : 0)), dist: s * roomy[k] + 4 })),
  );
  const open = source.clipOutsideHull(gold, { planes: cube }, world.headNodes[1], half);
  // its sides grown sideways land in the open; its top and bottom in the low room's ceiling and floor
  sure(open > 0.25, `a cube in the open does not: ${open.toFixed(2)} outside`);
});
