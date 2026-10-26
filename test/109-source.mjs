// The Source engine (src/source/): Source's textures written and read (VTF), the compiler's text (SMD), a GoldSrc
// model ported (the QC, its files, what is renamed and left out, and why), Valve's packs read (VPK), materials
// read (VMT), a model of another kind drawn by the renderer, and a port compiled and held to its original.
//
// No game: every model and file is made here. The compile runs where GMod's studiomdl is found (a Steam library,
// or SMAK_STUDIOMDL), and is said to be skipped where it is not, as the map compilers' cases are.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import * as smak from "../src/index.mjs";
import { buildModelSpec, validateModelSpec } from "../src/spec/model.mjs";
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

test("port: a one-shot's travel left out (in place, as GoldSrc played it), no rollback; a view model's animations start outright", () => {
  sure(/^\$motionrollback 0$/m.test(qcText), `no rollback, so a walk's travel comes out in one straight line:\n${qcText}`);
  sure(!/fadein/.test(qcText), "a model that is not a view model keeps Source's fades");
  const gun = smak.buildMdl({
    name: "v_thing.mdl",
    bones: portBones,
    bodyparts: [{ name: "body", models: [{ name: "gun", meshes: [{ tris: [tri(0)], texture: plain("gun.bmp") }] }] }],
    sequences: [
      // the gun turned a quarter about z in its first animation: its forward is the bone's -y
      { name: "idle", fps: 10, loops: true, frames: [[[0, 0, 0, 0, 0, Math.PI / 2], [2, 0, 0, 0, 0, 0]]] },
      { name: "lunge", fps: 10, frames: [still, still, still], movement: [30, 0, 0] },
      { name: "shoot", fps: 10, frames: [still] },
      { name: "shoot_empty", fps: 10, frames: [still] },
      { name: "deploy", fps: 10, frames: [still] },
      { name: "attack1miss", fps: 10, frames: [still] },
      { name: "reload", fps: 10, frames: [still], activity: 3 },
    ],
    attachments: [{ name: "", bone: "arm", pos: [0, -5, 0] }, { name: "", bone: "arm", pos: [0, 1, 0] }],
  });
  const view = source.portToSource(gun, { name: "v_thing" });
  const viewQc = view.files.find((f) => f.path === view.qc).data;
  sure(/\$sequence "lunge" "anims\/lunge\.smd" fps 10 fadein 0 fadeout 0\n/.test(viewQc), `the one-shot with no LX, and no fades:\n${viewQc}`);
  const lunge = view.files.find((f) => f.path === "src/anims/lunge.smd").data.split("\n");
  sure(lunge[lunge.indexOf("time 2") + 1] === "0 0 0 0 0 0 0", `the one-shot's root in place: ${lunge[lunge.indexOf("time 2") + 1]}`);
  sure(!/\$collision/.test(viewQc), `a view model collides as nothing: it never touches the world:\n${viewQc}`);
  for (const [name, activity] of [["idle", "ACT_VM_IDLE"], ["shoot", "ACT_VM_PRIMARYATTACK"], ["shoot_empty", "ACT_VM_DRYFIRE"], ["deploy", "ACT_VM_DRAW"], ["attack1miss", "ACT_VM_MISSCENTER"]]) // prettier-ignore
    sure(new RegExp(`\\$sequence "${name}" [^\\n]*activity ${activity} 1`).test(viewQc), `${name} given ${activity} by its name:\n${viewQc}`); // prettier-ignore
  sure(/\$sequence "reload" [^\n]*activity ACT_WALK 1/.test(viewQc) && !/"lunge" [^\n]*activity/.test(viewQc), "its own activity kept; a name that fits none given none");
  sure(view.warnings.some((w) => /activities by their names.*idle ACT_VM_IDLE, shoot ACT_VM_PRIMARYATTACK/.test(w)), `said: ${view.warnings}`); // prettier-ignore
  sure(/\$attachment "muzzle" "arm_2" 0 -5 0 rotate 0 -90(\.\d+)? 0/.test(viewQc) && /\$attachment "attachment1" "arm_2" 0 1 0 rotate 0 0 0/.test(viewQc), `the first attachment the muzzle, along the gun's forward:\n${viewQc}`); // prettier-ignore
  const told = source.portToSource(gun, { name: "v_thing", kind: "thing" });
  const toldQc = told.files.find((f) => f.path === told.qc).data;
  sure(!/fadein|muzzle|ACT_VM/.test(toldQc), "kind thing keeps the fades, names no muzzle and no activity");
});

