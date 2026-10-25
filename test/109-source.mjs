// The Source engine (src/source/): Source's textures written and read (VTF), the compiler's text (SMD), a GoldSrc
// model ported (the QC, its files, what is renamed and left out, and why), Valve's packs read (VPK), materials
// read (VMT), a model of another kind drawn by the renderer, and a port compiled and held to its original.
//
// No game: every model and file is made here. The compile runs where GMod's studiomdl is found (a Steam library,
// or SMAK_STUDIOMDL), and is said to be skipped where it is not, as the map compilers' cases are.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import * as smak from "../src/index.mjs";
import { test, sure, near, tmp, runSmak, inked } from "./helper.mjs";

const { source } = smak;
const folder = join(tmp, "source");
mkdirSync(folder, { recursive: true });

// ── VTF ──
/** A picture of `w` by `h` whose pixel (x, y) is [x * 10, y * 10, 100, 255]. */
const ramp = (w, h) => {
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rgba.set([x * 10, y * 10, 100, 255], (y * w + x) * 4);
  return { width: w, height: h, rgba };
};

test("VTF: a picture of powers of two is written as it is, every mip level down to 1 by 1, and read back the same", () => {
  const picture = ramp(8, 4);
  const bytes = source.writeVtf(picture);
  sure(bytes.toString("latin1", 0, 3) === "VTF" && bytes.readUInt32LE(4) === 7 && bytes.readUInt32LE(8) === 2, "VTF 7.2");
  const read = source.readVtf(bytes);
  sure(read.width === 8 && read.height === 4, `its size: ${read.width}x${read.height}`);
  sure(read.mips === 4 && read.format === source.VTF_FORMAT.BGR888, `4 levels (8, 4, 2, 1 wide), BGR888: ${read.mips}, ${read.format}`); // prettier-ignore
  sure(Buffer.from(read.rgba).equals(Buffer.from(picture.rgba)), "the same pixels");
  // 80 bytes of header, then the levels from the smallest: 1x1, 2x1, 4x2, 8x4, three bytes a pixel
  sure(bytes.length === 80 + 3 * (1 + 2 + 8 + 32), `its length: ${bytes.length}`);
});

test("VTF: a picture of no power of two is resampled up to one; a masked one keeps its holes whole and its colours clean", () => {
  const odd = source.readVtf(source.writeVtf(ramp(5, 3)));
  sure(odd.width === 8 && odd.height === 4, `5x3 written 8x4: ${odd.width}x${odd.height}`);
  // a corner stays its colour: bilinear between pixels' middles
  sure(odd.rgba[0] === 0 && odd.rgba[1] === 0, "the top left is still the top left's colour");
  // a 4x4 picture with its left half holes (alpha 0, coloured red: a hole's colour is no colour)
  const rgba = new Uint8Array(4 * 4 * 4);
  for (let i = 0; i < 16; i++) rgba.set(i % 4 < 2 ? [255, 0, 0, 0] : [0, 0, 255, 255], i * 4);
  const bytes = source.writeVtf({ width: 4, height: 4, rgba }, { alpha: true });
  const read = source.readVtf(bytes);
  sure(read.format === source.VTF_FORMAT.BGRA8888 && read.flags & source.VTF_FLAG.ONEBITALPHA, "BGRA8888, one-bit alpha");
  sure([...read.rgba].every((v, i) => i % 4 !== 3 || v === 0 || v === 255), "alpha only 0 or 255");
  // the 2x2 level (after the header and the 1x1 level): its left column a hole, its right blue, with no red run into it
  const level2 = bytes.subarray(80 + 4, 80 + 4 + 16);
  sure(level2[3] === 0 && level2[7] === 255 && level2[4] === 255 && level2[6] === 0, `the 2x2 level: hole, then pure blue: ${[...level2]}`); // prettier-ignore
});

