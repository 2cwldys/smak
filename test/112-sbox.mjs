// s&box (src/sbox/): the DMX of a mesh and of an animation, KV3 text, ModelDoc's document and a material, a GoldSrc
// model ported (its files, what is renamed and why), and a port compiled by s&box's resourcecompiler.
//
// No game: every model is made here. The compile runs where s&box is found (a Steam library, SMAK_SBOX or
// FACEPUNCH_ENGINE), and is said to be skipped where it is not, as GMod's studiomdl's cases are.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
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

// ── held to the original in the editor (the parts that need no editor) ──
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