test("port: an animation's blends on a pose parameter named by its motion, over GoldSrc's range; four of two axes a grid", () => {
  const down = portBones.map((b) => [...b.pos, 0, -0.5, 0]);
  const up = portBones.map((b) => [...b.pos, 0, 0.5, 0]);
  const aiming = smak.buildMdl({
    name: "aimer.mdl",
    bones: portBones,
    bodyparts: [{ name: "body", models: [{ name: "body", meshes: [{ tris: [tri(0)], texture: plain("skin.bmp") }] }] }],
    sequences: [
      { name: "idle", fps: 10, loops: true, frames: [still] },
      { name: "aim", fps: 10, frames: [down, down], blendFrames: [[up, up]], blendtype: [smak.MOTION.XR, 0], blendstart: [-45, 0], blendend: [60, 0] }, // prettier-ignore
      { name: "shoot", fps: 10, frames: [down], blendFrames: [[up]], blendtype: [smak.MOTION.XR, 0], blendstart: [-50, 0], blendend: [35, 0] }, // prettier-ignore
      { name: "look", fps: 10, frames: [still], blendFrames: [[down], [up], [still]], blendtype: [smak.MOTION.XR, smak.MOTION.YR], blendstart: [-10, -20], blendend: [10, 20] }, // prettier-ignore
    ],
  });
  const read = smak.sequences(aiming)[1];
  sure(read.blends === 2 && read.blendtype[0] === smak.MOTION.XR && read.blendstart[0] === -45 && read.blendend[0] === 60, `the blends written and read: ${JSON.stringify(read)}`); // prettier-ignore
  sure(Math.abs(smak.frameValues(aiming, 1, 0, 1)[0][4] - 0.5) < 0.01, "the second blend's frames, the gun up");
  const port = source.portToSource(aiming, { name: "aimer" });
  const qc = port.files.find((f) => f.path === port.qc).data;
  sure(/^\$poseparameter "blend_xr" -50 60$/m.test(qc) && /^\$poseparameter "blend_yr" -20 20$/m.test(qc), `one pose parameter an axis, over every range on it:\n${qc}`); // prettier-ignore
  sure(qc.indexOf("$poseparameter") < qc.indexOf("$sequence"), "declared before the animations");
  sure(/\$sequence "aim" "anims\/aim\.smd" "anims\/aim_blend1\.smd" blend "blend_xr" -45 60 fps 10/.test(qc), `the aim on it:\n${qc}`); // prettier-ignore
  sure(/\$sequence "look" "anims\/look\.smd" "anims\/look_blend1\.smd" "anims\/look_blend2\.smd" "anims\/look_blend3\.smd" blend "blend_xr" -10 10 blend "blend_yr" -20 20 blendwidth 2 fps 10/.test(qc), `two axes, two by two:\n${qc}`); // prettier-ignore
  const up1 = port.files.find((f) => f.path === "src/anims/aim_blend1.smd").data;
  sure(up1.includes("0 0 0 0 0 0.5 0"), `the second blend's frames written: ${up1}`);
  sure(!port.warnings.some((w) => /blend/.test(w)), `no blend left: ${port.warnings}`);
  sure(port.facts.blends.length === 3 && port.facts.poses.join() === "blend_xr,blend_yr", `held to the compiled model: ${JSON.stringify(port.facts.blends)}`); // prettier-ignore
  const three = source.blendingOf({ name: "x", blends: 3, blendtype: [smak.MOTION.XR, 0], blendstart: [-1, 0], blendend: [1, 0] });
  sure(three.count === 2 && /first 2 blends of 3/.test(three.left), `three blends: the first two, said: ${JSON.stringify(three)}`);
  const flat = source.blendingOf({ name: "x", blends: 2, blendtype: [0, 0], blendstart: [0, 0], blendend: [0, 0] });
  sure(flat.count === 1 && /one value/.test(flat.left) && source.blendingOf({ blends: 2, blendtype: [0, 0], blendstart: [0, 0], blendend: [1, 0] }).axes[0].pose === "blend", "a range of nothing left, a blend of no motion named blend"); // prettier-ignore
});