test("VTF: Valve's compressed pictures (DXT1, DXT5) are read", () => {
  // one DXT1 block of 4x4: colour 0 white, colour 1 black, the first row colour 0, the rest colour 1
  const head = Buffer.alloc(80);
  head.write("VTF\0", 0, "latin1");
  head.writeUInt32LE(7, 4);
  head.writeUInt32LE(2, 8);
  head.writeUInt32LE(80, 12);
  head.writeUInt16LE(4, 16);
  head.writeUInt16LE(4, 18);
  head.writeUInt16LE(1, 24);
  head.writeUInt32LE(source.VTF_FORMAT.DXT1, 52);
  head[56] = 1;
  head.writeUInt32LE(0xffffffff, 57);
  const block = Buffer.alloc(8);
  block.writeUInt16LE(0xffff, 0);
  block.writeUInt16LE(0x0000, 2);
  block.writeUInt32LE(0x55555500, 4); // 2 bits a pixel, the first row 0, the rest 1
  const read = source.readVtf(Buffer.concat([head, block]));
  sure(read.rgba[0] === 255 && read.rgba[4 * 4] === 0 && read.rgba[4 * 4 + 3] === 255, `DXT1: white over black: ${[...read.rgba.slice(0, 20)]}`); // prettier-ignore
  head.writeUInt32LE(source.VTF_FORMAT.DXT5, 52);
  // alpha 255 and 0, every pixel's index 1 (0)
  const alpha = Buffer.from([255, 0, 0b01001001, 0b10010010, 0b00100100, 0b01001001, 0b10010010, 0b00100100]);
  const read5 = source.readVtf(Buffer.concat([head, alpha, block]));
  sure(read5.rgba[3] === 0 && read5.rgba[0] === 255, `DXT5: white, its alpha 0: ${[...read5.rgba.slice(0, 4)]}`);
});

// ── SMD ──
test("SMD: the skeleton by frames and the triangles, numbers short, a quote in a name made an apostrophe", () => {
  const text = source.smdOf({
    bones: [{ name: 'a"b', parent: -1 }],
    frames: [[[1, 2, 3, 0.5, -0, 0]]],
    triangles: [{ material: "skin", corners: [0, 1, 2].map((i) => ({ bone: 0, p: [i, 0.1 + 0.2, 0], n: [0, 0, 1], uv: [i / 2, 1] })) }],
  });
  const lines = text.trim().split("\n");
  sure(lines[0] === "version 1" && lines[2] === `0 "a'b" -1`, `head: ${lines.slice(0, 3)}`);
  sure(lines.includes("0 1 2 3 0.5 0 0"), "a frame's line: no -0, no long tail");
  sure(lines.includes("0 1 0.3 0 0 0 1 0.5 1"), `a corner's line: ${lines.filter((l) => l.startsWith("0 1 "))}`);
  sure(lines.at(-1) === "end" && lines.includes("triangles") && lines.includes("skin"), "the triangles, the material's line");
});

// ── a GoldSrc model to port: two bodyparts (the second with an empty submodel), two skins, a masked texture, an
// attachment and a hit box, a triangle of no area, bones whose names are one in any case, two animations of one
// name, and a walk that travels ──
const plain = (name, flags = 0, colour = 128) => ({ name, width: 6, height: 4, pixels: new Uint8Array(24).fill(1), palette: new Uint8Array(768).fill(colour), flags }); // prettier-ignore
const tri = (x, bone = "Arm") => [
  { p: [x, 0, 0], uv: [0, 0], bone },
  { p: [x + 1, 0, 0], uv: [1, 0], bone },
  { p: [x, 0, 1], uv: [0, 1], bone },
];
const flat = [
  { p: [5, 0, 0], uv: [0, 0] },
  { p: [6, 0, 0], uv: [1, 0] },
  { p: [7, 0, 0], uv: [0.5, 1] },
];
const portBones = [
  { name: "Arm", parent: -1, pos: [0, 0, 0] },
  { name: "arm", parent: 0, pos: [2, 0, 0] },
];
const still = portBones.map((b) => [...b.pos, 0, 0, 0]);
const portable = smak.buildMdl({
  name: "portable.mdl",
  bones: portBones,
  bodyparts: [
    { name: "body", models: [{ name: "Body Ref", meshes: [{ tris: [tri(0), tri(2, "arm"), flat], texture: plain("Skin One.bmp") }] }] },
    { name: "gun", models: [{ name: "gun", meshes: [{ tris: [tri(-3)], texture: plain("leaves.bmp", 64) }] }, { name: "none", meshes: [] }] },
  ],
  sequences: [
    { name: "idle", fps: 10, loops: true, frames: [still], activity: 1, actweight: 1 },
    { name: "walk", fps: 10, loops: true, frames: [still, still, still], activity: 3, actweight: 0, movement: [30, 0, 0] },
    { name: "Idle", fps: 0, frames: [still, still] },
  ],
  attachments: [{ name: "", bone: "arm", pos: [1, 2, 3] }],
  hitboxes: [{ bone: "Arm", group: 2, min: [0, -1, -1], max: [3, 1, 1] }],
  skins: [{ "Skin One.bmp": plain("Skin Two.bmp", 0, 200) }],
});
const ported = source.portToSource(portable, { name: "Portable Thing" });
const qcText = ported.files.find((f) => f.path === ported.qc).data;

