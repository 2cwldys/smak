// A GoldSrc model (.mdl, version 10) made the files Source's compiler builds a model from: SMD for each
// submodel and each animation, a QC that says how they go together, and a VTF and a VMT for each texture.
// Nothing is decompiled by another program: the model is read by this kit (mdl.mjs) and written out as text.
//
//   portToSource(src, { name, folder, groups, collision })   -> { name, modelname, files, warnings, facts }
//   writePort(port, out)                                       the files written under `out`
//
// WHAT GOES WHERE (under `out`):
//   src/<name>.qc, src/<submodel>.smd, src/anims/<animation>.smd    what the compiler reads (compile.mjs runs it)
//   addon/materials/models/<folder>/<name>/<texture>.vtf and .vmt   the textures, as GMod looks for them
//   addon/models/<folder>/<name>.mdl ...                             the compiled model, once compiled
// `addon` is a folder the person puts in garrysmod/addons/ as it is.
//
// WHAT IS KEPT AS IT WAS:
// - the bones, their names and their rest, and every animation's frames, value for value: a GoldSrc bone's six
//   values are an SMD bone's six;
// - each bodypart as a $bodygroup, each submodel in it in its order (one with no triangles `blank`), so a body
//   number means what it meant;
// - each skin family as a row of the $texturegroup, so a skin number means what it meant;
// - the attachments, the hit boxes and their groups, the eyes and the boxes;
// - an animation's fps, looping, activity and weight, and its events by their numbers;
// - an animation's travel. GoldSrc's compiler took it out of the frames of a sequence marked LX (LY, LZ) and kept
//   it as its linearmovement: it is put back into the root bones' frames, and Source's compiler, told LX in
//   its turn, takes it out again.
//
// WHAT CHANGES, AND WHY:
// - the meshes are written in the model's space (GoldSrc keeps them in their bone's), the corners of each
//   triangle the other way round (SMD wants them counter-clockwise from the front, as GoldSrc's compiler read
//   them; the file keeps them clockwise), and v counted from the picture's bottom;
// - `$origin 0 0 0 -90`: Source's compiler turns everything it reads by 90 degrees about z, as GoldSrc's did
//   when it compiled the original. What is written here is the original as it was compiled, already turned;
// - a texture is a picture of a power of two each way (resampled up: GoldSrc's may be 96 by 83), mip-mapped;
// - a texture's flags become its material's: masked (64) alpha-tested with its last colour a hole, additive
//   (32) additive, fullbright (4) UnlitGeneric; chrome (2) has no like in Source, and is a picture with the
//   room's reflection over it ($envmap), warned of.
//
// WHAT IS LEFT BEHIND, each said in a warning: bone controllers (Source turns a head by pose parameters), an
// animation's blends after its first (Source blends by pose parameters), an activity whose name this kit does not
// know, an animation kept in a file that is not given.

import {
  readMdl,
  readMesh,
  bones as bonesOf,
  restPose,
  apply34,
  sequences as sequencesOf,
  readSequence,
  events as eventsOf,
  attachments as attachmentsOf,
  hitboxes as hitboxesOf,
  boneControllers,
  skinFamilies,
  textureOf,
  modelBoxes,
  ACTIVITY,
  MOTION,
} from "../mdl.mjs";
import { rgbaOf } from "../image.mjs";
import { cross, sub as sub3 } from "../vec.mjs";
import { smdOf } from "./smd.mjs";
import { writeVtf } from "./vtf.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";

/** GoldSrc's texture flags (STUDIO_NF_ of studio.h). */
const NF = { flat: 1, chrome: 2, fullbright: 4, additive: 32, masked: 64 };
/** The axes of travel, in the order of linearmovement. */
const TRAVEL = [
  ["LX", MOTION.LX],
  ["LY", MOTION.LY],
  ["LZ", MOTION.LZ],
];
/** A triangle whose sides' cross product is shorter than this (twice its area, in square units) has none. */
const NO_AREA = 1e-6;
/** The folder under models/ (and materials/models/) a port goes in, unless told. */
export const PORT_FOLDER = "smak";