test("comparePort: a loop's travel in pieces, or not as far, a blend lost, a view model that fades", () => {
  const facts = { bones: [], sequences: [], materials: [], bodygroups: [], skins: 1, attachments: [], hitboxes: 0, travels: [{ name: "walk", movement: [30, 0, 0] }], blends: [{ name: "aim", count: 2, poses: ["blend_xr"] }], poses: ["blend_xr"], view: true }; // prettier-ignore
  const seq = (name, animations, more = {}) => ({ name, animations, blends: animations.length, params: [], fadein: 0, fadeout: 0, ...more });
  const compiled = (walk, aim, poses, fade = 0) => ({
    version: 48, bones: [], materials: [], bodyparts: [], skins: [[]], attachments: [], hitboxes: [], cdmaterials: [], poses, // prettier-ignore
    sequences: [seq("walk", [0], { fadein: fade }), aim],
    animations: [{ name: "@walk", movements: walk }, { name: "@aim", movements: [] }, { name: "@aim", movements: [] }],
  });
  const whole = compiled([{ position: [30, 0, 0] }], seq("aim", [1, 2], { params: [{ pose: 0, start: -45, end: 45 }] }), [{ name: "blend_xr" }]); // prettier-ignore
  sure(source.comparePort(facts, whole).passed, `whole: ${source.comparePort(facts, whole).faults}`);
  const bent = source.comparePort(facts, compiled([{ position: [20, 0, 0] }, { position: [10, 0, 0] }], whole.sequences[1], whole.poses)); // prettier-ignore
  sure(/animation walk travels 30\.00 0\.00 0\.00 in 2 pieces, where GoldSrc took out 30\.00 0\.00 0\.00 in one straight line/.test(bent.faults.join("\n")), bent.faults.join("\n")); // prettier-ignore
  const short = source.comparePort(facts, compiled([{ position: [25, 0, 0] }], whole.sequences[1], whole.poses));
  sure(/travels 25\.00/.test(short.faults.join("\n")), short.faults.join("\n"));
  const flat = source.comparePort(facts, compiled([{ position: [30, 0, 0] }], seq("aim", [1]), []));
  sure(/a pose parameter lost: blend_xr/.test(flat.faults.join("\n")) && /animation aim blends 1 on nothing, where it had 2 on blend_xr/.test(flat.faults.join("\n")), flat.faults.join("\n")); // prettier-ignore
  const fading = source.comparePort(facts, compiled([{ position: [30, 0, 0] }], whole.sequences[1], whole.poses, 0.2));
  sure(/a view model's animations fade in or out: walk/.test(fading.faults.join("\n")), fading.faults.join("\n"));
});

test("port: the sounds events play moved under the port's folder, copied from the mod's sound/ or valve's, one not there said", () => {
  const game = join(folder, "game");
  const stepper = smak.buildMdl({
    name: "stepper.mdl",
    bones: portBones,
    bodyparts: [{ name: "body", models: [{ name: "body", meshes: [{ tris: [tri(0)], texture: plain("skin.bmp") }] }] }],
    sequences: [
      { name: "walk", fps: 10, loops: true, frames: [still, still], events: [
        { frame: 0, event: 1004, options: "common\\Step1.wav" },
        { frame: 1, event: 5004, options: "*mod/hum.wav" },
        { frame: 1, event: 1008, options: "!HG_ALERT" },
        { frame: 1, event: 1004, options: "gone/away.wav" },
        { frame: 1, event: 2001, options: "not/a/sound.wav" },
      ] }, // prettier-ignore
    ],
  });
  const port = source.portToSource(stepper, { name: "stepper", folder: "mine" });
  const qc = port.files.find((f) => f.path === port.qc).data;
  sure(/event 1004 0 "mine\/common\/step1\.wav"/.test(qc) && /event 5004 1 "\*mine\/mod\/hum\.wav"/.test(qc), `the sounds under mine/:\n${qc}`); // prettier-ignore
  sure(/event 1008 1 "!HG_ALERT"/.test(qc) && /event 2001 1 "not\/a\/sound\.wav"/.test(qc), "a sentence and an event that plays no sound kept as they were");
  sure(port.sounds.length === 3 && port.sounds[0].from === "common/Step1.wav", `the sounds listed: ${JSON.stringify(port.sounds)}`);
  mkdirSync(join(game, "mymod", "models"), { recursive: true });
  mkdirSync(join(game, "mymod", "sound", "mod"), { recursive: true });
  mkdirSync(join(game, "valve", "sound", "common"), { recursive: true });
  // valve's step as Half-Life's are, 8-bit at 22050, which Source plays as it is; the mod's hum at 48000, which it
  // plays silently
  const tone = (n, rate) => Float32Array.from({ length: n }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / rate));
  const step = smak.audio.writeWav(tone(2205, 22050), { rate: 22050, bits: 8 });
  // (writeWav writes no rate the engines refuse: one written at 44100, its header said 48000)
  const humming = smak.audio.writeWav(tone(4800, 48000), { rate: 44100 });
  humming.writeUInt32LE(48000, 24);
  humming.writeUInt32LE(48000 * 2, 28);
  writeFileSync(join(game, "mymod", "sound", "mod", "hum.wav"), humming);
  writeFileSync(join(game, "valve", "sound", "common", "Step1.wav"), step);
  const file = join(game, "mymod", "models", "stepper.mdl");
  writeFileSync(file, stepper);
  sure(source.soundFoldersOf(file).length === 2, `the mod's sounds, then valve's: ${source.soundFoldersOf(file)}`);
  const out = join(folder, "stepper");
  const result = source.portToGmod(file, { out, folder: "mine", compile: false });
  sure(readFileSync(join(out, "addon", "sound", "mine", "common", "step1.wav")).equals(step), "valve's step copied as it was, its name in lower case");
  const hum = smak.audio.readWav(readFileSync(join(out, "addon", "sound", "mine", "mod", "hum.wav")));
  sure(hum.rate === 44100 && hum.bits === 16 && Math.abs(hum.samples - 4410) <= 1, `the mod's own at 48000 rewritten at 44100, as long: ${hum.rate} Hz, ${hum.samples}`); // prettier-ignore
  sure(result.warnings.some((w) => /Source would not play as it was .*: mod\/hum\.wav \(48000 Hz 16-bit\)/.test(w)), `the rewritten one said: ${result.warnings.join("\n")}`); // prettier-ignore
  sure(source.sourceWav(Buffer.from("RIFF junk")).unread && !source.sourceWav(step).bytes, "one not a WAVE file left as it is; one Source plays, too");
  sure(result.sounds.length === 2 && result.warnings.some((w) => /a sound its events play not found in .*: gone\/away\.wav/.test(w)), `the one not there said: ${result.warnings.join("\n")}`); // prettier-ignore
});