test("port: names as Source's files want them, the model turned back, its bodygroups, skins, attachment and hit box in the QC", () => {
  sure(ported.name === "portable_thing" && ported.modelname === "smak/portable_thing.mdl", `named: ${ported.name}, ${ported.modelname}`); // prettier-ignore
  sure(/\$cdmaterials "models\/smak\/portable_thing\/"/.test(qcText), "its materials' folder");
  sure(/\$origin 0 0 0 -90/.test(qcText), "turned back: Source's compiler turns what it reads as GoldSrc's did");
  sure(/\$bodygroup "gun"\n\{\n\tstudio "gun\.smd"\n\tblank\n\}/.test(qcText), `the empty submodel blank, in its place:\n${qcText}`); // prettier-ignore
  sure(/\$texturegroup "skinfamilies"\n\{\n\t\{ "skin_one" \}\n\t\{ "skin_two" \}\n\}/.test(qcText), "the skin families, the materials that differ");
  sure(/\$attachment "attachment0" "arm_2" 1 2 3 rotate 0 0 0/.test(qcText), "an attachment with no name named, on its bone's new name");
  sure(/\$hbox 2 "Arm" 0 -1 -1 3 1 1/.test(qcText), "the hit box");
  sure(ported.files.some((f) => f.path === "src/body_ref.smd") && ported.files.some((f) => f.path === "src/gun.smd"), "a file a submodel");
});

test("port: what Source refuses is changed and warned of: a bone of another's name in any case, two animations of one name, fps 0, weight 0, a triangle of no area", () => {
  const said = ported.warnings.join("\n");
  sure(/"arm" \(number 1\) as arm_2/.test(said), `the second bone renamed: ${said}`);
  sure(/animation Idle \(number 2\): a second of that name, ported as Idle_2/.test(said), "the animation renamed");
  sure(/\$sequence "Idle_2" "anims\/idle_2\.smd" fps 1/.test(qcText), `fps 0 of 2 frames written 1:\n${qcText}`);
  sure(/fps 0 \(its 2 frames held still\)/.test(said), "and said");
  sure(/activity ACT_WALK 1/.test(qcText) && /weight 0 for ACT_WALK/.test(said), "weight 0 written 1, and said");
  sure(/a triangle of no area left out/.test(said), "the triangle of no area");
  const body = ported.files.find((f) => f.path === "src/body_ref.smd").data;
  sure(body.split("\n").filter((l) => l === "skin_one").length === 2, "two triangles of the three written");
  sure(ported.facts.corners.length === 6 + 3, `the corners held to the compiled model: ${ported.facts.corners.length}`);
});

