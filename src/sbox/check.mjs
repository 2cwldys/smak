// A port held to its original in s&box's own editor: the compiled model read back there and played, frame by frame,
// and each bone's place set beside where GoldSrc's animation puts it.
//
//   probeCode(vmdl, samples)                       the C# that reads a compiled model and poses it (run_csharp)
//   expectedOf(src, port, { groups, samples })     what the original says: its bones' names, animations' lengths,
//                                                  parts, skins, attachments, hit boxes, and its poses
//   compareSbox(expected, read, { tolerance })     -> { passed, faults, said, worst }
//   checkSboxPort(file, { project, name, folder, kind, sbox, perSequence, shot }) -> the whole check, in the editor
//
// WHAT IS HELD. The compiled model must have every bone of the port, under its parent; every animation, of its
// length ((frames - 1) / fps); every bodypart with its choices; a material group a skin (none when one); every
// attachment and hit box. Then each animation is played at its first frame and its middle one (more with
// perSequence), stopped there, and every bone's place in the model's space read: it must be where GoldSrc's frame
// puts it (mdl.poseAt), within `tolerance` units. A model turned, a bone misnamed (its channel then moves nothing),
// a bone dropped, a walk whose travel was not taken out all show as bones off their place.
//
// THE EDITOR. The check runs in the project's editor (editor.mjs: the one open, else one opened and closed
// after). Its probe object is made in the scene being edited and removed before the check ends; the scene is not
// saved. Its picture (`shot`) is the editor's camera on the model posed in its first animation.
import { readStudio, sequenceFilesOf } from "../studio-file.mjs";
import { sequenceGroups, poseAt, sequences as sequencesOf, readSequence } from "../mdl.mjs";
import { portToSbox } from "./port.mjs";
import { sourceName } from "../source/port.mjs";
import { editorFor, runCsharp, sboxCall, projectFolder } from "./editor.mjs";
import { compileVmdl, findSbox } from "./compile.mjs";
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/** How far a bone may be from GoldSrc's place, in units: s&box compresses its animations (Half-Life's barney,
 * houndeye, scientist and hgrunt, 918 poses: 0.025 at most). */
export const POSE_TOLERANCE = 0.1;
/** And how much farther, per unit of the bone's chain (its links to the root, end to end, in the pose): a rotation
 * compressed turns a long chain's end by more (all 210 of Half-Life's models: tentacle2's, nihilanth's, the osprey's
 * and the loader's ends of chain up to 0.19 off). 0.0005 is a turn of 0.03 degrees; a model turned by one degree
 * is 35 times that. */
export const REACH_TOLERANCE = 0.0005;
/** The probe object's name in the scene, and where it stands: away from anything of the person's. */
const PROBE = "smak_sbox_check";
const PROBE_AT = [0, 0, -10000];