// ── a biped as Half-Life's players are: its hand turned half round from Valve's, by where its thumb stands ──
const bipedBones = [
  { name: "Bip01", parent: -1, pos: [0, 0, 3], rot: [0, 0, 0] },
  { name: "Bip01 Spine", parent: 0, pos: [0, 0, 4], rot: [0, 0, 0] },
  { name: "Bip01 R Arm1", parent: 1, pos: [0, -6, 20], rot: [0, 0, -1.2] },
  { name: "Bip01 R Hand", parent: 2, pos: [10, 0, 0], rot: [0.4, 0.1, 0.2] },
  { name: "Bip01 R Finger0", parent: 3, pos: [1.53, 0.11, 1.66], rot: [0.3, 0, 0.5] },
  { name: "Bip01 L Leg1", parent: 0, pos: [0, 4, -20], rot: [0, 0, 0] },
  { name: "Dummy01", parent: 1, pos: [0, 0, 10], rot: [0, 0, 0] },
];

test("valveBiped: Half-Life's biped names made Valve's, a hand turned by its thumb and nothing moved", () => {
  const names = [["Bip01", "ValveBiped.Bip01"], ["Bip01 Pelvis", "ValveBiped.Bip01_Pelvis"], ["Bip01 L Arm", "ValveBiped.Bip01_L_Clavicle"], ["Bip01 R Arm1", "ValveBiped.Bip01_R_UpperArm"], ["Bip01 R Arm2", "ValveBiped.Bip01_R_Forearm"], ["Bip01 L Leg", "ValveBiped.Bip01_L_Thigh"], ["Bip01 L Leg1", "ValveBiped.Bip01_L_Calf"], ["Bip01 Spine3", "ValveBiped.Bip01_Spine4"], ["Bip01 Neck", "ValveBiped.Bip01_Neck1"], ["Bip01 Head", "ValveBiped.Bip01_Head1"], ["Bip01 R Finger01", "ValveBiped.Bip01_R_Finger01"], ["Bip01 L UpperArm", "ValveBiped.Bip01_L_UpperArm"]]; // prettier-ignore
  for (const [goldsrc, valve] of names) sure(source.valveBipedName(goldsrc) === valve, `${goldsrc}: ${source.valveBipedName(goldsrc)}`);
  sure(source.valveBipedName("Dummy01") === null && source.valveBipedName("Bip01 R") === null, "a bone of no biped's: none");
  const rig = source.valveBiped(bipedBones, { player: true });
  sure(rig.rolls.length === 1 && rig.rolls[0].degrees === 180 && rig.rolls[0].measured, `the hand turned half round, measured: ${JSON.stringify(rig.rolls)}`); // prettier-ignore
  sure(rig.kept.join() === "Dummy01" && rig.named.length === 6, `renamed: ${rig.named}; kept: ${rig.kept}`);
  const thumb = rig.skeleton[4];
  near((Math.atan2(thumb.pos[2], thumb.pos[1]) * 180) / Math.PI, -93.8, 0.1, "the thumb where Valve's stands, near -105");
  sure(rig.skeleton.at(-1).name === "ValveBiped.Anim_Attachment_RH" && rig.skeleton.at(-1).parent === 3 && rig.attachments[0].name === "anim_attachment_RH", "the hand's attachment bone and attachment"); // prettier-ignore
  // every bone where it was, every frame: only the hand's own axes turned, about its x
  const values = bipedBones.map((b) => [...b.pos, ...b.rot]);
  const was = smak.poseOfValues(values, bipedBones.map((b) => b.parent));
  const now = smak.poseOfValues(rig.frame(values), rig.skeleton.map((b) => b.parent));
  for (let bone = 0; bone < bipedBones.length; bone++)
    for (let row = 0; row < 3; row++)
      for (let column = 0; column < 4; column++)
        if (bone !== 3 || column === 0 || column === 3) near(now[bone][row][column], was[bone][row][column], 1e-9, `bone ${bone} [${row}][${column}]`); // prettier-ignore
  near(now[3][0][1], -was[3][0][1], 1e-9, "the hand's y turned half round");
  const p = rig.point(3, [1, 2, 3]);
  near(p[1], -2, 1e-9, "a place in the hand's space turned with it");
  near(p[2], -3, 1e-9, "and its z");
  sure(rig.point(2, [1, 2, 3])[1] === 2, "a place in another bone's space as it was");
  const box = rig.box(3, [0, -1, 0], [2, 1, 3]);
  near(box.min[2], -3, 1e-9, "a box on the hand, its z turned");
  near(box.max[2], 0, 1e-9, "and its top");
  const held = source.valveBiped(bipedBones.filter((b) => b.name !== "Bip01 R Finger0" && b.name !== "Dummy01"));
  sure(held.rolls[0].degrees === 180 && !held.rolls[0].measured && /no thumb/.test(held.warnings[0]) && !held.attachments.length, `a held model: Half-Life's turn, said, no attachments: ${held.warnings}`); // prettier-ignore
  sure(source.valveBiped(bipedBones, { handRoll: 0 }).rolls.length === 0, "handRoll 0: the hands left as they are");
});