test("port: a walk's travel put back into its frames and LX said; the masked texture alpha-tested, as a VTF with its holes", () => {
  sure(/\$sequence "walk" "anims\/walk\.smd" fps 10 loop activity ACT_WALK 1 LX/.test(qcText), `the walk's line:\n${qcText}`);
  const walk = ported.files.find((f) => f.path === "src/anims/walk.smd").data.split("\n");
  // the root at its rest in the first frame, 15 along in the second, 30 in the last
  const rootAt = (time) => walk[walk.indexOf(`time ${time}`) + 1];
  sure(rootAt(0) === "0 0 0 0 0 0 0" && rootAt(1) === "0 15 0 0 0 0 0" && rootAt(2) === "0 30 0 0 0 0 0", `the root's frames: ${rootAt(0)} | ${rootAt(1)} | ${rootAt(2)}`); // prettier-ignore
  const vmt = ported.files.find((f) => f.path.endsWith("leaves.vmt")).data;
  sure(/"\$alphatest" "1"/.test(vmt) && /"\$basetexture" "models\/smak\/portable_thing\/leaves"/.test(vmt), vmt);
  const vtf = source.readVtf(ported.files.find((f) => f.path.endsWith("leaves.vtf")).data);
  sure(vtf.width === 8 && vtf.height === 4 && vtf.flags & source.VTF_FLAG.ONEBITALPHA, `6x4 written 8x4, one-bit alpha: ${vtf.width}x${vtf.height}`);
  sure(/"VertexLitGeneric"/.test(ported.files.find((f) => f.path.endsWith("skin_one.vmt")).data), "a plain texture VertexLitGeneric");
  sure(source.vmtOf("x", 4).startsWith('"UnlitGeneric"') && /\$additive/.test(source.vmtOf("x", 32)), "fullbright unlit, additive additive");
});

test("port: a box when asked, weighed by Source unless a density or a mass is given", () => {
  sure(!/\$collision/.test(qcText), "a skeleton of one hit box: too few for a ragdoll, none");
  sure(/too few bones with hit boxes for a ragdoll/.test(ported.warnings.join("\n")), "and said");
  const box = source.portToSource(portable, { name: "boxed", collision: "box" });
  const boxQc = box.files.find((f) => f.path === box.qc).data;
  sure(/\$collisionmodel "boxed_physics\.smd"\n\{\n\t\$automass\n\}/.test(boxQc), boxQc);
  const physics = box.files.find((f) => f.path === "src/boxed_physics.smd").data;
  sure(physics.split("\n").filter((l) => l === "physics").length === 12, "twelve triangles: a box");
  // the triangles' box is 10 by 0 by 1 here (a flat model): its volume 0, so a density weighs it nothing; a mass
  const heavy = source.portToSource(portable, { name: "boxed", collision: "box", mass: 12.5, surfaceprop: "wood" });
  const heavyQc = heavy.files.find((f) => f.path === heavy.qc).data;
  sure(/\$mass 12\.5/.test(heavyQc) && /\$surfaceprop "wood"/.test(heavyQc), heavyQc);
  let said = "";
  try {
    source.portToSource(portable, { name: "x", collision: "spring" });
  } catch (error) {
    said = error.message;
  }
  sure(/collision is auto, hull, box, ragdoll, none, not spring/.test(said), said);
});