const csString = (s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/**
 * The C# that reads the compiled model at `vmdl` and poses it at each of `samples` ([{ sequence, time }]). It
 * returns { error } or { bones, sequences, parts, groups, attachments, hitboxes, poses }; the probe object is left
 * posed at the first sample for a picture, and removed by removeProbeCode.
 */
export function probeCode(vmdl, samples) {
  const list = samples.map((s) => `(${csString(s.sequence)}, ${Number(s.time).toFixed(6)}f)`).join(", ");
  return `
var model = Model.Load( ${csString(vmdl)} );
if ( model is null || model.IsError ) return new { error = "the model did not load: " + ${csString(vmdl)} };
var scene = Editor.SceneEditorSession.Active?.Scene ?? Game.ActiveScene;
foreach ( var old in scene.GetAllObjects( true ).Where( g => g.Name == ${csString(PROBE)} ).ToList() ) old.Destroy();
var r3 = ( Vector3 v ) => new[] { MathF.Round( v.x, 4 ), MathF.Round( v.y, 4 ), MathF.Round( v.z, 4 ) };
var bones = Enumerable.Range( 0, model.BoneCount ).Select( i => new object[] { model.GetBoneName( i ), model.GetBoneParent( i ) } ).ToArray();
var sequences = Enumerable.Range( 0, model.AnimationCount ).Select( i => model.GetAnimationName( i ) ).ToArray();
var parts = model.Parts.All.Select( p => new object[] { p.Name, p.Choices.Select( c => c.Name ).ToArray() } ).ToArray();
var groups = Enumerable.Range( 0, model.MaterialGroupCount ).Select( i => model.GetMaterialGroupName( i ) ).ToArray();
var attachments = Enumerable.Range( 0, model.AttachmentCount ).Select( i => model.GetAttachmentName( i ) ).ToArray();
var hitboxes = ( model.HitboxSet?.All ?? new HitboxSet.Box[0] ).Select( h => new object[] { h.Name, h.Bone?.Name, string.Join( ",", h.Tags?.TryGetAll() ?? new string[0] ) } ).ToArray();
var go = scene.CreateObject();
go.Name = ${csString(PROBE)};
go.WorldPosition = new Vector3( ${PROBE_AT.join(", ")} );
var r = go.Components.Create<SkinnedModelRenderer>();
r.Model = model;
r.UseAnimGraph = false;
r.PlayAnimationsInEditorScene = true;
var poses = new System.Collections.Generic.List<object>();
var durations = new System.Collections.Generic.Dictionary<string, float>();
var samples = new (string, float)[] { ${list} };
foreach ( var (name, time) in samples.Reverse() )
{
	r.Sequence.Name = name;
	r.Sequence.PlaybackRate = 0;
	// a looping renderer wraps an animation's very end to its start: not looping, it holds its last frame
	r.Sequence.Looping = false;
	var t = time;
	r.Sequence.Time = t;
	await Task.Delay( 40 );
	r.Sequence.Time = t;
	await Task.Delay( 40 );
	durations[name] = r.Sequence.Duration;
	var world = r.GetBoneTransforms( true );
	poses.Insert( 0, new { sequence = name, time, at = r.Sequence.Time, bones = world.Select( t => r3( t.Position - go.WorldPosition ) ).ToArray() } );
}
return new { bones, sequences, durations, parts, groups, attachments, hitboxes, poses };
`;
}

/** The C# that removes the probe object. */
export const removeProbeCode = () =>
  `var scene = Editor.SceneEditorSession.Active?.Scene ?? Game.ActiveScene;
foreach ( var old in scene.GetAllObjects( true ).Where( g => g.Name == ${csString(PROBE)} ).ToList() ) old.Destroy();
return "removed";`;

/**
 * What the original says the compiled model must hold, from its bytes (`src`) and its port (portToSbox's). The
 * samples: each animation at its first frame and its middle one, `perSequence` frames in all (1 to its length).
 */
export function expectedOf(src, port, { groups, perSequence = 2 } = {}) {
  const list = sequencesOf(src);
  const samples = [];
  const poses = [];
  for (const s of port.parts.sequences) {
    const index = s.index;
    if (index === undefined) continue;
    const frames = readSequence(src, index, 0, groups).frames.length;
    const picks = [...new Set(Array.from({ length: Math.min(perSequence, frames) }, (_, k) => Math.round((k * (frames - 1)) / Math.max(1, perSequence - 1))))]; // prettier-ignore
    for (const frame of picks) {
      const time = frame / s.fps;
      const pose = poseAt(src, index, frame, 0, groups).map((m) => [m[0][3], m[1][3], m[2][3]]);
      samples.push({ sequence: port.facts.sequences[port.parts.sequences.indexOf(s)], time });
      poses.push({ name: list[index].name, frame, bones: pose });
    }
  }
  return {
    bones: port.facts.bones.map((name, i) => [name, port.parts.bones[i].parent]),
    sequences: port.facts.sequences.map((name, i) => ({ name, duration: (readSequence(src, port.parts.sequences[i].index, 0, groups).frames.length - 1) / port.parts.sequences[i].fps })), // prettier-ignore
    parts: port.facts.bodygroups,
    skins: port.facts.skins,
    attachments: port.facts.attachments,
    hitboxes: port.facts.hitboxes,
    samples,
    poses,
  };
}

/** The compiled model read back (`read`, probeCode's answer) held to `expected`. */
export function compareSbox(expected, read, { tolerance = POSE_TOLERANCE } = {}) {
  const faults = [];
  if (read.error) return { passed: false, faults: [read.error], said: [], worst: null };
  const names = read.bones.map(([name]) => name);
  const missing = expected.bones.filter(([name]) => !names.includes(name)).map(([name]) => name);
  if (missing.length)
    faults.push(
      `${missing.length} bones of the port not in the compiled model: ${missing.slice(0, 6).join(", ")}`,
    );
  const reparented = expected.bones.filter(([name, parent]) => {
    const at = names.indexOf(name);
    if (at < 0) return false;
    const want = parent < 0 ? null : expected.bones[parent][0];
    const has = read.bones[at][1] < 0 ? null : names[read.bones[at][1]];
    return want !== has;
  });
  if (reparented.length)
    faults.push(
      `bones under another parent than the port's: ${reparented
        .map(([n]) => n)
        .slice(0, 6)
        .join(", ")}`,
    );
  const lost = expected.sequences.filter((s) => !read.sequences.includes(s.name)).map((s) => s.name);
  if (lost.length)
    faults.push(`${lost.length} animations not in the compiled model: ${lost.slice(0, 6).join(", ")}`);
  const longer = expected.sequences.filter((s) => read.durations[s.name] !== undefined && Math.abs(read.durations[s.name] - s.duration) > 0.002); // prettier-ignore
  if (longer.length) faults.push(`animations of another length: ${longer.slice(0, 4).map((s) => `${s.name} ${read.durations[s.name].toFixed(3)} s, not ${s.duration.toFixed(3)}`).join("; ")}`); // prettier-ignore
  const choices = expected.parts.map((g) => {
    const part = read.parts.find(([name]) => name === g.name);
    return part
      ? part[1].length === g.choices
        ? null
        : `${g.name} has ${part[1].length} choices, not ${g.choices}`
      : `bodygroup ${g.name} not there`;
  });
  faults.push(...choices.filter(Boolean));
  const groups = expected.skins > 1 ? expected.skins : read.groups.length <= 1 ? read.groups.length : -1;
  if (read.groups.length !== groups)
    faults.push(`${read.groups.length} material groups, not ${expected.skins} (a skin each)`);
  const attachmentsLost = expected.attachments.filter((a) => !read.attachments.includes(a));
  if (attachmentsLost.length) faults.push(`attachments not there: ${attachmentsLost.join(", ")}`);
  if ((read.hitboxes ?? []).length !== expected.hitboxes)
    faults.push(`${read.hitboxes.length} hit boxes, not ${expected.hitboxes}`);
  // the poses: each bone of the port where GoldSrc's frame puts it, within `tolerance` and REACH_TOLERANCE of its
  // chain's length in that pose
  let worst = { off: 0 };
  const offPoses = [];
  const link = (pose, i) => {
    const parent = expected.bones[i][1];
    return parent < 0 ? 0 : Math.hypot(...[0, 1, 2].map((a) => pose.bones[i][a] - pose.bones[parent][a]));
  };
  expected.samples.forEach((sample, k) => {
    const got = read.poses[k];
    const want = expected.poses[k];
    if (!got) return;
    const chain = [];
    expected.bones.forEach(
      ([, parent], i) => (chain[i] = (parent < 0 ? 0 : (chain[parent] ?? 0)) + link(want, i)),
    );
    let off = 0;
    let over = 0;
    let bone = "";
    let overBone = "";
    expected.bones.forEach(([name], i) => {
      const at = names.indexOf(name);
      if (at < 0 || !got.bones[at]) return;
      const d = Math.hypot(...[0, 1, 2].map((a) => got.bones[at][a] - want.bones[i][a]));
      if (d > off) [off, bone] = [d, name];
      const beyond = d - (tolerance + REACH_TOLERANCE * chain[i]);
      if (beyond > over) [over, overBone] = [beyond, `${name} ${d.toFixed(2)} units off`];
    });
    if (off > worst.off) worst = { off, bone, sequence: sample.sequence, frame: want.frame };
    if (over > 0) offPoses.push(`${sample.sequence} frame ${want.frame}: ${overBone}`);
  });
  if (offPoses.length) faults.push(`${offPoses.length} of ${expected.samples.length} poses with a bone off GoldSrc's place: ${offPoses.slice(0, 5).join("; ")}`); // prettier-ignore
  const said = [
    `${read.bones.length} bones, ${read.sequences.length} animations, ${read.parts.length} bodygroups, ${read.groups.length} material groups, ${read.attachments.length} attachments, ${read.hitboxes.length} hit boxes`, // prettier-ignore
    `${expected.samples.length} poses held to GoldSrc's: the farthest bone ${worst.off.toFixed(3)} units off${worst.bone ? ` (${worst.bone}, ${worst.sequence} frame ${worst.frame})` : ""}`, // prettier-ignore
  ];
  return { passed: !faults.length, faults, said, worst };
}

/**
 * The whole check of a model's port in s&box: the port made again (as sbox-port made it: same name, folder and
 * kind), compiled if its .vmdl_c is not there, read back and posed in the project's editor, and held to the
 * original. `shot`: a file to save the editor's picture of it to. Returns { passed, faults, said, worst, shot }.
 */
export async function checkSboxPort(
  file,
  { project, name, folder, kind, sbox, perSequence = 2, shot, tolerance } = {},
) {
  const engine = sbox ?? findSbox();
  const root = projectFolder(project);
  const assets = join(root, "Assets");
  const { src } = readStudio(file);
  const groups = sequenceGroups(src).length > 1 ? sequenceFilesOf(file, src) : undefined;
  const own = String(file).replace(/\\/g, "/").split("/").pop();
  const port = portToSbox(src, { name: name ?? sourceName(own), folder, groups, kind });
  if (!existsSync(join(assets, port.vmdl)))
    throw new Error(
      `${port.vmdl} is not in ${assets}: port it there first (smak sbox-port ${own} -o ${assets})`,
    );
  if (!existsSync(join(assets, `${port.vmdl}_c`))) compileVmdl(assets, port.vmdl, { sbox: engine });
  const expected = expectedOf(src, port, { groups, perSequence });
  const editor = await editorFor(root, { sbox: engine });
  try {
    // the editor compiles what changed on disk; asked again, so the check reads this port's compile
    sboxCall(root, "asset_compile", { path: port.vmdl }, { sbox: engine });
    const read = runCsharp(root, probeCode(port.vmdl, expected.samples), { sbox: engine });
    const result = compareSbox(expected, read, { tolerance });
    if (shot && !read.error) {
      const size = Math.max(16, ...expected.poses[0].bones.map((p) => Math.hypot(...p))) * 2.2;
      const at = PROBE_AT;
      const pictured = sboxCall(root, "call_tools", { calls: [
        { name: "set_editor_camera", arguments: { position: `${at[0] + size},${at[1] - size * 0.6},${at[2] + size * 0.45}`, angles: "18,150,0" } },
        { name: "editor_camera_screenshot", arguments: { width: 960, height: 720 } },
      ] }, { sbox: engine }); // prettier-ignore
      const made = String(typeof pictured === "string" ? pictured : JSON.stringify(pictured)).match(
        /[A-Za-z]:\\[^\r\n"]+\.png/,
      );
      if (made) {
        copyFileSync(made[0], shot);
        result.shot = shot;
      }
    }
    runCsharp(root, removeProbeCode(), { sbox: engine });
    return { ...result, opened: editor.opened };
  } finally {
    await editor.close();
  }
}
