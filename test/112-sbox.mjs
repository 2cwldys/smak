// s&box (src/sbox/): the DMX of a mesh and of an animation, KV3 text, ModelDoc's document and a material, a GoldSrc
// model ported (its files, what is renamed and why), and a port compiled by s&box's resourcecompiler.
//
// No game: every model is made here. The compile runs where s&box is found (a Steam library, SMAK_SBOX or
// FACEPUNCH_ENGINE), and is said to be skipped where it is not, as GMod's studiomdl's cases are.
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import * as smak from "../src/index.mjs";
import { turned, turnOfQuaternion } from "../src/import-math.mjs";
import { test, sure, near, tmp, runSmak } from "./helper.mjs";

const { sbox } = smak;
const folder = join(tmp, "sbox");
mkdirSync(folder, { recursive: true });

// ── DMX ──
const bones = [
  { name: "Bip01", parent: -1 },
  { name: "Bip01 Pelvis", parent: 0 },
];
const rest = [
  [0, 0, 40, 0, 0, -Math.PI / 2],
  [0, 0, 2, 0.1, 0.2, 0.3],
];
const corner = (p, uv, bone = 1) => ({ bone, p, n: [0, 0, 1], uv });
const triangles = [
  {
    material: "skin",
    corners: [corner([0, 0, 0], [0, 0]), corner([1, 0, 0], [1, 0]), corner([0, 1, 0], [0, 1])],
  },
  {
    material: "skin",
    corners: [corner([1, 0, 0], [1, 0]), corner([1, 1, 0], [1, 1]), corner([0, 1, 0], [0, 1])],
  },
  {
    material: "metal",
    corners: [corner([0, 0, 1], [0, 0], 0), corner([1, 0, 1], [1, 0], 0), corner([0, 1, 1], [0, 1], 0)],
  },
];
/** An attribute's array in a DMX's text: its items, as written (the attribute, not an item of vertexFormat's list
 * that names it). */
const arrayOf = (text, key) => {
  const at = text.search(new RegExp(`"${key.replace(/\$/g, "\\$")}" "\\w+_array"`));
  const open = text.indexOf("[", at);
  return text
    .slice(open + 1, text.indexOf("]", open))
    .split(",")
    .map((s) => s.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
};

test("quaternionOf: a bone's three angles turn as Rz Ry Rx, GoldSrc's order", () => {
  for (const angles of [
    [0.3, -0.7, 1.9],
    [Math.PI / 2, 0, 0],
    [0, 0, -Math.PI / 2],
  ]) {
    const q = sbox.quaternionOf(angles);
    const want = turned(
      angles.map((a) => (a * 180) / Math.PI),
      "xyz",
    );
    const got = turnOfQuaternion(q);
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++) near(got[r][c], want[r][c], 1e-9, `row ${r} column ${c} of ${angles}`);
  }
});

test("dmxOf: a mesh is keyvalues2, model 22, s&box's axes; its bones' names as s&box keeps them; a face set a material", () => {
  const text = sbox.dmxOf({ bones, frames: [rest], triangles }, { name: "body" });
  sure(text.startsWith("<!-- dmx encoding keyvalues2 4 format model 22 -->"), text.slice(0, 80));
  sure(
    /"forwardParity" "int" "1"/.test(text) && /"upAxis" "int" "3"/.test(text),
    "z up, forwardParity 1: nothing turned",
  );
  sure(
    /"name" "string" "Bip01_Pelvis"/.test(text) && !/Bip01 Pelvis/.test(text),
    "Bip01 Pelvis written Bip01_Pelvis",
  );
  sure(
    (text.match(/"DmeJoint"/g) ?? []).length === 2 && /"jointList" "element_array"/.test(text),
    "two joints, and their list",
  );
  // the pelvis's place from its parent, its angles as a quaternion
  const q = sbox.quaternionOf([0.1, 0.2, 0.3]).map((v) => v.toFixed(6).replace(/\.?0+$/, ""));
  sure(
    text.includes(`"orientation" "quaternion" "${q.join(" ")}"`),
    `the pelvis's orientation ${q.join(" ")}`,
  );
  // 9 corners, of 5 places (the second triangle shares two of the first's, the third is on another bone)
  sure(arrayOf(text, "position$0").length === 7 && arrayOf(text, "position$0Indices").length === 9, `positions kept once: ${arrayOf(text, "position$0").length}`); // prettier-ignore
  sure(/"jointCount" "int" "1"/.test(text) && arrayOf(text, "blendindices$0").join(",") === "1,1,1,1,0,0,0", `each corner on its bone: ${arrayOf(text, "blendindices$0")}`); // prettier-ignore
  sure(/"flipVCoordinates" "bool" "1"/.test(text), "v from the picture's bottom, as the SMD's");
  const faces = arrayOf(text, "faces");
  sure(faces.join(",") === "0,1,2,-1,3,4,5,-1", `skin's face set, -1 after each triangle: ${faces}`);
  sure(
    /"mtlName" "string" "skin"/.test(text) && /"mtlName" "string" "metal"/.test(text),
    "a face set each material",
  );
  sure(
    text === sbox.dmxOf({ bones, frames: [rest], triangles }, { name: "body" }),
    "the same input writes the same file (its ids too)",
  );
});

test("dmxOf: an animation keys each bone's position and orientation at each frame's time on its joint's transform", () => {
  const frames = [rest, rest.map((six) => [six[0] + 3, ...six.slice(1)]), rest];
  const text = sbox.dmxOf({ bones, frames }, { fps: 15, name: "walk" });
  sure(
    /"DmeChannelsClip"/.test(text) && /"frameRate" "float" "15"/.test(text),
    "a clip at 15 frames a second",
  );
  sure((text.match(/"DmeChannel"/g) ?? []).length === 4, "a position and an orientation channel each bone");
  sure(
    arrayOf(text, "times").join(",") === "0.0000,0.0667,0.1333",
    `its keys' times: ${arrayOf(text, "times")}`,
  );
  sure(/"duration" "time" "0.1333"/.test(text), "its length: the last frame's time");
  // the root's first channel moves it 3 along x at the second frame
  sure(
    arrayOf(text, "values").join("|") === "0 0 40|3 0 40|0 0 40",
    `the root's places: ${arrayOf(text, "values").join("|")}`,
  );
  // each channel names the transform of its joint (an id written in the skeleton above it)
  const target = text.match(/"toElement" "element" "([0-9a-f-]+)"/)[1];
  sure(
    text.indexOf(`"id" "elementid" "${target}"`) < text.indexOf('"toElement"'),
    "the channel's transform is the skeleton's",
  );
  for (const bad of [
    { bones: [], frames },
    { bones, frames: [] },
  ]) {
    let said = "";
    try {
      sbox.dmxOf(bad);
    } catch (error) {
      said = error.message;
    }
    sure(/one at least/.test(said), said);
  }
});

// ── KV3, the document, the material ──
test("kv3: floats keep their point, ints are marked, lists and objects nest as ModelDoc writes them", () => {
  const text = sbox.kv3({
    a: 1,
    b: sbox.KV3_INT(-1),
    c: 'x"y',
    d: [1, 2, 3],
    e: [{ f: true }],
    g: [],
    h: undefined,
  });
  sure(/a = 1\.0/.test(text) && /b = -1\n/.test(text) && /c = "x'y"/.test(text), text);
  sure(
    /d = \[ 1\.0, 2\.0, 3\.0 \]/.test(text) && /e = \[\n\t\t\{\n\t\t\tf = true\n\t\t\},\n\t\]/.test(text),
    text,
  );
  sure(/g = \[  \]/.test(text) && !/h =/.test(text), "an empty list; nothing written for undefined");
});

test("vmatOf: complex.shader's; masked alpha-tested on its mask, additive added, fullbright lit by itself", () => {
  const plainText = sbox.vmatOf({ color: "materials/a.png" });
  sure(/shader "shaders\/complex.shader"/.test(plainText) && /TextureColor "materials\/a.png"/.test(plainText) && !/F_/.test(plainText), plainText); // prettier-ignore
  const masked = sbox.vmatOf({ color: "a.png", mask: "a_mask.png", flags: 64 });
  sure(/F_ALPHA_TEST 1/.test(masked) && /TextureTranslucency "a_mask.png"/.test(masked), masked);
  sure(
    /F_ADDITIVE_BLEND 1/.test(sbox.vmatOf({ color: "a.png", flags: 32 })) &&
      /F_SELF_ILLUM 1/.test(sbox.vmatOf({ color: "a.png", flags: 4 })),
    "the flags",
  );
});

// ── a GoldSrc model ported: two bones (named alike in any case), a bodypart of two submodels (one blank), a skin, a
// masked texture, an attachment, a hit box, two animations of one name, a walk that travels, events ──
const plain = (name, flags = 0, colour = 128) => ({ name, width: 6, height: 4, pixels: new Uint8Array(24).fill(1), palette: new Uint8Array(768).fill(colour), flags }); // prettier-ignore
const tri = (x, bone = "Arm") => [
  { p: [x, 0, 0], uv: [0, 0], bone },
  { p: [x + 1, 0, 0], uv: [1, 0], bone },
  { p: [x, 0, 1], uv: [0, 1], bone },
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
    {
      name: "body",
      models: [
        { name: "Body-Ref", meshes: [{ tris: [tri(0), tri(2, "arm")], texture: plain("Skin One.bmp") }] },
      ],
    },
    {
      name: "gun",
      models: [
        { name: "gun", meshes: [{ tris: [tri(-3)], texture: plain("leaves.bmp", 64) }] },
        { name: "none", meshes: [] },
      ],
    },
  ],
  sequences: [
    { name: "idle", fps: 10, loops: true, frames: [still], activity: 1, actweight: 1 },
    { name: "walk", fps: 10, loops: true, frames: [still, still, still], activity: 3, actweight: 1, movement: [30, 0, 0], events: [{ frame: 1, event: 1004, options: "common\\step1.wav" }] }, // prettier-ignore
    { name: "Idle", fps: 10, frames: [still, still] },
  ],
  attachments: [{ name: "", bone: "arm", pos: [1, 2, 3] }],
  hitboxes: [{ bone: "Arm", group: 2, min: [0, -1, -1], max: [3, 1, 1] }],
  skins: [{ "Skin One.bmp": plain("Skin Two.bmp", 0, 200) }],
});
const port = sbox.portToSbox(portable, { name: "Portable Thing" });
const fileOf = (path) => port.files.find((f) => f.path === path)?.data;
const vmdl = String(fileOf(port.vmdl));

test("portToSbox: the files as an s&box project's Assets has them: a .vmdl, a DMX each submodel and animation, PNG and .vmat", () => {
  sure(
    port.vmdl === "models/smak/portable_thing.vmdl" && vmdl.startsWith("<!-- kv3 encoding:text"),
    port.vmdl,
  );
  const paths = port.files.map((f) => f.path);
  for (const path of [
    "models/smak/portable_thing/body-ref.dmx",
    "models/smak/portable_thing/gun.dmx",
    "models/smak/portable_thing/anims/walk.dmx",
    "materials/models/smak/portable_thing/skin_one.png",
    "materials/models/smak/portable_thing/skin_one.vmat",
    "materials/models/smak/portable_thing/leaves_mask.png",
  ])
    sure(paths.includes(path), `${path} in ${paths.join(", ")}`);
  sure(
    String(fileOf("models/smak/portable_thing/body-ref.dmx")).includes('"mtlName" "string" "skin_one"'),
    "the mesh names its material",
  );
  sure(
    /F_ALPHA_TEST 1/.test(fileOf("materials/models/smak/portable_thing/leaves.vmat")),
    "the masked texture alpha-tested",
  );
  sure(/bone_cull_type = "None"/.test(vmdl), "no bone dropped: the compiler drops one no vertex is on");
});