/** A post of one bone (a box 4 by 4 by 20) and a figure of three bones with a hit box each. */
const cube = (lo, hi, bone) => {
  const c = (x, y, z) => [x ? hi[0] : lo[0], y ? hi[1] : lo[1], z ? hi[2] : lo[2]];
  const quads = [[[0,0,0],[0,1,0],[1,1,0],[1,0,0]], [[0,0,1],[1,0,1],[1,1,1],[0,1,1]], [[0,0,0],[1,0,0],[1,0,1],[0,0,1]], [[0,1,0],[0,1,1],[1,1,1],[1,1,0]], [[0,0,0],[0,0,1],[0,1,1],[0,1,0]], [[1,0,0],[1,1,0],[1,1,1],[1,0,1]]]; // prettier-ignore
  return quads.flatMap(([a, b, cc, d]) => [[a, b, cc], [a, cc, d]].map((tri) => tri.map((k, i) => ({ p: c(...k), uv: [i / 2, 0.5], bone }))));
};
const post = smak.buildMdl({ name: "post.mdl", bodyparts: [{ name: "body", models: [{ name: "post", meshes: [{ tris: cube([0, 0, 0], [4, 4, 20]), texture: plain("wood.bmp") }] }] }] }); // prettier-ignore
const figureBones = [
  { name: "hips", parent: -1, pos: [0, 0, 30] },
  { name: "chest", parent: 0, pos: [0, 0, 10] },
  { name: "head", parent: 1, pos: [0, 0, 12] },
];
const figure = smak.buildMdl({
  name: "figure.mdl",
  bones: figureBones,
  bodyparts: [{ name: "body", models: [{ name: "figure", meshes: [{ tris: [...cube([-4, -3, 25], [4, 3, 40], "hips"), ...cube([-5, -3, 40], [5, 3, 52], "chest"), ...cube([-2, -2, 52], [2, 2, 58], "head")], texture: plain("cloth.bmp") }] }] }], // prettier-ignore
  sequences: [{ name: "idle", fps: 10, loops: true, frames: [figureBones.map((b) => [...b.pos, 0, 0, 0])] }],
  hitboxes: [
    { bone: "hips", group: 3, min: [-4, -3, -5], max: [4, 3, 10] },
    { bone: "chest", group: 2, min: [-5, -3, 0], max: [5, 3, 12] },
    { bone: "head", group: 1, min: [-2, -2, 0], max: [2, 2, 6] },
  ],
});

