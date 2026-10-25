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
  poseAt,
  frameValues,
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
import { convexHull } from "./hull.mjs";
import { massOf } from "./surfaceprops.mjs";
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
 *   collision: what it collides as in Source:
 *              "hull"     the convex hull of its triangles, one solid: a physics prop that rolls as it is shaped
 *              "box"      the box about its triangles
 *              "ragdoll"  a piece for each bone with hit boxes, the hull of its corners and of its children's
 *                         that have none, joined by joints that bend as far as its animations bend them
 *                         (jointTurns): a figure that falls as a body ($collisionjoints)
 *              "none"     nothing
 *              "auto"     a hull for a model of one bone, a ragdoll for one with a skeleton and hit boxes, else none
 *   surfaceprop: what it is made of to Source (its sounds, its weight a volume, how it breaks): "wood", "metal",
 *              "flesh"... ("flesh" for a ragdoll, "default" else, unless told)
 *   pictures:  Map(texture name -> { width, height, rgba }): the textures in full colour, for a model the kit built
 *              for Source (buildModelSpec's `pictures`); the file's own 256 colours otherwise
 *   bind:      { seq, frame }: bound in that frame's pose, not in the bones' rest (a body the kit built on a game's
 *              skeleton was made in its first animation's first frame; the game's own were modelled at rest)
 *   mass:      its mass in kilograms; unless told, its collision model's volume at `density` (kg a cubic metre), or
 *              at `densities(surfaceprop)` (densityOf with GMod's table), or without either Source's $automass,
 *              which weighs it as "default". A ragdoll weighs a person's RAGDOLL_MASS unless told
 * Returns { name, modelname, qc (its path in files), files: [{ path, data }] (paths under the out folder),
 * warnings: [sentence], facts: { bones, sequences, materials, bodygroups, skins, attachments, hitboxes, corners } }
 * (what the compiled model must have again: comparePort).
 */
export function portToSource(src, { name, folder = PORT_FOLDER, groups, collision = "auto", surfaceprop, mass, density, densities, pictures, bind } = {}) {
  if (!COLLISIONS.includes(collision)) throw new Error(`portToSource: collision is ${COLLISIONS.join(", ")}, not ${collision}`);
  if (mass !== undefined && !(mass > 0)) throw new Error(`portToSource: mass is kilograms more than 0, not ${mass}`);
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
  // the pose it is bound in, which Source draws it in at rest and a ragdoll falls from: the bones' own rest, or
  // (`bind`) a frame of an animation, the stance a body the kit built was made in
  const rest = bind ? poseAt(src, bind.seq, bind.frame) : restPose(src);
  const smdBones = skeleton.map(({ name: bone, parent }) => ({ name: bone, parent }));
  const restFrame = bind ? frameValues(src, bind.seq, bind.frame) : skeleton.map(({ pos, rot }) => [...pos, ...rot]);

  // ── materials: one for each texture, named as Source wants its files ──
  const materialNames = uniqueNames(info.textures.map((t) => sourceName(t.name)));
  const materialsPath = `models/${where}/${model}`;
  info.textures.forEach((texture, i) => {
    const masked = Boolean(texture.flags & NF.masked);
    // a model the kit built for Source has its pictures in full colour beside the file's 256 colours
    const full = pictures?.get(texture.name);
    const picture = full ?? textureOf(src, i);
    const vtf = writeVtf({ width: picture.width, height: picture.height, rgba: full ? full.rgba : rgbaOf(picture, masked) }, { alpha: masked });
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
  // every triangle as its corners' bones and places in the model's space: a ragdoll's pieces are fitted to them
  const bodyTriangles = [];
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
          bodyTriangles.push(tri.map(({ bone }, k) => ({ bone, p: at[k] })));
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
  // every frame of every animation, as read: how far a ragdoll's joints bend is measured on them
  const allFrames = [];
  list.forEach((seq, i) => {
    let read;
    try {
      read = readSequence(src, i, 0, groups);
    } catch (error) {
      warnings.push(`animation ${seq.name}: not ported (${error.message}; give the files of animations beside the model)`); // prettier-ignore
      return;
    }
    allFrames.push(...read.frames);
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

  // ── what it collides as ──
  const kind =
    collision !== "auto" ? collision : skeleton.length === 1 ? "hull" : hitboxes.length ? "ragdoll" : "none";
  const massLine = () => (mass === undefined ? "\t$automass" : `\t$mass ${num(mass)}`);
  let collisionLines = [];
  const physicsFile = `${model}_physics.smd`;
  const physics = (triangles) => files.push({ path: `src/${physicsFile}`, data: smdOf({ bones: smdBones, frames: [restFrame], triangles }) }); // prettier-ignore
  if ((kind === "hull" || kind === "box") && Number.isFinite(bodyBox[0][0])) {
    const hull = kind === "hull" ? convexHull(allCorners.map((c) => c.p)) : null;
    if (kind === "hull" && !hull) warnings.push("its triangles lie in a plane, which has no hull: a box about them in its place");
    physics(hull ? hullTriangles(hull, 0) : boxTriangles(bodyBox, 0));
    const volume = hull ? hullVolume(hull) : bodyBox[1].reduce((product, v, i) => product * (v - bodyBox[0][i]), 1);
    const weight = density ?? densities?.(surfaceprop ?? "default");
    const weighed = mass === undefined && weight > 0 ? Math.round(massOf(volume, weight) * 10) / 10 : undefined;
    collisionLines = [`$collisionmodel ${quote(physicsFile)}\n{\n${weighed === undefined ? massLine() : `\t$mass ${num(weighed)}`}\n}`]; // prettier-ignore
  } else if (kind === "ragdoll") {
    const pieces = ragdollPieces(skeleton, hitboxes, rest, bodyTriangles);
    if (pieces.dropped.length)
      warnings.push(`a ragdoll has ${RAGDOLL_MOST} pieces at most: ${pieces.dropped.length} of the smallest left to their parents (${pieces.dropped.join(", ")})`); // prettier-ignore
    if (pieces.merged.length)
      warnings.push(`${pieces.merged.join(", ")}: hit boxes and no body of their own (too few corners, or too thin), joined to the piece above`);
    if (pieces.list.length >= 2 && !pieces.list[0].fitted)
      warnings.push("its corners make no pieces: the boxes of its hit boxes in their place, which are bigger than its body");
    if (pieces.list.length < 2) warnings.push("too few bones with hit boxes for a ragdoll: none made");
    else {
      physics(pieces.list.flatMap((piece) => piece.triangles));
      const root = pieces.list[0].bone;
      const turns = jointTurns(skeleton, rest, pieces.list.map((piece) => piece.bone), allFrames);
      const joined = pieces.list.filter((piece) => piece.bone !== root);
      const unmeasured = joined.filter((piece) => !turns?.get(piece.bone)).map((piece) => skeleton[piece.bone].name);
      if (unmeasured.length)
        warnings.push(`${turns ? `${unmeasured.join(", ")}: never turned by its animations` : "no animation to measure its joints on"}, so each bends ${RAGDOLL_TURN} degrees each way about each axis`); // prettier-ignore
      const joints = joined
        .flatMap((piece) => ["x", "y", "z"].map((axis, a) => {
          const [lo, hi] = turns?.get(piece.bone)?.[a] ?? [-RAGDOLL_TURN, RAGDOLL_TURN];
          return `\t$jointconstrain ${quote(skeleton[piece.bone].name)} ${axis} limit ${num(lo)} ${num(hi)} 0`;
        })); // prettier-ignore
      // a person weighs RAGDOLL_MASS whatever their build, as Valve weighs its own; the compiler shares it among
      // the pieces by their volume
      if (mass === undefined) warnings.push(`a ragdoll weighs a person's ${RAGDOLL_MASS} kg unless told (mass), as Valve's do`);
      const weighed = mass ?? RAGDOLL_MASS;
      collisionLines = [`$collisionjoints ${quote(physicsFile)}\n{\n\t$mass ${num(weighed)}\n\t$inertia 10\n\t$damping 0.01\n\t$rotdamping 1.5\n\t$rootbone ${quote(skeleton[root].name)}\n${joints.join("\n")}\n}`]; // prettier-ignore
      // the pose a ragdoll is built in and falls from: the bones at rest
      files.push({ path: "src/anims/ragdoll.smd", data: smdOf({ bones: smdBones, frames: [restFrame] }) });
      sequenceLines.push(`$sequence "ragdoll" "anims/ragdoll.smd" fps 30 activity ACT_DIERAGDOLL 1`);
    }
  }
  const material = surfaceprop ?? (kind === "ragdoll" && collisionLines.length ? "flesh" : "default");
  if (!surfaceprop && material === "flesh") warnings.push(`a ragdoll taken for flesh ($surfaceprop "flesh"): give surfaceprop for a robot, a statue`); // prettier-ignore

  // ── the QC ──
  const qc = [
    `// ${model}: ported from GoldSrc by SMAK (portToSource). Compiled by Source's studiomdl.`,
    `$modelname ${quote(`${where}/${model}.mdl`)}`,
    `$cdmaterials ${quote(`${materialsPath}/`)}`,
    // what is written is the original as GoldSrc's compiler left it, already turned: not turned again
    `$origin 0 0 0 -90`,
    `$surfaceprop ${quote(material)}`,
  ];
  if (!isZero(boxes.eyes)) qc.push(`$eyeposition ${vec(boxes.eyes)}`);
  if (!isZero(boxes.bbmin) || !isZero(boxes.bbmax)) qc.push(`$bbox ${vec(boxes.bbmin)} ${vec(boxes.bbmax)}`);
  if (!isZero(boxes.min) || !isZero(boxes.max)) qc.push(`$cbox ${vec(boxes.min)} ${vec(boxes.max)}`);
  // Source's compiler drops a bone no vertex is on, and then cannot find it for a hit box or an animation's
  // frames (a body the kit built on Half-Life's grunt left its toes empty): such a bone is kept as one a weapon
  // is merged onto is
  const weighted = new Set(bodyTriangles.flatMap((corners) => corners.map(({ bone }) => bone)));
  for (const [i, bone] of skeleton.entries()) if (!weighted.has(i)) qc.push(`$bonemerge ${quote(bone.name)}`);
  for (const group of bodygroups)
    qc.push(`$bodygroup ${quote(group.name)}\n{\n${group.models.map((file) => (file ? `\tstudio ${quote(file)}` : "\tblank")).join("\n")}\n}`); // prettier-ignore
  if (skinRows.length)
    qc.push(`$texturegroup "skinfamilies"\n{\n${skinRows.map((row) => `\t{ ${row.map(quote).join(" ")} }`).join("\n")}\n}`); // prettier-ignore
  attachments.forEach((a, i) =>
    qc.push(`$attachment ${quote(attachmentNames[i])} ${quote(skeleton[a.bone].name)} ${vec(a.pos)} rotate 0 0 0`),
  );
  for (const box of hitboxes) qc.push(`$hbox ${box.group} ${quote(skeleton[box.bone].name)} ${vec(box.min)} ${vec(box.max)}`);
  qc.push(...collisionLines);
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

/** What a port may collide as (portToSource's `collision`). */
export const COLLISIONS = ["auto", "hull", "box", "ragdoll", "none"];
/** How far a ragdoll's joints bend each way about each axis, in degrees, when it has no animation to measure. */
const RAGDOLL_TURN = 40;
/**
 * What a ragdoll weighs unless told, in kilograms: a person, as Valve weighs its own whatever their build (a
 * citizen's .phy and Kleiner's both say 90). By its volume Half-Life's grunt would weigh 232 kg as water: GoldSrc's
 * figures are bulky.
 */
const RAGDOLL_MASS = 90;
/**
 * A joint's limits from its animations: the turns between these shares of its frames (the few frames past them,
 * Half-Life's grunt's dives and falls, turn a thigh almost round), widened by TURN_SPARE each way, at most
 * TURN_MOST. An axis that turns less than TURN_STILL in them is held still, as Valve's knees are about two axes.
 */
const TURN_SHARE = [0.02, 0.98];
const TURN_SPARE = 10;
const TURN_MOST = 150;
const TURN_STILL = 1;
/** The most pieces a ragdoll has: Source's (RAGDOLL_MAX_ELEMENTS, 24). */
const RAGDOLL_MOST = 24;
/** A piece thinner than this (units) each way is made this thick: the physics cannot hold a flat box. */
const THINNEST_PIECE = 0.5;

/** The volume a hull holds, in cubic units: the tetrahedra of its faces to its first point. */
function hullVolume(hull) {
  const o = hull.points[0];
  return hull.faces.reduce((sum, face) => {
    const [a, b, c] = face.map((i) => sub3(hull.points[i], o));
    return sum + (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6; // prettier-ignore
  }, 0);
}

/** The hull's faces as SMD triangles on one bone (its normals the faces'). */
function hullTriangles(hull, bone) {
  return hull.faces.map((face) => {
    const [a, b, c] = face.map((i) => hull.points[i]);
    const m = cross(sub3(b, a), sub3(c, a));
    const length = Math.hypot(...m) || 1;
    const n = m.map((v) => v / length);
    return { material: "physics", corners: [a, b, c].map((p) => ({ bone, p, n, uv: [0, 0] })) };
  });
}

/**
 * A ragdoll's pieces, in the bones' order (a parent before its children). Each is the convex hull of the corners
 * on its bone and on the bones below it that have no piece (a hand's fingers, its gun), and of the middles of the
 * triangles' sides from them to another piece's, in the model's space on that bone; the corners on bones above
 * every piece go to the first. A bone with hit boxes is a piece when those
 * corners make a hull THINNEST_PIECE thick at least (a spine bone with no corners of its own is not: the piece
 * above it takes its place); the biggest RAGDOLL_MOST of them. GoldSrc's hit boxes are far bigger than the body
 * (hgrunt.mdl's weigh 855 kg as flesh): its corners are not. A model whose corners make fewer than two pieces has
 * the boxes of its hit boxes for pieces.
 * Returns { list: [{ bone, triangles, volume (cubic units), fitted }], dropped: [bone names], merged: [bone names
 * with hit boxes and no body, taken by the piece above] }.
 */
function ragdollPieces(skeleton, hitboxes, rest, triangles = []) {
  const boxes = new Map();
  for (const box of hitboxes) {
    const was = boxes.get(box.bone);
    boxes.set(box.bone, was ? [was[0].map((v, i) => Math.min(v, box.min[i])), was[1].map((v, i) => Math.max(v, box.max[i]))] : [box.min, box.max]); // prettier-ignore
  }
  // each corner goes to its bone's piece, or its nearest forebear's, or the first piece's. A vertex is on one
  // bone in GoldSrc, so a body's corners are rings, a bone's each: where a triangle's side goes from one piece's
  // corner to another's, each takes its share of the side, half of it shared among the steps between them (a
  // low-poly belly's side from the hips to the chest goes past two pieces of spine), and the pieces meet there
  const hullsOf = (pieces) => {
    const owned = new Map([...pieces].map((bone) => [bone, []]));
    const first = Math.min(...pieces);
    const ownerOf = skeleton.map((_, bone) => {
      let at = bone;
      while (at >= 0 && !pieces.has(at)) at = skeleton[at].parent;
      return at >= 0 ? at : first;
    });
    // a piece's chain of pieces up to the first
    const pieceAbove = (bone) => {
      let at = skeleton[bone].parent;
      while (at >= 0 && !pieces.has(at)) at = skeleton[at].parent;
      return at;
    };
    const chainOf = (bone) => (bone < 0 ? [] : [bone, ...chainOf(pieceAbove(bone))]);
    const chains = new Map([...pieces].map((bone) => [bone, chainOf(bone)]));
    const steps = (a, b) => {
      const up = chains.get(a);
      const down = chains.get(b);
      const meet = up.findIndex((bone) => down.includes(bone));
      return meet < 0 ? up.length + down.length : meet + down.indexOf(up[meet]);
    };
    for (const corners of triangles) {
      const owners = corners.map(({ bone }) => ownerOf[bone]);
      corners.forEach(({ p }, k) => owned.get(owners[k]).push(p));
      for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
        if (owners[a] === owners[b]) continue;
        const share = 0.5 / steps(owners[a], owners[b]);
        const toward = (from, to) => corners[from].p.map((v, axis) => v + (corners[to].p[axis] - v) * share);
        owned.get(owners[a]).push(toward(a, b));
        owned.get(owners[b]).push(toward(b, a));
      }
    }
    return new Map([...owned].map(([bone, points]) => {
      const hull = points.length >= 4 ? convexHull(points) : null;
      return [bone, hull && thicknessOf(hull) >= THINNEST_PIECE ? hull : null];
    })); // prettier-ignore
  };
  // one tree of pieces, under the one with the most below it: Source's compiler refuses a joint on a piece with
  // none above it (barnacle.mdl's bones have three roots). The bones of the others give their corners to its root
  const isBelow = (bone, top) => {
    for (let at = bone; at >= 0; at = skeleton[at].parent) if (at === top) return true;
    return false;
  };
  const oneTree = (set) => {
    const top = [...set].reduce((best, bone) => {
      const below = [...set].filter((other) => isBelow(other, bone)).length;
      return below > best.below || (below === best.below && bone < best.bone) ? { bone, below } : best;
    }, { bone: -1, below: -1 }).bone;
    return new Set([...set].filter((bone) => isBelow(bone, top)));
  };
  // a bone that makes no hull gives its corners to the piece above it, until every piece makes one
  let pieces = boxes.size ? oneTree(new Set(boxes.keys())) : new Set();
  let hulls = pieces.size ? hullsOf(pieces) : new Map();
  while (pieces.size && [...hulls.values()].some((hull) => !hull)) {
    pieces = new Set([...pieces].filter((bone) => hulls.get(bone)));
    if (pieces.size) pieces = oneTree(pieces);
    hulls = pieces.size ? hullsOf(pieces) : new Map();
  }
  const dropped = [];
  if (pieces.size > RAGDOLL_MOST) {
    const ranked = [...pieces].sort((x, y) => hullVolume(hulls.get(y)) - hullVolume(hulls.get(x)));
    dropped.push(...ranked.slice(RAGDOLL_MOST).map((bone) => skeleton[bone].name));
    pieces = new Set(ranked.slice(0, RAGDOLL_MOST));
    hulls = hullsOf(pieces);
  }
  if (pieces.size >= 2 && [...hulls.values()].every(Boolean))
    return {
      list: [...pieces].sort((x, y) => x - y).map((bone) => ({ bone, triangles: hullTriangles(hulls.get(bone), bone), volume: hullVolume(hulls.get(bone)), fitted: true })), // prettier-ignore
      dropped,
      merged: [...boxes.keys()].filter((bone) => !pieces.has(bone) && !dropped.includes(skeleton[bone].name)).map((bone) => skeleton[bone].name),
    };
  // no body to fit: the boxes of the hit boxes, the biggest RAGDOLL_MOST
  const boxVolume = ([lo, hi]) => hi.reduce((product, v, i) => product * Math.max(THINNEST_PIECE, v - lo[i]), 1);
  const tree = boxes.size ? oneTree(new Set(boxes.keys())) : new Set();
  const ranked = [...boxes.entries()].filter(([bone]) => tree.has(bone)).sort((x, y) => boxVolume(y[1]) - boxVolume(x[1]));
  const list = ranked
    .slice(0, RAGDOLL_MOST)
    .sort((x, y) => x[0] - y[0])
    .map(([bone, [lo, hi]]) => {
      // a flat box is made THINNEST_PIECE thick about its middle
      const thick = lo.map((v, i) => (hi[i] - v < THINNEST_PIECE ? [(v + hi[i] - THINNEST_PIECE) / 2, (v + hi[i] + THINNEST_PIECE) / 2] : [v, hi[i]])); // prettier-ignore
      const triangles = boxTriangles([thick.map((pair) => pair[0]), thick.map((pair) => pair[1])], bone).map((triangle) => ({
        ...triangle,
        corners: triangle.corners.map((corner) => ({ ...corner, p: apply34(rest[bone], corner.p), n: turn34(rest[bone], corner.n) })), // prettier-ignore
      }));
      return { bone, triangles, volume: boxVolume([lo, hi]), fitted: false };
    });
  return { list, dropped: ranked.slice(RAGDOLL_MOST).map(([bone]) => skeleton[bone].name), merged: [] };
}

/** How thin a hull is: the least, over its faces, of how far its farthest point is behind the face. */
function thicknessOf(hull) {
  return Math.min(
    ...hull.faces.map((face) => {
      const [a, b, c] = face.map((i) => hull.points[i]);
      const m = cross(sub3(b, a), sub3(c, a));
      const length = Math.hypot(...m) || 1;
      return Math.max(...hull.points.map((p) => -(m[0] * (p[0] - a[0]) + m[1] * (p[1] - a[1]) + m[2] * (p[2] - a[2])) / length)); // prettier-ignore
    }),
  );
}

/** A bone's turn from its six values (roll about x, then pitch about y, then yaw about z, as mdl.mjs's). */
function turnOf([, , , x, y, z]) {
  const [sx, cx, sy, cy, sz, cz] = [x, y, z].flatMap((a) => [Math.sin(a), Math.cos(a)]);
  return [
    [cy * cz, sx * sy * cz - cx * sz, cx * sy * cz + sx * sz],
    [cy * sz, sx * sy * sz + cx * cz, cx * sy * sz - sx * cz],
    [-sy, sx * cy, cx * cy],
  ];
}
const times33 = (a, b) => a.map((row) => [0, 1, 2].map((c) => row[0] * b[0][c] + row[1] * b[1][c] + row[2] * b[2][c]));
const across33 = (m) => [0, 1, 2].map((c) => m.map((row) => row[c]));
/** A turn as degrees about each of its own axes: its axis times its angle (the turn's logarithm). */
function degreesOf(m) {
  const angle = Math.acos(Math.max(-1, Math.min(1, (m[0][0] + m[1][1] + m[2][2] - 1) / 2)));
  const s = Math.sin(angle);
  const k = (s > 1e-6 ? angle / (2 * s) : 0.5) * (180 / Math.PI);
  return [m[2][1] - m[1][2], m[0][2] - m[2][0], m[1][0] - m[0][1]].map((v) => v * k);
}

/**
 * How far each ragdoll piece's bone turns from its rest against the piece above it, about each of its own axes,
 * over every frame of the model's animations: Map(bone -> [[lo, hi] x, y, z] in degrees), as $jointconstrain
 * takes them. Measured against Valve's own: a citizen's knee bends the way +z turns it (its .phy's limits
 * z -12 to 126), its elbow the way -z does (-149 to 4); Half-Life's grunt's knee bends by -z, and its animations
 * turn it -140 to 22. A bone they never turn is null; all of it is null when there is no frame.
 */
function jointTurns(skeleton, rest, pieceBones, frames) {
  if (!frames.length) return null;
  const pieces = new Set(pieceBones);
  const above = (bone) => {
    let at = skeleton[bone].parent;
    while (at >= 0 && !pieces.has(at)) at = skeleton[at].parent;
    return at;
  };
  // a turn of a bone against the piece above it, in the model's space; at rest from the rest pose
  const against = (turns, bone, parent) => (parent < 0 ? turns[bone] : times33(across33(turns[parent]), turns[bone]));
  const restTurns = rest.map((m) => m.map((row) => row.slice(0, 3)));
  const seen = new Map(pieceBones.map((bone) => [bone, [[], [], []]]));
  for (const frame of frames) {
    const turns = [];
    frame.forEach((six, bone) => {
      const own = turnOf(six);
      turns.push(skeleton[bone].parent < 0 ? own : times33(turns[skeleton[bone].parent], own));
    });
    for (const bone of pieceBones) {
      const parent = above(bone);
      const turn = times33(across33(against(restTurns, bone, parent)), against(turns, bone, parent));
      degreesOf(turn).forEach((v, axis) => seen.get(bone)[axis].push(v));
    }
  }
  return new Map(
    [...seen].map(([bone, axes]) => {
      const spans = axes.map((values) => {
        values.sort((a, b) => a - b);
        return TURN_SHARE.map((share) => values[Math.round(share * (values.length - 1))]);
      });
      // a bone its animations never turn is not measured by them: it bends RAGDOLL_TURN each way
      if (spans.every(([lo, hi]) => hi - lo < TURN_STILL)) return [bone, null];
      return [bone, spans.map(([lo, hi]) => {
        if (hi - lo < TURN_STILL) return [0, 0];
        // the rest, the pose it falls from, is always inside them
        return [Math.max(-TURN_MOST, Math.min(0, Math.floor(lo - TURN_SPARE))), Math.min(TURN_MOST, Math.max(0, Math.ceil(hi + TURN_SPARE)))];
      })];
    }),
  );
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
