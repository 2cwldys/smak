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
// - a looping animation's travel. GoldSrc's compiler took it out of the frames of a sequence marked LX (LY, LZ)
//   and kept it as its linearmovement: it is put back into the root bones' frames, and Source's compiler, told LX
//   in its turn and with no rollback ($motionrollback 0), takes it out again in the same straight line. A one-shot
//   stays in place, as GoldSrc played it: Source takes a one-shot's travel out along a curve (a jump straight
//   ahead lurched back), stevenlafl's finding in The Specialists' port;
// - an animation's blends (Half-Life's aiming up and down), each axis on a pose parameter named by the motion it
//   was (blend_xr, a pitch; blend where it names none), over the values GoldSrc gave its first and last blend;
// - the sound an event plays (1004, 1008, 5004: a step, a voice, a gun's clip) moved under the port's folder,
//   sound/<folder>/<its path>, clear of GMod's own sounds of that name (Half-Life 2's weapons/ and common/);
//   `sounds` lists them, for portToGmod to copy from the game. A view model's (5004, its clip) are not left
//   in the model: GMod never plays a view model's own sound events (stevenlafl's finding, porting The
//   Specialists, whose reloads were silent). They are written as Lua beside it instead
//   (addon/lua/autorun/client/, viewSoundsLua), which plays each as the view model's animation passes its
//   frame, for the holder alone, as GoldSrc's client did;
// - a view model's animations start outright (fadein 0 fadeout 0), as GoldSrc's did: Source fades a new one in
//   over 0.2 s, which swallows a gun's short kick. Those with no activity are given Source's by their names
//   (VIEW_ACTIVITIES: idle ACT_VM_IDLE, shoot ACT_VM_PRIMARYATTACK...), which a GMod weapon's script plays them by;
//   its first attachment, unnamed, is its `muzzle`, turned along the gun's forward in its first animation (a
//   Source attachment points along its x, where GMod's muzzle flash goes; GoldSrc's have no turn);
// - a player, and a weapon held in a player's hand (a p_ model), made a biped GMod knows (biped.mjs): Valve's bone
//   names, the hands turned as Valve's are. A player also gets the bones and attachments GMod looks for on its
//   hands, and stands on its feet: GoldSrc's player stands about its middle, 36 above its feet (PLAYER_LIFT), and
//   Source's on its feet, so its animations are lifted and it is lit from its middle ($illumposition). With
//   `upper`, each animation has a copy that moves the body from the spine up (<name>_upper), for laying over a
//   walk.
//
// WHAT CHANGES, AND WHY:
// - the meshes are written in the model's space (GoldSrc keeps them in their bone's), the corners of each
//   triangle the other way round (SMD wants them counter-clockwise from the front, as GoldSrc's compiler read
//   them; the file keeps them clockwise), and v counted from the picture's bottom;
// - `$origin 0 0 0 -90`: Source's compiler turns everything it reads by 90 degrees about z, as GoldSrc's did
//   when it compiled the original. What is written here is the original as it was compiled, already turned;
// - a texture is a picture of a power of two each way (resampled up: GoldSrc's may be 96 by 83), mip-mapped;
// - a texture's flags become its material's: masked (64) alpha-tested with its last colour a hole, additive
//   (32) additive, fullbright (4) UnlitGeneric. Chrome (2) has no like in Source: GoldSrc never draws a chrome
//   texture by the file's s and t, but by how each corner's surface faces the eye, worked out again each frame
//   (R_StudioChrome). It is worked out once, in the first animation's first frame, from where the eye is: for a
//   view model where it always is (the model's origin, looking along x), for anything else in front of it.
//
// WHAT IS LEFT BEHIND, each said in a warning: bone controllers (Source turns a head by pose parameters), an
// animation's blends after its first (Source blends by pose parameters), an activity whose name this kit does not
// know, an animation kept in a file that is not given, the blends of an animation of more than two that are not
// two axes of two.