test("port: a model of one bone collides as its hull, weighed at its density; a figure with hit boxes as a ragdoll", () => {
  // a post 4 x 4 x 20 = 320 cubic units, as wood (700 kg a cubic metre): 320 * 0.0254^3 * 700 = 3.67 kg
  const p = source.portToSource(post, { name: "post", surfaceprop: "wood", density: source.densityOf("wood") });
  const postQc = p.files.find((f) => f.path === p.qc).data;
  sure(/\$collisionmodel "post_physics\.smd"\n\{\n\t\$mass 3\.7\n\}/.test(postQc), postQc);
  const hullFaces = p.files.find((f) => f.path === "src/post_physics.smd").data.split("\n").filter((l) => l === "physics").length;
  sure(hullFaces === 12, `the hull of a box is the box: ${hullFaces} triangles`);
  const f = source.portToSource(figure, { name: "figure" });
  const figureQc = f.files.find((x) => x.path === f.qc).data;
  sure(/\$collisionjoints "figure_physics\.smd"\n\{\n\t\$mass 90\n/.test(figureQc) && /\$rootbone "hips"/.test(figureQc), figureQc);
  sure((figureQc.match(/\$jointconstrain/g) ?? []).length === 6, "two joints, three axes each");
  sure(/\$surfaceprop "flesh"/.test(figureQc) && /\$sequence "ragdoll" "anims\/ragdoll\.smd" fps 30 activity ACT_DIERAGDOLL 1/.test(figureQc), figureQc);
  const said = f.warnings.join("\n");
  sure(/taken for flesh/.test(said) && /weighs a person's 90 kg/.test(said), said);
  const pieces = f.files.find((x) => x.path === "src/figure_physics.smd").data.split("\n").filter((l) => l === "physics").length;
  sure(pieces === 36, `three boxes: ${pieces} triangles`);
});

test("convexHull: the hull of points in a ball holds them all; a box's is its twelve triangles; points in a plane have none", () => {
  const points = Array.from({ length: 400 }, (_, i) => {
    const z = 1 - (2 * (i + 0.5)) / 400;
    const r = Math.sqrt(1 - z * z);
    return [Math.cos(i * 2.4) * r * 10, Math.sin(i * 2.4) * r * 10, z * 10];
  });
  const hull = source.convexHull([...points, [0, 0, 0], [1, 2, 3]]);
  sure(hull.points.length === 400 && hull.faces.length === 2 * 400 - 4, `V ${hull.points.length}, F ${hull.faces.length} (F = 2V - 4)`);
  const box = source.convexHull([0, 1].flatMap((x) => [0, 1].flatMap((y) => [0, 1].map((z) => [x, y, z]))));
  sure(box.faces.length === 12, `a box: ${box.faces.length}`);
  sure(source.convexHull([[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [2, 3, 0]]) === null, "flat: none");
});

test("surfaceprops: a material's density through its bases, from a surfaceproperties.txt or the kit's table; a mass of a volume", () => {
  const props = source.readSurfaceProps('// a comment\n"default" { "density" "2000" }\n"Wood" { "density" "700" }\n"wood_crate" { "base" "wood" "stepleft" "x" }\n"odd" { "base" "nothing" }'); // prettier-ignore
  sure(source.densityOf("wood_crate", props) === 700 && source.densityOf("Wood", props) === 700, "through its base");
  sure(source.densityOf("unknown", props) === 2000 && source.densityOf("metal") === 2700, "default, and the kit's table");
  near(source.massOf(61023.7, 1000), 1000, 0.1, "a cubic metre of water");
  sure(source.SURFACEPROP_OF_BASE.darkwood === "wood" && source.SURFACEPROP_OF_BASE.iron === "metal", "a spec's bases");
});

test("port: writePort writes src/ and addon/ under the folder given", () => {
  const qc = source.writePort(ported, join(folder, "written"));
  sure(existsSync(qc) && existsSync(join(folder, "written", "addon", "materials", "models", "smak", "portable_thing", "leaves.vtf")), qc);
});

// ── the compiled model held to the original: comparePort over plain data ──
test("comparePort: a compiled model that has what the port had passes, and says what it holds", () => {
  const facts = { bones: ["a"], sequences: ["idle"], materials: ["m"], bodygroups: [{ name: "body", models: 1 }], skins: 1, attachments: [], hitboxes: 0, corners: [{ p: [0, 0, 0], uv: [0, 0] }] }; // prettier-ignore
  const compiled = { version: 48, bones: [{ name: "a" }], sequences: [{ name: "idle" }], materials: ["m"], cdmaterials: ["models/x/"], skins: [[0]], bodyparts: [{ name: "body", models: [{ vertices: 3 }] }], attachments: [], hitboxes: [] }; // prettier-ignore
  const triangles = [{ corners: [{ p: [0.02, 0, 0], uv: [0, 0] }] }];
  const result = source.comparePort(facts, compiled, triangles);
  sure(result.passed && result.said.length === 3, `${result.faults} / ${result.said}`);
  // a model with no hit boxes is given one by Source's compiler: no loss (a barrel built by the kit, 2026-10-25)
  const given = source.comparePort(facts, { ...compiled, hitboxes: [{}] }, triangles);
  sure(given.passed, `a hit box the compiler made is no fault: ${given.faults}`);
});

// ── VPK ──
test("VPK: a pack's tree read, a file's bytes from a numbered archive, from after the tree, and with a preload", () => {
  // a version 1 pack: models/a.mdl in archive 0, materials/b.vmt after the tree, readme with all its bytes preloaded
  const string = (s) => Buffer.from(`${s}\0`, "latin1");
  const entry = (archive, offset, length, preload = Buffer.alloc(0)) => {
    const e = Buffer.alloc(18);
    e.writeUInt16LE(preload.length, 4);
    e.writeUInt16LE(archive, 6);
    e.writeUInt32LE(offset, 8);
    e.writeUInt32LE(length, 12);
    e.writeUInt16LE(0xffff, 16);
    return Buffer.concat([e, preload]);
  };
  const tree = Buffer.concat([
    string("mdl"), string("models"), string("a"), entry(0, 2, 3), string(""), string(""),
    string("vmt"), string("materials"), string("b"), entry(0x7fff, 0, 4), string(""), string(""),
    string("txt"), string(" "), string("readme"), entry(0, 0, 0, Buffer.from("hi")), string(""), string(""),
    string(""),
  ]); // prettier-ignore
  const head = Buffer.alloc(12);
  head.writeUInt32LE(0x55aa1234, 0);
  head.writeUInt32LE(1, 4);
  head.writeUInt32LE(tree.length, 8);
  writeFileSync(join(folder, "pak_dir.vpk"), Buffer.concat([head, tree, Buffer.from("VMT!")]));
  writeFileSync(join(folder, "pak_000.vpk"), Buffer.from("..MDL.."));
  const pack = source.openVpk(join(folder, "pak_dir.vpk"));
  sure(pack.files.length === 3 && pack.has("Models\\A.mdl"), `its files: ${pack.files}`);
  sure(pack.read("models/a.mdl").toString() === "MDL" && pack.read("materials/b.vmt").toString() === "VMT!", "read from both");
  sure(pack.read("readme.txt").toString() === "hi", "a preloaded file");
});

// ── VMT ──
test("VMT: the shader and its keys read, a nested block and comments passed over", () => {
  const { shader, keys } = source.readVmt('"VertexLitGeneric"\n{\n // a comment\n "$basetexture" "models/a/b"\n $alphatest 1\n "Proxies" { "AnimatedTexture" { "animatedtexturevar" "$x" } }\n "$additive" "0"\n}'); // prettier-ignore
  sure(shader === "VertexLitGeneric" && keys.$basetexture === "models/a/b" && keys.$alphatest === "1" && keys.$additive === "0", JSON.stringify(keys));
  sure(!("animatedtexturevar" in keys) && !("proxies" in keys), "nothing of the nested block");
});

// ── render: a model of another kind, its texture its own colours ──
test("render: triangles of another kind (a Source model's) drawn, their texture of RGBA, a masked one's holes not drawn", () => {
  const rgba = new Uint8Array(2 * 2 * 4).fill(255);
  rgba.set([255, 0, 0, 255], 0);
  const tex = { name: "t", width: 2, height: 2, flags: 0, rgba };
  const square = (texture) => [
    { tex: texture, where: {}, tri: 0, c: [[0, -5, -5], [0, 5, 5], [0, 5, -5]].map((p) => ({ p, n: [1, 0, 0], u: 1, v: 1 })) },
    { tex: texture, where: {}, tri: 1, c: [[0, -5, -5], [0, -5, 5], [0, 5, 5]].map((p) => ({ p, n: [1, 0, 0], u: 0, v: 0 })) },
  ];
  const drawn = smak.render(null, { tris: square(tex), view: "front", width: 64, height: 64, light: false, cull: false });
  sure(inked(drawn) > 0.3, `drawn: ${inked(drawn)}`);
  const red = [...Array(64 * 64).keys()].filter((i) => drawn.rgba[i * 4] > 200 && drawn.rgba[i * 4 + 1] < 60).length;
  sure(red > 300, `one triangle wears the red pixel: ${red}`);
  const holed = { ...tex, flags: smak.TEXTURE.masked, rgba: new Uint8Array(16) };
  const none = smak.render(null, { tris: square(holed), view: "front", width: 64, height: 64, light: false, cull: false });
  sure(inked(none) < 0.01, `holes: nothing drawn (${inked(none)})`);
});

test("findStudiomdl: one named that is not there is refused; none found says what it is and where it comes from", () => {
  let said = "";
  try {
    source.findStudiomdl({ file: join(folder, "nothing.exe") });
  } catch (error) {
    said = error.message;
  }
  sure(/no studiomdl at/.test(said), said);
  try {
    source.findStudiomdl({ env: {} });
    said = "";
  } catch (error) {
    said = error.message;
  }
  // a machine with GMod finds it by the registry; without, the sentence
  sure(!said || (/Garry's Mod/.test(said) && /SMAK_STUDIOMDL/.test(said)), said);
});

// ── compiled, where GMod's studiomdl is ──
let studiomdl = null;
try {
  studiomdl = source.findStudiomdl();
} catch {
  // no GMod on this machine: the compiled cases are skipped
}
const testCompiled = (name, run) => {
  if (studiomdl) test(name, run);
  else console.log(`skip  ${name}\n      skipped: no studiomdl (install Garry's Mod, or name one in SMAK_STUDIOMDL)`);
};

testCompiled("compiled: the port is built by GMod's studiomdl, and every bone, animation, bodygroup and corner is in it", () => {
  const out = join(folder, "compiled");
  const file = join(folder, "portable.mdl");
  writeFileSync(file, portable);
  const result = source.portToGmod(file, { out, name: "portable" });
  sure(result.passed, `held to the original: ${result.faults.join("; ")}`);
  const mdl = source.readSourceMdl(readFileSync(join(out, "addon", "models", "smak", "portable.mdl")));
  sure(mdl.version === 48 && mdl.bones.length === 2 && mdl.sequences.length === 3, `Source 48, 2 bones, 3 animations: ${mdl.version}, ${mdl.bones.length}, ${mdl.sequences.length}`); // prettier-ignore
  sure(mdl.bodyparts[1].models.length === 2 && mdl.skins.length === 2, "the gun's two submodels, two skins");
  sure(result.picture && inked(result.picture) > 0.01, "drawn from its own files");
  // a corner moved: the check says so
  const port = source.portToSource(portable, { name: "portable" });
  port.facts.corners[0] = { p: [9, 9, 9], uv: [0, 0] };
  const stem = join(out, "addon", "models", "smak", "portable");
  const triangles = source.sourceTriangles(mdl, source.readVvd(readFileSync(`${stem}.vvd`)), source.readVtx(readFileSync(`${stem}.dx90.vtx`))); // prettier-ignore
  const held = source.comparePort(port.facts, mdl, triangles);
  sure(!held.passed && /1 of 9 corners not where the original had them/.test(held.faults[0]), held.faults.join("; "));
});

testCompiled("compiled: smak gmod-port ends in PASS and draws it; source-info reads the compiled file", () => {
  const out = join(folder, "cli");
  const file = join(folder, "portable.mdl");
  const said = runSmak("gmod-port", file, "-o", out, "--name", "cli_thing");
  sure(/PASS: compiled and whole/.test(said) && existsSync(join(out, "sheet.png")), said);
  const info = runSmak("source-info", join(out, "addon", "models", "smak", "cli_thing.mdl"));
  sure(/Source model, version 48/.test(info) && /material leaves: VertexLitGeneric, 8x4/.test(info), info);
});

test("smak gmod-port --no-compile writes the files with no compiler", () => {
  const file = join(folder, "portable-nc.mdl");
  writeFileSync(file, portable);
  const said = runSmak("gmod-port", file, "-o", join(folder, "nc"), "--no-compile");
  sure(/PASS: written, not compiled/.test(said) && existsSync(join(folder, "nc", "src", "portable-nc.qc")), said);
});

testCompiled("compiled: the post collides as one solid of its weight; the figure as a ragdoll of three pieces and two joints", () => {
  const postFile = join(folder, "post.mdl");
  writeFileSync(postFile, post);
  const p = source.portToGmod(postFile, { out: join(folder, "post"), surfaceprop: "wood", picture: false });
  sure(p.passed && p.physics.solids === 1 && Math.abs(p.physics.mass - 3.7) < 0.05, `${p.faults} ${JSON.stringify({ ...p.physics, text: undefined })}`);
  sure(p.physics.surfaceprops[0] === "wood", `wood: ${p.physics.surfaceprops}`);
  const figureFile = join(folder, "figure.mdl");
  writeFileSync(figureFile, figure);
  const f = source.portToGmod(figureFile, { out: join(folder, "figure"), picture: false });
  sure(f.passed && f.physics.solids === 3 && f.physics.joints === 2, `${f.faults} ${JSON.stringify({ ...f.physics, text: undefined })}`);
  sure(/collides as 3 solids joined by 2 joints \(a ragdoll\)/.test(f.said.join("\n")), f.said.join(" | "));
});