test("port: a player made Valve's biped, standing on its feet, lit from its middle, with copies from the spine up; a held one collides as nothing", () => {
  const values = bipedBones.map((b) => [...b.pos, ...b.rot]);
  const playerMdl = smak.buildMdl({
    name: "hero.mdl",
    bones: bipedBones,
    bodyparts: [{ name: "body", models: [{ name: "body", meshes: [{ tris: [tri(0, "Bip01"), tri(2, "Bip01 R Hand"), tri(4, "Bip01 Spine")], texture: plain("suit.bmp") }] }] }], // prettier-ignore
    sequences: [
      { name: "idle", fps: 10, loops: true, frames: [values, values], activity: 1 },
      { name: "walk", fps: 10, loops: true, frames: [values, values], activity: 3, movement: [20, 0, 0] },
    ],
    hitboxes: [{ bone: "Bip01 R Hand", group: 0, min: [0, -1, 0], max: [2, 1, 3] }],
    attachments: [{ name: "", bone: "Bip01 R Hand", pos: [1, 2, 3] }],
    eyes: [0, 0, 28],
  });
  const port = source.portToSource(playerMdl, { name: "hero", kind: "player", upper: true });
  const qc = port.files.find((f) => f.path === port.qc).data;
  sure(/\$hbox 0 "ValveBiped\.Bip01_R_Hand" 0 -1 -3 2 1 0/.test(qc), `the hand's hit box turned with it:\n${qc}`);
  sure(/\$attachment "attachment0" "ValveBiped\.Bip01_R_Hand" 1 -2 -3 rotate 0 0 0/.test(qc) && /\$attachment "anim_attachment_RH" "ValveBiped\.Anim_Attachment_RH" 0 0 0/.test(qc), "its attachment turned, GMod's added"); // prettier-ignore
  sure(/^\$illumposition 0 0 36$/m.test(qc) && /^\$eyeposition 0 0 64$/m.test(qc), `lit from its middle, its eyes lifted:\n${qc}`);
  const walk = port.files.find((f) => f.path === "src/anims/walk.smd").data.split("\n");
  sure(walk[walk.indexOf("time 0") + 1] === "0 0 0 39 0 0 0", `its root lifted 36 onto its feet: ${walk[walk.indexOf("time 0") + 1]}`);
  const reference = port.files.find((f) => f.path === "src/body.smd").data.split("\n");
  sure(reference[reference.indexOf("time 0") + 1] === "0 0 0 3 0 0 0", "the reference not lifted: the triangles stay where the original has them");
  sure(/\$weightlist "upper" \{\n\t"ValveBiped\.Bip01" 0\n\t"ValveBiped\.Bip01_Spine" 1\n\t"ValveBiped\.Bip01_R_UpperArm" 1/.test(qc) && /"ValveBiped\.Bip01_L_Calf" 0/.test(qc) && /"ValveBiped\.Anim_Attachment_RH" 1/.test(qc), `the weights from the spine up:\n${qc}`); // prettier-ignore
  sure(/\$sequence "walk_upper" "anims\/walk\.smd" fps 10 loop weightlist "upper"\n/.test(qc) && qc.indexOf('"walk_upper"') > qc.indexOf('$sequence "walk"'), `the copy after the animations, with no activity or travel:\n${qc}`); // prettier-ignore
  sure(port.facts.sequences.includes("idle_upper") && port.facts.kind === "player", "held to the compiled model");
  const heldPort = source.portToSource(playerMdl, { name: "p_gun" });
  const heldQc = heldPort.files.find((f) => f.path === heldPort.qc).data;
  sure(/ValveBiped\.Bip01_R_Hand/.test(heldQc) && !/\$collision|illumposition|anim_attachment_RH|_upper/.test(heldQc), `a held one: Valve's names, nothing to collide, no lift:\n${heldQc}`); // prettier-ignore
  sure(/^\$eyeposition 0 0 28$/m.test(heldQc), "and its eyes as they were");
});

test("port: a view model's sound events played by Lua beside it, not left in the model, which GMod never plays them from", () => {
  const clip = (name, loops) => ({ name, fps: 10, loops, frames: [still, still, still], events: [{ frame: 1, event: 5004, options: "*items\\ClipIn.wav" }, { frame: 2, event: 5001, options: "20" }] }); // prettier-ignore
  const gun = smak.buildMdl({
    name: "v_gun.mdl",
    bones: portBones,
    bodyparts: [{ name: "body", models: [{ name: "body", meshes: [{ tris: [tri(0)], texture: plain("skin.bmp") }] }] }],
    sequences: [{ name: "idle", fps: 10, loops: true, frames: [still] }, clip("reload", false), clip("spin", true)],
  });
  const port = source.portToSource(gun, { name: "v_gun" });
  const qc = port.files.find((f) => f.path === port.qc).data;
  sure(!/event 5004/.test(qc) && /event 5001 2 "20"/.test(qc), `the clip's sound left out of the model, the muzzle's kept:\n${qc}`);
  const lua = port.files.find((f) => f.path === "addon/lua/autorun/client/smak_sounds_smak_v_gun.lua")?.data ?? "";
  sure(lua.includes('SMAK_VIEW_SOUNDS["models/smak/v_gun.mdl"]'), `the Lua, by the model's name as GetModel says it:\n${lua}`);
  sure(lua.includes('[1] = { frames = 3, loops = false, { 1, "smak/items/clipin.wav" } }, -- reload') && lua.includes("[2] = { frames = 3, loops = true,"), `each by its compiled number, frames and loop, its sound under the port's folder:\n${lua}`); // prettier-ignore
  sure(/hook\.Add\("Think", "smak_view_sounds"/.test(lua) && /if SMAK_VIEW_SOUNDS_HOOKED then return end/.test(lua), "one hook for every model's");
  sure(port.sounds.length === 1 && port.sounds[0].to === "smak/items/clipin.wav" && port.viewSounds.length === 2, `the sound still copied: ${JSON.stringify(port.sounds)}`); // prettier-ignore
  sure(port.warnings.some((w) => /reload 1, spin 1\) played by Lua/.test(w)), port.warnings.join("\n"));
  const thing = source.portToSource(gun, { name: "gun" });
  sure(/event 5004 1 "\*smak\/items\/clipin\.wav"/.test(thing.files.find((f) => f.path === thing.qc).data) && !thing.viewSounds.length, "a model not a view model keeps its own"); // prettier-ignore
});

test("port: chrome where GoldSrc draws it, by how each corner faces the eye (R_StudioChrome), with no room's reflection", () => {
  const shiny = { name: "shiny.bmp", width: 64, height: 64, pixels: new Uint8Array(64 * 64).fill(1), palette: new Uint8Array(768).fill(90), flags: 2 }; // prettier-ignore
  // a face to the eye, one up, one aslant, on a bone ahead of the eye
  const faces = [
    [{ p: [10, 0, 0], uv: [0, 0] }, { p: [10, 1, 0], uv: [1, 0] }, { p: [10, 0, 1], uv: [0, 1] }],
    [{ p: [12, 0, 0], uv: [0, 0] }, { p: [13, 0, 0], uv: [1, 0] }, { p: [12, 1, 0], uv: [0, 1] }],
    [{ p: [14, 0, 0], uv: [0, 0] }, { p: [15, 1, 0], uv: [1, 0] }, { p: [14, 0.5, 1], uv: [0, 1] }],
  ].map((t) => t.map((c) => ({ ...c, bone: "Gun" })));
  const shinyMdl = (name) =>
    smak.buildMdl({
      name,
      bones: [{ name: "Gun", parent: -1, pos: [10, 0, 0] }],
      bodyparts: [{ name: "body", models: [{ name: "body", meshes: [{ tris: faces, texture: shiny }] }] }],
      sequences: [{ name: "idle", fps: 10, loops: true, frames: [[[10, 0, 0, 0, 0, 0]]] }],
    });
  // each corner's u v against its normal: the eye's up is -z seen from it, its right +y for a view model (looking
  // along x from the origin) and -y for anything else (seen from in front, looking back)
  for (const [name, side] of [["v_shiny", 1], ["shiny", -1]]) {
    const port = source.portToSource(shinyMdl(`${name}.mdl`), { name });
    const corners = port.files.find((f) => f.path === "src/body.smd").data.split("\n").map((l) => l.trim().split(/\s+/).map(Number)).filter((l) => l.length === 9); // prettier-ignore
    sure(corners.length === 9, `${name}: nine corners: ${corners.length}`);
    for (const [, , , , , ny, nz, u, v] of corners) {
      near(u, (1 + side * ny) / 2, 1e-6, `${name}: u by the normal across the eye`);
      near(v, (1 + nz) / 2, 1e-6, `${name}: v by the normal up`);
    }
    sure(corners.slice(0, 3).every(([, , , , , , , u, v]) => Math.abs(u - 0.5) < 1e-6 && Math.abs(v - 0.5) < 1e-6), `${name}: the face to the eye in the picture's middle`); // prettier-ignore
    const vmt = port.files.find((f) => f.path.endsWith("shiny.vmt")).data;
    sure(!/envmap/.test(vmt), `${name}: no room's reflection:\n${vmt}`);
  }
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
  // its one animation never turns a bone: its joints are not measured, and bend 40 degrees each way
  sure(/\$jointconstrain "chest" y limit -40 40 0/.test(figureQc) && /chest, head: never turned by its animations/.test(said), said);
});

test("port: a ragdoll's joints bend as far as its animations bend them; an axis they never turn is held", () => {
  // the chest bends forward about y from 0 to 60 degrees, and never about x or z; the head never turns on it
  const bend = smak.buildMdl({
    name: "bender.mdl",
    bones: figureBones,
    bodyparts: [{ name: "body", models: [{ name: "bender", meshes: [{ tris: [...cube([-4, -3, 25], [4, 3, 40], "hips"), ...cube([-5, -3, 40], [5, 3, 52], "chest"), ...cube([-2, -2, 52], [2, 2, 58], "head")], texture: plain("cloth.bmp") }] }] }], // prettier-ignore
    sequences: [{ name: "bow", fps: 10, frames: [0, 10, 20, 30, 40, 50, 60].map((deg) => figureBones.map((b) => [...b.pos, 0, b.name === "chest" ? (deg * Math.PI) / 180 : 0, 0])) }], // prettier-ignore
    hitboxes: [
      { bone: "hips", group: 3, min: [-4, -3, -5], max: [4, 3, 10] },
      { bone: "chest", group: 2, min: [-5, -3, 0], max: [5, 3, 12] },
      { bone: "head", group: 1, min: [-2, -2, 0], max: [2, 2, 6] },
    ],
  });
  const b = source.portToSource(bend, { name: "bender" });
  const qc = b.files.find((x) => x.path === b.qc).data;
  // 0 to 60, ten degrees spare each way
  sure(/"chest" x limit 0 0 0/.test(qc) && /"chest" y limit -10 70 0/.test(qc) && /"chest" z limit 0 0 0/.test(qc), qc);
  sure(/"head" y limit -40 40 0/.test(qc) && /head: never turned/.test(b.warnings.join("\n")), qc);
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

// ── a model made for Source (6d): a spec built with engine "source" ──
const crateSpec = (more = {}) => ({
  spec: "smak.model/1",
  name: "crate.mdl",
  kind: "prop",
  materials: { oak: { base: "wood" } },
  parts: [{ id: "body", kind: "box", material: "oak", size: [24, 24, 24] }],
  ...more,
});
/** How many colours a picture has. */
const coloursOf = ({ rgba }) => {
  const seen = new Set();
  for (let i = 0; i < rgba.length; i += 4) seen.add((rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2]);
  return seen.size;
};

test("a spec made for Source: held to Half-Life 2's props, painted on 512, its picture kept in full colour", () => {

  const made = buildModelSpec(crateSpec({ engine: "source" }));
  sure(made.mdl && made.report.ok, made.report.errors.concat(made.report.faults).join("; "));
  const facts = made.report.facts.join("\n");
  sure(/made for Source: .* 512 by 512/.test(facts) && /Half-Life 2's props of this size/.test(facts), facts);
  const [picture] = made.pictures.values();
  sure(picture.width === 512 && picture.height === 512, `${picture.width}x${picture.height}`);
  // the file's texture is cut to 256 colours; the picture beside it is not
  sure(coloursOf(picture) > 256, `${coloursOf(picture)} colours`);
  const goldsrc = buildModelSpec(crateSpec());
  sure(!goldsrc.pictures && /Half-Life's props of this size/.test(goldsrc.report.facts.join("\n")), "a GoldSrc build keeps none, and is held to Half-Life's");
  // a spec's own picture size and budget still bind: a low-poly look is the spec's to choose
  const small = buildModelSpec(crateSpec({ engine: "source", texture: { width: 128, height: 128 }, budget: 12 }));
  sure([...small.pictures.values()][0].width === 128 && small.report.ok, small.report.faults.join("; "));
});

test("a spec's engine: goldsrc or source; a Source weapon is refused; check holds the file to Source's limits", () => {

  sure(/engine: "goldsrc" or "source"/.test(validateModelSpec(crateSpec({ engine: "xash" })).errors.join("\n")), "xash refused");
  const weapon = validateModelSpec(crateSpec({ engine: "source", weapon: { kind: "sword" } })).errors.join("\n");
  sure(/a Source weapon is not made yet/.test(weapon), weapon);
  const big = smak.buildMdl({ name: "big.mdl", bodyparts: [{ name: "body", models: [{ name: "big", meshes: [{ tris: cube([0, 0, 0], [8, 8, 8]), texture: smak.indexed({ width: 1024, height: 1024, rgb: new Uint8Array(1024 * 1024 * 3).fill(90) }, "big.bmp") }] }] }] }); // prettier-ignore
  sure(smak.check(big, "goldsrc").warnings.some((w) => /larger than 512/.test(w)), "GoldSrc shrinks a 1024 picture");
  sure(!smak.check(big, "source").warnings.some((w) => /larger than/.test(w)), smak.check(big, "source").warnings.join("; "));
});

testCompiled("compiled: smak build --engine source writes the addon, compiled and whole, its texture in full colour", () => {
  const specFile = join(folder, "crate.json");
  writeFileSync(specFile, JSON.stringify(crateSpec()));
  const out = join(folder, "crate");
  const said = runSmak("build", specFile, "-o", out, "--engine", "source");
  sure(/built, and every check passed/.test(said) && /Source: collides as 1 solid, [\d.]+ kg, wood/.test(said), said);
  sure(existsSync(join(out, "crate-source-sheet.png")), "the compiled model drawn");
  const vtf = source.readVtf(readFileSync(join(out, "crate_source", "addon", "materials", "models", "smak", "crate", "crate_sheet0.vtf")));
  sure(vtf.width === 512 && coloursOf(vtf) > 256, `${vtf.width}x${vtf.height}, ${coloursOf(vtf)} colours`);
});

test("port: bind writes the model bound in a frame's pose: its rest, its ragdoll's pose and its joints' zero", () => {
  // the chest's first frame bends 30 degrees about y from its rest
  const leaning = smak.buildMdl({
    name: "leaning.mdl",
    bones: figureBones,
    bodyparts: [{ name: "body", models: [{ name: "leaning", meshes: [{ tris: [...cube([-4, -3, 25], [4, 3, 40], "hips"), ...cube([-5, -3, 40], [5, 3, 52], "chest"), ...cube([-2, -2, 52], [2, 2, 58], "head")], texture: plain("cloth.bmp") }] }] }], // prettier-ignore
    sequences: [{ name: "lean", fps: 10, frames: [0, 10].map((deg) => figureBones.map((b) => [...b.pos, 0, b.name === "chest" ? ((30 + deg) * Math.PI) / 180 : 0, 0])) }], // prettier-ignore
    hitboxes: [
      { bone: "hips", group: 3, min: [-4, -3, -5], max: [4, 3, 10] },
      { bone: "chest", group: 2, min: [-5, -3, 0], max: [5, 3, 12] },
    ],
  });
  const atRest = source.portToSource(leaning, { name: "leaning" });
  const bound = source.portToSource(leaning, { name: "leaning", bind: { seq: 0, frame: 0 } });
  const skeletonOf = (port) => port.files.find((f) => f.path === "src/leaning.smd").data.match(/skeleton\r?\ntime 0\r?\n([\s\S]*?)end/)[1];
  sure(/^1 0 0 10 0 0 0$/m.test(skeletonOf(atRest)), skeletonOf(atRest));
  sure(/^1 0 0 10 0 0\.523599 0$/m.test(skeletonOf(bound)), skeletonOf(bound));
  // measured from the lean: the chest turns 0 to 10 degrees further, so its joint bends -10 to 20 about y
  const qc = bound.files.find((f) => f.path === bound.qc).data;
  sure(/"chest" y limit -10 20 0/.test(qc), qc);
});