import {
  readMdl,
  readMesh,
  bones as bonesOf,
  restPose,
  poseAt,
  frameValues,
  apply34,
  poseOfValues,
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
import { cross, dot, unit, sub as sub3 } from "../vec.mjs";
import { smdOf } from "./smd.mjs";
import { valveBiped } from "./biped.mjs";
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
/** Where the eye is when GoldSrc draws chrome, and its right: a view model's at its origin looking along x (the
 * view's own), anything else's far in front of it, looking back. */
const CHROME_EYE = { view: { eye: [0, 0, 0], right: [0, -1, 0] }, other: { eye: [1e5, 0, 0], right: [0, 1, 0] } };
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
/**
 * Where GoldSrc draws a corner of a chrome texture in its picture, in pixels as the file's s and t are
 * (R_StudioChrome): a bone's up and right as the eye sees it from where the bone is, and the corner's normal along
 * each, from -1 to 1, made 0 to 64.
 */
function chromeAt(pose, bone, n, { eye, right }) {
  const m = pose[bone];
  // from the eye to the bone, as the SDK has it (tmp): up is it across the eye's right, right it across up
  const fromEye = unit(sub3([m[0][3], m[1][3], m[2][3]], eye));
  const up = unit(cross(fromEye, right));
  const side = unit(cross(fromEye, up));
  const normal = turn34(m, n);
  return [(dot(normal, side) + 1) * 32, (dot(normal, up) + 1) * 32];
}
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
 *              "auto"     a hull for a model of one bone, a ragdoll for one with a skeleton and hit boxes, else none;
 *                         none for a view model, which is drawn in front of the eyes and never touches the world
 *   surfaceprop: what it is made of to Source (its sounds, its weight a volume, how it breaks): "wood", "metal",
 *              "flesh"... ("flesh" for a ragdoll, "default" else, unless told)
 *   pictures:  Map(texture name -> { width, height, rgba }): the textures in full colour, for a model the kit built
 *              for Source (buildModelSpec's `pictures`); the file's own 256 colours otherwise
 *   kind:      what the model is to GMod (PORT_KINDS): "view" a view model, whose animations start outright
 *              (fadein 0 fadeout 0) and are given activities by their names; "held" a weapon in a player's hand
 *              (a p_ model), "player" a player model, each made a biped GMod knows (valveBiped); "thing" else.
 *              A name that begins v_ is a view model, p_ a held one, unless told
 *   handRoll:  a biped's hands' turn about their x from Valve's, in degrees, when not to be measured by its thumbs
 *   upper:     a player's animations each copied as <name>_upper, from its spine up
 *   bind:      { seq, frame }: bound in that frame's pose, not in the bones' rest (a body the kit built on a game's
 *              skeleton was made in its first animation's first frame; the game's own were modelled at rest)
 *   mass:      its mass in kilograms; unless told, its collision model's volume at `density` (kg a cubic metre), or
 *              at `densities(surfaceprop)` (densityOf with GMod's table), or without either Source's $automass,
 *              which weighs it as "default". A ragdoll weighs a person's RAGDOLL_MASS unless told
 * Returns { name, modelname, qc (its path in files), files: [{ path, data }] (paths under the out folder),
 * sounds: [{ from (the path the event named, under the game's sound/), to (under Source's sound/) }], warnings: [sentence], facts: { bones, sequences, materials, bodygroups, skins, attachments, hitboxes, corners } }
 * (what the compiled model must have again: comparePort).
 */
export function portToSource(src, { name, folder = PORT_FOLDER, groups, collision = "auto", surfaceprop, mass, density, densities, pictures, bind, kind, handRoll, upper = false } = {}) {
  if (!COLLISIONS.includes(collision)) throw new Error(`portToSource: collision is ${COLLISIONS.join(", ")}, not ${collision}`);
  if (mass !== undefined && !(mass > 0)) throw new Error(`portToSource: mass is kilograms more than 0, not ${mass}`);
  if (!name) throw new Error("portToSource: the model's name in Source (name)");
  const model = sourceName(name);
  const madeAs = kind ?? (/^v_/.test(model) ? "view" : /^p_/.test(model) ? "held" : "thing");
  if (!PORT_KINDS.includes(madeAs)) throw new Error(`portToSource: kind is ${PORT_KINDS.join(", ")}, not ${kind}`);
  const viewModel = madeAs === "view";
  const player = madeAs === "player";
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
  const named = original.map((bone, i) => ({ ...bone, name: boneNames[i] }));
  // a player, or a weapon in its hand, made Valve's biped: its names, its hands turned, a player's hands' bones
  const rig = player || madeAs === "held" ? valveBiped(named, { player, handRoll }) : null;
  if (rig) {
    warnings.push(...rig.warnings);
    if (rig.named.length)
      warnings.push(`${rig.named.length} bones given GMod's names (${named.find((b) => b.name === rig.named[0]).name} as ${rig.skeleton[named.findIndex((b) => b.name === rig.named[0])].name}...), as GMod finds a biped's${rig.kept.length ? `; ${rig.kept.length} kept theirs (${rig.kept.slice(0, 4).join(", ")}${rig.kept.length > 4 ? "..." : ""})` : ""}`); // prettier-ignore
    else warnings.push("no bone of a biped's (Bip01, Bip01 Pelvis...): its bones keep their names, and GMod finds no hand on it");
    for (const roll of rig.rolls.filter((r) => r.measured || handRoll !== undefined))
      warnings.push(`the ${roll.side === "R" ? "right" : "left"} hand turned ${roll.degrees} degrees about its x, as Valve's hands are${roll.measured ? " (by where its thumb stands)" : ""}: a gun GMod merges onto it sits as on a Half-Life 2 figure`); // prettier-ignore
    if (player && rig.attachments.length) warnings.push(`${rig.attachments.map((a) => a.name).join(" and ")} added on the hands, where GMod puts a held thing and the flashlight`); // prettier-ignore
  }
  const skeleton = rig ? rig.skeleton : named;
  // a frame's six numbers a bone, as Source is to have them
  const reframe = rig ? rig.frame : (values) => values;
  // a player stands on its feet in Source, about its middle in GoldSrc: its animations are lifted
  const lift = player ? PLAYER_LIFT : 0;
  // the pose it is bound in, which Source draws it in at rest and a ragdoll falls from: the bones' own rest, or
  // (`bind`) a frame of an animation, the stance a body the kit built was made in
  const rest = bind ? poseAt(src, bind.seq, bind.frame) : restPose(src);
  const smdBones = skeleton.map(({ name: bone, parent }) => ({ name: bone, parent }));
  // each SMD as data too, by its path under src/: what an engine that reads no SMD (s&box) is written from
  const smdData = new Map();
  const smd = (path, input) => {
    smdData.set(path, input);
    files.push({ path: `src/${path}`, data: smdOf(input) });
  };
  const restFrame = reframe(bind ? frameValues(src, bind.seq, bind.frame) : named.map(({ pos, rot }) => [...pos, ...rot]));
  // the bones' matrices in that pose as Source is to have them (a biped's hands turned): what the ragdoll is
  // fitted and jointed on. The triangles are placed by `rest`, the file's own, in the model's space, where the turn
  // moves nothing
  const bound = rig ? poseOfValues(restFrame, skeleton.map((bone) => bone.parent)) : rest;

  // ── materials: one for each texture, named as Source wants its files ──
  const materialNames = uniqueNames(info.textures.map((t) => sourceName(t.name)));
  const materialsPath = `models/${where}/${model}`;
  // each texture's picture as data: { name, width, height, rgba, flags }
  const textures = [];
  info.textures.forEach((texture, i) => {
    const masked = Boolean(texture.flags & NF.masked);
    // a model the kit built for Source has its pictures in full colour beside the file's 256 colours
    const full = pictures?.get(texture.name);
    const picture = full ?? textureOf(src, i);
    const rgba = full ? full.rgba : rgbaOf(picture, masked);
    textures.push({ name: materialNames[i], width: picture.width, height: picture.height, rgba, flags: texture.flags });
    const vtf = writeVtf({ width: picture.width, height: picture.height, rgba }, { alpha: masked });
    files.push({ path: `addon/materials/${materialsPath}/${materialNames[i]}.vtf`, data: vtf });
    files.push({ path: `addon/materials/${materialsPath}/${materialNames[i]}.vmt`, data: vmtOf(`${materialsPath}/${materialNames[i]}`, texture.flags) }); // prettier-ignore
  });
  const chrome = info.textures.filter((t) => t.flags & NF.chrome).map((t) => t.name);
  if (chrome.length)
    warnings.push(`${chrome.join(", ")}: chrome in GoldSrc (where the picture is drawn worked out by the eye each frame), which Source has no like of: worked out once, in the first animation's first frame, ${viewModel ? "from the view's eye, where a view model's always is" : "seen from in front"}`); // prettier-ignore
  // the pose chrome is worked out in: the first animation's first frame, which a view model idles in
  const seen = chrome.length ? (sequencesOf(src).length ? poseAt(src, 0, 0) : rest) : null;
  const chromeEye = viewModel ? CHROME_EYE.view : CHROME_EYE.other;

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
          const chromed = info.textures[texture].flags & NF.chrome;
          const corners = tri.map(({ p, n, bone, s: fileS, t: fileT }) => {
            const [s, t] = chromed ? chromeAt(seen, bone, n, chromeEye) : [fileS, fileT];
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
      smd(`${file}.smd`, { bones: smdBones, frames: [restFrame], triangles });
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
  // each $sequence as data: { index (in the original), name, files, fps, loops, activity, weight, travel, blends, events }
  const sequenceData = [];
  // a view model's animations given an activity by their names, said once
  const activitiesNamed = [];
  // the sounds the events play, by the path they named
  const sounds = new Map();
  const soundOf = (options) => {
    const named = options.trim().replace(/\\/g, "/").match(SOUND_FILE);
    if (!named) return options;
    const to = `${where}/${named[2].toLowerCase()}`;
    if (!sounds.has(named[2])) sounds.set(named[2], to);
    return `${named[1]}${to}`;
  };
  // a view model's sound events, by the compiled animation's number: played by the Lua written beside it
  const viewSounds = [];
  // what the compiled model must have again of its animations: each loop's travel, each one's blends
  const travels = [];
  const blendFacts = [];
  // each pose parameter's range: the values of every animation that blends on it
  const poseRanges = new Map();
  // every frame of every animation, as read: how far a ragdoll's joints bend is measured on them
  const allFrames = [];
  // a player's copies from its spine up, after its own animations (game code plays those by number)
  const spine = skeleton.findIndex((bone) => bone.name === "ValveBiped.Bip01_Spine");
  const upperBody = upper && player && spine >= 0;
  if (upper && !upperBody) warnings.push("upper: only a player with Valve's spine (ValveBiped.Bip01_Spine) has copies from the spine up; none made"); // prettier-ignore
  const upperLines = [];
  list.forEach((seq, i) => {
    const blending = blendingOf(seq);
    if (blending.left) warnings.push(`animation ${seq.name}: ${blending.left}`);
    let reads;
    try {
      reads = Array.from({ length: blending.count }, (_, blend) => readSequence(src, i, blend, groups));
    } catch (error) {
      warnings.push(`animation ${seq.name}: not ported (${error.message}; give the files of animations beside the model)`); // prettier-ignore
      return;
    }
    for (const blend of reads) blend.frames = blend.frames.map(reframe);
    const read = reads[0];
    for (const blend of reads) allFrames.push(...blend.frames);
    // a loop's travel only: Source takes a one-shot's out along a curve, not GoldSrc's straight line
    const axes = seq.loops ? TRAVEL.filter(([, bit]) => seq.motiontype & bit) : [];
    const travelled = axes.length && read.frames.length > 1;
    // GoldSrc took one travel out of every blend: it is put back into each
    const smds = reads.map((blend, b) => {
      const frames = blend.frames.map((frame, f) =>
        frame.map((six, bone) => {
          if (!roots.includes(bone)) return six;
          const lifted = lift ? [six[0], six[1], six[2] + lift, ...six.slice(3)] : six;
          if (!travelled) return lifted;
          const share = f / (blend.frames.length - 1);
          return lifted.map((v, axis) => (axis < 3 && axes.some(([, bit]) => bit === TRAVEL[axis][1]) ? v + seq.movement[axis] * share : v)); // prettier-ignore
        }),
      );
      const path = `anims/${animationFiles[i]}${b ? `_blend${b}` : ""}.smd`;
      smd(path, { bones: smdBones, frames });
      return path;
    });
    if (travelled) travels.push({ name: sequenceNames[i], movement: [0, 1, 2].map((axis) => (axes.some(([, bit]) => bit === TRAVEL[axis][1]) ? seq.movement[axis] : 0)) }); // prettier-ignore
    if (blending.count > 1) {
      blendFacts.push({ name: sequenceNames[i], count: blending.count, poses: blending.axes.map((a) => a.pose) });
      for (const { pose, start, end } of blending.axes) {
        const [low, high] = poseRanges.get(pose) ?? [Infinity, -Infinity];
        poseRanges.set(pose, [Math.min(low, start, end), Math.max(high, start, end)]);
      }
    }
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
    } else if (viewModel) {
      const activity = viewActivityOf(seq.name);
      if (activity) {
        options.push(`activity ${activity} 1`);
        activitiesNamed.push(`${sequenceNames[i]} ${activity}`);
      }
    }
    if (travelled) options.push(...axes.map(([word]) => word));
    if (viewModel) options.push("fadein 0", "fadeout 0");
    // a grid two wide when it blends on two axes: GoldSrc's four are the first axis's two at the second's start,
    // then at its end, as Source's grid is laid row by row
    if (blending.axes.length === 2) options.unshift("blendwidth 2");
    options.unshift(...blending.axes.map(({ pose, start, end }) => `blend ${quote(pose)} ${num(start)} ${num(end)}`));
    const all = eventsOf(src, i);
    const played = viewModel ? all.filter((e) => e.event === VIEW_SOUND_EVENT && SOUND_FILE.test(e.options.trim().replace(/\\/g, "/"))) : []; // prettier-ignore
    if (played.length)
      viewSounds.push({ sequence: sequenceLines.length, name: sequenceNames[i], frames: read.frames.length, loops: Boolean(seq.loops), events: played.map((e) => ({ frame: e.frame, sound: soundOf(e.options).replace(/^[*]+/, "") })) }); // prettier-ignore
    const events = all.filter((e) => !played.includes(e)).map((e) => `\t{ event ${e.event} ${e.frame} ${quote(SOUND_EVENTS.includes(e.event) ? soundOf(e.options) : e.options)} }`); // prettier-ignore
    sequenceLines.push(`$sequence ${quote(sequenceNames[i])} ${smds.map(quote).join(" ")} ${options.join(" ")}${events.length ? ` {\n${events.join("\n")}\n}` : ""}`); // prettier-ignore
    sequenceData.push({
      index: i,
      name: sequenceNames[i],
      files: smds,
      fps,
      loops: Boolean(seq.loops),
      activity: (seq.activity && ACTIVITY[seq.activity]) || null,
      weight: Math.max(1, seq.actweight),
      travel: travelled ? axes.map(([word]) => word) : [],
      blends: blending.axes,
      events: all.map((e) => ({ event: e.event, frame: e.frame, options: SOUND_EVENTS.includes(e.event) ? soundOf(e.options) : e.options })), // prettier-ignore
    });
    portedSequences.push(sequenceNames[i]);
    // its copy from the spine up, to lay over a walk: no activity (a layer is asked for by name), no events (they
    // would play twice), no travel (its root is not in it)
    if (upperBody) {
      const layered = options.filter((option) => !/^(activity |L[XYZ]$)/.test(option));
      upperLines.push(`$sequence ${quote(`${sequenceNames[i]}_upper`)} ${smds.map(quote).join(" ")} ${layered.join(" ")} weightlist "upper"`); // prettier-ignore
      portedSequences.push(`${sequenceNames[i]}_upper`);
    }
  });

  if (activitiesNamed.length)
    warnings.push(`a view model's animations given Source's activities by their names, which a GMod weapon's script plays them by (SendWeaponAnim): ${activitiesNamed.join(", ")}`); // prettier-ignore

  // ── what a monster has ──
  const attachments = [
    ...attachmentsOf(src).map((a) => (rig ? { ...a, pos: rig.point(a.bone, a.pos) } : a)),
    ...(rig?.attachments ?? []),
  ];
  // a view model's first, unnamed, is where its shots come from: GMod looks for it as "muzzle"
  const muzzle = viewModel && attachments.length && !attachments[0].name && !attachments.some((a) => a.name.toLowerCase() === "muzzle"); // prettier-ignore
  const attachmentNames = uniqueNames(attachments.map((a, i) => (a.name ? a.name : muzzle && i === 0 ? "muzzle" : `attachment${i}`))); // prettier-ignore
  // the muzzle turned so that its x is the model's forward in its first animation's first frame (the bone's turn
  // then): the gun's own forward, as GoldSrc drew it before the view
  let muzzleTurn = "0 0 0";
  if (muzzle) {
    let pose;
    try {
      pose = poseAt(src, 0, 0, 0, groups);
    } catch {
      pose = rest;
    }
    const along = pose[attachments[0].bone][0].slice(0, 3); // the model's x in the bone's space: the first row
    muzzleTurn = `${num((-Math.asin(Math.max(-1, Math.min(1, along[2]))) * 180) / Math.PI)} ${num((Math.atan2(along[1], along[0]) * 180) / Math.PI)} 0`; // prettier-ignore
    warnings.push(`a view model's first attachment named muzzle, where GMod puts its muzzle flash, and turned along the gun's forward (rotate ${muzzleTurn})`); // prettier-ignore
  }
  const hitboxes = hitboxesOf(src).map((h) => (rig ? { ...h, ...rig.box(h.bone, h.min, h.max) } : h));
  const controllers = boneControllers(src);
  if (controllers.length)
    warnings.push(`${controllers.length === 1 ? "a bone controller" : `${controllers.length} bone controllers`} (${controllers.map((c) => skeleton[c.bone]?.name).join(", ")}) left: Source turns such bones by pose parameters, which a port does not make yet`); // prettier-ignore
  const boxes = modelBoxes(src);

  // ── what it collides as ──
  const collides =
    collision !== "auto" ? collision : viewModel || madeAs === "held" ? "none" : skeleton.length === 1 ? "hull" : hitboxes.length ? "ragdoll" : "none"; // prettier-ignore
  const massLine = () => (mass === undefined ? "\t$automass" : `\t$mass ${num(mass)}`);
  let collisionLines = [];
  const physicsFile = `${model}_physics.smd`;
  const physics = (triangles) => smd(physicsFile, { bones: smdBones, frames: [restFrame], triangles });
  if ((collides === "hull" || collides === "box") && Number.isFinite(bodyBox[0][0])) {
    const hull = collides === "hull" ? convexHull(allCorners.map((c) => c.p)) : null;
    if (collides === "hull" && !hull) warnings.push("its triangles lie in a plane, which has no hull: a box about them in its place");
    physics(hull ? hullTriangles(hull, 0) : boxTriangles(bodyBox, 0));
    const volume = hull ? hullVolume(hull) : bodyBox[1].reduce((product, v, i) => product * (v - bodyBox[0][i]), 1);
    const weight = density ?? densities?.(surfaceprop ?? "default");
    const weighed = mass === undefined && weight > 0 ? Math.round(massOf(volume, weight) * 10) / 10 : undefined;
    collisionLines = [`$collisionmodel ${quote(physicsFile)}\n{\n${weighed === undefined ? massLine() : `\t$mass ${num(weighed)}`}\n}`]; // prettier-ignore
  } else if (collides === "ragdoll") {
    const pieces = ragdollPieces(skeleton, hitboxes, bound, bodyTriangles);
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
      const turns = jointTurns(skeleton, bound, pieces.list.map((piece) => piece.bone), allFrames);
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
      smd("anims/ragdoll.smd", { bones: smdBones, frames: [restFrame] });
      sequenceLines.push(`$sequence "ragdoll" "anims/ragdoll.smd" fps 30 activity ACT_DIERAGDOLL 1`);
    }
  }
  const material = surfaceprop ?? (collides === "ragdoll" && collisionLines.length ? "flesh" : "default");
  if (!surfaceprop && material === "flesh") warnings.push(`a ragdoll taken for flesh ($surfaceprop "flesh"): give surfaceprop for a robot, a statue`); // prettier-ignore

  // ── the QC ──
  const qc = [
    `// ${model}: ported from GoldSrc by SMAK (portToSource). Compiled by Source's studiomdl.`,
    `$modelname ${quote(`${where}/${model}.mdl`)}`,
    `$cdmaterials ${quote(`${materialsPath}/`)}`,
    // what is written is the original as GoldSrc's compiler left it, already turned: not turned again
    `$origin 0 0 0 -90`,
    `$surfaceprop ${quote(material)}`,
    // GoldSrc took a walk's travel out in one straight line; Source's default rollback treats the last 0.3 s on
    // its own, and the root drifts off that line
    `$motionrollback 0`,
  ];
  // a player's boxes and eyes lifted with its animations; it is lit from its middle, where GMod's own are (male_07
  // at 35): from its origin, at its feet, it would be lit from under the floor and drawn black
  const up = (v) => [v[0], v[1], v[2] + lift];
  if (!isZero(boxes.eyes)) qc.push(`$eyeposition ${vec(up(boxes.eyes))}`);
  if (player) qc.push(`$illumposition 0 0 ${num(PLAYER_LIFT)}`);
  if (!isZero(boxes.bbmin) || !isZero(boxes.bbmax)) qc.push(`$bbox ${vec(up(boxes.bbmin))} ${vec(up(boxes.bbmax))}`);
  if (!isZero(boxes.min) || !isZero(boxes.max)) qc.push(`$cbox ${vec(up(boxes.min))} ${vec(up(boxes.max))}`);
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
    qc.push(`$attachment ${quote(attachmentNames[i])} ${quote(skeleton[a.bone].name)} ${vec(a.pos)} rotate ${muzzle && i === 0 ? muzzleTurn : "0 0 0"}`),
  );
  for (const box of hitboxes) qc.push(`$hbox ${box.group} ${quote(skeleton[box.bone].name)} ${vec(box.min)} ${vec(box.max)}`);
  qc.push(...collisionLines);
  if (!sequenceLines.length) {
    // Source's compiler wants one animation at least: the rest pose
    smd("anims/idle.smd", { bones: smdBones, frames: [restFrame] });
    sequenceLines.push(`$sequence "idle" "anims/idle.smd" fps 30`);
  }
  for (const [pose, [low, high]] of poseRanges) qc.push(`$poseparameter ${quote(pose)} ${num(low)} ${num(high)}`);
  if (upperBody) {
    const from = new Set([spine]);
    skeleton.forEach((bone, i) => from.has(bone.parent) && from.add(i));
    qc.push(`$weightlist "upper" {\n${skeleton.map((bone, i) => `\t${quote(bone.name)} ${from.has(i) ? 1 : 0}`).join("\n")}\n}`);
  }
  qc.push(...sequenceLines, ...upperLines);
  files.push({ path: `src/${model}.qc`, data: `${qc.join("\n")}\n` });
  if (viewSounds.length) {
    files.push({ path: `addon/lua/autorun/client/smak_sounds_${where}_${model}.lua`, data: viewSoundsLua(`models/${where}/${model}.mdl`, viewSounds) }); // prettier-ignore
    warnings.push(`its sound events (${viewSounds.map((s) => `${s.name} ${s.events.length}`).join(", ")}) played by Lua beside it (lua/autorun/client/), not by the model: GMod never plays a view model's own`); // prettier-ignore
  }

  return {
    name: model,
    modelname: `${where}/${model}.mdl`,
    qc: `src/${model}.qc`,
    files,
    sounds: [...sounds].map(([from, to]) => ({ from, to })),
    viewSounds,
    warnings,
    // what the QC and SMDs say, as data, for an engine that reads neither (s&box: sbox/port.mjs)
    parts: {
      bones: smdBones,
      smd: smdData,
      bodygroups,
      skins: skinRows,
      textures,
      sequences: sequenceData,
      attachments: attachments.map((a, i) => ({ name: attachmentNames[i], bone: skeleton[a.bone].name, pos: a.pos })),
      hitboxes: hitboxes.map((h) => ({ group: h.group, bone: skeleton[h.bone].name, min: h.min, max: h.max })),
      eyes: isZero(boxes.eyes) ? null : up(boxes.eyes),
    },
    facts: {
      bones: skeleton.map((b) => b.name),
      sequences: portedSequences,
      travels,
      blends: blendFacts,
      poses: [...poseRanges.keys()],
      view: viewModel,
      kind: madeAs,
      materials: [...usedRefs].map((ref) => materialNames[families[0][ref]]),
      bodygroups: bodygroups.map((g) => ({ name: g.name, models: g.models.length })),
      skins: Math.max(1, skinRows.length),
      attachments: attachmentNames,
      hitboxes: hitboxes.length,
      corners: allCorners,
    },
  };
}

/**
 * The events that play a sound file named in their options: 1004 a monster's (a step: SCRIPT_EVENT_SOUND), 1008 its
 * voice (SCRIPT_EVENT_SOUND_VOICE), 5004 one the client plays (a view model's clip: CL_EVENT_SOUND). Source keeps
 * the numbers.
 */
export const SOUND_EVENTS = [1004, 1008, 5004];
/** A view model's sound event (CL_EVENT_SOUND), which GMod does not play: viewSoundsLua plays it. */
const VIEW_SOUND_EVENT = 5004;
/** A sound file in an event's options: what goes before it (GoldSrc's * of a sound streamed), and its path. */
const SOUND_FILE = /^([*]*)([^*!].*\.wav)$/i;

/**
 * The Lua that plays a view model's sound events, a client file of GMod's (lua/autorun/client/), as
 * stevenlafl's weapon base plays The Specialists' (playEvents): each event once, as the view model's animation
 * passes its frame; a loop's again each time round, and an animation begun again (a second reload) from its
 * start. Every model's file adds its own to one table, and the first to load adds the one hook that plays them
 * all. The sound is the holder's alone, as GoldSrc's client played it (ATTN_NORM: level 75).
 *   modelname: "models/smak/smak_v_9mmar.mdl", as the view model's GetModel() says it
 *   viewSounds: [{ sequence (the compiled number), name, frames, loops, events: [{ frame, sound }] }]
 */
export function viewSoundsLua(modelname, viewSounds) {
  const rows = viewSounds.map((s) => `\t[${s.sequence}] = { frames = ${s.frames}, loops = ${s.loops}, ${s.events.map((e) => `{ ${e.frame}, ${JSON.stringify(e.sound)} }`).join(", ")} }, -- ${s.name}`); // prettier-ignore
  return `-- Written by SMAK (gmod-port): the sound events of ${modelname}, played as its animation passes each one.
-- GMod never plays a view model's own sound events (stevenlafl's finding, porting The Specialists to GMod), so
-- they are here and not in the model. By the animation's number: its frames, whether it loops, { frame, sound }.
SMAK_VIEW_SOUNDS = SMAK_VIEW_SOUNDS or {}
SMAK_VIEW_SOUNDS[${JSON.stringify(modelname)}] = {
${rows.join("\n")}
}

-- the one hook that plays every SMAK view model's, added by the first of their files to load
if SMAK_VIEW_SOUNDS_HOOKED then return end
SMAK_VIEW_SOUNDS_HOOKED = true
local heard = { model = "", seq = -1, frame = -1 }
hook.Add("Think", "smak_view_sounds", function()
	local ply = LocalPlayer()
	if not IsValid(ply) then return end
	local vm = ply:GetViewModel()
	if not IsValid(vm) then return end
	local model, seq = vm:GetModel(), vm:GetSequence()
	local list = SMAK_VIEW_SOUNDS[model] and SMAK_VIEW_SOUNDS[model][seq]
	local frame = list and vm:GetCycle() * (list.frames - 1) or -1
	-- another animation, or a one-shot begun again: from its start
	if model ~= heard.model or seq ~= heard.seq or (list and not list.loops and frame < heard.frame) then
		heard.model, heard.seq, heard.frame = model, seq, -1
	end
	if not list then return end
	-- a loop past its end: the rest of it, then from its start
	local wrapped = list.loops and frame < heard.frame
	for _, e in ipairs(list) do
		if (wrapped and (e[1] > heard.frame or e[1] <= frame)) or (not wrapped and e[1] > heard.frame and e[1] <= frame) then
			ply:EmitSound(e[2], 75, 100, 1, CHAN_AUTO)
		end
	end
	heard.frame = frame
end)
`;
}

/**
 * A view model's animations' activities by their names, the first that fits: Half-Life's weapons' (v_9mmar's
 * longidle, deploy, grenade, shoot; v_crowbar's attack1miss), as a GMod weapon's script asks for them.
 */
export const VIEW_ACTIVITIES = [
  [/^shoot_?empty$|^dryfire$/i, "ACT_VM_DRYFIRE"],
  [/^start_?reload$/i, "ACT_SHOTGUN_RELOAD_START"],
  [/^pump$/i, "ACT_SHOTGUN_PUMP"],
  [/^reload(_noshot|_empty)?\d*$/i, "ACT_VM_RELOAD"],
  [/^attack\d*miss$/i, "ACT_VM_MISSCENTER"],
  [/^attack\d*hit$/i, "ACT_VM_HITCENTER"],
  [/^(grenade|shoot_?big|alt_?fire\w*|secondary\w*)$/i, "ACT_VM_SECONDARYATTACK"],
  [/^(shoot|fire|attack)\d*$/i, "ACT_VM_PRIMARYATTACK"],
  [/^(pin_?pull|pull_?pin)$/i, "ACT_VM_PULLPIN"],
  [/^throw\d*$/i, "ACT_VM_THROW"],
  [/^(draw|deploy|up)\d*$/i, "ACT_VM_DRAW"],
  [/^(re)?holster\d*$|^down$/i, "ACT_VM_HOLSTER"],
  [/fidget/i, "ACT_VM_FIDGET"],
  [/^(sm_|long|deep)?idle\d*$/i, "ACT_VM_IDLE"],
];
/** The activity a view model's animation is given by its name (VIEW_ACTIVITIES), or null. */
export const viewActivityOf = (name) => VIEW_ACTIVITIES.find(([pattern]) => pattern.test(name))?.[1] ?? null;

/** The GoldSrc motions a blend may be along, as a pose parameter's name has them (blend_xr). */
const BLEND_MOTIONS = ["X", "Y", "Z", "XR", "YR", "ZR"];

/**
 * A GoldSrc animation's blends as Source's: `count` animations, and the pose parameter of each axis with the
 * values its first and last blend stand for ({ pose, start, end }). Two are one axis; four with a second axis's
 * motion, two by two. Any other number is ported as its first two, or a range of nothing as its first alone,
 * `left` saying so.
 */
export function blendingOf(seq) {
  if (!(seq.blends > 1)) return { count: 1, axes: [] };
  const axis = (k) => {
    const motion = BLEND_MOTIONS.find((name) => MOTION[name] === seq.blendtype[k]);
    return { pose: motion ? `blend_${motion.toLowerCase()}` : k ? "blend2" : "blend", start: seq.blendstart[k], end: seq.blendend[k] }; // prettier-ignore
  };
  const axes = seq.blends === 4 && seq.blendtype[1] ? [axis(0), axis(1)] : [axis(0)];
  if (axes.length === 2 && axes[0].pose === axes[1].pose) axes[1].pose += "2";
  const flat = axes.find((a) => a.start === a.end);
  if (flat)
    return { count: 1, axes: [], left: `its first blend of ${seq.blends} ported: its blends stand for one value (${num(flat.start)}), which no pose parameter can range over` }; // prettier-ignore
  const count = axes.length === 2 ? 4 : 2;
  return { count, axes, left: seq.blends > count ? `its first ${count} blends of ${seq.blends} ported: GoldSrc's renderer blends no more` : undefined }; // prettier-ignore
}

/** What a port may be made as (portToSource's `kind`). */
export const PORT_KINDS = ["thing", "view", "held", "player"];
/** How far a GoldSrc player stands above its feet, which Source's stands on: the middle of its standing hull. */
export const PLAYER_LIFT = 36;

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