/** A name as Source's files and materials are best named: lower case, letters, digits, _ and -. */
export const sourceName = (name) =>
  String(name)
    .replace(/\.(bmp|mdl|smd)$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "unnamed";

/**
 * Names made unique as Source's compiler tells them apart, which is in any case (chumtoad.mdl's bone "Bone10"
 * and a bone named bone10 would be one): the first of a name keeps it, one met again gets _2, _3 after it, past
 * any name already taken.
 */
function uniqueNames(names) {
  const key = (name) => name.toLowerCase();
  const firsts = new Set();
  const isFirst = names.map((name) => !firsts.has(key(name)) && Boolean(firsts.add(key(name))));
  const taken = new Set(firsts);
  return names.map((name, i) => {
    if (isFirst[i]) return name;
    let n = 2;
    while (taken.has(key(`${name}_${n}`))) n++;
    taken.add(key(`${name}_${n}`));
    return `${name}_${n}`;
  });
}

/** A rotation only (a matrix's first three columns) applied to a direction. */
const turn34 = (m, v) => m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
/** A number as the QC writes it. */
const num = (v) => {
  const text = (Math.abs(v) < 5e-7 ? 0 : v).toFixed(6).replace(/\.?0+$/, "");
  return text === "-0" ? "0" : text;
};
const vec = (v) => v.map(num).join(" ");
const quote = (text) => `"${String(text).replace(/"/g, "'")}"`;
const isZero = (v) => v.every((x) => x === 0);

/**
 * The material file of a texture, by its GoldSrc flags.
 *   path: its picture under materials/, without .vtf ("models/smak/barney/bx_face1")
 */
export function vmtOf(path, flags = 0) {
  const shader = flags & NF.fullbright ? "UnlitGeneric" : "VertexLitGeneric";
  const keys = [["$basetexture", path]];
  if (flags & NF.masked) keys.push(["$alphatest", "1"], ["$alphatestreference", "0.5"]);
  if (flags & NF.additive) keys.push(["$additive", "1"]);
  if (flags & NF.chrome) keys.push(["$envmap", "env_cubemap"], ["$envmaptint", "[0.5 0.5 0.5]"]);
  return `${quote(shader)}\n{\n${keys.map(([key, value]) => `\t${quote(key)} ${quote(value)}`).join("\n")}\n}\n`;
}

/**
 * A GoldSrc model made the files Source's compiler builds it from.
 *   src:       the model's bytes, with its textures (readStudio puts a <name>t.mdl's inside)
 *   name:      the model's name in Source (its file's, lower case): models/<folder>/<name>.mdl
 *   folder:    the folder under models/ and materials/models/ (PORT_FOLDER unless told)
 *   groups:    the files of animations kept beside it (sequenceFilesOf), when it has any
 *   collision: "box" (a box about it, to be a physics prop), "none", or "auto" (a box for a model of one bone,
 *              none for one with a skeleton: a ragdoll is not made yet)
 * Returns { name, modelname, qc (its path in files), files: [{ path, data }] (paths under the out folder),
 * warnings: [sentence], facts: { bones, sequences, materials, bodygroups, skins, attachments, hitboxes, corners } }
 * (what the compiled model must have again: comparePort).
 */
export function portToSource(src, { name, folder = PORT_FOLDER, groups, collision = "auto" } = {}) {
  if (!name) throw new Error("portToSource: the model's name in Source (name)");
  const model = sourceName(name);
  const where = sourceName(folder);
  const info = readMdl(src);
  const warnings = [];
  const files = [];
  // a bone with no name (grenade.mdl's second), or a name another bone has, cannot be read back by Source's
  // compiler: it is named bone<n>, or <name>_2, and the hit boxes and attachments on it follow it
  const original = bonesOf(src);
  const boneNames = uniqueNames(original.map((bone, i) => bone.name.trim() || `bone${i}`));
  const unnamed = original.map((bone, i) => (bone.name.trim() ? -1 : i)).filter((i) => i >= 0);
  const twice = original.map((bone, i) => (bone.name.trim() && boneNames[i] !== bone.name ? `"${bone.name}" (number ${i}) as ${boneNames[i]}` : null)).filter(Boolean); // prettier-ignore
  if (unnamed.length)
    warnings.push(`${unnamed.length === 1 ? "a bone" : `${unnamed.length} bones`} with no name, named ${unnamed.length === 1 ? boneNames[unnamed[0]] : `${boneNames[unnamed[0]]} to ${boneNames[unnamed.at(-1)]}`} (Source's compiler cannot read a bone with no name)`); // prettier-ignore
  if (twice.length) warnings.push(`bones of a name another has (in any case, as Source tells them) renamed: ${twice.join(", ")}`);
  const skeleton = original.map((bone, i) => ({ ...bone, name: boneNames[i] }));
  const rest = restPose(src);
  const smdBones = skeleton.map(({ name: bone, parent }) => ({ name: bone, parent }));
  const restFrame = skeleton.map(({ pos, rot }) => [...pos, ...rot]);

  // ── materials: one for each texture, named as Source wants its files ──
  const materialNames = uniqueNames(info.textures.map((t) => sourceName(t.name)));
  const materialsPath = `models/${where}/${model}`;
  info.textures.forEach((texture, i) => {
    const picture = textureOf(src, i);
    const masked = Boolean(texture.flags & NF.masked);
    const vtf = writeVtf({ width: picture.width, height: picture.height, rgba: rgbaOf(picture, masked) }, { alpha: masked });
    files.push({ path: `addon/materials/${materialsPath}/${materialNames[i]}.vtf`, data: vtf });
    files.push({ path: `addon/materials/${materialsPath}/${materialNames[i]}.vmt`, data: vmtOf(`${materialsPath}/${materialNames[i]}`, texture.flags) }); // prettier-ignore
  });
  const chrome = info.textures.filter((t) => t.flags & NF.chrome).map((t) => t.name);
  if (chrome.length)
    warnings.push(`${chrome.join(", ")}: chrome in GoldSrc (the picture turned with the view), which Source has no like of: written as the picture with the room's reflection over it ($envmap env_cubemap)`); // prettier-ignore

  // ── the submodels: each one SMD, in the model's space, its triangles counter-clockwise ──
  const families = skinFamilies(src);
  const usedRefs = new Set();
  const bodyBox = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
  // every corner as the compiled model is to have it: in the model's space, u v from the picture's top (the .vvd's)
  const allCorners = [];
  const submodelFiles = uniqueNames(info.bodyparts.flatMap((part) => part.models.map((m) => sourceName(m.name))));
  let fileIndex = 0;
  let flat = 0;
  const bodygroups = info.bodyparts.map((part) => ({
    name: part.name,
    models: part.models.map((sub) => {
      const file = submodelFiles[fileIndex++];
      const triangles = [];
      for (const mesh of sub.meshes) {
        if (!mesh.numtris) continue;
        usedRefs.add(mesh.skinref);
        const texture = families[0][mesh.skinref];
        const { width, height } = info.textures[texture];
        for (const tri of readMesh(src, sub, mesh)) {
          // a triangle of no area (128 of osprey_tailgibs.mdl's 230) is dropped by Source's compiler: left out
          const at = tri.map(({ p, bone }) => apply34(rest[bone], p));
          if (Math.hypot(...cross(sub3(at[1], at[0]), sub3(at[2], at[0]))) < NO_AREA) {
            flat++;
            continue;
          }
          const corners = tri.map(({ p, n, bone, s, t }) => {
            const at = apply34(rest[bone], p);
            at.forEach((v, axis) => {
              bodyBox[0][axis] = Math.min(bodyBox[0][axis], v);
              bodyBox[1][axis] = Math.max(bodyBox[1][axis], v);
            });
            allCorners.push({ p: at, uv: [s / width, t / height] });
            return { bone, p: at, n: turn34(rest[bone], n), uv: [s / width, 1 - t / height] };
          });
          triangles.push({ material: materialNames[texture], corners: [corners[0], corners[2], corners[1]] });
        }
      }
      if (!triangles.length) return null;
      files.push({ path: `src/${file}.smd`, data: smdOf({ bones: smdBones, frames: [restFrame], triangles }) });
      return `${file}.smd`;
    }),
  }));

  if (flat)
    warnings.push(`${flat === 1 ? "a triangle" : `${flat} triangles`} of no area left out (Source's compiler drops them; GoldSrc drew nothing of them either)`);

  // ── the skins: the references that differ between families, each family a row ──
  const differing = [...usedRefs].sort((a, b) => a - b).filter((ref) => families.some((family) => family[ref] !== families[0][ref])); // prettier-ignore
  const skinRows = differing.length ? families.map((family) => differing.map((ref) => materialNames[family[ref]])) : [];

  // ── the animations ──
  const list = sequencesOf(src);
  const animationFiles = uniqueNames(list.map((seq) => sourceName(seq.name)));
  // GoldSrc's compiler let two animations have one name (scientist.mdl's crouch_idle3, houndeye.mdl's run), and
  // the engine finds the first by it; Source's refuses the model. The first keeps it, the next is _2
  const sequenceNames = uniqueNames(list.map((seq) => seq.name.toLowerCase())).map((unique, i) =>
    unique === list[i].name.toLowerCase() ? list[i].name : `${list[i].name}${unique.slice(list[i].name.length)}`,
  );
  sequenceNames.forEach((named, i) => {
    if (named !== list[i].name)
      warnings.push(`animation ${list[i].name} (number ${i}): a second of that name, ported as ${named} (Source's compiler refuses two of one name; the game's code finds the first by it, as before)`); // prettier-ignore
  });
  const roots = skeleton.map((bone, i) => (bone.parent < 0 ? i : -1)).filter((i) => i >= 0);
  const sequenceLines = [];
  const portedSequences = [];
  list.forEach((seq, i) => {
    let read;
    try {
      read = readSequence(src, i, 0, groups);
    } catch (error) {
      warnings.push(`animation ${seq.name}: not ported (${error.message}; give the files of animations beside the model)`); // prettier-ignore
      return;
    }
    const axes = TRAVEL.filter(([, bit]) => seq.motiontype & bit);
    const travelled = axes.length && read.frames.length > 1;
    const frames = read.frames.map((frame, f) =>
      frame.map((six, bone) => {
        if (!travelled || !roots.includes(bone)) return six;
        const share = f / (read.frames.length - 1);
        return six.map((v, axis) => (axis < 3 && axes.some(([, bit]) => bit === TRAVEL[axis][1]) ? v + seq.movement[axis] * share : v));
      }),
    );
    files.push({ path: `src/anims/${animationFiles[i]}.smd`, data: smdOf({ bones: smdBones, frames }) });
    if (seq.blends > 1)
      warnings.push(`animation ${seq.name}: its first blend of ${seq.blends} ported, the rest left (Source blends by pose parameters, which a port does not make yet)`); // prettier-ignore
    // Source's compiler refuses an fps of 0 (shotgunshell.mdl's): one frame is still at any, more are played at 1
    const fps = seq.fps > 0 ? seq.fps : read.frames.length > 1 ? 1 : 30;
    if (!(seq.fps > 0) && read.frames.length > 1)
      warnings.push(`animation ${seq.name}: fps ${seq.fps} (its ${read.frames.length} frames held still), which Source's compiler refuses: written 1`); // prettier-ignore
    const options = [`fps ${num(fps)}`];
    if (seq.loops) options.push("loop");
    if (seq.activity) {
      const activity = ACTIVITY[seq.activity];
      // a weight of 0 (hgrunt.mdl's) is refused too: GoldSrc picks such a sequence only when it is the first of
      // its activity, and 1 is the least Source takes
      if (activity) options.push(`activity ${activity} ${Math.max(1, seq.actweight)}`);
      else warnings.push(`animation ${seq.name}: activity ${seq.activity}, a mod's own (activity.h names 1 to 76), left off: the game's code that asks for it by number is not in Source`); // prettier-ignore
      if (activity && seq.actweight < 1)
        warnings.push(`animation ${seq.name}: weight ${seq.actweight} for ${activity}, which Source's compiler refuses: written 1`);
    }
    if (travelled) options.push(...axes.map(([word]) => word));
    const events = eventsOf(src, i).map((e) => `\t{ event ${e.event} ${e.frame} ${quote(e.options)} }`);
    sequenceLines.push(`$sequence ${quote(sequenceNames[i])} ${quote(`anims/${animationFiles[i]}.smd`)} ${options.join(" ")}${events.length ? ` {\n${events.join("\n")}\n}` : ""}`); // prettier-ignore
    portedSequences.push(sequenceNames[i]);
  });

  // ── what a monster has ──
  const attachments = attachmentsOf(src);
  const attachmentNames = uniqueNames(attachments.map((a, i) => (a.name ? a.name : `attachment${i}`)));
  const hitboxes = hitboxesOf(src);
  const controllers = boneControllers(src);
  if (controllers.length)
    warnings.push(`${controllers.length === 1 ? "a bone controller" : `${controllers.length} bone controllers`} (${controllers.map((c) => skeleton[c.bone]?.name).join(", ")}) left: Source turns such bones by pose parameters, which a port does not make yet`); // prettier-ignore
  const boxes = modelBoxes(src);

  // ── the collision model: a box about the meshes ──
  const wantsBox = collision === "box" || (collision === "auto" && skeleton.length === 1);
  let collisionFile = null;
  if (wantsBox && Number.isFinite(bodyBox[0][0])) {
    collisionFile = `${model}_physics.smd`;
    files.push({ path: `src/${collisionFile}`, data: smdOf({ bones: smdBones, frames: [restFrame], triangles: boxTriangles(bodyBox, 0) }) }); // prettier-ignore
  }

  // ── the QC ──
  const qc = [
    `// ${model}: ported from GoldSrc by SMAK (portToSource). Compiled by Source's studiomdl.`,
    `$modelname ${quote(`${where}/${model}.mdl`)}`,
    `$cdmaterials ${quote(`${materialsPath}/`)}`,
    // what is written is the original as GoldSrc's compiler left it, already turned: not turned again
    `$origin 0 0 0 -90`,
    `$surfaceprop "default"`,
  ];
  if (!isZero(boxes.eyes)) qc.push(`$eyeposition ${vec(boxes.eyes)}`);
  if (!isZero(boxes.bbmin) || !isZero(boxes.bbmax)) qc.push(`$bbox ${vec(boxes.bbmin)} ${vec(boxes.bbmax)}`);
  if (!isZero(boxes.min) || !isZero(boxes.max)) qc.push(`$cbox ${vec(boxes.min)} ${vec(boxes.max)}`);
  for (const group of bodygroups)
    qc.push(`$bodygroup ${quote(group.name)}\n{\n${group.models.map((file) => (file ? `\tstudio ${quote(file)}` : "\tblank")).join("\n")}\n}`); // prettier-ignore
  if (skinRows.length)
    qc.push(`$texturegroup "skinfamilies"\n{\n${skinRows.map((row) => `\t{ ${row.map(quote).join(" ")} }`).join("\n")}\n}`); // prettier-ignore
  attachments.forEach((a, i) =>
    qc.push(`$attachment ${quote(attachmentNames[i])} ${quote(skeleton[a.bone].name)} ${vec(a.pos)} rotate 0 0 0`),
  );
  for (const box of hitboxes) qc.push(`$hbox ${box.group} ${quote(skeleton[box.bone].name)} ${vec(box.min)} ${vec(box.max)}`);
  if (collisionFile) qc.push(`$collisionmodel ${quote(collisionFile)}\n{\n\t$automass\n}`);
  if (!sequenceLines.length) {
    // Source's compiler wants one animation at least: the rest pose
    files.push({ path: "src/anims/idle.smd", data: smdOf({ bones: smdBones, frames: [restFrame] }) });
    sequenceLines.push(`$sequence "idle" "anims/idle.smd" fps 30`);
  }
  qc.push(...sequenceLines);
  files.push({ path: `src/${model}.qc`, data: `${qc.join("\n")}\n` });

  return {
    name: model,
    modelname: `${where}/${model}.mdl`,
    qc: `src/${model}.qc`,
    files,
    warnings,
    facts: {
      bones: skeleton.map((b) => b.name),
      sequences: portedSequences,
      materials: [...usedRefs].map((ref) => materialNames[families[0][ref]]),
      bodygroups: bodygroups.map((g) => ({ name: g.name, models: g.models.length })),
      skins: Math.max(1, skinRows.length),
      attachments: attachmentNames,
      hitboxes: hitboxes.length,
      corners: allCorners,
    },
  };
}

/** The twelve triangles of a box [min, max], on one bone, counter-clockwise from outside. */
function boxTriangles([lo, hi], bone) {
  const corner = (x, y, z) => [x ? hi[0] : lo[0], y ? hi[1] : lo[1], z ? hi[2] : lo[2]];
  // each face: its four corners counter-clockwise seen from outside, and its normal
  const faces = [
    [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0], [0, 0, -1]],
    [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]],
    [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], [0, -1, 0]],
    [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
    [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0], [-1, 0, 0]],
    [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1], [1, 0, 0]],
  ];
  return faces.flatMap(([a, b, c, d, n]) =>
    [[a, b, c], [a, c, d]].map((tri) => ({
      material: "physics",
      corners: tri.map((k) => ({ bone, p: corner(...k), n, uv: [0, 0] })),
    })),
  );
}

/** The port's files written under `out` (src/ and addon/). Returns the QC's full path. */
export function writePort(port, out) {
  for (const { path, data } of port.files) {
    const to = join(out, path);
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, data);
  }
  return join(out, port.qc);
}