test("portToSbox: a mesh's node named with no hyphen; bodygroups with a blank; a skin a material group; names as s&box keeps them", () => {
  sure(/_class = "RenderMeshFile"\n\t+name = "body_ref"\n\t+filename = "models\/smak\/portable_thing\/body-ref\.dmx"/.test(vmdl), "Body-Ref's node body_ref, its file kept"); // prettier-ignore
  sure(/name = "gun"\n\t+children = \[\n[^\]]*name = "gun"\n\t+meshes = \[\n\t+"gun",/.test(vmdl) && /name = "blank1"\n\t+meshes = \[  \]/.test(vmdl), "gun's two choices, the second blank"); // prettier-ignore
  sure(/_class = "MaterialGroup"\n\t+name = "skin1"/.test(vmdl) && /from = "materials\/models\/smak\/portable_thing\/skin_one\.vmat"\n\t+to = "materials\/models\/smak\/portable_thing\/skin_two\.vmat"/.test(vmdl), "skin 1: skin_one becomes skin_two"); // prettier-ignore
  sure(/parent_bone = "arm_2"/.test(vmdl) && /tags = "hitgroup_2"/.test(vmdl) && /hitbox_mins = \[ 0\.0, -1\.0, -1\.0 \]/.test(vmdl), "the attachment on arm_2 (arm made unique), the hit box in group 2"); // prettier-ignore
  sure(
    port.facts.skins === 2 && port.facts.bodygroups.length === 2 && port.facts.attachments.length === 1,
    JSON.stringify(port.facts),
  );
});

test("portToSbox: an animation's fps, loop and activity; a walk's travel taken out as root motion; an event kept as a generic one", () => {
  sure(
    /name = "walk"[\s\S]*?_class = "ExtractMotion"\n\t+extract_tx = true\n\t+extract_ty = false/.test(vmdl),
    "walk's travel along x extracted",
  );
  sure(/root_bone_name = "Arm"/.test(vmdl), "on its root bone");
  sure(/event_class = "AE_GENERIC_EVENT"\n\t+event_frame = 1\n\t+event_keys = \{\n\t+TypeName = "goldsrc"\n\t+Int = 1004\n\t+StringData = "smak\/common\/step1\.wav"/.test(vmdl), "the step: 1004 at frame 1, its sound's path"); // prettier-ignore
  sure(
    /activity_name = "ACT_WALK"/.test(vmdl) && /looping = true/.test(vmdl) && /framerate = 10\.0/.test(vmdl),
    "ACT_WALK, looping, at 10",
  );
  sure(
    port.facts.sequences.join(",") === "idle,walk,Idle_2",
    `the second Idle renamed as Source's port does: ${port.facts.sequences}`,
  );
  sure(
    port.warnings.some((w) => /1 events kept as s&box's generic ones/.test(w)),
    port.warnings.join("\n"),
  );
});

// ── its sounds: a game's sound folder with a step, a loop and a clip; one the folder has not ──
const soundsFolder = join(folder, "game-sound");
const within = (value, expected, tolerance) => Math.abs(value - expected) <= tolerance;
const tone = (n, rate, every = 20) => Float32Array.from({ length: n }, (_, i) => 0.5 * Math.sin(i / every) * (1 - i / n));
mkdirSync(join(soundsFolder, "common"), { recursive: true });
mkdirSync(join(soundsFolder, "weapons"), { recursive: true });
writeFileSync(join(soundsFolder, "common", "step1.wav"), smak.audio.writeWav(tone(2205, 11025), { rate: 11025, bits: 8 }));
writeFileSync(join(soundsFolder, "weapons", "hum.wav"), smak.audio.writeWav(tone(22050, 22050), { rate: 22050, bits: 8, loop: 11025 })); // prettier-ignore
writeFileSync(join(soundsFolder, "weapons", "clip.wav"), smak.audio.writeWav(tone(4410, 22050), { rate: 22050 }));
const sounder = smak.buildMdl({
  name: "sounder.mdl",
  bones: portBones,
  bodyparts: [{ name: "body", models: [{ name: "body", meshes: [{ tris: [tri(0)], texture: plain("skin.bmp") }] }] }],
  sequences: [
    { name: "walk", fps: 10, loops: true, frames: [still, still, still], events: [{ frame: 1, event: 1004, options: "common\\step1.wav" }, { frame: 2, event: 1008, options: "*weapons/hum.wav" }] }, // prettier-ignore
    { name: "reload", fps: 10, frames: [still, still], events: [{ frame: 0, event: 5004, options: "weapons/clip.wav" }, { frame: 1, event: 1004, options: "common/gone.wav" }, { frame: 1, event: 5001, options: "10" }] }, // prettier-ignore
    { name: "idle", fps: 10, frames: [still] },
  ],
  attachments: [{ name: "", bone: "arm", pos: [1, 2, 3] }],
});
const sounded = sbox.portToSbox(sounder, { name: "sounder", sounds: [soundsFolder] });
const sounderVmdl = String(sounded.files.find((f) => f.path === sounded.vmdl).data);
const soundFile = (path) => sounded.files.find((f) => f.path === path)?.data;

test("portToSbox: the sounds its events play as .sound assets under sounds/<folder>/, heard as far as GoldSrc heard them; a loop told in its .meta", () => {
  const paths = sounded.files.map((f) => f.path);
  for (const path of ["sounds/smak/common/step1.wav", "sounds/smak/common/step1.sound", "sounds/smak/weapons/hum.wav", "sounds/smak/weapons/hum.wav.meta", "sounds/smak/weapons/clip.sound"]) // prettier-ignore
    sure(paths.includes(path), `${path} in ${paths.filter((p) => p.startsWith("sounds")).join(", ")}`);
  sure(!paths.includes("sounds/smak/common/step1.wav.meta"), "a sound that does not loop has no .meta");
  sure(soundFile("sounds/smak/common/step1.wav").equals(readFileSync(join(soundsFolder, "common", "step1.wav"))), "the .wav kept as it is"); // prettier-ignore
  const step = JSON.parse(soundFile("sounds/smak/common/step1.sound"));
  sure(step.Sounds[0] === "sounds/smak/common/step1.vsnd" && step.Distance === 500, `a monster's step at ATTN_IDLE, 500 units: ${JSON.stringify(step)}`); // prettier-ignore
  sure(step.Falloff.length === 2 && step.Falloff.every((p) => p.mode === "Linear") && step.Falloff[0].y === 1 && step.Falloff[1].y === 0, "its gain a line from 1 to 0"); // prettier-ignore
  sure(!step.OcclusionEnabled && !step.ReverbEnabled && !step.AirAbsorption && !step.UI, "no occlusion, reverb or air: GoldSrc's mixer had none"); // prettier-ignore
  sure(JSON.parse(soundFile("sounds/smak/weapons/clip.sound")).Distance === 1250, "a client's sound (5004) at ATTN_NORM, 1250 units"); // prettier-ignore
  const meta = JSON.parse(soundFile("sounds/smak/weapons/hum.wav.meta"));
  sure(meta.loop === true && within(meta.start, 0.5, 1e-6) && meta.end === undefined && /^[0-9a-f]{8}-/.test(meta.guid), `hum loops from its cue, half a second in, to its end: ${JSON.stringify(meta)}`); // prettier-ignore
  const hum = sounded.sounds.find((s) => s.from === "weapons/hum.wav");
  sure(within(hum.loop, 0.5, 1e-9) && within(hum.duration, 1, 1e-9) && hum.vsnd === "sounds/smak/weapons/hum.vsnd", JSON.stringify(hum)); // prettier-ignore
  sure(sounded.facts.sounds === 3 && sounded.facts.soundEvents === 3, JSON.stringify(sounded.facts));
});

test("portToSbox: an event whose sound was found plays it (AE_CL_PLAYSOUND; a view model's clip at its first attachment); one not found, and any other, kept generic", () => {
  sure(/event_class = "AE_CL_PLAYSOUND"\n\t+event_frame = 1\n\t+event_keys = \{\n\t+name = "sounds\/smak\/common\/step1\.sound"\n\t+\}/.test(sounderVmdl), "the step played by its .sound"); // prettier-ignore
  sure(/event_class = "AE_CL_PLAYSOUND"\n\t+event_frame = 2\n\t+event_keys = \{\n\t+name = "sounds\/smak\/weapons\/hum\.sound"/.test(sounderVmdl), "a streamed one (*) too"); // prettier-ignore
  sure(/event_class = "AE_CL_PLAYSOUND_ATTACHMENT"\n\t+event_frame = 0\n\t+event_keys = \{\n\t+name = "sounds\/smak\/weapons\/clip\.sound"\n\t+attachment = "attachment0"/.test(sounderVmdl), `5004 at the first attachment:\n${sounderVmdl.match(/AE_CL_PLAYSOUND_ATTACHMENT[\s\S]{0,200}/)?.[0]}`); // prettier-ignore
  sure(/Int = 1004\n\t+StringData = "smak\/common\/gone\.wav"/.test(sounderVmdl) && /Int = 5001\n\t+StringData = "10"/.test(sounderVmdl), "the sound not found, and the muzzle flash, generic"); // prettier-ignore
  sure(sounded.warnings.some((w) => /a sound its events play not found in .*game-sound.*: common\/gone\.wav/.test(w)), sounded.warnings.join("\n")); // prettier-ignore
  sure(sounded.warnings.some((w) => /^2 events kept as s&box's generic ones/.test(w)), sounded.warnings.join("\n"));
  sure(JSON.stringify(sounded.soundEvents) === JSON.stringify([{ sequence: "walk", loops: true, sounds: ["sounds/smak/common/step1.sound", "sounds/smak/weapons/hum.sound"] }, { sequence: "reload", loops: false, sounds: ["sounds/smak/weapons/clip.sound"] }]), JSON.stringify(sounded.soundEvents)); // prettier-ignore
  // told no sound folder, every event is generic, as before
  const unsounded = sbox.portToSbox(sounder, { name: "sounder" });
  sure(unsounded.sounds.length === 0 && !/AE_CL_PLAYSOUND/.test(String(unsounded.files.find((f) => f.path === unsounded.vmdl).data)), "no folder, no sounds"); // prettier-ignore
  sure(unsounded.warnings.some((w) => /4 sounds its events play not found in no sound folder/.test(w)), unsounded.warnings.join("\n")); // prettier-ignore
});

test("sboxSound: a file that is not a WAVE file is unread; soundEnvelope: a sound's loudness 10 ms by 10 ms at its own rate", () => {
  sure(/not a WAVE file/.test(sbox.sboxSound(Buffer.from("ID3 an mp3"), { path: "sounds/x.wav" }).unread), "unread");
  const loud = Float32Array.from({ length: 2205 }, (_, i) => (i < 1102 ? 0.5 : 0) * (i % 2 ? 1 : -1));
  const envelope = sbox.soundEnvelope(loud, 22050);
  sure(envelope.length === 10 && within(envelope[0], 0.5, 1e-6) && envelope[9] === 0, `10 windows of 220.5 samples: ${envelope.map((v) => v.toFixed(3))}`); // prettier-ignore
  sure(sbox.soundEnvelope(loud.subarray(0, 441), 44100).length === 1, "at 44100, 441 samples a window");
  sure(sbox.distanceOf(sbox.ATTENUATION.idle) === 500 && sbox.distanceOf(sbox.ATTENUATION.norm) === 1250, "1000 over the attenuation"); // prettier-ignore
});

test("expectedOf, soundProbeCode, compareSounds: its sounds read back, played, and its animations' sound events heard", () => {
  const expected = sbox.expectedOf(sounder, sounded, { perSequence: 1 });
  sure(expected.sounds.length === 3 && expected.sounds.every((s) => s.envelope.length > 0), JSON.stringify(expected.sounds.map((s) => [s.sound, s.envelope.length]))); // prettier-ignore
  sure(within(expected.soundEvents.find((e) => e.sequence === "walk").duration, 0.2, 1e-9), "the walk's length, to play it through"); // prettier-ignore
  const code = sbox.soundProbeCode(sounded.vmdl, expected.sounds, expected.soundEvents);
  sure(/ResourceLibrary\.Get<SoundEvent>\( path \)/.test(code) && code.includes('"sounds/smak/weapons/hum.sound"') && /OnSoundEvent/.test(code) && /\("walk", 1\.0000f, true\)/.test(code) && /\("reload", 1\.0000f, false\)/.test(code), code); // prettier-ignore
  const read = {
    sounds: expected.sounds.map((s) => ({ sound: s.sound, file: s.vsnd, valid: true, duration: s.duration, distance: s.distance, falloff: [0.75, 0.5, 0.25], occlusion: false, reverb: false, envelope: s.envelope.map((v) => v * 0.9) })), // prettier-ignore
    playing: Object.fromEntries(expected.sounds.map((s) => [s.sound, s.loop !== null])),
    heard: expected.soundEvents.flatMap((e) => e.sounds.map((sound) => ({ sequence: e.sequence, sound }))),
  };
  const whole = sbox.compareSounds(expected, read);
  sure(!whole.faults.length && /3 sounds as \.sound assets.*\(1 looping\).*correlated 1\.0000/.test(whole.said[0]) && /2 animations played through: 3 sound events heard, of 3/.test(whole.said[1]), JSON.stringify(whole)); // prettier-ignore
  const broken = (change) => {
    const copy = structuredClone(read);
    change(copy);
    return sbox.compareSounds(expected, copy).faults.join("\n");
  };
  const step = (r) => r.sounds.find((s) => s.sound.endsWith("step1.sound"));
  sure(/step1\.sound did not load/.test(broken((r) => (step(r).missing = true))), "one that does not load");
  sure(/heard to 1500 units, not 500/.test(broken((r) => (step(r).distance = 1500))), "heard too far");
  sure(/falls off as .* not in a line/.test(broken((r) => (step(r).falloff = [0.22, 0.04, 0.01]))), "s&box's own falloff"); // prettier-ignore
  sure(/is 9\.000 s long/.test(broken((r) => (step(r).duration = 9))), "of another length");
  sure(/not as loud as the original/.test(broken((r) => step(r).envelope.reverse())), "its loudness reversed");
  sure(/hum\.sound did not loop/.test(broken((r) => (r.playing["sounds/smak/weapons/hum.sound"] = false))), "the loop stopped"); // prettier-ignore
  sure(/clip\.sound still played after its length/.test(broken((r) => (r.playing["sounds/smak/weapons/clip.sound"] = true))), "a one-shot looping"); // prettier-ignore
  sure(/walk played sounds\/smak\/common\/step1\.sound, not .*hum\.sound \(looping\)/.test(broken((r) => r.heard.splice(1, 1))), "a sound event not heard"); // prettier-ignore
  sure(!broken((r) => r.heard.push(...r.heard.filter((h) => h.sequence === "walk"))), "a loop's heard each time round"); // prettier-ignore
  sure(/reload played sounds\/smak\/weapons\/clip\.sound, sounds\/smak\/weapons\/clip\.sound, not sounds\/smak\/weapons\/clip\.sound$/.test(broken((r) => r.heard.push({ sequence: "reload", sound: "sounds/smak/weapons/clip.sound" }))), "a one-shot's heard twice"); // prettier-ignore
});

// ── compiled, where s&box is ──
let found = null;
try {
  found = sbox.findSbox();
} catch {
  // no s&box on this machine: the compiled cases are skipped
}
const testCompiled = (name, run) => {
  if (found) test(name, run);
  else
    console.log(
      `skip  ${name}\n      skipped: no s&box (install it from Steam, or name its folder in SMAK_SBOX)`,
    );
};

test("findSbox: a folder named that has no s&box is refused; none found says what it is and where it comes from", () => {
  let said = "";
  try {
    sbox.findSbox({ folder: folder });
  } catch (error) {
    said = error.message;
  }
  sure(/no s&box at/.test(said), said);
  said = "";
  try {
    sbox.findSbox({
      env: { HOME: folder, USERPROFILE: folder, ProgramFiles: folder, "ProgramFiles(x86)": folder },
    });
  } catch (error) {
    said = error.message;
  }
  sure(said === "" || /no s&box: its model compiler comes with s&box/.test(said), said);
});

testCompiled(
  "compiled: s&box's resourcecompiler builds the port, nothing it could not resolve, its textures and materials beside it",
  () => {
    const assets = join(folder, "Assets");
    sbox.writeSboxPort(port, assets);
    const result = sbox.compileVmdl(assets, port.vmdl, { sbox: found });
    sure(
      existsSync(result.compiled) && !result.notes.length,
      `${result.compiled}: ${result.notes.join("; ")}`,
    );
    sure(
      existsSync(join(assets, "materials/models/smak/portable_thing/skin_one.vmat_c")),
      "the material compiled with it",
    );
    // a mesh named with a hyphen, as the node: the compile fails, and says the node
    const broken = String(fileOf(port.vmdl)).replace('name = "body_ref"', 'name = "body-ref"');
    writeFileSync(join(assets, "models/smak/broken.vmdl"), broken);
    let said = "";
    try {
      sbox.compileVmdl(assets, "models/smak/broken.vmdl", { sbox: found });
    } catch (error) {
      said = error.message;
    }
    sure(/did not compile models\/smak\/broken\.vmdl/.test(said) && /body-ref/.test(said), said);
  },
);

testCompiled("compiled: a model's sounds' files compiled in one run, each to its .vsnd_c beside it", () => {
  const assets = join(folder, "sounded");
  sbox.writeSboxPort(sounded, assets);
  const made = sbox.compileSounds(assets, sounded.sounds.map((s) => s.wav), { sbox: found });
  sure(made.compiled.length === 3 && made.compiled.every((f) => existsSync(f)) && made.compiled[0].endsWith(".vsnd_c"), JSON.stringify(made.compiled)); // prettier-ignore
});

testCompiled("compiled: smak sbox-port ends in PASS with what it made", () => {
  const file = join(folder, "portable.mdl");
  writeFileSync(file, portable);
  const said = runSmak("sbox-port", file, "-o", join(folder, "cli"), "--name", "cli_thing");
  sure(
    /PASS: compiled in [\d.]+ s: models\/smak\/cli_thing\.vmdl \(2 bones, 2 meshes, 3 animations, 2 skins, 2 bodygroups/.test(
      said,
    ),
    said,
  );
  sure(existsSync(join(folder, "cli", "models", "smak", "cli_thing.vmdl_c")), "its compiled model");
});

test("smak sbox-port --no-compile writes the files with no compiler", () => {
  const file = join(folder, "portable-nc.mdl");
  writeFileSync(file, portable);
  const said = runSmak("sbox-port", file, "-o", join(folder, "nc"), "--no-compile");
  sure(
    /PASS: written, not compiled/.test(said) &&
      existsSync(join(folder, "nc", "models", "smak", "portable-nc.vmdl")),
    said,
  );
  sure(
    readFileSync(join(folder, "nc", "models", "smak", "portable-nc.vmdl"), "utf8").includes("RenderMeshList"),
    "its document",
  );
});

test("portToSbox: a v_ model is a view model (its animations start outright); a p_ one keeps its bones' names unless told held", () => {
  const view = sbox.portToSbox(portable, { name: "v_thing" });
  sure(
    /fade_in_time = 0\.0/.test(String(view.files.find((f) => f.path === view.vmdl).data)),
    "a view model's animations with no fade",
  );
  const held = sbox.portToSbox(portable, { name: "p_thing" });
  sure(
    held.facts.bones.join(",") === "Arm,arm_2",
    `its own bones' names, not Valve's biped's: ${held.facts.bones}`,
  );
});

test("portToSbox: a bone's name as s&box keeps it (a dot an underscore, as stealth.mdl's \"Stealth.\"), two that come out one kept apart", () => {
  sure(
    sbox.boneNameOf("Stealth.") === "Stealth_" && sbox.boneNameOf("Bip01 L Hand") === "Bip01_L_Hand",
    "dots and spaces",
  );
  const twins = smak.buildMdl({
    name: "twins.mdl",
    bones: [
      { name: "Bip01 L", parent: -1, pos: [0, 0, 0] },
      { name: "Bip01_L", parent: 0, pos: [2, 0, 0] },
    ],
    bodyparts: [{ name: "body", models: [{ name: "body", meshes: [{ tris: [tri(0, "Bip01 L"), tri(2, "Bip01_L")], texture: plain("skin.bmp") }] }] }], // prettier-ignore
    sequences: [
      {
        name: "idle",
        fps: 10,
        frames: [
          [
            [0, 0, 0, 0, 0, 0],
            [2, 0, 0, 0, 0, 0],
          ],
        ],
      },
    ],
    hitboxes: [{ bone: "Bip01_L", group: 1, min: [0, 0, 0], max: [1, 1, 1] }],
  });
  const port = sbox.portToSbox(twins, { name: "twins" });
  sure(port.facts.bones.join(",") === "Bip01_L,Bip01_L_2", `kept apart: ${port.facts.bones}`);
  const dmx = String(port.files.find((f) => f.path.endsWith("/body.dmx")).data);
  sure(/"name" "string" "Bip01_L_2"/.test(dmx), "the mesh's second bone Bip01_L_2");
  sure(
    /parent_bone = "Bip01_L_2"/.test(String(port.files.find((f) => f.path === port.vmdl).data)),
    "the hit box on it",
  );
});

test("portToSbox: a bodygroup's name ending in a number after a letter (loader.mdl's leg2) has an underscore before it, as ModelDoc keeps it", () => {
  const leg = (name, x) => ({
    name,
    models: [{ name, meshes: [{ tris: [tri(x, "Bone01")], texture: plain("skin.bmp") }] }],
  });
  const legs = smak.buildMdl({
    name: "legs.mdl",
    bones: [{ name: "Bone01", parent: -1, pos: [0, 0, 0] }],
    bodyparts: [leg("body", 0), leg("leg2", 2), leg("leg_2", 4)],
    sequences: [{ name: "idle", fps: 10, frames: [[[0, 0, 0, 0, 0, 0]]] }],
  });
  const port = sbox.portToSbox(legs, { name: "legs" });
  const names = port.facts.bodygroups.map((g) => g.name).join(",");
  sure(names === "body,leg_2,leg_2_2", `the groups: ${names}`);
});

// ── what it collides as: a figure of boxes, a ragdoll; a prop of one bone, a hull ──
/** A closed box's twelve triangles about `middle`, `half` each way, on `bone`, in the model's space. */
const boxTris = (middle, half, bone) => {
  const at = (x, y, z) => [0, 1, 2].map((a) => middle[a] + [x, y, z][a] * half[a]);
  const quad = (a, b, c, d) => [
    [a, b, c],
    [a, c, d],
  ];
  const faces = [
    ...quad(at(-1, -1, -1), at(-1, 1, -1), at(1, 1, -1), at(1, -1, -1)),
    ...quad(at(-1, -1, 1), at(1, -1, 1), at(1, 1, 1), at(-1, 1, 1)),
    ...quad(at(-1, -1, -1), at(1, -1, -1), at(1, -1, 1), at(-1, -1, 1)),
    ...quad(at(-1, 1, -1), at(-1, 1, 1), at(1, 1, 1), at(1, 1, -1)),
    ...quad(at(-1, -1, -1), at(-1, -1, 1), at(-1, 1, 1), at(-1, 1, -1)),
    ...quad(at(1, -1, -1), at(1, 1, -1), at(1, 1, 1), at(1, -1, 1)),
  ];
  return faces.map((corners) => corners.map((p) => ({ p, uv: [0, 0], bone })));
};
// the pelvis at 40 up; the spine above it, the leg and shin below; the arm off the spine, hanging against the pelvis
const figureBones = [
  { name: "Pelvis", parent: -1, pos: [0, 0, 40] },
  { name: "Spine", parent: 0, pos: [0, 0, 5] },
  { name: "Leg", parent: 0, pos: [0, 0, -4] },
  { name: "Shin", parent: 2, pos: [0, 0, -16] },
  { name: "Arm", parent: 1, pos: [6, 0, 5] },
];
const figureRest = figureBones.map((b) => [...b.pos, 0, 0, 0]);
// the knee bends about its z alone; the spine turns about all three
const bend = (k) =>
  figureRest.map((six, i) =>
    i === 3
      ? [...six.slice(0, 3), 0, 0, -0.4 * k]
      : i === 1
        ? [...six.slice(0, 3), 0.1 * k, -0.2 * k, 0.15 * k]
        : six,
  );
const figure = smak.buildMdl({
  name: "figure.mdl",
  bones: figureBones,
  bodyparts: [
    {
      name: "body",
      models: [
        {
          name: "body",
          meshes: [
            {
              tris: [
                ...boxTris([0, 0, 40], [4, 4, 4], "Pelvis"),
                ...boxTris([0, 0, 52], [4, 4, 6], "Spine"),
                ...boxTris([0, 0, 28], [3, 3, 8], "Leg"),
                ...boxTris([0, 0, 12], [2.5, 2.5, 7], "Shin"),
                ...boxTris([5, 0, 41], [1.5, 1.5, 6], "Arm"),
              ],
              texture: plain("skin.bmp"),
            },
          ],
        },
      ],
    },
  ],
  sequences: [{ name: "bend", fps: 10, frames: [0, 1, 2, 3, 4].map(bend) }],
  hitboxes: ["Pelvis", "Spine", "Leg", "Shin", "Arm"].map((bone) => ({
    bone,
    group: 1,
    min: [-1, -1, -1],
    max: [1, 1, 1],
  })),
});
const figurePort = sbox.portToSbox(figure, { name: "figure" });
const figureVmdl = String(figurePort.files.find((f) => f.path === figurePort.vmdl).data);

test("portToSbox: a figure collides as a ragdoll: a hull on each piece's bone, a file each, its weight shared by volume", () => {
  const { physics } = figurePort;
  sure(figurePort.facts.collision === "ragdoll", figurePort.facts.collision);
  sure(physics.shapes.map((s) => s.bone).join(",") === "Pelvis,Spine,Leg,Shin,Arm", physics.shapes.map((s) => s.bone).join()); // prettier-ignore
  sure((figureVmdl.match(/_class = "PhysicsHullFile"/g) ?? []).length === 5, "five hull nodes");
  sure(/name = "physics_Shin"\n\t+parent_bone = "Shin"\n\t+surface_prop = "flesh"/.test(figureVmdl), "the shin's hull on its bone, as flesh"); // prettier-ignore
  sure(
    figurePort.files.some((f) => f.path === "models/smak/figure/physics/physics_Shin.dmx"),
    "the shin's file",
  );
  near(
    physics.bodies.reduce((sum, b) => sum + b.mass, 0),
    90,
    1e-6,
    "a person's 90 kg, shared",
  );
  sure(/_class = "PhysicsBodyMarkup"\n\t+target_body = "Pelvis"\n\t+mass_override = /.test(figureVmdl), "a mass on each body"); // prettier-ignore
});

test("portToSbox: a joint that turns about one axis is a hinge about it, one that turns about more a cone along its bone", () => {
  const joints = Object.fromEntries(figurePort.physics.joints.map((j) => [j.child, j]));
  sure(joints.Shin.kind === "hinge" && joints.Shin.axis === 2 && joints.Shin.min < -100 && joints.Shin.max >= 0, JSON.stringify(joints.Shin)); // prettier-ignore
  sure(joints.Spine.kind === "cone" && joints.Spine.axis === 0, JSON.stringify(joints.Spine));
  // the anchor: the child's place in the piece above at rest; a hinge's frame its bone's, a cone's z on its bone's x
  sure(joints.Shin.origin.map((v) => Math.round(v * 1000) / 1000).join() === "0,0,-16" && joints.Shin.angles.every((a) => Math.abs(a) < 1e-6), JSON.stringify(joints.Shin)); // prettier-ignore
  sure(
    joints.Spine.angles.map((a) => Math.round(a)).join() === "0,-90,-90",
    `citizen's turn: ${joints.Spine.angles}`,
  );
  sure(/_class = "PhysicsJointRevolute"\n\t+parent_body = "Leg"\n\t+child_body = "Shin"/.test(figureVmdl) && /_class = "PhysicsJointConical"\n\t+parent_body = "Pelvis"\n\t+child_body = "Spine"/.test(figureVmdl), "the joints written"); // prettier-ignore
});

test("portToSbox: a ragdoll's pieces that meet at rest and are not joined are trimmed apart (s&box pushes them away)", () => {
  const { physics } = figurePort;
  sure(
    physics.trimmed.some(([a, b]) => `${a}/${b}` === "Pelvis/Arm"),
    JSON.stringify(physics.trimmed),
  );
  const shape = (bone) => physics.shapes.find((s) => s.bone === bone).points;
  sure(!sbox.hullsMeet(shape("Pelvis"), shape("Arm")), "the pelvis and the arm apart");
  sure(
    sbox.hullsMeet(shape("Pelvis"), shape("Leg")),
    "joined pieces left meeting (a joint keeps them from colliding)",
  );
  sure(
    figurePort.warnings.some((w) => /trimmed apart/.test(w)),
    "said",
  );
});

test("portToSbox: gibs, a body part's choices each on a bone of its own, are no ragdoll; the figure with a gun to choose is", () => {
  const gib = (bone, middle) => ({ name: `gib_${bone}`, meshes: [{ tris: boxTris(middle, [2, 2, 2], bone), texture: plain("skin.bmp") }] }); // prettier-ignore
  const gibs = smak.buildMdl({
    name: "gibs.mdl",
    bones: figureBones,
    bodyparts: [
      { name: "gibs", models: [gib("Pelvis", [0, 0, 40]), gib("Spine", [0, 0, 52]), gib("Leg", [0, 0, 28])] },
    ],
    sequences: [{ name: "idle", fps: 10, frames: [figureRest] }],
    hitboxes: ["Pelvis", "Spine", "Leg"].map((bone) => ({
      bone,
      group: 1,
      min: [-1, -1, -1],
      max: [1, 1, 1],
    })),
  });
  const port = sbox.portToSbox(gibs, { name: "gibs" });
  sure(port.physics === null, "no ragdoll");
  sure(
    port.warnings.some((w) => /body part gibs shows one of its choices at a time/.test(w)),
    port.warnings.join("\n"),
  );
  // the figure with a second body part to choose a gun on the arm or none: still one body
  const armed = smak.buildMdl({
    name: "armed.mdl",
    bones: figureBones,
    bodyparts: [
      { name: "body", models: [{ name: "body", meshes: [{ tris: [...boxTris([0, 0, 40], [4, 4, 4], "Pelvis"), ...boxTris([0, 0, 52], [4, 4, 6], "Spine"), ...boxTris([0, 0, 28], [3, 3, 8], "Leg")], texture: plain("skin.bmp") }] }] }, // prettier-ignore
      { name: "gun", models: [gib("Arm", [5, 0, 41]), gib("Shin", [0, 0, 12])] },
    ],
    sequences: [{ name: "idle", fps: 10, frames: [figureRest] }],
    hitboxes: ["Pelvis", "Spine", "Leg"].map((bone) => ({
      bone,
      group: 1,
      min: [-1, -1, -1],
      max: [1, 1, 1],
    })),
  });
  sure(sbox.portToSbox(armed, { name: "armed" }).physics?.joints.length >= 1, "armed: a ragdoll");
});

test("portToSbox: a prop of one bone collides as its hull; a view model, and a figure told none, as nothing", () => {
  const prop = smak.buildMdl({
    name: "crate.mdl",
    bones: [{ name: "Crate", parent: -1, pos: [0, 0, 0] }],
    bodyparts: [{ name: "body", models: [{ name: "crate", meshes: [{ tris: boxTris([0, 0, 8], [8, 8, 8], "Crate"), texture: plain("wood.bmp") }] }] }], // prettier-ignore
    sequences: [{ name: "idle", fps: 10, frames: [[[0, 0, 0, 0, 0, 0]]] }],
  });
  const port = sbox.portToSbox(prop, { name: "crate", surfaceprop: "wood_crate" });
  sure(port.facts.collision === "hull" && port.physics.shapes.length === 1 && port.physics.joints.length === 0, JSON.stringify(port.facts)); // prettier-ignore
  sure(port.physics.shapes[0].surface === "wood" && port.physics.shapes[0].bone === "Crate", JSON.stringify(port.physics.shapes[0])); // prettier-ignore
  sure(sbox.portToSbox(prop, { name: "v_crate" }).physics === null, "a view model");
  sure(sbox.portToSbox(figure, { name: "figure", collision: "none" }).physics === null, "told none");
});

test("portToSbox: a ragdoll's pieces' inertia and damping as the GMod port's QC has them; hulls made exactly, 44 corners at most", () => {
  sure(/inertia_scale = 10\.0\n\t+linear_damping = 0\.01\n\t+angular_damping = 1\.5/.test(figureVmdl), "$inertia 10, $damping 0.01, $rotdamping 1.5"); // prettier-ignore
  sure(
    /optimization_algorithm = "Exact"/.test(figureVmdl) && !/QEM/.test(figureVmdl),
    "made exactly: s&box's own simplifying left hulls off",
  );
  sure(
    figurePort.physics.shapes.every((s) => s.points.length <= sbox.HULL_CORNERS),
    "44 corners at most",
  );
});

test("portToSbox: a p_ model collides as nothing unless told, as the GMod port's held one", () => {
  sure(sbox.portToSbox(figure, { name: "p_figure" }).physics === null, "p_ untold");
  sure(
    sbox.portToSbox(figure, { name: "p_figure", collision: "ragdoll" }).physics?.joints.length === 4,
    "p_ told",
  );
});

test("jointOf: a cone swings 90 degrees at most, the widest s&box holds, its limits' own kept as wider", () => {
  const wide = sbox.jointOf([
    [-20, 20],
    [-130, 40],
    [-30, 30],
  ]);
  sure(wide.kind === "cone" && wide.swing === 90 && wide.wider === 130, JSON.stringify(wide));
  const narrow = sbox.jointOf([
    [-20, 20],
    [-60, 40],
    [-30, 30],
  ]);
  sure(narrow.swing === 60 && narrow.wider === undefined, JSON.stringify(narrow));
});

test("simplifyHull: a hull of many corners kept to 44, cut in by little; one of few left as it is", () => {
  const ball = [];
  for (let i = 0; i < 300; i++) {
    const z = 1 - (2 * (i + 0.5)) / 300;
    const r = Math.sqrt(1 - z * z);
    const a = i * 2.399963;
    ball.push([10 * r * Math.cos(a), 10 * r * Math.sin(a), 10 * z]);
  }
  const { hull, inset } = sbox.simplifyHull(smak.source.convexHull(ball));
  sure(
    hull.points.length <= sbox.HULL_CORNERS && inset > 0 && inset < 2,
    `${hull.points.length} corners, cut in ${inset}`,
  );
  const cube = smak.source.convexHull(
    [0, 1].flatMap((x) => [0, 1].flatMap((y) => [0, 1].map((z) => [x, y, z]))),
  );
  const kept = sbox.simplifyHull(cube);
  sure(kept.hull.points.length === 8 && kept.inset === 0, "a cube kept");
});

test("evenOut: a ragdoll's piece lighter than a tenth of one joined to it is made that, the whole as heavy as it was", () => {
  const bodies = [
    { bone: "body", mass: 80 },
    { bone: "leg", mass: 9.9 },
    { bone: "toe", mass: 0.1 },
  ];
  const joints = [
    { parent: "body", child: "leg" },
    { parent: "leg", child: "toe" },
  ];
  const raised = sbox.evenOut(bodies, joints);
  near(
    bodies.reduce((sum, b) => sum + b.mass, 0),
    90,
    1e-9,
    "90 kg still",
  );
  sure(
    raised.join() === "toe" && bodies[2].mass * sbox.MASS_RATIO >= bodies[1].mass * (1 - 1e-9),
    JSON.stringify(bodies),
  );
  sure(bodies[1].mass * sbox.MASS_RATIO >= bodies[0].mass * (1 - 1e-9), "the leg a tenth of the body");
});

test("evenOut: a piece lighter than MASS_LEAST of the whole is made that, though no piece joined to it outweighs it ten times", () => {
  // each a tenth of the one above it, the hand 0.9% of the whole
  const bodies = [
    { bone: "body", mass: 100 },
    { bone: "arm", mass: 10 },
    { bone: "hand", mass: 1 },
  ];
  const joints = [
    { parent: "body", child: "arm" },
    { parent: "arm", child: "hand" },
  ];
  const raised = sbox.evenOut(bodies, joints);
  const total = bodies.reduce((sum, b) => sum + b.mass, 0);
  near(total, 111, 1e-9, "as heavy as it was");
  sure(raised.join() === "hand" && bodies[2].mass > 1.1, JSON.stringify(bodies));
});

test("trimApart: a small piece inside a big one keeps some of itself; two that cannot be cut so are said", () => {
  const cube = (o, s) => smak.source.convexHull([0, 1].flatMap((x) => [0, 1].flatMap((y) => [0, 1].map((z) => [o[0] + x * s, o[1] + y * s, o[2] + z * s])))); // prettier-ignore
  const hulls = [cube([0, 0, 0], 10), cube([7, 4, 4], 2)];
  const { trimmed, left } = sbox.trimApart(hulls, ["body", "knob"], []);
  sure(
    trimmed.length === 1 && !left.length && !sbox.hullsMeet(hulls[0].points, hulls[1].points),
    JSON.stringify(trimmed),
  );
  const span = Math.max(...hulls[1].points.map((p) => p[0])) - Math.min(...hulls[1].points.map((p) => p[0]));
  sure(span >= 0.5 - 1e-9, `the knob kept ${span} of itself`);
  const tiny = [cube([0, 0, 0], 0.6), cube([0.1, 0.1, 0.1], 0.4)];
  sure(
    sbox.trimApart(tiny, ["a", "b"], []).left.length === 1,
    "too small to cut and keep half a unit of each",
  );
});

test("comparePhysics: what the port wrote read back and tried passes; a body missing, a joint turned, pieces pushing, a fall through the floor do not", () => {
  const expected = sbox.expectedOf(figure, figurePort).physics;
  sure(expected.poses.length > 0, "poses inside the joints' limits to hold it in");
  const read = {
    bodies: expected.shapes.map((s) => ({ bone: s.bone, mass: 0, surface: s.surface, points: s.points })),
    weighs: expected.shapes.map((s) => expected.masses.find((m) => m.bone === s.bone).mass),
    joints: expected.joints.map((j) => ({ type: j.kind === "hinge" ? "Hinge" : "Ball", parent: j.parent, child: j.child, at1: j.at, at2: j.at, z1: j.along, swing: j.swing ?? 0, twist: j.kind === "hinge" ? [-(j.max - j.min) / 2, (j.max - j.min) / 2] : j.twist })), // prettier-ignore
    restMoved: 0,
    held: expected.poses.map((p) => ({ name: p.name, moved: 0.05, bone: "Shin" })),
    dropped: { settled: 2, speed: 0, lowest: -0.1, lowestPiece: "Shin", gap: 0.1, gapAt: "Shin" },
  };
  const good = sbox.comparePhysics(expected, read);
  sure(
    !good.faults.length && /5 bodies \(90\.0 kg\), 4 joints/.test(good.said[0]),
    `${good.faults} ${good.said}`,
  );
  const bad = sbox.comparePhysics(expected, {
    ...read,
    bodies: read.bodies.slice(1),
    joints: read.joints.map((j) => (j.child === "Shin" ? { ...j, z1: [1, 0, 0] } : j)),
    restMoved: 3,
    dropped: { ...read.dropped, lowest: -5, lowestPiece: "Pelvis" },
  });
  for (const fault of [
    /no physics body on Pelvis/,
    /Shin's joint turns about another axis/,
    /pushed each other 3\.00 units/,
    /Pelvis went 5\.0 units through the floor/,
  ])
    // prettier-ignore
    sure(bad.faults.some((f) => fault.test(f)), `${fault} in ${bad.faults.join(" | ")}`);
  sure(
    /Bip01|PhysicsWorld/.test(sbox.physicsProbeCode("models/smak/figure.vmdl", expected.poses)),
    "the probe makes its own worlds",
  );
});

test("surfaceOf: a GMod surfaceprop as the s&box surface it starts with or is kin to; none like it is default, said", () => {
  const of = (name) => sbox.surfaceOf(name);
  sure(of("metal_box").surface === "metal" && of("alienflesh").surface === "flesh" && of("porcelain").surface === "ceramic", "kin"); // prettier-ignore
  sure(of("concrete").surface === "default" && !of("concrete").kept && of("default").kept, "none like it");
});

test("hullsMeet: two convex sets of points meet when they overlap or come within the margin", () => {
  const cube = (o, s = 1) => [0, 1].flatMap((x) => [0, 1].flatMap((y) => [0, 1].map((z) => [o[0] + x * s, o[1] + y * s, o[2] + z * s]))); // prettier-ignore
  const a = cube([0, 0, 0]);
  sure(
    sbox.hullsMeet(a, cube([0.5, 0.5, 0.5])) && sbox.hullsMeet(a, cube([0.2, 0.2, 0.2], 0.5)),
    "overlapping, and inside",
  );
  sure(
    !sbox.hullsMeet(a, cube([1.2, 0, 0])) && !sbox.hullsMeet(a, cube([1.1, 1.1, 1.1])),
    "apart, and apart past a corner",
  );
  sure(
    sbox.hullsMeet(a, cube([1.2, 0, 0]), 0.3) && !sbox.hullsMeet(a, cube([1.2, 0, 0]), 0.1),
    "within a margin",
  );
});

test("insideLimits, jointStretch: how far inside its joint a bone is in a pose, and how far the pose moves it off", () => {
  const rest = sbox.restOf(figureBones, figureRest);
  const limits = [
    [-20, 30],
    [-10, 10],
    [-15, 15],
  ];
  const turns = rest.map((r) => r.turn);
  // a cone: its twist about x -20 to 30, its swing as far as y's or z's widest, 15
  near(sbox.insideLimits(limits, turns, turns, 0, 1), 15, 1e-6, "at rest: 15 from the cone's edge");
  // the spine turned 25 degrees about its x (a twist): 5 inside the cone's twist; 35 is 5 outside
  const about = (deg) => {
    const c = Math.cos((deg * Math.PI) / 180);
    const s = Math.sin((deg * Math.PI) / 180);
    return turns.map((t, i) =>
      i === 1
        ? [
            [1, 0, 0],
            [0, c, -s],
            [0, s, c],
          ]
        : t,
    );
  };
  near(sbox.insideLimits(limits, turns, about(25), 0, 1), 5, 1e-6, "twisted 25 of 30");
  near(sbox.insideLimits(limits, turns, about(35), 0, 1), -5, 1e-6, "twisted 35 of 30");
  // a hinge's held-still axes may turn a degree
  const hinge = [
    [0, 0],
    [0, 0],
    [-90, 10],
  ];
  sure(sbox.insideLimits(hinge, turns, about(0.5), 0, 1) > 5 && sbox.insideLimits(hinge, turns, about(3), 0, 1) < 0, "a hinge's still axis"); // prettier-ignore
  const moved = rest.map((r, i) => (i === 1 ? { ...r, at: [r.at[0], r.at[1] + 2, r.at[2]] } : r));
  near(sbox.jointStretch(rest, rest, 0, 1), 0, 1e-9, "at rest, held where it is");
  near(sbox.jointStretch(rest, moved, 0, 1), 2, 1e-9, "a bone moved 2 off its piece above");
});
test("expectedOf: each animation's first and middle frames, GoldSrc's pose at each, its length; probeCode asks for them", () => {
  const expected = sbox.expectedOf(portable, port, { perSequence: 2 });
  // idle has 1 frame (one sample), walk 3 (frames 0 and 2), Idle_2 2 (0 and 1)
  sure(expected.samples.map((s) => `${s.sequence}@${s.time}`).join(" ") === "idle@0 walk@0 walk@0.2 Idle_2@0 Idle_2@0.1", JSON.stringify(expected.samples)); // prettier-ignore
  sure(expected.sequences.map((s) => s.duration).join(",") === "0,0.2,0.1", `lengths (frames - 1) / fps: ${expected.sequences.map((s) => s.duration)}`); // prettier-ignore
  // GoldSrc's walk kept no travel in its frames: its root at its rest, the second bone 2 along x
  sure(expected.poses[2].bones[1].join(",") === "2,0,0", `walk's last frame: ${expected.poses[2].bones[1]}`);
  sure(
    expected.bones.map(([n, p]) => `${n}<${p}`).join(" ") === "Arm<-1 arm_2<0",
    `bones and parents: ${JSON.stringify(expected.bones)}`,
  );
  const code = sbox.probeCode(port.vmdl, expected.samples);
  sure(
    code.includes('Model.Load( "models/smak/portable_thing.vmdl" )') && code.includes('("walk", 0.200000f)'),
    "the model and its samples in the probe",
  );
  sure(
    /r\.Sequence\.Looping = false/.test(code) && /r\.Sequence\.PlaybackRate = 0/.test(code),
    "an animation stopped, its last frame held, not wrapped to its first",
  );
  sure(/smak_sbox_check/.test(sbox.removeProbeCode()), "the probe object removed by its name");
});

// ── a model whose animations blend: on one axis (Half-Life's aiming), and on two ──
const down = portBones.map((b) => [...b.pos, 0, -0.5, 0]);
const up = portBones.map((b) => [...b.pos, 0, 0.5, 0]);
const aimer = smak.buildMdl({
  name: "aimer.mdl",
  bones: portBones,
  bodyparts: [{ name: "body", models: [{ name: "body", meshes: [{ tris: [tri(0)], texture: plain("skin.bmp") }] }] }],
  sequences: [
    { name: "idle", fps: 10, loops: true, frames: [still] },
    { name: "aim", fps: 10, frames: [down, down], blendFrames: [[up, up]], blendtype: [smak.MOTION.XR, 0], blendstart: [-45, 0], blendend: [60, 0], activity: 1, actweight: 1, events: [{ frame: 1, event: 5001, options: "10" }] }, // prettier-ignore
    { name: "shoot", fps: 10, frames: [down], blendFrames: [[up]], blendtype: [smak.MOTION.XR, 0], blendstart: [-50, 0], blendend: [35, 0] }, // prettier-ignore
    { name: "look", fps: 10, frames: [still], blendFrames: [[down], [up], [still]], blendtype: [smak.MOTION.XR, smak.MOTION.YR], blendstart: [-10, -20], blendend: [10, 20] }, // prettier-ignore
  ],
});
const aimed = sbox.portToSbox(aimer, { name: "aimer" });
const graphText = String(aimed.files.find((f) => f.path === aimed.graph)?.data);

test("portToSbox: an animation's blends in an animation graph, chosen by its sequence and blended on the GMod port's pose parameters; each blend an animation of its own", () => {
  sure(aimed.graph === "models/smak/aimer.vanmgrph", `the graph beside the model: ${aimed.graph}`);
  const doc = String(aimed.files.find((f) => f.path === aimed.vmdl).data);
  sure(doc.includes('anim_graph_name = "models/smak/aimer.vanmgrph"'), "the model names it");
  sure(aimed.facts.sequences.join() === "idle,aim,shoot,look,aim_blend1,shoot_blend1,look_blend1,look_blend2,look_blend3", `the blends after every animation, which keep GoldSrc's numbers: ${aimed.facts.sequences}`); // prettier-ignore
  const blend = doc.slice(doc.indexOf('name = "aim_blend1"'), doc.indexOf('name = "shoot_blend1"'));
  sure(/activity_name = ""/.test(blend) && !/AnimEvent/.test(blend) && /aim_blend1\.dmx/.test(blend), `a blend asked for by no activity, its events the first's:\n${blend}`); // prettier-ignore
  sure(aimed.files.some((f) => f.path === "models/smak/aimer/anims/look_blend3.dmx"), "each blend's animation written");
  sure(graphText.startsWith("<!-- kv3 encoding:text") && /format:animgraph2/.test(graphText), "KV3, an animgraph2");
  sure(/m_enumOptions = \[\n\s*"idle",\n\s*"aim",\n\s*"shoot",\n\s*"look",\n\s*\]/.test(graphText), `an option an animation, in the model's order:\n${graphText}`); // prettier-ignore
  sure(/m_name = "blend_xr"[\s\S]*?m_fDefaultValue = 0\.0\s*m_fMinValue = -50\.0\s*m_fMaxValue = 60\.0/.test(graphText), "blend_xr over every range on it, level at the start"); // prettier-ignore
  sure(/m_name = "blend_yr"[\s\S]*?m_fMinValue = -20\.0\s*m_fMaxValue = 20\.0/.test(graphText), "blend_yr over look's");
  sure(/"CSelectorAnimNode"[\s\S]*?m_selectionSource = "SelectionSource_Enum"[\s\S]*?m_bResetOnChange = true/.test(graphText), "a selector on the enum, a new animation started at its first frame"); // prettier-ignore
  const one = graphText.slice(graphText.indexOf('m_sName = "aim"'));
  sure(/"CBlendAnimNode"/.test(graphText) && /m_name = "aim"\s*m_blendValue = -45\.0[\s\S]*?m_name = "aim_blend1"\s*m_blendValue = 60\.0/.test(one), "aim blended from -45 to 60"); // prettier-ignore
  sure(/"CBlend2DAnimNode"[\s\S]*?"look"\s*m_blendValue = \[ -10\.0, -20\.0 \][\s\S]*?"look_blend1"\s*m_blendValue = \[ 10\.0, -20\.0 \][\s\S]*?"look_blend2"\s*m_blendValue = \[ -10\.0, 20\.0 \][\s\S]*?"look_blend3"\s*m_blendValue = \[ 10\.0, 20\.0 \]/.test(graphText), "look's four, the first axis's two at the second's start, then at its end"); // prettier-ignore
  sure(aimed.warnings.some((w) => /3 animations blend \(aim, shoot, look\): in its animation graph/.test(w)), `said: ${aimed.warnings}`); // prettier-ignore
  sure(!aimed.warnings.some((w) => /first blend only/.test(w)), "no blend left behind");
  sure(port.graph === "" && /anim_graph_name = ""/.test(vmdl), "a model whose animations do not blend has no graph");
  const view = sbox.portToSbox(aimer, { name: "v_aimer" });
  const viewGraph = String(view.files.find((f) => f.path === view.graph).data);
  sure(/m_blendDuration = 0\.0/.test(viewGraph) && /m_blendDuration = 0\.2/.test(graphText), "a view model's animations change at once, as its fades");
});

test("blendedPoseAt: an animation part of the way between its two blends, as GoldSrc's renderer mixes them (turns slerped)", () => {
  const ends = [0, 1].map((blend) => smak.poseAt(aimer, 1, 0, blend));
  const at = (pose) => pose[1].slice(0, 3).map((row) => row[3]);
  const apart = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  near(apart(at(sbox.blendedPoseAt(aimer, 1, 0, 0)), at(ends[0])), 0, 1e-6, "at 0 its first blend");
  near(apart(at(sbox.blendedPoseAt(aimer, 1, 0, 1)), at(ends[1])), 0, 1e-6, "at 1 its second");
  // half way between -0.5 and 0.5 about y: not turned, the second bone straight out along x
  near(apart(at(sbox.blendedPoseAt(aimer, 1, 0, 0.5)), [2, 0, 0]), 0, 1e-6, "half way, the turn between");
  const quarter = at(sbox.blendedPoseAt(aimer, 1, 0, 0.25));
  near(apart(quarter, [2 * Math.cos(0.25), 0, 2 * Math.sin(0.25)]), 0, 1e-6, `a quarter of the way, a quarter of the turn: ${quarter}`); // prettier-ignore
});

test("expectedOf, compareSbox: each blend held as an animation, and the graph's blends at their start, middle and end", () => {
  const expected = sbox.expectedOf(aimer, aimed, { perSequence: 2 });
  sure(expected.sequences.map((s) => s.name).join() === "idle,aim,aim_blend1,shoot,shoot_blend1,look,look_blend1,look_blend2,look_blend3", `every animation's length: ${expected.sequences.map((s) => s.name)}`); // prettier-ignore
  sure(expected.samples.filter((s) => s.sequence === "aim_blend1").length === 2, "a blend's frames sampled as its first's");
  const labels = expected.graphPoses.map((p) => p.name);
  sure(labels.slice(0, 3).join() === "aim at blend_xr -45,aim at blend_xr 7.5,aim at blend_xr 60" && labels.length === 10, `aim's start, middle and end; look's four corners: ${labels}`); // prettier-ignore
  sure(expected.graphParameters.join() === "sequence,blend_xr,blend_yr", `${expected.graphParameters}`);
  const code = sbox.probeCode(aimed.vmdl, expected.samples, expected.graphSamples);
  sure(code.includes('gr.Set( "sequence", "aim" );') && code.includes('gr.Set( "blend_xr", 7.500000f );') && /gr\.PlaybackRate = 0\.0001f/.test(code), "the graph told its animation and value, and held"); // prettier-ignore
  sure(code.indexOf('gr.Set( "sequence"') < code.indexOf("gr.Enabled = true"), "told before it starts, so it starts on that animation");
  const read = {
    bones: expected.bones,
    sequences: expected.sequences.map((s) => s.name),
    durations: Object.fromEntries(expected.sequences.map((s) => [s.name, s.duration])),
    parts: [],
    groups: [],
    attachments: [],
    hitboxes: [],
    poses: expected.poses.map((p) => ({ bones: p.bones })),
    graph: aimed.graph,
    graphParameters: ["sequence", "blend_xr", "blend_yr"],
    graphPoses: expected.graphPoses.map((p) => p.bones.map(([x, y, z]) => [x, y, z + 0.03])),
  };
  const good = sbox.compareSbox(expected, read);
  sure(good.passed && good.said.some((s) => /10 blends played by its graph \(models\/smak\/aimer\.vanmgrph\) held to GoldSrc's: the farthest bone 0\.030 units off/.test(s)), `${good.faults} ${good.said}`); // prettier-ignore
  const off = sbox.compareSbox(expected, { ...read, graphPoses: read.graphPoses.map((p, k) => (k === 1 ? p.map(([x, y, z]) => [x, y, z + 1]) : p)) }); // prettier-ignore
  sure(off.faults.some((f) => /1 of 10 blends played by its graph with a bone off GoldSrc's place: aim at blend_xr 7\.5/.test(f)), `${off.faults}`); // prettier-ignore
  const none = sbox.compareSbox(expected, { ...read, graph: null, graphParameters: [] });
  sure(none.faults.some((f) => /its animation graph is none, not models\/smak\/aimer\.vanmgrph/.test(f)), `${none.faults}`); // prettier-ignore
});

testCompiled("compiled: a model's animation graph compiles beside it", () => {
  const assets = join(folder, "Assets");
  sbox.writeSboxPort(aimed, assets);
  sbox.compileVmdl(assets, aimed.vmdl, { sbox: found });
  const result = sbox.compileVmdl(assets, aimed.graph, { sbox: found });
  sure(existsSync(join(assets, "models/smak/aimer.vanmgrph_c")) && !result.notes.length, `${result.notes.join("; ")}`);
});

test("compareSbox: a port read back whole passes, and says how far its farthest bone is", () => {
  const expected = sbox.expectedOf(portable, port, { perSequence: 2 });
  const read = {
    bones: expected.bones,
    sequences: expected.sequences.map((s) => s.name),
    durations: Object.fromEntries(expected.sequences.map((s) => [s.name, s.duration])),
    parts: [
      ["body", ["body_ref"]],
      ["gun", ["gun", "blank1"]],
    ],
    groups: ["default", "skin1"],
    attachments: expected.attachments,
    hitboxes: [["hitbox0", "Arm", "hitgroup_2"]],
    poses: expected.poses.map((p) => ({ bones: p.bones.map(([x, y, z]) => [x, y, z + 0.05]) })),
  };
  const result = sbox.compareSbox(expected, read);
  sure(
    result.passed && /5 poses held to GoldSrc's: the farthest bone 0\.050 units off/.test(result.said[1]),
    `${result.faults} ${result.said}`,
  );
});

test("compareSbox: a bone at the end of a long chain may be farther off than one near its root (a rotation compressed)", () => {
  const chain = (n, step) => ({
    bones: Array.from({ length: n }, (_, i) => [`b${i}`, i - 1]),
    pose: Array.from({ length: n }, (_, i) => [i * step, 0, 0]),
  });
  const check = ({ bones, pose }, off) => {
    const expected = {
      bones,
      sequences: [],
      parts: [],
      skins: 1,
      attachments: [],
      hitboxes: 0,
      samples: [{ sequence: "idle", time: 0 }],
      poses: [{ name: "idle", frame: 0, bones: pose }],
    };
    const read = {
      bones,
      sequences: [],
      durations: {},
      parts: [],
      groups: [],
      attachments: [],
      hitboxes: [],
      poses: [{ bones: pose.map(([x, y, z], i) => (i === pose.length - 1 ? [x, y + off, z] : [x, y, z])) }],
    };
    return sbox.compareSbox(expected, read);
  };
  const long = check(chain(9, 50), 0.15);
  sure(long.passed, `400 units of chain, 0.15 off: ${long.faults}`);
  const short = check(chain(2, 10), 0.15);
  sure(
    !short.passed && /b1 0\.15 units off/.test(short.faults[0]),
    `10 units of chain, 0.15 off: ${short.faults}`,
  );
  const turned = check(chain(9, 50), 400 * Math.sin(Math.PI / 180));
  sure(!turned.passed, "400 units of chain turned one degree");
});

test("projectFolder: a folder with no .sbproj is no s&box project, and says how to make one", () => {
  let said = "";
  try {
    sbox.projectFolder(folder);
  } catch (error) {
    said = error.message;
  }
  sure(/not an s&box project \(no \.sbproj in it\)/.test(said) && /sbox-cli --new/.test(said), said);
});

// ── a map (src/sbox/map.mjs, mapcheck.mjs), on the kit's own two rooms ──
import { HERE } from "./helper.mjs";

const twoRooms = join(HERE, "fixtures", "tworooms.bsp");
const roomsBsp = smak.maps.readBsp(readFileSync(twoRooms));
const roomsPort = sbox.portMapToSbox(twoRooms, { lighting: "lights" });
const roomsScene = JSON.parse(roomsPort.files.find((f) => f.path === roomsPort.scene).data);

/** A PolygonMesh's blob read back: its half-edges and its streams. */
function readMeshBlob(base64) {
  const b = Buffer.from(base64, "base64");
  let at = 0;
  const int = () => {
    at += 4;
    return b.readInt32LE(at - 4);
  };
  const sections = {};
  sure(int() === 1, "the blob's version");
  for (let n = int(); n > 0; n--) {
    const length = int();
    const name = b.toString("utf8", at, at + length);
    at += length;
    const size = int();
    sections[name] = b.subarray(at, at + size);
    at += size;
  }
  const ints = (buf) => Array.from({ length: buf.length / 4 }, (_, i) => buf.readInt32LE(i * 4));
  const floats = (buf, k) => Array.from({ length: buf.length / 4 / k }, (_, i) => Array.from({ length: k }, (_, j) => buf.readFloatLE((i * k + j) * 4))); // prettier-ignore
  const all = ints(sections.topology);
  const [nv, ne, nf] = all;
  const halfEdges = Array.from({ length: ne }, (_, i) => all.slice(3 + nv + i * 4, 7 + nv + i * 4));
  const faceEdges = all.slice(3 + nv + ne * 4, 3 + nv + ne * 4 + nf);
  return { nv, ne, nf, halfEdges, faceEdges, positions: floats(sections.positions, 3), uvs: floats(sections.texcoord, 2), materials: ints(sections.materialindex), sections }; // prettier-ignore
}

test("portMapToSbox: each face of the BSP a polygon of a MeshComponent, its half-edges whole, wound as s&box winds them, its texture where GoldSrc laid it", () => {
  const world = roomsScene.GameObjects.find((g) => g.Name === "worldspawn");
  const mesh = world.Components[0];
  sure(mesh.__type === "Sandbox.MeshComponent" && mesh.Collision === "Mesh" && mesh.Static, JSON.stringify({ ...mesh, Mesh: undefined }));
  const m = readMeshBlob(mesh.Mesh.Data);
  const drawn = smak.maps.modelFaces(roomsBsp, 0).filter((f) => !smak.maps.textureKind(smak.maps.faceTexture(roomsBsp, f).name).sky);
  sure(m.nf === drawn.length && m.nf === roomsPort.meshes[0].faces, `${m.nf} polygons, of ${drawn.length} faces`);
  for (const name of ["blends", "colors", "edgeflags"]) sure(m.sections[name].length === m.ne * 4, `${name}: one for each half-edge`);
  sure(m.uvs.length === m.ne && m.materials.length === m.nf, "a coordinate a half-edge, a material a face");
  m.halfEdges.forEach(([, twin], h) => sure(m.halfEdges[twin][1] === h, `half-edge ${h}: its twin's twin is not itself`));
  drawn.forEach((face, i) => {
    // round the polygon from its face's edge by `next`: GoldSrc's corners, the other way round
    const loop = [];
    for (let h = m.faceEdges[i], n = 0; n === 0 || h !== m.faceEdges[i]; h = m.halfEdges[h][2], n++) {
      sure(m.halfEdges[h][3] === i && n < 64, `polygon ${i}: an edge of another face, or no end`);
      loop.push(h);
    }
    const corners = loop.map((h) => m.positions[m.halfEdges[h][0]]);
    const goldsrc = smak.maps.facePolygon(roomsBsp, face);
    sure(corners.length === goldsrc.length, `polygon ${i}: ${corners.length} corners of ${goldsrc.length}`);
    // anticlockwise seen from the front, as s&box winds a face: its normal Newell's, summed round the polygon, as
    // PolygonMesh.PlaneEquation sums it (a BSP face keeps corners on its straight edges; its first three may be in
    // a line)
    const n = [0, 0, 0];
    corners.forEach((p, k) => {
      const q = corners[(k + 1) % corners.length];
      n[0] += p[1] * q[2] - p[2] * q[1];
      n[1] += p[2] * q[0] - p[0] * q[2];
      n[2] += p[0] * q[1] - p[1] * q[0];
    });
    const want = smak.maps.faceNormal(roomsBsp, face);
    sure(n.reduce((s, v, k) => s + v * want[k], 0) > 0, `polygon ${i} faces away from its face`);
    // each corner's coordinate GoldSrc's at that corner
    const uvs = smak.maps.faceUvs(roomsBsp, face);
    for (const h of loop) {
      const at = m.positions[m.halfEdges[h][0]];
      const k = goldsrc.findIndex((p) => p.every((v, j) => Math.abs(v - at[j]) < 1e-3));
      sure(k >= 0 && m.uvs[h].every((v, j) => Math.abs(v - uvs[k][j]) < 1e-4), `polygon ${i}: a corner's coordinate ${m.uvs[h]}, GoldSrc's ${uvs[k]}`); // prettier-ignore
    }
  });
});

test("portMapToSbox: the world tagged for traces, the func_wall its own, the start at its feet, the lights and the indirect light over the world; the grate alpha-tested, opaque, a power of two", () => {
  const byName = Object.fromEntries(roomsScene.GameObjects.map((g) => [g.Name, g]));
  sure(byName.worldspawn.Tags === sbox.WORLD_TAG, `the world's tags: ${byName.worldspawn.Tags}`);
  sure(byName["func_wall *1"].Components[0].Mesh.Materials[0] === "materials/smak/maps/tworooms/mask_smakgrate.vmat", "the grate's own material"); // prettier-ignore
  const start = byName.info_player_start;
  sure(start.Position === "96,96,4" && start.Components[0].__type === "Sandbox.SpawnPoint", `the start: ${start.Position}`);
  sure(start.Rotation === sbox.rotationOf([0, 90, 0]), "turned to its angle");
  const lights = roomsScene.GameObjects.filter((g) => g.Name === "light");
  sure(lights.length === 2 && lights.every((g) => g.Components[0].__type === "Sandbox.PointLight" && g.Components[0].Radius > 0), "two point lights"); // prettier-ignore
  const grate = roomsPort.files.find((f) => f.path.endsWith("mask_smakgrate.vmat")).data;
  sure(/F_ALPHA_TEST 1/.test(grate) && /TextureTranslucency "materials\/smak\/maps\/tworooms\/mask_smakgrate_mask\.png"/.test(grate), grate); // prettier-ignore
  const picture = smak.unpng(roomsPort.files.find((f) => f.path.endsWith("mask_smakgrate.png")).data);
  const mask = smak.unpng(roomsPort.files.find((f) => f.path.endsWith("mask_smakgrate_mask.png")).data);
  let opaque = true;
  for (let p = 3; p < picture.rgba.length; p += 4) opaque &&= picture.rgba[p] === 255;
  sure(opaque, "the grate's picture opaque, its holes in the mask");
  sure(mask.rgba.some((v, i) => i % 4 === 0 && v === 0) && mask.rgba.some((v, i) => i % 4 === 0 && v === 255), "the mask has holes and solid");
  sure(roomsScene.GameObjects.every((g) => /^[0-9a-f-]{36}$/.test(g.__guid)), "every object a GUID");
  const again = sbox.portMapToSbox(twoRooms, { lighting: "lights" });
  sure(again.files.find((f) => f.path === again.scene).data === roomsPort.files.find((f) => f.path === roomsPort.scene).data, "the same scene each time"); // prettier-ignore
  sure(/sky desert/.test(roomsPort.warnings.join(" ")) && roomsPort.sky === null, "a sky not found is said");
  const indirect = byName[sbox.INDIRECT_LIGHT]?.Components[0];
  const world = smak.maps.worldBounds(smak.maps.readBsp(readFileSync(twoRooms)));
  sure(indirect?.__type === "Sandbox.IndirectLightVolume" && indirect.RenderExcludeTags === "clip", "an indirect light volume, the clip brushes out of it"); // prettier-ignore
  sure(indirect.Bounds.Mins === world.mins.map((v) => v - 16).join(",") && indirect.Bounds.Maxs === world.maxs.map((v) => v + 16).join(","), `over the world: ${JSON.stringify(indirect.Bounds)}`); // prettier-ignore
});

test("portMapToSbox: a brush entity blocks with its every brush, unseen; starts of a mod's classes; a map's info_texlights; rendermode 5 additive", () => {
  const wall = roomsScene.GameObjects.find((g) => g.Name === "func_wall *1");
  sure(wall.Tags === sbox.BRUSH_TAG, `the func_wall's tags: ${wall.Tags}`);
  const solids = wall.Children ?? [];
  sure(solids.length > 0 && solids.every((c) => c.Tags === `${sbox.BRUSH_TAG},${sbox.CLIP_TAG}` && c.Components[0].Collision === "Hull" && c.Components[0].HideInGame), `its solids: ${solids.length}`); // prettier-ignore
  sure(roomsPort.meshes.find((m) => m.model === 1).at.join() === "0,0,0", "where the entity is, for the check");
  const none = sbox.portMapToSbox(twoRooms, { starts: ["ms_player_spawn"], lighting: "lights" });
  const noneScene = JSON.parse(none.files.find((f) => f.path === none.scene).data);
  sure(!noneScene.GameObjects.some((g) => g.Components?.[0]?.__type === "Sandbox.SpawnPoint"), "info_player_start not a start of the mod's");
  sure(/no spawn point \(ms_player_spawn\)/.test(none.warnings.join(" ")), none.warnings.join(" "));
  // the same rooms, the start an MSC one, the grate's texture made to shine by the map, the func_wall drawn added
  const entities = roomsBsp.entities.map((pairs) => {
    const keys = Object.fromEntries(pairs);
    if (keys.classname === "info_player_start") return pairs.map(([k, v]) => [k, k === "classname" ? "ms_player_begin" : v]);
    if (keys.classname === "func_wall") return pairs.map(([k, v]) => [k, k === "rendermode" ? "5" : k === "renderamt" ? "100" : v]);
    return pairs;
  });
  entities.push([["classname", "info_texlights"], ["origin", "0 0 0"], ["{smakgrate", "255 128 64 200"]]);
  const msc = join(tmp, "tworooms_msc.bsp");
  writeFileSync(msc, smak.maps.withEntities(readFileSync(twoRooms), entities));
  const port = sbox.portMapToSbox(msc, { starts: ["ms_player_begin", "ms_player_spawn"], lighting: "lights" });
  const scene = JSON.parse(port.files.find((f) => f.path === port.scene).data);
  sure(scene.GameObjects.some((g) => g.Name === "ms_player_begin" && g.Components[0].__type === "Sandbox.SpawnPoint"), "ms_player_begin a start");
  const grate = port.lights.find((l) => l.classname === "texlight" && /smakgrate/i.test(l.texture));
  sure(grate, "the grate shines, as its info_texlights says");
  // in the old compilers' measure: its colour as given, no reflectivity of the texture's; reaching as far as hlrad's
  const [r, g] = grate.colour;
  sure(Math.abs(g / r - (128 / 255) ** sbox.TEXLIGHT_POWER) < 1e-6, `its colour: ${grate.colour}`);
  const world = smak.maps.worldBounds(smak.maps.readBsp(readFileSync(msc)));
  const across = Math.hypot(...[0, 1, 2].map((c) => world.maxs[c] - world.mins[c]));
  const hlrad = (r / sbox.TEXLIGHT_SCALE) ** (1 / sbox.TEXLIGHT_POWER);
  sure(Math.abs(grate.reach - Math.min(across, sbox.TEXLIGHT_REACH * Math.sqrt(hlrad))) < 1e-6, `reach ${grate.reach}, red ${r}, across ${across}`); // prettier-ignore
  const drawn = scene.GameObjects.find((g) => g.Name === "func_wall *1").Components[0].Mesh.Materials[0];
  sure(drawn === "materials/smak/maps/tworooms_msc/mask_smakgrate_add100.vmat", drawn);
  // its share added in linear light: (100 / 255) to the power 2.2
  const vmat = port.files.find((f) => f.path === drawn).data;
  sure(/F_ADDITIVE_BLEND 1/.test(vmat) && /F_SELF_ILLUM 1/.test(vmat) && /g_vColorTint "\[0\.127530 0\.127530 0\.127530 0\.000000\]"/.test(vmat), vmat); // prettier-ignore
  // render mode 2 (glass) seen through at its renderamt; at renderamt 0 not drawn, and solid all the same
  const withWall = (keys) => {
    const changed = roomsBsp.entities.map((pairs) => (Object.fromEntries(pairs).classname === "func_wall" ? [...pairs.filter(([k]) => k !== "rendermode" && k !== "renderamt"), ...keys] : pairs)); // prettier-ignore
    const at = join(tmp, `tworooms_rm${keys.map(([, v]) => v).join("_")}.bsp`);
    writeFileSync(at, smak.maps.withEntities(readFileSync(twoRooms), changed));
    const p = sbox.portMapToSbox(at, { lighting: "lights" });
    return { p, wall: JSON.parse(p.files.find((f) => f.path === p.scene).data).GameObjects.find((g) => g.Name === "func_wall *1") }; // prettier-ignore
  };
  const glass = withWall([["rendermode", "2"], ["renderamt", "150"]]);
  const seen = glass.wall.Components[0].Mesh.Materials[0];
  const seenVmat = glass.p.files.find((f) => f.path === seen).data;
  sure(/_see150\.vmat$/.test(seen) && /F_TRANSLUCENT 1/.test(seenVmat) && /g_flOpacityScale "0\.588"/.test(seenVmat) && !/F_ADDITIVE_BLEND/.test(seenVmat), seenVmat); // prettier-ignore
  const gone = withWall([["rendermode", "2"], ["renderamt", "0"]]);
  sure(gone.wall.Components.length === 0 && gone.wall.Children?.length > 0, "faded to nothing: no mesh drawn, its solids kept");
  sure(!gone.p.meshes.some((m) => m.name === "func_wall *1"), "and no mesh for the check to look for");
  // out of render mode 4 a `{` texture's holes are filled with the palette's last colour, the picture opaque
  const normal = withWall([["rendermode", "0"], ["renderamt", "255"]]);
  const filled = normal.wall.Components[0].Mesh.Materials[0];
  const filledVmat = normal.p.files.find((f) => f.path === filled).data;
  sure(/mask_smakgrate_filled\.vmat$/.test(filled) && !/F_ALPHA_TEST/.test(filledVmat) && /mask_smakgrate_filled\.png/.test(filledVmat), filledVmat); // prettier-ignore
  const filledPicture = smak.unpng(normal.p.files.find((f) => f.path.endsWith("mask_smakgrate_filled.png")).data);
  const holed = smak.unpng(roomsPort.files.find((f) => f.path.endsWith("mask_smakgrate.png")).data);
  sure(filledPicture.rgba.every((v, i) => i % 4 !== 3 || v === 255) && filledPicture.rgba.some((v, i) => v !== holed.rgba[i]), "opaque, and the holes another colour than the open grate's"); // prettier-ignore
  sure(/_see150\.vmat$/.test(seen) && !/F_ALPHA_TEST/.test(seenVmat) && /mask_smakgrate_filled\.png/.test(seenVmat), "seen through, filled too");
});

test("portMapToSbox lighting lightmaps: the map's lightmaps in one atlas, each face's place there in its corners' colour, its materials SMAK's shader; no lights of s&box's to bake", () => {
  const port = sbox.portMapToSbox(twoRooms);
  const scene = JSON.parse(port.files.find((f) => f.path === port.scene).data);
  const types = scene.GameObjects.flatMap((g) => g.Components.map((c) => c.__type));
  sure(!types.includes("Sandbox.IndirectLightVolume") && !scene.GameObjects.some((g) => /^texlight/.test(g.Name)), "no indirect light, no texture lights"); // prettier-ignore
  sure(port.files.some((f) => f.path === sbox.LIGHTMAP_SHADER && /VertexPaintTintColor/.test(f.data)), "the shader written");
  const world = scene.GameObjects.find((g) => g.Name === "worldspawn").Components[0];
  const vmat = port.files.find((f) => f.path === world.Mesh.Materials[0]).data;
  sure(/\/lit\//.test(world.Mesh.Materials[0]) && vmat.includes(`shader "${sbox.LIGHTMAP_SHADER}"`) && /TextureLightmap "materials\/smak\/maps\/tworooms\/lightmap\.png"/.test(vmat), vmat); // prettier-ignore
  const grate = scene.GameObjects.find((g) => g.Name === "func_wall *1").Components[0].Mesh.Materials[0];
  sure(/_holes\.vmat$/.test(grate) && /F_ALPHA_TEST 1/.test(port.files.find((f) => f.path === grate).data), `the grate in render mode 4 keeps its holes: ${grate}`); // prettier-ignore
  // every face's corners lead to its own samples: a corner's texture pixel / 16 plus its place is the atlas pixel
  // of the sample it stands on
  const bsp = smak.maps.readBsp(readFileSync(twoRooms));
  const faces = bsp.models.flatMap((_, m) => smak.maps.modelFaces(bsp, m));
  const atlas = sbox.lightmapAtlas(bsp, faces);
  let checked = 0;
  for (const face of faces) {
    const place = atlas.offsetOf(face);
    const lightmap = smak.maps.faceLightmap(bsp, face);
    if (!place) continue;
    const offset = [place[0] + place[1] * 256 - sbox.OFFSET_BIAS, place[2] + place[3] * 256 - sbox.OFFSET_BIAS];
    for (const [s, t] of smak.maps.faceTexels(bsp, face)) {
      const i = Math.floor((s - lightmap.originS) / 16 + 1e-6);
      const j = Math.floor((t - lightmap.originT) / 16 + 1e-6);
      const x = Math.floor(s / 16 + offset[0] + 1e-6);
      const y = Math.floor(t / 16 + offset[1] + 1e-6);
      const want = [...lightmap.styles[0].rgb.subarray((j * lightmap.width + i) * 3, (j * lightmap.width + i) * 3 + 3)];
      const got = [...atlas.rgba.subarray((y * atlas.width + x) * 4, (y * atlas.width + x) * 4 + 3)];
      sure(want.join() === got.join(), `face ${face}, corner ${s} ${t}: ${got} in the atlas, ${want} in its lightmap`);
      checked++;
    }
  }
  sure(checked > 20, `${checked} corners`);
  // and in the world's mesh, its faces' corners carry their places
  const colors = readMeshBlob(world.Mesh.Data).sections.colors;
  sure(colors.some((v) => v !== 0), "the world's corners coloured");
  const lights = sbox.portMapToSbox(twoRooms, { lighting: "lights" });
  sure(sbox.meshBlob([{ corners: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], uvs: [[0, 0], [1, 0], [0, 1]], material: 0, color: [1, 2, 3, 4] }]) !== sbox.meshBlob([{ corners: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], uvs: [[0, 0], [1, 0], [0, 1]], material: 0 }]) && lights.files.some((f) => /IndirectLightVolume/.test(f.data)), "lighting lights keeps s&box's"); // prettier-ignore
});

test("lightmapAtlas styles: a steady style added at its letter's share, one that changes in a layer below with its pattern's row; stylePatterns as the game starts them", () => {
  const bsp = smak.maps.readBsp(readFileSync(twoRooms));
  const faces = bsp.models.flatMap((_, m) => smak.maps.modelFaces(bsp, m));
  const face = faces.find((f) => smak.maps.faceLightmap(bsp, f)?.styles.length === 1);
  const lightmap = smak.maps.faceLightmap(bsp, face);
  const pixelOf = (atlas, x, y) => [...atlas.rgba.subarray((y * atlas.width + x) * 4, (y * atlas.width + x) * 4 + 4)];
  const firstOf = (atlas) => {
    const place = atlas.offsetOf(face);
    // the face's first sample: its place plus its first sample's place on the texture's grid
    return [place[0] + place[1] * 256 - sbox.OFFSET_BIAS + lightmap.originS / 16, place[2] + place[3] * 256 - sbox.OFFSET_BIAS + lightmap.originT / 16]; // prettier-ignore
  };
  const baked = [...lightmap.styles[0].rgb.subarray(0, 3)];
  const plain = sbox.lightmapAtlas(bsp, faces);
  sure(plain.layers === 0 && plain.styles === null && pixelOf(plain, ...firstOf(plain)).slice(0, 3).join() === baked.join(), "as baked"); // prettier-ignore
  const dark = sbox.lightmapAtlas(bsp, faces, new Map([[0, "a"]]));
  sure(dark.offsetOf(face) === null, "a style dark has no patch");
  const bright = sbox.lightmapAtlas(bsp, faces, new Map([[0, "z"]]));
  const brighter = pixelOf(bright, ...firstOf(bright)).slice(0, 3);
  sure(brighter.every((v, c) => v === Math.min(255, Math.round((baked[c] * 25) / 12))), `"z": ${brighter} from ${baked}`);
  const flicker = sbox.lightmapAtlas(bsp, faces, new Map([[0, "maz"]]));
  const [x, y] = firstOf(flicker);
  sure(flicker.layers === 1 && pixelOf(flicker, x, y).slice(0, 3).join() === "0,0,0", "nothing steady");
  const below = pixelOf(flicker, x, y + flicker.firstLayer);
  sure(below.slice(0, 3).join() === baked.join() && below[3] === 0, `the layer below: ${below}`);
  sure(flicker.height >= flicker.firstLayer + flicker.layerHeight && flicker.layerHeight <= flicker.firstLayer, "one layer, as tall as the faces that change"); // prettier-ignore
  const { rows, rgba, width } = flicker.styles;
  sure(rows.join() === "0" && [rgba[0], rgba[4], rgba[8], rgba[12]].join() === "120,0,250,120" && rgba[1] === 3 && width === 64, "its pattern, m a z, three long"); // prettier-ignore
  // the game's patterns: HL's under 32, a switched light's its own or "m", "a" when it starts dark
  const light = (style, extra = []) => [["classname", "light"], ["style", String(style)], ...extra];
  const patterns = smak.maps.stylePatterns({ entities: [light(32, [["pattern", "aaz"]]), light(33, [["spawnflags", "1"]]), light(34)] }); // prettier-ignore
  sure(patterns.get(1) === "mmnmmommommnonmmonqnmmo" && patterns.get(32) === "aaz" && patterns.get(33) === "a" && patterns.get(34) === "m", [...patterns].join(" ")); // prettier-ignore
  // a map with no style that changes writes no styles picture
  const port = sbox.portMapToSbox(twoRooms);
  sure(!port.files.some((f) => /lightstyles\.png$/.test(f.path)), "no styles picture for a map with none");
});

test("portMapToSbox: the world's sky faces solid, never drawn, under the clip brushes", () => {
  // the rooms with their floor's texture named sky: its 6 faces
  const bytes = Buffer.from(readFileSync(twoRooms));
  const floor = smak.maps.readBsp(bytes).textures.find((t) => t.name === "smakfloor");
  bytes.fill(0, floor.at, floor.at + 16).write("sky", floor.at, "latin1");
  const skyRooms = join(tmp, "tworooms_sky.bsp");
  writeFileSync(skyRooms, bytes);
  const port = sbox.portMapToSbox(skyRooms);
  const scene = JSON.parse(port.files.find((f) => f.path === port.scene).data);
  const skyClip = scene.GameObjects.find((g) => g.Name === "clip")?.Children?.find((c) => c.Name === "sky clip");
  sure(skyClip, "a sky clip");
  const mesh = skyClip.Components[0];
  sure(mesh.Collision === "Mesh" && mesh.HideInGame === true && skyClip.Tags.includes(sbox.CLIP_TAG), JSON.stringify({ ...mesh, Mesh: undefined })); // prettier-ignore
  sure(port.meshes.find((m) => m.name === "sky clip")?.faces === 6, "its 6 faces");
  const world = scene.GameObjects.find((g) => g.Name === "worldspawn").Components[0];
  sure(!world.Mesh.Materials.some((m) => /smakfloor/.test(m)), "the sky not drawn");
});

test("writeSboxMap: a bake recorded is kept by a port that writes the same, its old files removed; a port that writes otherwise bakes again", () => {
  const out = join(tmp, "bake_assets");
  rmSync(out, { recursive: true, force: true });
  const first = sbox.portMapToSboxFile(twoRooms, { out, lighting: "lights" });
  sure(first.baked === false && /^[0-9a-f]{64}$/.test(first.bakeKey), "nothing to keep at first");
  // the editor's bake as it leaves it: the scene saved naming three textures, an older bake's beside them
  const ddgi = join(out, sbox.sceneDataOf(first.scene), "ddgi");
  mkdirSync(ddgi, { recursive: true });
  const id = (n) => n.toString(16).padStart(32, "0");
  const scene = JSON.parse(readFileSync(join(out, first.scene), "utf8"));
  const volume = scene.GameObjects.find((g) => g.Name === sbox.INDIRECT_LIGHT).Components[0];
  for (const field of sbox.BAKED_FIELDS) {
    const kind = field.replace("Texture", "");
    volume[field] = `${sbox.sceneDataOf(first.scene)}/ddgi/indirect light_${kind.toLowerCase()}_${volume.__guid}_${id(2)}.vtex`;
    for (const n of [1, 2]) writeFileSync(join(ddgi, `indirect light_${kind}_${volume.__guid}_${id(n)}.vtex_c`), "");
  }
  writeFileSync(join(out, first.scene), JSON.stringify(scene));
  const textures = sbox.recordBake(out, first.scene, first.bakeKey);
  sure(textures?.IrradianceTexture === volume.IrradianceTexture, "recorded");
  const left = readdirSync(ddgi);
  sure(left.length === 3 && left.every((n) => n.includes(id(2))), `the older bake's files removed: ${left}`);
  const again = sbox.portMapToSboxFile(twoRooms, { out, lighting: "lights" });
  const kept = JSON.parse(readFileSync(join(out, again.scene), "utf8")).GameObjects.find((g) => g.Name === sbox.INDIRECT_LIGHT).Components[0]; // prettier-ignore
  sure(again.baked && sbox.BAKED_FIELDS.every((f) => kept[f] === volume[f]), "the same port keeps the bake");
  // the same scene of a map changed (the grate drawn otherwise)
  const bsp = smak.maps.readBsp(readFileSync(twoRooms));
  const changed = join(tmp, "tworooms_changed.bsp");
  writeFileSync(changed, smak.maps.withEntities(readFileSync(twoRooms), bsp.entities.map((pairs) => (Object.fromEntries(pairs).classname === "func_wall" ? pairs.map(([k, v]) => [k, k === "rendermode" ? "0" : v]) : pairs)))); // prettier-ignore
  const other = sbox.portMapToSboxFile(changed, { out, name: "tworooms", lighting: "lights" });
  sure(other.scene === first.scene && !other.baked && other.bakeKey !== first.bakeKey, "a port that writes otherwise bakes again");
});

test("rotationOf: Source's angles as s&box's quaternion: yaw turns left about up, pitch looks down", () => {
  const q = (s) => s.split(",").map(Number);
  const yaw = q(sbox.rotationOf([0, 90, 0]));
  sure(Math.abs(yaw[2] - Math.SQRT1_2) < 1e-4 && Math.abs(yaw[3] - Math.SQRT1_2) < 1e-4, `yaw 90: ${yaw}`);
  // a quaternion's forward, its +X turned
  const forward = ([x, y, z, w]) => [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)];
  const down = forward(q(sbox.rotationOf([90, 0, 0])));
  sure(Math.abs(down[2] + 1) < 1e-4, `pitch 90 looks ${down}`);
  const left = forward(q(sbox.rotationOf([0, 90, 0])));
  sure(Math.abs(left[1] - 1) < 1e-4, `yaw 90 looks ${left}`);
});

test("compareSboxMap: a scene read back whole passes; a mesh missing, faces lost, a spot blocked otherwise, a floor elsewhere are said", () => {
  const expected = sbox.expectedMapOf(twoRooms, roomsPort, { count: 200 });
  const read = {
    meshes: roomsPort.meshes.map((m) => ({ name: m.name, faces: m.faces, bad: 0, materials: m.materials, collision: m.collision })), // prettier-ignore
    sky: [],
    spawns: roomsPort.spawns.map((s) => s.feet.join(",")),
    lights: roomsPort.lights.map((l) => ({ at: l.origin.join(","), forward: "1,0,0" })),
    standing: expected.standing.map((b) => (b ? "1" : "0")).join(""),
    ducked: expected.ducked.map((b) => (b ? "1" : "0")).join(""),
    under: expected.floors.map((f) => ({ hit: true, z: f.floor, stuck: false })),
  };
  const whole = sbox.compareSboxMap(expected, read);
  sure(whole.passed, whole.faults.join("; "));
  sure(/200 spots: standing, 0 disagree/.test(whole.said.join(" ")), whole.said.join(" | "));
  const broken = sbox.compareSboxMap(expected, {
    ...read,
    meshes: [{ ...read.meshes[0], faces: read.meshes[0].faces - 1, collision: "None" }],
    standing: read.standing.replace(/1/g, "0"),
    under: [{ hit: true, z: 8, stuck: false }],
  });
  const said = broken.faults.join(" | ");
  sure(!broken.passed, "a broken scene passes");
  for (const want of [/func_wall \*1: no mesh/, /worldspawn: \d+ faces, of/, /worldspawn: collides as None, not Mesh/, /standing: \d+ of 200 spots blocked otherwise/, /its floor at 8\.00, GoldSrc's at 0/]) // prettier-ignore
    sure(want.test(said), `${want} not in: ${said}`);
});

test("compareLight: s&box's pictures as bright as GoldSrc's and lit in the same places pass; too dark, or lit elsewhere, are said", () => {
  const view = (k) => Array.from({ length: 144 }, (_, i) => 20 + ((i * 7 + k * 13) % 50));
  const goldsrc = [0, 1, 2].map(view);
  const same = sbox.compareLight(goldsrc, goldsrc.map((g) => g.map((v) => v * 1.1)));
  sure(!same.faults.length && Math.abs(same.ratio - 1.1) < 1e-9 && same.likeness > 0.999, same.faults.join("; "));
  const dark = sbox.compareLight(goldsrc, goldsrc.map((g) => g.map((v) => v * 0.5)));
  sure(/0\.50 times as bright as GoldSrc's/.test(dark.faults.join(" ")), dark.faults.join("; "));
  const elsewhere = sbox.compareLight(goldsrc, goldsrc.map((g) => [...g].reverse()));
  sure(/in other places than GoldSrc's/.test(elsewhere.faults.join(" ")), elsewhere.faults.join("; "));
  const grid = sbox.brightnessGrid({ width: 32, height: 18, rgba: new Uint8Array(32 * 18 * 4).fill(100) });
  sure(grid.length === 144 && grid.every((v) => Math.abs(v - 100) < 1e-9), "a flat picture's regions all its brightness");
});

test("mapProbeCode, lightCamerasCode, bakeIndirectLightCode: the scene opened, the world alone asked at every spot and floor; a camera at each start; its indirect light baked", () => {
  const code = sbox.mapProbeCode("scenes/smak/tworooms.scene", [[1, 2, 3], [4, 5, 6]], [[96, 96, 40]]);
  sure(/OpenScene/.test(code) && /"scenes\/smak\/tworooms\.scene"/.test(code), "the scene");
  sure(/new float\[\] \{ 1f, 2f, 3f, 4f, 5f, 6f \}/.test(code) && /new float\[\] \{ 96f, 96f, 40f \}/.test(code), "the spots and floors"); // prettier-ignore
  sure((code.match(/WithAnyTags\( "world", "brush" \)/g) ?? []).length === 4, "the world and the solid brush entities, in every trace");
  sure(/SceneEditorSession\.All\.Where\( x => x\.Scene\?\.Source\?\.ResourcePath == file\.ResourcePath \)/.test(code) && /open\.Destroy\(\)/.test(code), "a tab already open on the scene closed first"); // prettier-ignore
  const cameras = sbox.lightCamerasCode(sbox.lightViewsOf(roomsPort));
  sure(/new float\[\] \{ 96f, 96f, 68f, 90f \}/.test(cameras) && /FieldOfView = 80/.test(cameras), cameras);
  sure(/Tags\.Has\( "clip" \)/.test(sbox.lightCamerasGoneCode()), "the clip brushes shown again after");
  const bake = sbox.bakeIndirectLightCode();
  sure(/GetAllComponents<IndirectLightVolume>/.test(bake) && /await v\.BakeProbes\(\)/.test(bake) && (bake.match(/Save\( false \)/g) ?? []).length === 2, "the volumes baked, the scene saved before and after"); // prettier-ignore
});

test("compileFailures: the materials asset_compile says it could not compile, in the order asked", () => {
  const answered = JSON.stringify([{ Success: true, Path: "a.vmat" }, { Success: false, Path: "b.vmat" }]);
  sure(sbox.compileFailures(answered, ["a.vmat", "b.vmat"]).join() === "b.vmat", "b failed");
  sure(sbox.compileFailures(JSON.stringify(answered), ["a.vmat", "b.vmat"]).join() === "b.vmat", "said inside a string");
});

// ── a port's materials compiled, and how it looks (check.mjs) ──
test("portToSbox: a holed texture whose sides are not powers of two made so, its picture opaque, its holes in its mask", () => {
  const holed = { name: "net.bmp", width: 6, height: 4, pixels: Uint8Array.from({ length: 24 }, (_, i) => (i % 3 ? 1 : 255)), palette: new Uint8Array(768).fill(90), flags: 64 }; // prettier-ignore
  const netted = sbox.portToSbox(
    smak.buildMdl({ name: "net.mdl", bones: portBones, bodyparts: [{ name: "body", models: [{ name: "net", meshes: [{ tris: [tri(0)], texture: holed }] }] }], sequences: [{ name: "idle", fps: 10, frames: [still] }] }), // prettier-ignore
    { name: "net" },
  );
  const pictureOf = (end) => smak.unpng(netted.files.find((f) => f.path.endsWith(end)).data);
  const picture = pictureOf("/net.png");
  const mask = pictureOf("/net_mask.png");
  sure(picture.width === 8 && picture.height === 4 && mask.width === 8 && mask.height === 4, `${picture.width}x${picture.height}, its mask ${mask.width}x${mask.height}`); // prettier-ignore
  let opaque = true;
  for (let p = 3; p < picture.rgba.length; p += 4) opaque &&= picture.rgba[p] === 255;
  sure(opaque, "the picture opaque");
  sure(mask.rgba.some((v, i) => i % 4 === 0 && v === 0) && mask.rgba.some((v, i) => i % 4 === 0 && v === 255), "the mask has holes and solid");
});

testCompiled("compiled: every material of the port compiled with it; one that is not is said, with the model compiled", () => {
  const assets = join(folder, "Assets");
  sbox.writeSboxPort(port, assets);
  const materials = port.files.map((f) => f.path).filter((p) => p.endsWith(".vmat"));
  sbox.compileVmdl(assets, port.vmdl, { sbox: found, materials });
  sure(materials.every((m) => existsSync(join(assets, `${m}_c`))), `${materials.join(", ")} each compiled`);
  // a holed material whose mask is not a power of two each way, as the port made them before: the compiler makes no
  // mipmaps of it, compiles the model all the same, and says so only in a texture's line
  const holes = Uint8Array.from({ length: 6 * 4 * 4 }, (_, i) => (i % 4 === 3 ? (i % 8 === 3 ? 0 : 255) : 128));
  writeFileSync(join(assets, "materials/models/smak/portable_thing/odd.png"), smak.png(6, 4, holes));
  writeFileSync(join(assets, "materials/models/smak/portable_thing/odd.vmat"), sbox.vmatOf({ color: "materials/models/smak/portable_thing/odd.png", mask: "materials/models/smak/portable_thing/odd.png", flags: 64 })); // prettier-ignore
  let said = "";
  try {
    sbox.compileVmdl(assets, port.vmdl, { sbox: found, materials: [...materials, "materials/models/smak/portable_thing/odd.vmat"] }); // prettier-ignore
  } catch (error) {
    said = error.message;
  }
  sure(/but not 1 of its materials: materials\/models\/smak\/portable_thing\/odd\.vmat/.test(said) && /non-power-of-two/.test(said), said); // prettier-ignore
});

test("compareLooks: s&box's pictures as the kit's pass; a material drawn red, holes filled, a part missing are said", () => {
  const [w, h] = [64, 64];
  const picture = (paint) => {
    const rgba = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) rgba.set([...(paint(x, y) ?? sbox.LOOK.background), 255], (y * w + x) * 4);
    return { width: w, height: h, rgba };
  };
  // a body (grey) with a net in it (holes of 4 by 4 pixels) and an arm (brown)
  const body = (x, y) => (x >= 16 && x < 48 && y >= 8 && y < 56 ? (x >= 24 && x < 40 && y >= 20 && y < 36 && ((x >> 2) + (y >> 2)) % 2 ? null : [120, 120, 120]) : x >= 48 && x < 64 && y >= 8 && y < 56 ? [110, 70, 40] : null); // prettier-ignore
  const kit = [picture(body), picture(body)];
  const same = sbox.compareLooks(kit, kit.map((p) => ({ ...p, rgba: p.rgba.map((v, i) => (i % 4 === 3 ? v : Math.min(255, v + 3))) })));
  sure(!same.faults.length && same.shape === 1 && same.colour === 0, same.faults.join("; "));
  // drawn a pixel over: the same silhouette
  const over = sbox.compareLooks(kit, kit.map(() => picture((x, y) => body(x - 1, y))));
  sure(!over.faults.length && over.shape === 1, `a pixel over: ${over.faults.join("; ")}`);
  const red = sbox.compareLooks(kit, [picture(body), picture((x, y) => (body(x, y) ? [200, 20, 20] : null))]);
  sure(red.faults.length === 1 && /view 2, its colours not the original's/.test(red.faults[0]), red.faults.join("; "));
  // a chrome texture's pixels are not compared: the kit draws chrome from the eye, the port from one place
  const chrome = sbox.compareLooks(kit, [picture(body), picture((x, y) => (body(x, y) ? [200, 20, 20] : null))], { skip: [[], new Uint8Array(64 * 64).fill(1)] }); // prettier-ignore
  sure(!chrome.faults.length, chrome.faults.join("; "));
  const filled = sbox.compareLooks(kit, [picture((x, y) => (x >= 16 && x < 48 && y >= 8 && y < 56 ? [120, 120, 120] : body(x, y))), kit[1]]); // prettier-ignore
  const armless = sbox.compareLooks(kit, [kit[0], picture((x, y) => (x >= 48 ? null : body(x, y)))]);
  sure(/view 1, its shape not the original's/.test(filled.faults.join(" ")) || filled.shape < 1, `holes filled: ${filled.shape}`);
  sure(armless.faults.some((f) => /view 2, its shape not the original's/.test(f)), `an arm missing: ${armless.faults.join("; ")} (${armless.shape})`); // prettier-ignore
});

test("lookViewsOf, lookProbeCode: four eyes round the model at the distance that fits it; s&box's scene of its own, ticked, lit white", () => {
  const { views, dist, mid } = sbox.lookViewsOf({ mid: [0, 0, 36], far: 40 });
  sure(views.length === 4 && dist > 40, `${views.length} views at ${dist}`);
  for (const v of views) near(Math.hypot(...v.eye.map((e, k) => e - mid[k])), dist, 1e-6, "each eye that far from the middle");
  sure(views[0].eye[0] > 0 && views[0].angles[1] === 180, "the first from the front, looking back along -x");
  const code = sbox.lookProbeCode("models/smak/x.vmdl", views);
  sure(/new Scene\(\)/.test(code) && /GameTick/.test(code) && /AmbientLight>\(\)\.Color = Color\.White/.test(code) && /RenderToBitmap/.test(code), code); // prettier-ignore
  sure((code.match(/new float\[\] \{/g) ?? []).length === 4, "four views");
});

test("sbox map: each texture's type from the game's sound/materials.txt as its material's surface, one of SMAK's own a type", () => {
  const game = join(tmp, "sbox-typed-game");
  mkdirSync(join(game, "sound"), { recursive: true });
  writeFileSync(join(game, "sound", "materials.txt"), "M SMAKFLOOR\nV SMAKGRATE\n");
  for (const lighting of ["lights", "lightmaps"]) {
    const port = sbox.portMapToSbox(twoRooms, { folders: [game], lighting });
    const vmats = port.files.filter((f) => f.path.endsWith(".vmat") && !/playerclip|sky\//.test(f.path));
    const surfaceIn = (name) => vmats.filter((f) => f.path.includes(name)).map((f) => f.data.match(/PhysicsSurfaceProperties "([^"]+)"/)?.[1]); // prettier-ignore
    sure(surfaceIn("smakfloor").length && surfaceIn("smakfloor").every((s) => s === "goldsrc_metal"), `${lighting}: the floor's: ${surfaceIn("smakfloor")}`); // prettier-ignore
    sure(surfaceIn("smakwall").every((s) => s === "goldsrc_concrete"), `${lighting}: a texture listed nowhere is concrete: ${surfaceIn("smakwall")}`); // prettier-ignore
    sure(surfaceIn("smakgrate").length && surfaceIn("smakgrate").every((s) => s === "goldsrc_vent"), `${lighting}: {smakgrate as SMAKGRATE, its { stripped as the engine does: ${surfaceIn("smakgrate")}`); // prettier-ignore
    const surfaces = port.files.filter((f) => f.path.startsWith("surfaces/")).map((f) => f.path).sort();
    sure(surfaces.join() === "surfaces/goldsrc_concrete.surface,surfaces/goldsrc_metal.surface,surfaces/goldsrc_vent.surface", `${lighting}: each surface once: ${surfaces}`); // prettier-ignore
  }
  const vent = sbox.surfaceOfType("V");
  sure(vent.name === "goldsrc_vent" && JSON.parse(vent.data).BaseSurface === "surfaces/metal.sheet.surface", "a vent on s&box's thin metal");
  sure(sbox.surfaceOfType("?").name === "goldsrc_concrete", "an unknown type is concrete");
  sure(!/SystemAttributes/.test(sbox.vmatOf({ color: "a.png" })), "a model's material has no surface unless given one");
});

test("sboxDecal: a decals.wad texture as the engine reads it, masked by a blue last colour or a gradient, at its size", () => {
  const palette = new Uint8Array(768);
  palette.set([200, 10, 10], 3); // colour 1
  palette.set([0, 0, 255], 765);
  const pixels = Uint8Array.from({ length: 16 }, (_, i) => (i === 5 ? 1 : 255));
  const masked = smak.maps.decalRgba({ width: 4, height: 4, pixels, palette });
  sure(!masked.gradient && masked.rgba[5 * 4 + 3] === 255 && masked.rgba[3] === 0 && masked.rgba[5 * 4] === 200, "a hole where 255, the colour elsewhere"); // prettier-ignore
  const red = palette.slice();
  red.set([90, 0, 0], 765);
  const blood = smak.maps.decalRgba({ width: 4, height: 4, pixels: Uint8Array.from({ length: 16 }, (_, i) => i * 16), palette: red }); // prettier-ignore
  sure(blood.gradient && blood.rgba[0] === 90 && blood.rgba[3] === 0 && blood.rgba[15 * 4 + 3] === 240, "a gradient: the last colour, the index as the alpha"); // prettier-ignore
  const made = sbox.sboxDecal({ width: 4, height: 4, pixels, palette }, { picture: "materials/x/shot.png" });
  const decal = JSON.parse(made.decal);
  sure(decal.Width === 4 && decal.Height === 4 && decal.ColorTexture.data.FilePath === "materials/x/shot.png", "its definition: the texture's size in units, its picture"); // prettier-ignore
  sure(made.png.subarray(1, 4).toString() === "PNG", "its picture");
});

test("spriteFrameRgba: a sprite's frame by its format, as the engine reads it", () => {
  const palette = new Uint8Array(768);
  palette.set([10, 20, 30], 3);
  palette.set([0, 0, 255], 765);
  const sprite = (format) => ({ format, palette, frames: [{ width: 2, height: 1, pixels: Uint8Array.from([1, 255]) }] });
  const [add, holes, cover] = ["additive", "alpha test", "index alpha"].map((f) => smak.maps.spriteFrameRgba(sprite(f), 0).rgba);
  sure(add.join() === "10,20,30,255,0,0,255,255", `additive: every pixel its colour, opaque: ${add}`);
  sure(holes.join() === "10,20,30,255,0,0,0,0", `alpha test: 255 a hole, black and clear: ${holes}`);
  sure(cover.join() === "0,0,255,1,0,0,255,255", `index alpha: the last colour, the index as alpha: ${cover}`);
});
